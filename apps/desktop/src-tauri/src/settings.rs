//! Launcher settings stored under the user's app-data directory.
//!
//! Game install folders are the only state the UI needs before it can ask the
//! backend for resume status. The official game folders stay untouched.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use yayl_core::settings::Settings;

use crate::error::CommandError;

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub install_roots: BTreeMap<String, String>,
    pub language: Option<String>,
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
