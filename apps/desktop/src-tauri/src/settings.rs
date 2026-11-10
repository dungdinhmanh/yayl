//! Launcher settings stored under the user's app-data directory.
//!
//! Game install folders are the only state the UI needs before it can ask the
//! backend for resume status. The official game folders stay untouched.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use yayl_core::downloader::DownloadOrder;
use yayl_core::proxy::{ProxyMode, ProxySettings};
use yayl_core::settings::{BackgroundMode, Settings};

use crate::error::CommandError;

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyView {
    pub mode: ProxyMode,
    pub url: Option<String>,
    pub no_proxy: Option<String>,
}

impl From<ProxySettings> for ProxyView {
    fn from(value: ProxySettings) -> Self {
        Self {
            mode: value.mode,
            url: value.url,
            no_proxy: value.no_proxy,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub install_roots: BTreeMap<String, String>,
    pub language: Option<String>,
    pub proxy: ProxyView,
    pub download_order: DownloadOrder,
    pub concurrency: usize,
    pub reduced_motion: bool,
    pub background: BackgroundMode,
    pub background_path: Option<String>,
    pub background_blur: u8,
    pub background_noise: u8,
    pub onboarding_complete: bool,
    pub close_to_tray: bool,
}

impl From<Settings> for SettingsView {
    fn from(value: Settings) -> Self {
        Self {
            install_roots: value
                .install_roots
                .into_iter()
                .map(|(game, root)| (game, root.to_string_lossy().into_owned()))
                .collect(),
            language: value.language,
            proxy: value.proxy.into(),
            download_order: value.download_order,
            concurrency: value.concurrency,
            reduced_motion: value.reduced_motion,
            background: value.background,
            background_path: value
                .background_path
                .map(|path| path.to_string_lossy().into_owned()),
            background_blur: value.background_blur,
            background_noise: value.background_noise,
            onboarding_complete: value.onboarding_complete,
            close_to_tray: value.close_to_tray,
        }
    }
}

pub fn path(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let data = app
        .path()
        .data_dir()
        .map_err(|error| CommandError::new("io", error.to_string()))?;
    Ok(data.join("yayl").join(SETTINGS_FILE))
}

pub fn load(app: &AppHandle) -> Result<Settings, CommandError> {
    Ok(Settings::load(&path(app)?)?)
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), CommandError> {
    settings.save(&path(app)?)?;
    Ok(())
}
