//! Official local metadata files.
//!
//! The game itself and third-party tools read these files, so YAYL keeps the
//! exact shape used by the official launcher:
//!
//! - `manifest.json`: `{ name, version, basis, vc, files[] }`
//! - `game-launcher-config.json`: `{ tag, name, params, version, vc, ... }`
//!
//! `vc` is `base64(MD5(Object.values(object).join(";")))`. The field order is
//! part of the format.

use crate::error::{Error, Result};
use crate::manifest::{Manifest, RawManifest, RawManifestFile};
use base64::Engine;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MANIFEST_FILE_NAME: &str = "manifest.json";
pub const GAME_CONFIG_FILE_NAME: &str = "game-launcher-config.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalManifest {
    pub name: String,
    pub version: String,
    pub basis: String,
    #[serde(default)]
    pub vc: String,
    #[serde(default)]
    pub files: Vec<LocalManifestFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalManifestFile {
    pub path: String,
    pub hash: String,
    pub size: String,
    #[serde(default)]
    pub vc: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameConfigFile {
    pub tag: String,
    pub name: String,
    #[serde(default)]
    pub params: Vec<String>,
    pub version: String,
    /// Official files use camelCase here.
    #[serde(
        default,
        rename = "gameUninstallScript",
        alias = "game_uninstall_script"
    )]
    pub game_uninstall_script: String,
    #[serde(default)]
    pub vc: String,
}

impl LocalManifest {
    pub fn from_manifest(
        name: impl Into<String>,
        version: impl Into<String>,
        basis: impl Into<String>,
        manifest: &Manifest,
    ) -> Self {
        let name = name.into();
        let version = version.into();
        let basis = basis.into();
        let vc = object_hash(&[name.clone(), version.clone(), basis.clone()]);
        let files = manifest
            .files
            .iter()
            .map(|entry| {
                let path = entry.original_path.clone();
                let hash = entry.crc64.to_string();
                let size = entry.size.to_string();
                let vc = object_hash(&[path.clone(), hash.clone(), size.clone()]);
                LocalManifestFile {
                    path,
                    hash,
                    size,
                    vc,
                }
            })
            .collect();
        Self {
            name,
            version,
            basis,
            vc,
            files,
        }
    }

    /// Validate the info hash and every file hash. Invalid files are dropped,
    /// matching the official reader's recovery behavior; an invalid info hash
    /// is a hard error because the file set cannot be trusted.
    pub fn validate(mut self) -> Result<Self> {
        let expected = object_hash(&[self.name.clone(), self.version.clone(), self.basis.clone()]);
        if self.vc != expected {
            return Err(Error::manifest("local manifest info hash mismatch"));
        }
        self.files.retain(|file| {
            file.vc == object_hash(&[file.path.clone(), file.hash.clone(), file.size.clone()])
        });
        Ok(self)
    }

    pub fn load(path: &Path) -> Result<Self> {
        let body = std::fs::read_to_string(path)?;
        let manifest: Self = serde_json::from_str(&body)?;
        manifest.validate()
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let body = serde_json::to_string_pretty(self).map_err(|error| {
            Error::new(
                crate::error::ErrorCode::Io,
                format!("serialize manifest: {error}"),
            )
        })?;
        crate::state::write_atomic(path, body.as_bytes())
    }

    /// Convert back to the remote manifest shape for checksum and size
    /// comparisons. The official local manifest does not store the remote
    /// `source`, so download URLs must come from a freshly fetched manifest.
    pub fn to_manifest(&self) -> Result<Manifest> {
        let raw = RawManifest {
            source: String::new(),
            file: self
                .files
                .iter()
                .map(|file| RawManifestFile {
                    path: file.path.clone(),
                    hash: file.hash.clone(),
                    size: file.size.clone(),
                })
                .collect(),
        };
        Manifest::from_raw(raw)
    }
}

impl GameConfigFile {
    pub fn new(
        tag: impl Into<String>,
        name: impl Into<String>,
        params: Vec<String>,
        version: impl Into<String>,
        game_uninstall_script: impl Into<String>,
    ) -> Self {
        let tag = tag.into();
        let name = name.into();
        let version = version.into();
        let game_uninstall_script = game_uninstall_script.into();
        let vc = game_config_hash(&tag, &name, &params, &version, &game_uninstall_script);
        Self {
            tag,
            name,
            params,
            version,
            game_uninstall_script,
            vc,
        }
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let body = serde_json::to_string_pretty(self).map_err(|error| {
            Error::new(
                crate::error::ErrorCode::Io,
                format!("serialize game config: {error}"),
            )
        })?;
        crate::state::write_atomic(path, body.as_bytes())
    }

    pub fn load(path: &Path) -> Result<Self> {
        let body = std::fs::read_to_string(path)?;
        let value: serde_json::Value = serde_json::from_str(&body)?;
        let config: Self = serde_json::from_value(value.clone())?;
        // The hash covers the values that are actually in the file. Require the
        // matching shape instead of accepting either hash, so adding `params`
        // to a compact config invalidates it.
        let extended = value.get("params").is_some() || value.get("gameUninstallScript").is_some();
        if !config.has_valid_hash(extended) {
            return Err(Error::manifest("game config hash mismatch"));
        }
        Ok(config)
    }

    /// The 1.6 launcher writes only `tag`, `name`, and `version`, while older
    /// launchers and YAYL also record `params` and `gameUninstallScript`.
    /// Accept both shapes so an install written by either launcher stays
    /// readable.
    fn has_valid_hash(&self, extended: bool) -> bool {
        if extended {
            self.vc
                == game_config_hash(
                    &self.tag,
                    &self.name,
                    &self.params,
                    &self.version,
                    &self.game_uninstall_script,
                )
        } else {
            self.vc == object_hash(&[self.tag.clone(), self.name.clone(), self.version.clone()])
        }
    }
}

