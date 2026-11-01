//! Small launcher settings file. Kept outside the game folder so the official
//! manifest/config stay untouched.

use crate::downloader::DownloadOrder;
use crate::error::Result;
use crate::proxy::ProxySettings;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Matches the desktop downloader default. Clamped again when a client is
/// built, so an old or hand-edited file cannot open thousands of sockets.
pub const DEFAULT_CONCURRENCY: usize = 10;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundMode {
    /// Full-bleed key art fetched by the launcher.
    #[default]
    Art,
    /// Token gradient without game art.
    Solid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub install_roots: BTreeMap<String, PathBuf>,
    #[serde(default)]
    pub language: Option<String>,
    /// Network proxy. The default is direct, matching the official launcher.
    #[serde(default)]
    pub proxy: ProxySettings,
    /// File scheduling policy. Defaults to smallest-first.
    #[serde(default)]
    pub download_order: DownloadOrder,
    /// Parallel file downloads. Valid range is 1-32.
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
    /// Reduce animation in the launcher UI.
    #[serde(default)]
    pub reduced_motion: bool,
    /// Backdrop style for the launcher UI.
    #[serde(default)]
    pub background: BackgroundMode,
    /// False only for a brand-new install. Old settings files are migrated to
    /// true because they predate onboarding.
    #[serde(default)]
    pub onboarding_complete: bool,
}

fn default_concurrency() -> usize {
    DEFAULT_CONCURRENCY
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            install_roots: BTreeMap::new(),
            language: None,
            proxy: ProxySettings::default(),
            download_order: DownloadOrder::default(),
            concurrency: DEFAULT_CONCURRENCY,
            reduced_motion: false,
            background: BackgroundMode::default(),
            onboarding_complete: false,
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let body = std::fs::read_to_string(path)?;
        let mut value: serde_json::Value = serde_json::from_str(&body)?;
        // Settings files written before onboarding existed belong to users who
        // already used the app. Do not show them the first-run flow again.
        if let Some(object) = value.as_object_mut() {
            object
                .entry("onboarding_complete")
                .or_insert(serde_json::Value::Bool(true));
        }
        Ok(serde_json::from_value(value)?)
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let body = serde_json::to_string_pretty(self).map_err(|error| {
            crate::error::Error::new(crate::error::ErrorCode::Io, error.to_string())
        })?;
        crate::state::write_atomic(path, body.as_bytes())
    }

    pub fn install_root(&self, game_id: &str) -> Option<&Path> {
        self.install_roots.get(game_id).map(PathBuf::as_path)
    }

    pub fn set_install_root(&mut self, game_id: &str, root: impl Into<PathBuf>) {
        self.install_roots.insert(game_id.to_string(), root.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut settings = Settings::default();
        settings.set_install_root("stella", dir.path().join("StellaSora_EN"));
        settings.proxy =
            ProxySettings::manual("socks5://127.0.0.1:1080").with_no_proxy("localhost");
        settings.download_order = DownloadOrder::LargestFirst;
        settings.concurrency = 16;
        settings.reduced_motion = true;
        settings.background = BackgroundMode::Solid;
        settings.onboarding_complete = true;
        settings.save(&path).unwrap();

        let loaded = Settings::load(&path).unwrap();
        assert_eq!(
            loaded.install_root("stella"),
            Some(dir.path().join("StellaSora_EN").as_path())
        );
        assert_eq!(loaded.proxy, settings.proxy);
        assert_eq!(loaded.download_order, DownloadOrder::LargestFirst);
        assert_eq!(loaded.concurrency, 16);
        assert!(loaded.reduced_motion);
        assert_eq!(loaded.background, BackgroundMode::Solid);
        assert!(loaded.onboarding_complete);
    }

    #[test]
    fn old_settings_files_still_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"install_roots":{},"language":"vi"}"#).unwrap();
        let settings = Settings::load(&path).unwrap();
        assert_eq!(settings.proxy, ProxySettings::default());
        assert_eq!(settings.download_order, DownloadOrder::SmallestFirst);
        assert_eq!(settings.concurrency, DEFAULT_CONCURRENCY);
        // Existing users are not sent through onboarding again.
        assert!(settings.onboarding_complete);
    }

    #[test]
    fn missing_file_is_empty_settings() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Settings::load(&dir.path().join("missing.json")).unwrap();
        assert!(settings.install_roots.is_empty());
        assert!(!settings.onboarding_complete);
        assert_eq!(settings.concurrency, DEFAULT_CONCURRENCY);
    }
}
