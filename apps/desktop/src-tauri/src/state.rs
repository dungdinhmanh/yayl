//! In-memory state shared by Tauri commands.
//!
//! Only the active cancel token and the last manifest size are kept here.
//! Durable state stays in `<install root>/.yayl` and the app settings file.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use yayl_core::downloader::CancelToken;

struct ActiveDownload {
    id: u64,
    cancel: CancelToken,
}

#[derive(Default)]
pub struct AppState {
    downloads: Mutex<HashMap<String, ActiveDownload>>,
    sizes: Mutex<HashMap<String, u64>>,
    next_id: AtomicU64,
}

impl AppState {
    pub fn is_active(&self, game: &str) -> bool {
        lock(&self.downloads).contains_key(game)
    }

    /// Register a download and return its handle id. Returns `None` when the
    /// game already has an active download. Check and insert happen under one
    /// lock so two `start_download` calls cannot both win.
    pub fn begin(&self, game: String, cancel: CancelToken) -> Option<u64> {
        let mut downloads = lock(&self.downloads);
        if downloads.contains_key(&game) {
            return None;
        }
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        downloads.insert(game, ActiveDownload { id, cancel });
        Some(id)
    }

    /// Remove the download only if it is still the one registered by `begin`.
    /// A finished old task must not delete a newer resumed download.
    pub fn finish(&self, game: &str, id: u64) {
        let mut downloads = lock(&self.downloads);
        if downloads.get(game).is_some_and(|active| active.id == id) {
            downloads.remove(game);
        }
    }

    pub fn cancel(&self, game: &str) {
        if let Some(active) = lock(&self.downloads).get(game) {
            active.cancel.cancel();
        }
    }

    pub fn cached_size(&self, game: &str) -> Option<u64> {
        lock(&self.sizes).get(game).copied()
    }

    pub fn cache_size(&self, game: String, bytes: u64) {
        lock(&self.sizes).insert(game, bytes);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_finished_old_handle_keeps_the_new_download() {
        let state = AppState::default();
        let first = state.begin("demo".to_owned(), CancelToken::new()).unwrap();
        state.finish("demo", first);
        assert!(!state.is_active("demo"));

        let second = state.begin("demo".to_owned(), CancelToken::new()).unwrap();
        assert_ne!(first, second);
        // The first task's cleanup runs after the second task started.
        state.finish("demo", first);
        assert!(state.is_active("demo"));
        state.finish("demo", second);
        assert!(!state.is_active("demo"));
    }

    #[test]
    fn begin_rejects_a_second_download_for_the_same_game() {
        let state = AppState::default();
        assert!(state.begin("demo".to_owned(), CancelToken::new()).is_some());
        assert!(state.begin("demo".to_owned(), CancelToken::new()).is_none());
        assert!(
            state
                .begin("other".to_owned(), CancelToken::new())
                .is_some()
        );
    }
}