pub fn manifest_path(root: &Path) -> PathBuf {
    root.join(MANIFEST_FILE_NAME)
}

pub fn game_config_path(root: &Path) -> PathBuf {
    root.join(GAME_CONFIG_FILE_NAME)
}

/// `base64(MD5(values.join(";")))`, matching the official `getObjectHash`.
pub fn object_hash(values: &[String]) -> String {
    let joined = values.join(";");
    let digest = Md5::digest(joined.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(digest)
}

fn game_config_hash(
    tag: &str,
    name: &str,
    params: &[String],
    version: &str,
    game_uninstall_script: &str,
) -> String {
    // JS `Object.values({tag,name,params,version,gameUninstallScript})` turns
    // the params array into a comma-separated string before the outer join.
    object_hash(&[
        tag.to_owned(),
        name.to_owned(),
        params.join(","),
        version.to_owned(),
        game_uninstall_script.to_owned(),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::Manifest;

    const REMOTE: &str = r#"{
      "source": "/Arknights_EN-042.0.0-game",
      "file": [
        {"path": "/Arknights.exe", "hash": "1726476550168236827", "size": "675304"},
        {"path": "/a/b.txt", "hash": "0", "size": "0"}
      ]
    }"#;

    #[test]
    fn writes_and_reads_official_manifest() {
        let manifest = Manifest::parse(REMOTE).unwrap();
        let local = LocalManifest::from_manifest(
            "Arknights_EN",
            "042.0.0",
            "prod/Arknights_EN-042.0.0-game.zip",
            &manifest,
        );
        let dir = tempfile::tempdir().unwrap();
        let path = manifest_path(dir.path());
        local.save(&path).unwrap();

        let text = std::fs::read_to_string(&path).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["name"], "Arknights_EN");
        assert_eq!(value["files"][0]["path"], "/Arknights.exe");
        assert!(value["vc"].as_str().unwrap().len() > 10);
        assert!(value["files"][0]["vc"].as_str().unwrap().len() > 10);

        let loaded = LocalManifest::load(&path).unwrap();
        assert_eq!(loaded.files.len(), 2);
        assert_eq!(loaded.to_manifest().unwrap().total_bytes(), 675_304);
    }

    #[test]
    fn rejects_tampered_info_hash() {
        let manifest = Manifest::parse(REMOTE).unwrap();
        let mut local = LocalManifest::from_manifest("Arknights_EN", "042.0.0", "basis", &manifest);
        local.version = "999.0.0".to_owned();
        assert!(local.validate().is_err());
    }

    #[test]
    fn drops_tampered_files() {
        let manifest = Manifest::parse(REMOTE).unwrap();
        let mut local = LocalManifest::from_manifest("Arknights_EN", "042.0.0", "basis", &manifest);
        local.files[0].size = "1".to_owned();
        let valid = local.validate().unwrap();
        assert_eq!(valid.files.len(), 1);
        assert_eq!(valid.files[0].path, "/a/b.txt");
    }

    #[test]
    fn game_config_hash_round_trips() {
        let config = GameConfigFile::new(
            "Arknights_EN",
            "Arknights",
            vec!["-a".to_owned(), "-b".to_owned()],
            "042.0.0",
            "",
        );
        let dir = tempfile::tempdir().unwrap();
        let path = game_config_path(dir.path());
        config.save(&path).unwrap();
        let loaded = GameConfigFile::load(&path).unwrap();
        assert_eq!(loaded, config);
    }

    #[test]
    fn reads_the_compact_config_written_by_the_1_6_launcher() {
        // Observed shape: the 1.6 launcher writes only tag/name/version.
        let tag = "StellaSora_EN";
        let name = "StellaSora";
        let version = "2.0.0";
        let vc = object_hash(&[tag.to_owned(), name.to_owned(), version.to_owned()]);
        let body =
            format!(r#"{{"tag":"{tag}","name":"{name}","version":"{version}","vc":"{vc}"}}"#);
        let dir = tempfile::tempdir().unwrap();
        let path = game_config_path(dir.path());
        std::fs::write(&path, body).unwrap();
        let loaded = GameConfigFile::load(&path).unwrap();
        assert_eq!(loaded.name, name);
        assert_eq!(loaded.version, version);
        assert!(loaded.params.is_empty());
    }

    #[test]
    fn rejects_extra_fields_in_a_compact_config() {
        let tag = "StellaSora_EN";
        let name = "StellaSora";
        let version = "2.0.0";
        let vc = object_hash(&[tag.to_owned(), name.to_owned(), version.to_owned()]);
        let body = format!(
            r#"{{"tag":"{tag}","name":"{name}","params":["--evil"],"version":"{version}","vc":"{vc}"}}"#
        );
        let dir = tempfile::tempdir().unwrap();
        let path = game_config_path(dir.path());
        std::fs::write(&path, body).unwrap();
        assert!(GameConfigFile::load(&path).is_err());
    }

    #[test]
    fn rejects_a_tampered_game_config() {
        let config = GameConfigFile::new("Arknights_EN", "Arknights", Vec::new(), "042.0.0", "");
        let dir = tempfile::tempdir().unwrap();
        let path = game_config_path(dir.path());
        config.save(&path).unwrap();
        let mut value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        value["name"] = serde_json::Value::String("Other".to_owned());
        std::fs::write(&path, value.to_string()).unwrap();
        assert!(GameConfigFile::load(&path).is_err());
    }
}
