//! Tauri commands used by `src/lib/ipc.ts`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use yayl_core::download_plan::{DEFAULT_LAUNCHER_VERSION, RemoteGame};
use yayl_core::downloader::DownloadOrder;
use yayl_core::path::nearest_existing;
use yayl_core::playtime::{PLAYTIME_FILE, PlaytimeEntry, PlaytimeStore};
use yayl_core::profile::{self, GameProfile};
use yayl_core::proxy::{ProxyMode, ProxySettings};
use yayl_core::settings::{BackgroundMode, Settings as CoreSettings};
use yayl_core::state::now_unix;
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
pub async fn download_bytes(
    app: AppHandle,
    state: State<'_, AppState>,
    game: String,
) -> Result<u64, CommandError> {
    let profile = profile(&game)?;
    if let Some(bytes) = state.cached_size(&game) {
        return Ok(bytes);
    }

    let client = yayl_core::proxy::build_client(&settings::load(&app)?.proxy)?;
    let remote = RemoteGame::fetch_with_client(profile, DEFAULT_LAUNCHER_VERSION, client).await?;
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

fn default_base(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| CommandError::new("io", error.to_string()))?;
    Ok(home.join("Games").join("YAYL"))
}

fn default_root(app: &AppHandle, profile: &GameProfile) -> Result<PathBuf, CommandError> {
    Ok(default_base(app)?.join(profile.install_dir))
}

/// Only accept the saved root for this game, or the default root.
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

fn validate_language(language: &str) -> Result<(), CommandError> {
    match language {
        "vi" | "en" => Ok(()),
        _ => Err(CommandError::new(
            "invalid_input",
            format!("unsupported language: {language}"),
        )),
    }
}

