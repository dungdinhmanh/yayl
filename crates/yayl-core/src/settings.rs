//! Launcher settings file, kept outside the game folder.

use crate::downloader::DownloadOrder;
use crate::error::Result;
use crate::proxy::ProxySettings;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Matches the downloader default; clamped when a client is built.
pub const DEFAULT_CONCURRENCY: usize = 10;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundMode {
    /// Full-bleed key art fetched by the launcher.
    #[default]
    Art,
    /// User-provided image, GIF, or video.
    Custom,
    /// Token gradient without game art.
    Solid,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundFit {
    /// Fill the window, cropping overflow.
    #[default]
    Cover,
    /// Show the whole media with letterboxing.
    Contain,
    /// Natural size, centered.
    Center,
    /// Repeat the image or GIF from the top-left.
    Tile,
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
    /// Fallback copy of the custom backdrop in the app cache.
    #[serde(default)]
    pub background_path: Option<PathBuf>,
    /// Original custom backdrop path; used first, with `background_path` as fallback.
    #[serde(default)]
    pub background_source: Option<PathBuf>,
    /// Backdrop blur in pixels, 0-40.
    #[serde(default)]
    pub background_blur: u8,
    /// Backdrop grain strength, 0-100.
    #[serde(default)]
    pub background_noise: u8,
    /// Backdrop opacity percent, 20-100.
    #[serde(default = "default_opacity")]
    pub background_opacity: u8,
    /// How custom media fills the window.
    #[serde(default)]
    pub background_fit: BackgroundFit,
    /// Silence backdrop video audio.
    #[serde(default = "default_true")]
    pub background_muted: bool,
    /// Restart backdrop video when it ends.
    #[serde(default = "default_true")]
    pub background_loop: bool,
    /// False only for a brand-new install.
    #[serde(default)]
    pub onboarding_complete: bool,
    /// Keep YAYL in the tray when the window is closed.
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
}

fn default_concurrency() -> usize {
    DEFAULT_CONCURRENCY
}

fn default_true() -> bool {
    true
}

fn default_opacity() -> u8 {
    100
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
            background_path: None,
            background_source: None,
            background_blur: 0,
            background_noise: 0,
            background_opacity: 100,
            background_fit: BackgroundFit::default(),
            background_muted: true,
            background_loop: true,
            onboarding_complete: false,
            close_to_tray: true,
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
        // Existing users are not sent through onboarding again.
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
        settings.background = BackgroundMode::Custom;
        settings.background_path = Some(dir.path().join("cache").join("wallpaper.mp4"));
        settings.background_source = Some(dir.path().join("wallpaper.mp4"));
        settings.background_blur = 12;
        settings.background_noise = 40;
        settings.background_opacity = 70;
        settings.background_fit = BackgroundFit::Contain;
        settings.background_muted = false;
        settings.background_loop = false;
        settings.onboarding_complete = true;
        settings.close_to_tray = false;
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
        assert_eq!(loaded.background, BackgroundMode::Custom);
        assert_eq!(
            loaded.background_path,
            Some(dir.path().join("cache").join("wallpaper.mp4"))
        );
        assert_eq!(
            loaded.background_source,
            Some(dir.path().join("wallpaper.mp4"))
        );
        assert_eq!(loaded.background_blur, 12);
        assert_eq!(loaded.background_noise, 40);
        assert_eq!(loaded.background_opacity, 70);
        assert_eq!(loaded.background_fit, BackgroundFit::Contain);
        assert!(!loaded.background_muted);
        assert!(!loaded.background_loop);
        assert!(loaded.onboarding_complete);
        assert!(!loaded.close_to_tray);
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
        assert!(settings.close_to_tray);
        assert_eq!(settings.background_opacity, 100);
        assert_eq!(settings.background_fit, BackgroundFit::Cover);
        assert!(settings.background_muted);
        assert!(settings.background_loop);
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
