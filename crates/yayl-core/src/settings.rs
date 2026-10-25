//! Small launcher settings file. Kept outside the game folder so the official
//! manifest/config stay untouched.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub install_roots: BTreeMap<String, PathBuf>,
    #[serde(default)]
    pub language: Option<String>,
}

impl Settings {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let body = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&body)?)
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let body = serde_json::to_string_pretty(self).map_err(|error| {
            crate::error::Error::new(crate::error::ErrorCode::Io, error.to_string())
        })?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, body)?;
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        std::fs::rename(&tmp, path)?;
        Ok(())
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
        settings.save(&path).unwrap();

        let loaded = Settings::load(&path).unwrap();
        assert_eq!(
            loaded.install_root("stella"),
            Some(dir.path().join("StellaSora_EN").as_path())
        );
    }

    #[test]
    fn missing_file_is_empty_settings() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Settings::load(&dir.path().join("missing.json")).unwrap();
        assert!(settings.install_roots.is_empty());
    }
}