#[tauri::command]
pub fn set_language(app: AppHandle, language: String) -> Result<SettingsView, CommandError> {
    validate_language(&language)?;
    let mut settings = settings::load(&app)?;
    settings.language = Some(language.clone());
    settings::save(&app, &settings)?;
    crate::refresh_tray(&app, &language);
    Ok(settings.into())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSettingsPatch {
    pub mode: ProxyMode,
    pub url: Option<String>,
    pub no_proxy: Option<String>,
    pub download_order: DownloadOrder,
    pub concurrency: usize,
}

#[tauri::command]
pub fn save_network_settings(
    app: AppHandle,
    patch: NetworkSettingsPatch,
) -> Result<SettingsView, CommandError> {
    if !(1..=32).contains(&patch.concurrency) {
        return Err(CommandError::new(
            "invalid_input",
            "concurrency must be between 1 and 32",
        ));
    }
    let mut proxy = ProxySettings {
        mode: patch.mode,
        url: None,
        no_proxy: patch.no_proxy.filter(|value| !value.trim().is_empty()),
    };
    if proxy.mode == ProxyMode::Manual {
        proxy.url = patch.url.filter(|value| !value.trim().is_empty());
    }
    proxy.validate()?;

    let mut settings = settings::load(&app)?;
    settings.proxy = proxy;
    settings.download_order = patch.download_order;
    settings.concurrency = patch.concurrency;
    settings::save(&app, &settings)?;
    Ok(settings.into())
}

#[tauri::command]
pub fn save_appearance(
    app: AppHandle,
    reduced_motion: bool,
    background: BackgroundMode,
) -> Result<SettingsView, CommandError> {
    let mut settings = settings::load(&app)?;
    settings.reduced_motion = reduced_motion;
    settings.background = background;
    settings::save(&app, &settings)?;
    Ok(settings.into())
}

#[tauri::command]
pub fn save_window_behavior(
    app: AppHandle,
    close_to_tray: bool,
) -> Result<SettingsView, CommandError> {
    let mut settings = settings::load(&app)?;
    settings.close_to_tray = close_to_tray;
    settings::save(&app, &settings)?;
    Ok(settings.into())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunInput {
    pub language: String,
    pub roots: BTreeMap<String, String>,
}

/// Persist first-run choices before the summary step.
#[tauri::command]
pub fn save_first_run(app: AppHandle, input: FirstRunInput) -> Result<SettingsView, CommandError> {
    validate_language(&input.language)?;
    if input.roots.is_empty() {
        return Err(CommandError::new(
            "invalid_input",
            "select at least one game",
        ));
    }

    let mut roots = BTreeMap::new();
    for (game, path) in input.roots {
        profile(&game)?;
        let root = PathBuf::from(path);
        validate_install_root(&root)?;
        roots.insert(game, root);
    }

    let mut settings = settings::load(&app)?;
    settings.language = Some(input.language);
    for (game, root) in roots {
        settings.set_install_root(&game, root);
    }
    settings::save(&app, &settings)?;
    Ok(settings.into())
}

#[tauri::command]
pub fn complete_onboarding(app: AppHandle) -> Result<SettingsView, CommandError> {
    let mut settings = settings::load(&app)?;
    settings.onboarding_complete = true;
    settings::save(&app, &settings)?;
    Ok(settings.into())
}

/// Reset preferences; install folders and game files are untouched.
#[tauri::command]
pub fn reset_settings(app: AppHandle) -> Result<SettingsView, CommandError> {
    let current = settings::load(&app)?;
    let next = CoreSettings {
        install_roots: current.install_roots,
        onboarding_complete: current.onboarding_complete,
        ..CoreSettings::default()
    };
    settings::save(&app, &next)?;
    crate::refresh_tray(&app, "vi");
    Ok(next.into())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameProfileView {
    pub id: String,
    pub install_dir: String,
    pub default_root: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameProfilesView {
    pub base: String,
    pub games: Vec<GameProfileView>,
}

#[tauri::command]
pub fn game_profiles(app: AppHandle) -> Result<GameProfilesView, CommandError> {
    let base = default_base(&app)?;
    let games = profile::PROFILES
        .iter()
        .map(|profile| GameProfileView {
            id: profile.id.to_owned(),
            install_dir: profile.install_dir.to_owned(),
            default_root: base
                .join(profile.install_dir)
                .to_string_lossy()
                .into_owned(),
        })
        .collect();
    Ok(GameProfilesView {
        base: base.to_string_lossy().into_owned(),
        games,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfoView {
    pub version: String,
    pub debug: bool,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfoView {
    AppInfoView {
        version: app.package_info().version.to_string(),
        debug: cfg!(debug_assertions),
    }
}

const GAME_EXIT_EVENT: &str = "game-exit";

/// Serialize playtime writes when two games run at once.
static PLAYTIME_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaytimeView {
    pub seconds: u64,
    pub last_played: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameExitEvent {
    game: String,
    /// Total seconds across every session.
    total_seconds: u64,
    last_played: u64,
}

fn playtime_path(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let settings = settings::path(app)?;
    let dir = settings
        .parent()
        .ok_or_else(|| CommandError::new("io", "settings path has no parent"))?;
    Ok(dir.join(PLAYTIME_FILE))
}

#[tauri::command]
pub fn playtime(app: AppHandle, game: String) -> Result<PlaytimeView, CommandError> {
    profile(&game)?;
    let store = PlaytimeStore::load(&playtime_path(&app)?)?;
    let entry = store.entry(&game);
    Ok(PlaytimeView {
        seconds: entry.seconds,
        last_played: entry.last_played,
    })
}

/// Start the game and record the session; a damaged install returns `game_damaged`.
#[tauri::command]
pub async fn launch_game(app: AppHandle, game: String) -> Result<u32, CommandError> {
    let profile = profile(&game)?;
    let settings = settings::load(&app)?;
    let root = match settings.install_roots.get(&game) {
        Some(root) => root.clone(),
        None => default_root(&app, &profile)?,
    };
    ensure_allowed_root(&app, &game, &root)?;

    let local = {
        let root = root.clone();
        tokio::task::spawn_blocking(move || local_game_version(&root))
            .await
            .map_err(|error| CommandError::new("unknown", error.to_string()))?
    };
    if let Some(local) = local {
        // A slow or offline server must not block launch; only a reply can reject it.
        let client = yayl_core::proxy::build_client(&settings.proxy)?;
        let api =
            yayl_core::api::LauncherApi::with_client(&profile, DEFAULT_LAUNCHER_VERSION, client)?;
        if let Ok(Ok(config)) =
            tokio::time::timeout(Duration::from_secs(3), api.game_config()).await
            && config.is_below_minimum(&local)
        {
            return Err(CommandError::new(
                "update_required",
                format!("installed {local} is below the minimum supported version"),
            ));
        }
    }

    let (mut child, started) = tokio::task::spawn_blocking(move || {
        let damaged = yayl_core::process::damaged_files(&root).map_err(CommandError::from)?;
        if !damaged.is_empty() {
            return Err(CommandError::new(
                "game_damaged",
                format!(
                    "{} installed files are missing or the wrong size",
                    damaged.len()
                ),
            ));
        }
        let child = yayl_core::process::launch(&root, &profile).map_err(CommandError::from)?;
        Ok::<_, CommandError>((child, now_unix()))
    })
    .await
    .map_err(|error| CommandError::new("unknown", error.to_string()))??;

    let pid = child.id();

    let handle = app.clone();
    let id = game.clone();
    std::thread::spawn(move || {
        let _ = child.wait();
        let ended = now_unix();
        let seconds = ended.saturating_sub(started);
        let entry = record_session(&handle, &id, seconds, ended);
        let _ = handle.emit(
            GAME_EXIT_EVENT,
            GameExitEvent {
                game: id,
                total_seconds: entry.seconds,
                last_played: ended,
            },
        );
    });

    Ok(pid)
}

fn record_session(app: &AppHandle, game: &str, seconds: u64, ended: u64) -> PlaytimeEntry {
    let entry = PlaytimeEntry {
        seconds,
        last_played: Some(ended),
    };
    let Ok(path) = playtime_path(app) else {
        return entry;
    };
    let _guard = PLAYTIME_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut store = PlaytimeStore::load(&path).unwrap_or_default();
    let updated = store.record(game, seconds, ended);
    if let Err(error) = store.save(&path) {
        #[cfg(debug_assertions)]
        eprintln!("cannot save playtime: {error}");
    }
    updated
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
pub async fn fetch_news(
    app: AppHandle,
    game: String,
) -> Result<yayl_core::api::NewsFeed, CommandError> {
    let profile = profile(&game)?;
    let client = yayl_core::proxy::build_client(&settings::load(&app)?.proxy)?;
    let api = yayl_core::api::LauncherApi::with_client(&profile, DEFAULT_LAUNCHER_VERSION, client)?;
    Ok(api.news().await?)
}

/// Official social channels; URLs are validated in the core.
#[tauri::command]
pub async fn fetch_social(
    app: AppHandle,
    game: String,
) -> Result<Vec<yayl_core::api::SocialLink>, CommandError> {
    let profile = profile(&game)?;
    let client = yayl_core::proxy::build_client(&settings::load(&app)?.proxy)?;
    let api = yayl_core::api::LauncherApi::with_client(&profile, DEFAULT_LAUNCHER_VERSION, client)?;
    Ok(api.social().await?)
}

fn background_dir(app: &AppHandle, game: &str) -> Result<PathBuf, CommandError> {
    let data = app
        .path()
        .data_dir()
        .map_err(|error| CommandError::new("io", error.to_string()))?;
    Ok(data
        .join("yayl")
        .join("cache")
        .join("backgrounds")
        .join(game))
}

/// Fetch, verify, and cache the official background art.
#[tauri::command]
pub async fn fetch_background(
    app: AppHandle,
    game: String,
) -> Result<Option<String>, CommandError> {
    let profile = profile(&game)?;
    let client = yayl_core::proxy::build_client(&settings::load(&app)?.proxy)?;
    let api = yayl_core::api::LauncherApi::with_client(&profile, DEFAULT_LAUNCHER_VERSION, client)?;
    let dir = background_dir(&app, profile.id)?;

    let fetched = async {
        let config = api.base_config().await?;
        let Some(image) = yayl_core::background::image_from_config(
            &config.launcher_background_img,
            &config.launcher_background_img_crc64,
        ) else {
            return Ok::<Option<PathBuf>, yayl_core::Error>(None);
        };

        let path = yayl_core::background::cached_path(&dir, &image);
        if path.is_file() {
            let expected = image.crc64.parse::<u64>().map_err(|_| {
                yayl_core::Error::new(
                    yayl_core::ErrorCode::InvalidInput,
                    "background checksum is not a decimal CRC-64",
                )
            })?;
            let check = path.clone();
            let actual =
                tokio::task::spawn_blocking(move || yayl_core::crc64::crc64_file_blocking(&check))
                    .await
                    .map_err(|error| {
                        yayl_core::Error::new(yayl_core::ErrorCode::Unknown, error.to_string())
                    })??;
            if actual == expected {
                return Ok(Some(path));
            }
            // A corrupted cache entry is replaced, not shown.
            let _ = std::fs::remove_file(&path);
        }

        let bytes = api.background_image(&config).await?;
        let store_dir = dir.clone();
        let store_image = image.clone();
        let path = tokio::task::spawn_blocking(move || {
            yayl_core::background::store(&store_dir, &store_image, &bytes)
        })
        .await
        .map_err(|error| {
            yayl_core::Error::new(yayl_core::ErrorCode::Unknown, error.to_string())
        })??;
        Ok(Some(path))
    }
    .await;

    match fetched {
        Ok(Some(path)) => Ok(Some(path.to_string_lossy().into_owned())),
        Ok(None) => Ok(None),
        Err(error) => {
            if let Some(path) = yayl_core::background::newest(&dir) {
                return Ok(Some(path.to_string_lossy().into_owned()));
            }
            Err(error.into())
        }
    }
}

/// Open an https link in the system browser.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), CommandError> {
    yayl_core::url::validate_remote_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| CommandError::new("unknown", error.to_string()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameVersionView {
    pub local: Option<String>,
    pub latest: Option<String>,
    pub minimum: Option<String>,
    pub update_available: bool,
    pub update_required: bool,
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn local_game_version(root: &Path) -> Option<String> {
    yayl_core::local_manifest::LocalManifest::load(&yayl_core::local_manifest::manifest_path(root))
        .ok()
        .and_then(|manifest| non_empty(manifest.version))
}

/// Installed and latest/minimum versions; the local version works offline.
#[tauri::command]
pub async fn game_version(app: AppHandle, game: String) -> Result<GameVersionView, CommandError> {
    let profile = profile(&game)?;
    let root = settings::load(&app)?
        .install_root(&game)
        .map(Path::to_path_buf)
        .unwrap_or(default_root(&app, &profile)?);
    ensure_allowed_root(&app, &game, &root)?;
    let local = tokio::task::spawn_blocking(move || local_game_version(&root))
        .await
        .map_err(|error| CommandError::new("unknown", error.to_string()))?;

    let client = yayl_core::proxy::build_client(&settings::load(&app)?.proxy)?;
    let api = yayl_core::api::LauncherApi::with_client(&profile, DEFAULT_LAUNCHER_VERSION, client)?;
    let (latest, minimum, update_available, update_required) = match api.game_config().await {
        Ok(config) => {
            let update_available = local
                .as_deref()
                .is_some_and(|value| config.needs_update(value));
            let update_required = local
                .as_deref()
                .is_some_and(|value| config.is_below_minimum(value));
            (
                non_empty(config.game_latest_version),
                non_empty(config.game_lowest_version),
                update_available,
                update_required,
            )
        }
        Err(_) => (None, None, false, false),
    };

    Ok(GameVersionView {
        local,
        latest,
        minimum,
        update_available,
        update_required,
    })
}

#[tauri::command]
pub fn open_install_folder(app: AppHandle, game: String, path: String) -> Result<(), CommandError> {
    let path = PathBuf::from(&path);
    ensure_allowed_root(&app, &game, &path)?;
    // Open the nearest existing ancestor; the folder may not exist yet.
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
