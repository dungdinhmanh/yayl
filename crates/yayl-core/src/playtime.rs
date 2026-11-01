//! Playtime history kept outside the install root.
//!
//! The file survives moving a game to another folder, which is why it lives in
//! the launcher's data directory instead of `<install root>/.yayl`.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

pub const PLAYTIME_FILE: &str = "playtime.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaytimeEntry {
    /// Total seconds across every session.
    #[serde(default)]
    pub seconds: u64,
    /// Unix timestamp of the last session end.
    #[serde(default)]
    pub last_played: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaytimeStore {
    #[serde(default)]
    pub games: BTreeMap<String, PlaytimeEntry>,
}

impl PlaytimeStore {
    pub fn load(path: &Path) -> Result<Self> {
        match std::fs::read(path) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let bytes = serde_json::to_vec(self)?;
        crate::state::write_atomic(path, &bytes)
    }

    pub fn entry(&self, game: &str) -> PlaytimeEntry {
        self.games.get(game).copied().unwrap_or_default()
    }

    /// Add a finished session and return the updated entry.
    pub fn record(&mut self, game: &str, seconds: u64, last_played: u64) -> PlaytimeEntry {
        let entry = self.games.entry(game.to_owned()).or_default();
        entry.seconds = entry.seconds.saturating_add(seconds);
        entry.last_played = Some(last_played);
        *entry
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_is_an_empty_history() {
        let dir = tempfile::tempdir().unwrap();
        let store = PlaytimeStore::load(&dir.path().join(PLAYTIME_FILE)).unwrap();
        assert!(store.games.is_empty());
        assert_eq!(store.entry("arknights"), PlaytimeEntry::default());
    }

    #[test]
    fn round_trips_sessions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PLAYTIME_FILE);
        let mut store = PlaytimeStore::default();
        store.record("arknights", 3_600, 1_700_000_000);
        store.record("arknights", 60, 1_700_000_100);
        store.save(&path).unwrap();

        let loaded = PlaytimeStore::load(&path).unwrap();
        let entry = loaded.entry("arknights");
        assert_eq!(entry.seconds, 3_660);
        assert_eq!(entry.last_played, Some(1_700_000_100));
    }

    #[test]
    fn saturates_instead_of_overflowing() {
        let mut store = PlaytimeStore::default();
        store.record("stella", u64::MAX, 1);
        let entry = store.record("stella", 10, 2);
        assert_eq!(entry.seconds, u64::MAX);
    }
}
