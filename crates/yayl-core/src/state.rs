//! YAYL's private state directory inside an install root.
//!
//! `plan.json` is the immutable desired state, `task.json` the mutable
//! execution state, and `manifest.json` the raw server manifest. The last one
//! is distinct from the generated `<install root>/manifest.json`.

use crate::error::{Error, ErrorCode, Result};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

/// Load the raw server manifest, renaming the pre-rename file into place.
pub fn load_remote_manifest(root: &Path) -> Result<Option<String>> {
    let path = remote_manifest_path(root);
    let legacy = legacy_remote_manifest_path(root);
    if let Some(body) = read_non_empty(&path)? {
        let _ = std::fs::remove_file(&legacy);
        return Ok(Some(body));
    }
    match read_non_empty(&legacy)? {
        Some(body) => {
            let _ = std::fs::remove_file(&path);
            let _ = std::fs::rename(&legacy, &path);
            Ok(Some(body))
        }
        None => Ok(None),
    }
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
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    if durability == Durability::Full {
        std::fs::OpenOptions::new()
            .write(true)
            .open(&tmp)?
            .sync_all()?;
    }
    replace_file(&tmp, path)
}

#[cfg(windows)]
fn replace_file(tmp: &Path, path: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MOVEFILE_REPLACE_EXISTING, MoveFileExW};

    let from: Vec<u16> = tmp
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let to: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: both paths are null-terminated UTF-16 buffers that outlive the call.
    let moved = unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_REPLACE_EXISTING) };
    if moved == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(tmp: &Path, path: &Path) -> Result<()> {
    std::fs::rename(tmp, path)?;
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
