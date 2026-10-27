//! Install planning: total size, free space, and the saved location.

use crate::disk::{self, DiskSpace};
use crate::error::{Error, Result};
use crate::manifest::{Manifest, fetch_manifest};
use crate::path::{nearest_existing, validate_install_root};
use crate::profile::GameProfile;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct InstallPlan {
    pub root: PathBuf,
    pub drive: String,
    pub download_bytes: u64,
    pub install_bytes: u64,
    pub free_bytes: u64,
    pub total_bytes: u64,
    pub enough_space: bool,
    pub missing_bytes: u64,
    pub existing_install: bool,
}

impl InstallPlan {
    pub fn from_manifest(
        manifest: &Manifest,
        root: &Path,
        profile: Option<&GameProfile>,
    ) -> Result<Self> {
        validate_install_root(root)?;
        let space = disk::space_for(root)?;
        Ok(Self::from_parts(
            manifest.total_bytes(),
            manifest.total_bytes(),
            root,
            space,
            profile,
        ))
    }

    pub fn from_parts(
        download_bytes: u64,
        install_bytes: u64,
        root: &Path,
        space: DiskSpace,
        profile: Option<&GameProfile>,
    ) -> Self {
        let required = install_bytes.max(download_bytes);
        let missing_bytes = required.saturating_sub(space.free_bytes);
        Self {
            root: root.to_path_buf(),
            drive: disk::drive_label(root),
            download_bytes,
            install_bytes,
            free_bytes: space.free_bytes,
            total_bytes: space.total_bytes,
            enough_space: missing_bytes == 0,
            missing_bytes,
            existing_install: profile
                .map(|profile| detect_existing(root, profile))
                .unwrap_or(false),
        }
    }

    pub fn display_download(&self) -> String {
        disk::format_bytes(self.download_bytes)
    }

    pub fn display_install(&self) -> String {
        disk::format_bytes(self.install_bytes)
    }

    pub fn display_free(&self) -> String {
        disk::format_bytes(self.free_bytes)
    }

    pub fn display_missing(&self) -> String {
        disk::format_bytes(self.missing_bytes)
    }
}

/// Fetch the manifest and read disk space concurrently. The UI can start the
/// disk query immediately while the API request is still in flight; neither
/// task waits for the other.
pub async fn plan_install(
    manifest_url: &str,
    root: &Path,
    profile: Option<&GameProfile>,
) -> Result<InstallPlan> {
    validate_install_root(root)?;
    let client = crate::downloader::http_client()?;

    let manifest_future = fetch_manifest(&client, manifest_url);
    let disk_future = async {
        // Query the nearest existing ancestor so a not-yet-created root works.
        let probe = nearest_existing(root)?;
        disk::space_for(&probe)
    };

    let (manifest, space) = tokio::join!(manifest_future, disk_future);
    let manifest = manifest?;
    let space = space?;
    Ok(InstallPlan::from_parts(
        manifest.total_bytes(),
        manifest.total_bytes(),
        root,
        space,
        profile,
    ))
}

/// Build a plan when the manifest is already cached locally (offline start).
///
/// Accepts either the official local `manifest.json` (`files[]` with `vc`) or
/// a remote manifest (`file[]` with `source`).
pub fn plan_from_local_manifest(
    manifest_path: &Path,
    root: &Path,
    profile: Option<&GameProfile>,
) -> Result<InstallPlan> {
    let body = std::fs::read_to_string(manifest_path)?;
    let value: serde_json::Value = serde_json::from_str(&body)?;
    let manifest = if value.get("files").is_some() {
        crate::local_manifest::LocalManifest::load(manifest_path)?.to_manifest()?
    } else {
        Manifest::parse(&body)?
    };
    InstallPlan::from_manifest(&manifest, root, profile)
}

/// True when the selected folder already contains a game executable or the
/// official launcher config.
pub fn detect_existing(root: &Path, profile: &GameProfile) -> bool {
    root.join(profile.executable).is_file() || root.join("game-launcher-config.json").is_file()
}

/// Create the install root only when the user confirms, never during planning.
pub fn prepare_root(root: &Path) -> Result<()> {
    validate_install_root(root)?;
    if root.exists() {
        if !root.is_dir() {
            return Err(Error::path("install root is not a directory"));
        }
        return Ok(());
    }
    std::fs::create_dir_all(root)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::Manifest;
    use crate::profile::STELLA_SORA_EN;

    const SAMPLE: &str = r#"{
      "source": "/StellaSora_EN_1.13.0-game",
      "file": [
        {"path": "/StellaSora_Data/app.info", "hash": "15720943726513824584", "size": "37"},
        {"path": "/UnityPlayer.dll", "hash": "6400349585758476319", "size": "31006120"}
      ]
    }"#;

    #[test]
    fn plan_marks_enough_space() {
        let manifest = Manifest::parse(SAMPLE).unwrap();
        let space = DiskSpace {
            free_bytes: 100 * 1024 * 1024 * 1024,
            total_bytes: 500 * 1024 * 1024 * 1024,
        };
        let plan = InstallPlan::from_parts(
            manifest.total_bytes(),
            manifest.total_bytes(),
            Path::new("D:/Games/YAYL/StellaSora_EN"),
            space,
            Some(&STELLA_SORA_EN),
        );
        assert!(plan.enough_space);
        assert_eq!(plan.missing_bytes, 0);
        assert_eq!(plan.download_bytes, 31_006_157);
    }

    #[test]
    fn plan_marks_missing_space() {
        let space = DiskSpace {
            free_bytes: 10,
            total_bytes: 100,
        };
        let plan = InstallPlan::from_parts(
            50,
            60,
            Path::new("D:/Games/YAYL/StellaSora_EN"),
            space,
            Some(&STELLA_SORA_EN),
        );
        assert!(!plan.enough_space);
        assert_eq!(plan.missing_bytes, 50);
    }

    #[test]
    fn plans_from_the_official_local_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let manifest = Manifest::parse(SAMPLE).unwrap();
        let local = crate::local_manifest::LocalManifest::from_manifest(
            "StellaSora_EN",
            "1.13.0",
            "prod/StellaSora_EN_1.13.0-game.zip",
            &manifest,
        );
        let path = dir.path().join("manifest.json");
        local.save(&path).unwrap();

        let plan = plan_from_local_manifest(&path, &dir.path().join("game"), Some(&STELLA_SORA_EN))
            .unwrap();
        assert_eq!(plan.download_bytes, manifest.total_bytes());
    }
}
