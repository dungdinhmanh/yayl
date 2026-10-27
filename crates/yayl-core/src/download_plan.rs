//! Download orchestration: API -> game config -> manifest -> CDN -> files.
//!
//! The official launcher asks the API for the current game version and basis,
//! fetches the remote manifest, then downloads individual files from
//! `<cdn>/<manifest.source>/<file path>`. YAYL follows the same order so the
//! manifest and its checksums are on disk before any game file is requested.
//!
//! `manifest.json` and `game-launcher-config.json` are written only after every
//! file has passed CRC verification, matching the official launcher.

use crate::api::{CdnConfig, GameConfig, LauncherApi};
use crate::downloader::{CancelToken, DownloadReport, Downloader, FileJob, Progress};
use crate::error::{Error, ErrorCode, Result};
use crate::local_manifest::{GameConfigFile, LocalManifest, game_config_path, manifest_path};
use crate::manifest::Manifest;
use crate::profile::GameProfile;
use std::path::{Path, PathBuf};

/// Launcher version used in the signed API envelope. The server accepts any
/// recent version; this is not the game version.
pub const DEFAULT_LAUNCHER_VERSION: &str = "0.1.0";

/// Directory for YAYL's own cache files inside the install root.
const STATE_DIR: &str = ".yayl";
const REMOTE_MANIFEST_FILE: &str = "remote-manifest.json";

/// Everything fetched from the API/CDN before the first game byte is written.
#[derive(Debug, Clone)]
pub struct RemoteGame {
    pub profile: GameProfile,
    pub launcher_version: String,
    pub game: GameConfig,
    pub cdn: CdnConfig,
    pub manifest_url: String,
    pub manifest: Manifest,
    /// Exact manifest bytes, persisted before the download starts.
    pub raw_manifest: String,
}

impl RemoteGame {
    /// Fetch game config, CDN config, and the remote manifest.
    pub async fn fetch(profile: GameProfile, launcher_version: impl Into<String>) -> Result<Self> {
        let launcher_version = launcher_version.into();
        if launcher_version.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                "launcher version is empty",
            ));
        }

        let api = LauncherApi::new(&profile, launcher_version.clone())?;
        let (game, cdn) = tokio::join!(api.game_config(), api.cdn());
        let game = game?;
        let cdn = cdn?;

        if game.game_latest_version.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "game config has no latest version",
            ));
        }
        if game.game_latest_file_path.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "game config has no manifest basis",
            ));
        }
        if cdn.primary_cdn.trim().is_empty() && cdn.back_up_cdn.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Http,
                "CDN config has no download host",
            ));
        }

        let fetched = api
            .fetch_manifest(&game.game_latest_version, &game.game_latest_file_path)
            .await?;
        if fetched.manifest.source.trim_matches('/').is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "remote manifest has no source prefix",
            ));
        }

        Ok(Self {
            profile,
            launcher_version,
            game,
            cdn,
            manifest_url: fetched.url,
            manifest: fetched.manifest,
            raw_manifest: fetched.raw,
        })
    }

    /// Primary CDN, falling back to the backup host when the primary is empty.
    pub fn primary_cdn(&self) -> Result<&str> {
        let primary = self.cdn.primary_cdn.trim();
        if !primary.is_empty() {
            return Ok(primary);
        }
        let backup = self.cdn.back_up_cdn.trim();
        if !backup.is_empty() {
            return Ok(backup);
        }
        Err(Error::new(
            ErrorCode::Http,
            "CDN config has no download host",
        ))
    }

    /// Backup CDN when it differs from the primary host.
    pub fn backup_cdn(&self) -> Option<&str> {
        let primary = self.primary_cdn().ok()?;
        let backup = self.cdn.back_up_cdn.trim();
        if backup.is_empty() || backup == primary {
            None
        } else {
            Some(backup)
        }
    }
}

/// A prepared install: remote metadata plus the local install root.
#[derive(Debug, Clone)]
pub struct DownloadPlan {
    pub remote: RemoteGame,
    pub root: PathBuf,
}

impl DownloadPlan {
    /// Fetch all remote metadata and bind it to an install root. No directory
    /// is created here; the caller can still show a confirmation screen.
    pub async fn prepare(
        profile: GameProfile,
        root: impl Into<PathBuf>,
        launcher_version: impl Into<String>,
    ) -> Result<Self> {
        let root = root.into();
        crate::path::validate_install_root(&root)?;
        let remote = RemoteGame::fetch(profile, launcher_version).await?;
        Ok(Self { remote, root })
    }

    /// Build one resumable job per manifest entry, with the backup CDN first
    /// in fallback order after the primary.
    pub fn jobs(&self) -> Result<Vec<FileJob>> {
        let primary = self.remote.primary_cdn()?;
        let backup = self.remote.backup_cdn();

        Ok(self
            .remote
            .manifest
            .files
            .iter()
            .map(|entry| {
                let mut job = FileJob::new(
                    self.remote.manifest.file_url(primary, entry),
                    self.root.join(&entry.relative),
                    entry.size,
                    entry.crc64,
                );
                if let Some(backup) = backup {
                    job = job.with_backup(self.remote.manifest.file_url(backup, entry));
                }
                job
            })
            .collect())
    }

    pub fn remote_manifest_path(&self) -> PathBuf {
        self.root.join(STATE_DIR).join(REMOTE_MANIFEST_FILE)
    }

    /// Persist the exact remote manifest before downloading. This is the file
    /// used for checksums, so a crash never leaves the install without it.
    pub fn save_remote_manifest(&self) -> Result<PathBuf> {
        let path = self.remote_manifest_path();
        write_atomic(&path, self.remote.raw_manifest.as_bytes())?;
        Ok(path)
    }

