//! Tauri host for the YAYL desktop launcher.

mod commands;
mod download;
mod error;
mod settings;
mod state;

use state::AppState;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

fn tray_menu(app: &tauri::AppHandle, lang: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let (open, quit) = if lang == "en" {
        ("Open YAYL", "Quit")
    } else {
        ("Mở YAYL", "Thoát")
    };
    let open_item = MenuItem::with_id(app, "show", open, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open_item, &quit_item])
}

/// Rebuild the tray menu after the UI language changes.
pub(crate) fn refresh_tray(app: &tauri::AppHandle, lang: &str) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    if let Ok(menu) = tray_menu(app, lang) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let lang = settings::load(app.handle())
                .ok()
                .and_then(|settings| settings.language)
                .unwrap_or_else(|| "vi".to_owned());
            if let Some(icon) = app.default_window_icon().cloned() {
                let menu = tray_menu(app.handle(), &lang)?;
                TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .tooltip("YAYL")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => show_main(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let close_to_tray = settings::load(app)
                    .map(|settings| settings.close_to_tray)
                    .unwrap_or(false);
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::download_bytes,
            commands::disk_space,
            commands::default_install_root,
            commands::load_settings,
            commands::save_install_root,
            commands::set_language,
            commands::save_network_settings,
            commands::save_appearance,
            commands::save_window_behavior,
            commands::save_first_run,
            commands::complete_onboarding,
            commands::reset_settings,
            commands::game_profiles,
            commands::app_info,
            commands::playtime,
            commands::launch_game,
            commands::fetch_news,
            commands::fetch_social,
            commands::fetch_background,
            commands::open_external,
            commands::game_version,
            commands::choose_install_folder,
            commands::open_install_folder,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            download::download_status,
            download::start_download,
            download::cancel_download,
            download::discard_download,
            download::verify_game,
            download::repair_game,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run YAYL");
}
