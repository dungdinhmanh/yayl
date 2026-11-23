//! YAYL's private state directory inside an install root.

use crate::error::{Error, ErrorCode, Result};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Serializes atomic replacements inside this process.
///
/// On Windows `MoveFileExW` (used by `persist`) can fail with access denied
/// when two writers replace the same destination at once. State writes are
/// small and infrequent, so one process-wide lock is simpler than a per-path
/// map. Cross-process writers are still not coordinated.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub const STATE_DIR: &str = ".yayl";
pub const PLAN_FILE: &str = "plan.json";
pub const TASK_FILE: &str = "task.json";
/// Raw server manifest, not the generated `<install root>/manifest.json`.
pub const REMOTE_MANIFEST_FILE: &str = "manifest.json";
const LEGACY_REMOTE_MANIFEST_FILE: &str = "remote-manifest.json";

pub fn state_dir(root: &Path) -> PathBuf {
    root.join(STATE_DIR)
}

pub fn plan_path(root: &Path) -> PathBuf {
    state_dir(root).join(PLAN_FILE)
}

pub fn task_path(root: &Path) -> PathBuf {
    state_dir(root).join(TASK_FILE)
}

pub fn remote_manifest_path(root: &Path) -> PathBuf {
    state_dir(root).join(REMOTE_MANIFEST_FILE)
}

fn legacy_remote_manifest_path(root: &Path) -> PathBuf {
    state_dir(root).join(LEGACY_REMOTE_MANIFEST_FILE)
}

/// Load the raw server manifest, promoting the pre-rename file to the current name.
///
/// A non-empty `manifest.json` wins over `remote-manifest.json` and the legacy
/// copy is removed. When `manifest.json` is missing or empty, a non-empty
/// legacy file is written to the current name with [`write_atomic`] (fsync plus
/// atomic replace) and only then is the legacy copy removed. If that write
/// fails the error is returned and the legacy file is left untouched, so no
/// state is lost. No legacy file means there is nothing to migrate.
pub fn load_remote_manifest(root: &Path) -> Result<Option<String>> {
    let path = remote_manifest_path(root);
    let legacy = legacy_remote_manifest_path(root);
    if let Some(body) = read_non_empty(&path)? {
        remove_legacy_manifest(&legacy);
        return Ok(Some(body));
    }
    match read_non_empty(&legacy)? {
        Some(body) => {
            // Write the durable copy first; the legacy file stays in place
            // until the new name is safely on disk.
            write_atomic(&path, body.as_bytes())?;
            remove_legacy_manifest(&legacy);
            Ok(Some(body))
        }
        None => Ok(None),
    }
}

/// Best-effort cleanup of the pre-rename manifest.
///
/// The current name already holds the durable copy, so a failed removal only
/// leaves a harmless duplicate that the next load retries. `NotFound` simply
/// means there was nothing to remove.
fn remove_legacy_manifest(path: &Path) {
    let _ = std::fs::remove_file(path);
}

fn read_non_empty(path: &Path) -> Result<Option<String>> {
    match std::fs::read_to_string(path) {
        Ok(body) if body.trim().is_empty() => Ok(None),
        Ok(body) => Ok(Some(body)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

/// fsync policy for atomic state writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Durability {
    /// fsync before replace. Required for plans, raw manifests, terminal states.
    Full,
    /// Skip the fsync. Progress snapshots rebuild from `.yayl-part` checkpoints.
    Relaxed,
}

/// Write a file atomically with a full fsync.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    write_atomic_with(path, bytes, Durability::Full)
}

pub fn write_atomic_with(path: &Path, bytes: &[u8], durability: Durability) -> Result<()> {
    // Recover from poisoning: a panic elsewhere must not make every later
    // state write fail. The critical section only touches local files.
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    std::fs::create_dir_all(parent)?;
    // `NamedTempFile` creates a uniquely named file with create-new semantics,
    // so a pre-planted link at a predictable `.tmp` name cannot be followed.
    // It is removed automatically unless `persist` succeeds.
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(bytes)?;
    if durability == Durability::Full {
        file.as_file().sync_all()?;
    }
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
}

/// Serialize compact JSON and write it atomically.
pub fn write_json_atomic<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    write_json_atomic_with(path, value, Durability::Full)
}