    /// Write the official local metadata after a complete, verified download.
    pub fn write_local_metadata(&self) -> Result<()> {
        let game = &self.remote.game;
        let manifest = LocalManifest::from_manifest(
            self.remote.profile.game_tag,
            game.game_latest_version.clone(),
            game.game_latest_file_path.clone(),
            &self.remote.manifest,
        );
        manifest.save(&manifest_path(&self.root))?;

        let name = if game.game_start_exe_name.trim().is_empty() {
            self.remote.profile.executable.to_owned()
        } else {
            game.game_start_exe_name.clone()
        };
        let config = GameConfigFile::new(
            self.remote.profile.game_tag,
            name,
            game.game_start_params.clone(),
            game.game_latest_version.clone(),
            game.game_uninstall_script.clone(),
        );
        config.save(&game_config_path(&self.root))?;
        Ok(())
    }

    /// Persist the manifest, download every file, verify CRC, then write the
    /// official metadata. A partial failure leaves the manifest cache and all
    /// `.yayl-part` files in place for the next resume.
    pub async fn run<F>(
        &self,
        downloader: &Downloader,
        cancel: CancelToken,
        on_progress: F,
    ) -> Result<DownloadReport>
    where
        F: Fn(Progress) + Send + Sync + 'static,
    {
        std::fs::create_dir_all(&self.root)?;
        self.save_remote_manifest()?;

        let report = downloader
            .download_all(&self.root, self.jobs()?, cancel, on_progress)
            .await?;
        if report.is_complete() {
            self.write_local_metadata()?;
        }
        Ok(report)
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::ARKNIGHTS_EN;

    const REMOTE: &str = r#"{
      "source": "/Arknights_EN-042.0.0-game",
      "file": [
        {"path": "/Arknights.exe", "hash": "1726476550168236827", "size": "675304"},
        {"path": "/Arknights_Data/app.info", "hash": "0", "size": "0"}
      ]
    }"#;

    fn sample_plan(root: PathBuf) -> DownloadPlan {
        DownloadPlan {
            remote: RemoteGame {
                profile: ARKNIGHTS_EN,
                launcher_version: DEFAULT_LAUNCHER_VERSION.to_owned(),
                game: GameConfig {
                    game_latest_version: "042.0.0".to_owned(),
                    game_lowest_version: "042.0.0".to_owned(),
                    game_latest_file_path:
                        "prod/ZIP_TEMP/Arknights_EN_TEMP/Arknights_EN-042.0.0-game.zip".to_owned(),
                    game_start_exe_name: "Arknights".to_owned(),
                    game_start_params: vec!["-force-d3d11".to_owned()],
                    ..GameConfig::default()
                },
                cdn: CdnConfig {
                    primary_cdn: "https://cdn.example.com".to_owned(),
                    back_up_cdn: "https://backup.example.com".to_owned(),
                },
                manifest_url: "https://cdn.example.com/manifest.json".to_owned(),
                manifest: Manifest::parse(REMOTE).unwrap(),
                raw_manifest: REMOTE.to_owned(),
            },
            root,
        }
    }

    #[test]
    fn builds_source_aware_urls_with_backup() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());
        let jobs = plan.jobs().unwrap();

        assert_eq!(jobs.len(), 2);
        assert_eq!(
            jobs[0].urls[0],
            "https://cdn.example.com/Arknights_EN-042.0.0-game/Arknights.exe"
        );
        assert_eq!(
            jobs[0].urls[1],
            "https://backup.example.com/Arknights_EN-042.0.0-game/Arknights.exe"
        );
        assert_eq!(jobs[0].dest, dir.path().join("Arknights.exe"));
        assert_eq!(jobs[0].size, 675_304);
        assert_eq!(jobs[1].size, 0);
    }

    #[test]
    fn persists_the_manifest_before_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());

        let cache = plan.save_remote_manifest().unwrap();
        assert_eq!(cache, dir.path().join(".yayl/remote-manifest.json"));
        assert_eq!(std::fs::read_to_string(&cache).unwrap(), REMOTE);
        assert!(!manifest_path(dir.path()).exists());

        plan.write_local_metadata().unwrap();
        let local = LocalManifest::load(&manifest_path(dir.path())).unwrap();
        assert_eq!(local.name, "Arknights_EN");
        assert_eq!(local.version, "042.0.0");
        assert_eq!(
            local.basis,
            "prod/ZIP_TEMP/Arknights_EN_TEMP/Arknights_EN-042.0.0-game.zip"
        );
        assert_eq!(local.files.len(), 2);

        let config = GameConfigFile::load(&game_config_path(dir.path())).unwrap();
        assert_eq!(config.tag, "Arknights_EN");
        assert_eq!(config.name, "Arknights");
        assert_eq!(config.params, vec!["-force-d3d11".to_owned()]);
        assert_eq!(config.version, "042.0.0");
        let text = std::fs::read_to_string(game_config_path(dir.path())).unwrap();
        assert!(text.contains("\"gameUninstallScript\""));
        assert!(!text.contains("\"game_uninstall_script\""));
    }

    #[test]
    fn falls_back_to_the_backup_cdn() {
        let dir = tempfile::tempdir().unwrap();
        let mut plan = sample_plan(dir.path().to_path_buf());
        plan.remote.cdn.primary_cdn.clear();
        let jobs = plan.jobs().unwrap();
        assert_eq!(
            jobs[0].urls[0],
            "https://backup.example.com/Arknights_EN-042.0.0-game/Arknights.exe"
        );
        assert_eq!(jobs[0].urls.len(), 1);
    }
}
