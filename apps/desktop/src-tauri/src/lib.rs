//! Tauri host for the YAYL desktop launcher.

mod commands;
mod download;
mod error;
mod settings;
mod state;

use state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::download_bytes,
            commands::disk_space,
            commands::default_install_root,
            commands::load_settings,
            commands::save_install_root,
            commands::choose_install_folder,
            commands::open_install_folder,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            download::download_status,
            download::start_download,
            download::cancel_download,
            download::discard_download,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run YAYL");
}
