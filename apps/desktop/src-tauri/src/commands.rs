//! Tauri commands used by `src/lib/ipc.ts`.
//!
//! Commands validate untrusted paths and return stable error codes. The
//! webview only renders localized copy mapped from those codes.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use yayl_core::download_plan::{DEFAULT_LAUNCHER_VERSION, RemoteGame};
use yayl_core::path::nearest_existing;
use yayl_core::profile::{self, GameProfile};
use yayl_core::{disk, path::validate_install_root};

use crate::error::CommandError;
use crate::settings::{self, SettingsView};
use crate::state::AppState;

fn profile(game: &str) -> Result<GameProfile, CommandError> {
    profile::by_id(game)
        .copied()
        .ok_or_else(|| CommandError::new("invalid_input", format!("unknown game: {game}")))
}

#[tauri::command]
pub async fn download_bytes(state: State<'_, AppState>, game: String) -> Result<u64, CommandError> {
    let profile = profile(&game)?;
    if let Some(bytes) = state.cached_size(&game) {
        return Ok(bytes);
    }

    let remote = RemoteGame::fetch(profile, DEFAULT_LAUNCHER_VERSION).await?;
    let bytes = remote.manifest.total_bytes();
    state.cache_size(game, bytes);
    Ok(bytes)
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceView {
    pub free_bytes: u64,
    pub total_bytes: u64,
}

#[tauri::command]
pub async fn disk_space(path: String) -> Result<DiskSpaceView, CommandError> {
    if path.trim().is_empty() {
        return Err(CommandError::new("path_invalid", "empty install path"));
    }
    let path = PathBuf::from(&path);
    if !path.is_absolute() {
        return Err(CommandError::new(
            "path_invalid",
            "install path must be absolute",
        ));
    }
    let space = tokio::task::spawn_blocking(move || disk::space_for(&path))
        .await
        .map_err(|error| CommandError::new("unknown", error.to_string()))??;
    Ok(DiskSpaceView {
        free_bytes: space.free_bytes,
        total_bytes: space.total_bytes,
    })
}

fn default_root(app: &AppHandle, profile: &GameProfile) -> Result<PathBuf, CommandError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| CommandError::new("io", error.to_string()))?;
    Ok(home.join("Games").join("YAYL").join(profile.install_dir))
}

/// Commands that read or mutate an install root only accept the root saved for
/// this game, or the default root before the first save.
pub(crate) fn ensure_allowed_root(
    app: &AppHandle,
    game: &str,
    path: &Path,
) -> Result<(), CommandError> {
    let profile = profile(game)?;
    validate_install_root(path)?;
    let mut allowed = vec![default_root(app, &profile)?];
    let settings = settings::load(app)?;
    if let Some(saved) = settings.install_root(game) {
        allowed.push(saved.to_path_buf());
    }
    if allowed.iter().any(|root| same_path(root, path)) {
        Ok(())
    } else {
        Err(CommandError::new(
            "path_invalid",
            format!("path is not an install root for {game}"),
        ))
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    let left: Vec<_> = left.components().collect();
    let right: Vec<_> = right.components().collect();
    if left.len() != right.len() {
        return false;
    }
    left.iter().zip(right.iter()).all(|(a, b)| {
        let a = a.as_os_str().to_string_lossy();
        let b = b.as_os_str().to_string_lossy();
        if cfg!(windows) {
            a.eq_ignore_ascii_case(&b)
        } else {
            a == b
        }
    })
}

#[tauri::command]
pub fn default_install_root(app: AppHandle, game: String) -> Result<String, CommandError> {
    let profile = profile(&game)?;
    Ok(default_root(&app, &profile)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<SettingsView, CommandError> {
    Ok(settings::load(&app)?.into())
}

#[tauri::command]
pub fn save_install_root(app: AppHandle, game: String, path: String) -> Result<(), CommandError> {
    profile(&game)?;
    let root = PathBuf::from(path);
    validate_install_root(&root)?;

    let mut settings = settings::load(&app)?;
    settings.set_install_root(&game, root);
    settings::save(&app, &settings)
}

#[tauri::command]
pub async fn choose_install_folder(
    app: AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file();
    if let Some(path) = default_path.filter(|value| !value.trim().is_empty()) {
        dialog = dialog.set_directory(path);
    }
    dialog.pick_folder(move |folder| {
        let _ = tx.send(folder);
    });

    let folder = rx
        .await
        .map_err(|error| CommandError::new("unknown", error.to_string()))?;
    Ok(folder
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn open_install_folder(app: AppHandle, game: String, path: String) -> Result<(), CommandError> {
    let path = PathBuf::from(&path);
    ensure_allowed_root(&app, &game, &path)?;
    // The install folder may not exist yet (before the first download), so open
    // the nearest existing ancestor instead of failing.
    let folder = nearest_existing(&path)?;
    app.opener()
        .open_path(folder.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| CommandError::new("unknown", error.to_string()))
}

#[tauri::command]
pub fn window_minimize(window: tauri::WebviewWindow) -> Result<(), CommandError> {
    window.minimize().map_err(Into::into)
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::WebviewWindow) -> Result<(), CommandError> {
    if window.is_maximized()? {
        window.unmaximize()?;
    } else {
        window.maximize()?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_close(window: tauri::WebviewWindow) -> Result<(), CommandError> {
    window.close().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_path_requires_every_component_to_match() {
        assert!(same_path(
            Path::new(r"C:\Games\YAYL\Arknights"),
            Path::new(r"C:\Games\YAYL\Arknights")
        ));
        assert!(!same_path(
            Path::new(r"C:\Games\YAYL\Arknights"),
            Path::new(r"C:\Games\YAYL\Arknights-old")
        ));
        assert!(!same_path(
            Path::new(r"C:\Games\YAYL\Arknights"),
            Path::new(r"C:\Games\YAYL")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn same_path_ignores_windows_case() {
        assert!(same_path(
            Path::new(r"C:\Games\YAYL\Arknights"),
            Path::new(r"c:\games\yayl\arknights")
        ));
    }
}
