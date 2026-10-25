//! Disk-space queries for the selected install root.

use crate::error::{Error, Result};
use crate::path::nearest_existing;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct DiskSpace {
    pub free_bytes: u64,
    pub total_bytes: u64,
}

impl DiskSpace {
    pub fn used_bytes(self) -> u64 {
        self.total_bytes.saturating_sub(self.free_bytes)
    }

    pub fn has_room_for(self, bytes: u64) -> bool {
        self.free_bytes >= bytes
    }
}

pub fn space_for(path: &Path) -> Result<DiskSpace> {
    let probe = nearest_existing(path)?;
    let free_bytes = fs4::available_space(&probe)
        .map_err(|error| Error::disk(format!("cannot read free space: {error}")))?;
    let total_bytes = fs4::total_space(&probe)
        .map_err(|error| Error::disk(format!("cannot read total space: {error}")))?;
    Ok(DiskSpace {
        free_bytes,
        total_bytes,
    })
}

/// "C:" on Windows, "/" elsewhere. Used by the install dialog.
pub fn drive_label(path: &Path) -> String {
    for component in path.components() {
        if let Component::Prefix(prefix) = component {
            return prefix.as_os_str().to_string_lossy().to_string();
        }
    }
    if cfg!(windows) {
        path.components()
            .next()
            .map(|part| part.as_os_str().to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        "/".to_string()
    }
}

/// Display helper shared by the CLI and future IPC layer.
pub fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.2} {}", UNITS[unit])
}

pub fn default_install_root(base: &Path, install_dir: &str) -> PathBuf {
    base.join(install_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_bytes() {
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1024), "1.00 KB");
        assert_eq!(format_bytes(20_086_893_425), "18.71 GB");
    }

    #[test]
    fn reads_space_from_an_existing_ancestor() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("not-created-yet");
        let space = space_for(&nested).unwrap();
        assert!(space.total_bytes > 0);
        assert!(space.free_bytes <= space.total_bytes);
    }

    #[test]
    fn drive_label_is_never_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!drive_label(dir.path()).is_empty());
    }
}