pub fn write_json_atomic_with<T: serde::Serialize>(
    path: &Path,
    value: &T,
    durability: Durability,
) -> Result<()> {
    let body =
        serde_json::to_vec(value).map_err(|error| Error::new(ErrorCode::Io, error.to_string()))?;
    write_atomic_with(path, &body, durability)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_paths_live_under_dot_yayl() {
        let root = Path::new("games").join("sample");
        assert_eq!(plan_path(&root), root.join(".yayl").join("plan.json"));
        assert_eq!(task_path(&root), root.join(".yayl").join("task.json"));
        assert_eq!(
            remote_manifest_path(&root),
            root.join(".yayl").join("manifest.json")
        );
        assert_eq!(
            legacy_remote_manifest_path(&root),
            root.join(".yayl").join("remote-manifest.json")
        );
    }

    #[test]
    fn loads_and_migrates_the_legacy_manifest_name() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = legacy_remote_manifest_path(dir.path());
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, b"{\"file\":[]}").unwrap();

        let body = load_remote_manifest(dir.path()).unwrap().unwrap();

        assert_eq!(body, "{\"file\":[]}");
        assert!(remote_manifest_path(dir.path()).exists());
        assert!(!legacy.exists());
    }

    #[test]
    fn missing_legacy_manifest_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(state_dir(dir.path())).unwrap();

        assert_eq!(load_remote_manifest(dir.path()).unwrap(), None);
        assert!(!remote_manifest_path(dir.path()).exists());
        assert!(!legacy_remote_manifest_path(dir.path()).exists());
    }

    #[test]
    fn unreadable_current_manifest_reports_an_error_and_keeps_the_legacy_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = remote_manifest_path(dir.path());
        let legacy = legacy_remote_manifest_path(dir.path());
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        // A directory where a file is expected is unreadable on both platforms:
        // Windows reports access denied, Unix reports "is a directory".
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(&legacy, b"old").unwrap();

        let error = load_remote_manifest(dir.path()).unwrap_err();

        assert!(matches!(error.code, ErrorCode::Io | ErrorCode::Permission));
        assert_eq!(std::fs::read_to_string(&legacy).unwrap(), "old");
    }

    #[test]
    fn loading_prefers_the_non_empty_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let path = remote_manifest_path(dir.path());
        let legacy = legacy_remote_manifest_path(dir.path());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"new").unwrap();
        std::fs::write(&legacy, b"old").unwrap();

        let body = load_remote_manifest(dir.path()).unwrap().unwrap();

        assert_eq!(body, "new");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(!legacy.exists());
    }

    #[test]
    fn loading_replaces_an_empty_manifest_with_the_legacy_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = remote_manifest_path(dir.path());
        let legacy = legacy_remote_manifest_path(dir.path());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"").unwrap();
        std::fs::write(&legacy, b"old").unwrap();

        let body = load_remote_manifest(dir.path()).unwrap().unwrap();

        assert_eq!(body, "old");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "old");
        assert!(!legacy.exists());
    }

    #[test]
    fn atomic_write_replaces_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        write_atomic(&path, b"first").unwrap();
        write_atomic(&path, b"second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
    }

    #[test]
    fn atomic_write_failure_leaves_no_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        // A directory at the destination makes `persist` fail on both platforms.
        std::fs::create_dir_all(&path).unwrap();

        assert!(write_atomic(&path, b"payload").is_err());
        assert!(path.is_dir());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn concurrent_writes_never_interleave() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        write_atomic(&path, b"seed").unwrap();

        let payloads: Vec<Vec<u8>> = (0..4).map(|index| vec![b'a' + index; 64 * 1024]).collect();

        std::thread::scope(|scope| {
            for payload in &payloads {
                let path = &path;
                scope.spawn(move || {
                    for _ in 0..10 {
                        write_atomic(path, payload).unwrap();
                    }
                });
            }
        });

        let body = std::fs::read(&path).unwrap();
        assert!(payloads.contains(&body));
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn relaxed_write_replaces_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("task.json");
        write_atomic(&path, b"first").unwrap();
        write_atomic_with(&path, b"second", Durability::Relaxed).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
    }

    #[test]
    fn json_state_is_written_compact() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("task.json");
        write_json_atomic(&path, &serde_json::json!({"a": 1, "b": [1, 2]})).unwrap();
        let body = std::fs::read_to_string(&path).unwrap();
        assert!(!body.contains('\n'));
        assert_eq!(body, r#"{"a":1,"b":[1,2]}"#);
    }
}
