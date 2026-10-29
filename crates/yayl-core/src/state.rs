//! YAYL's private state directory inside an install root.
//!
//! `plan.json` is the immutable download plan (game config, CDN list, manifest
//! snapshot, jobs). `task.json` is the mutable execution state. Keeping them
//! separate means a progress update never rewrites the manifest snapshot that
//! verify/repair and manifest diff rely on.
//!
//! `manifest.json` here is the raw server manifest, not the official local
//! manifest at the install root. The directory makes the distinction explicit.

use crate::error::{Error, ErrorCode, Result};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const STATE_DIR: &str = ".yayl";
pub const PLAN_FILE: &str = "plan.json";
pub const TASK_FILE: &str = "task.json";
/// Raw server manifest. Distinct from `<install root>/manifest.json`, which is
/// generated after verification.
pub const REMOTE_MANIFEST_FILE: &str = "manifest.json";
/// Name used before the manifest was renamed. Read once and migrated.
pub const LEGACY_REMOTE_MANIFEST_FILE: &str = "remote-manifest.json";

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

pub fn legacy_remote_manifest_path(root: &Path) -> PathBuf {
    state_dir(root).join(LEGACY_REMOTE_MANIFEST_FILE)
}

/// Read the raw server manifest, migrating the pre-rename file if needed.
pub fn read_remote_manifest(root: &Path) -> Option<String> {
    let path = remote_manifest_path(root);
    let legacy = legacy_remote_manifest_path(root);
    if let Ok(body) = std::fs::read_to_string(&path) {
        // Clean up the pre-rename file if both exist.
        let _ = std::fs::remove_file(&legacy);
        return Some(body);
    }
    let body = std::fs::read_to_string(&legacy).ok()?;
    // Best effort: if the rename fails (permissions, open handle) the legacy
    // file still loads on the next run.
    let _ = std::fs::rename(&legacy, &path);
    Some(body)
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

/// Durability level for an atomic state write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Durability {
    /// fsync the temp file before the rename. Required for state that must
    /// survive power loss: plans, raw manifests, and terminal task states.
    Full,
    /// Skip the fsync. Only the rename is durable. Used for periodic progress
    /// snapshots that can be rebuilt from `.yayl-part` checkpoints anyway.
    Relaxed,
}

/// Write a file and make the rename durable before replacing the old file.
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
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Compact JSON is 20-25% smaller than pretty JSON and parses faster. State
/// files are machine-readable; use `serde_json::to_string_pretty` only for
/// human-facing exports.
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
        let root = Path::new("D:/Games/StellaSora_EN");
        assert_eq!(plan_path(root), root.join(".yayl").join("plan.json"));
        assert_eq!(task_path(root), root.join(".yayl").join("task.json"));
        assert_eq!(
            remote_manifest_path(root),
            root.join(".yayl").join("manifest.json")
        );
        assert_eq!(
            legacy_remote_manifest_path(root),
            root.join(".yayl").join("remote-manifest.json")
        );
    }

    #[test]
    fn reads_and_migrates_the_legacy_manifest_name() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = legacy_remote_manifest_path(dir.path());
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, b"{\"file\":[]}").unwrap();

        let body = read_remote_manifest(dir.path()).unwrap();
        assert_eq!(body, "{\"file\":[]}");
        assert!(remote_manifest_path(dir.path()).exists());
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
