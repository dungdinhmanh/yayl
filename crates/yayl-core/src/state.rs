//! YAYL's private state directory inside an install root.
//!
//! `plan.json` is the immutable download plan (game config, CDN list, manifest
//! snapshot, jobs). `task.json` is the mutable execution state. Keeping them
//! separate means a progress update never rewrites the manifest snapshot that
//! verify/repair and manifest diff rely on.

use crate::error::{Error, ErrorCode, Result};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const STATE_DIR: &str = ".yayl";
pub const PLAN_FILE: &str = "plan.json";
pub const TASK_FILE: &str = "task.json";
pub const REMOTE_MANIFEST_FILE: &str = "remote-manifest.json";

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

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

/// Write a file and make the rename durable before replacing the old file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::OpenOptions::new()
        .write(true)
        .open(&tmp)?
        .sync_all()?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(&tmp, path)?;
    Ok(())
}

pub fn write_json_atomic<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let body = serde_json::to_string_pretty(value)
        .map_err(|error| Error::new(ErrorCode::Io, error.to_string()))?;
    write_atomic(path, body.as_bytes())
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
            root.join(".yayl").join("remote-manifest.json")
        );
    }

    #[test]
    fn atomic_write_replaces_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        write_atomic(&path, b"first").unwrap();
        write_atomic(&path, b"second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
    }
}
