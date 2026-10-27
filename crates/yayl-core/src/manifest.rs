//! Official Yostar manifest parsing.
//!
//! The manifest is a JSON object with `source` and a flat `file` list. Every
//! entry has a leading-slash path, a decimal CRC-64/XZ hash, and a decimal
//! size stored as a string. We keep the official file untouched and build a
//! validated, typed view for the downloader.

use crate::crc64;
use crate::error::{Error, Result};
use crate::path::{normalize_manifest_path, path_key};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawManifest {
    #[serde(default)]
    pub source: String,
    pub file: Vec<RawManifestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawManifestFile {
    pub path: String,
    pub hash: String,
    pub size: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestEntry {
    /// Validated path relative to the install root.
    pub relative: PathBuf,
    /// Original manifest path, kept for diagnostics.
    pub original_path: String,
    pub size: u64,
    pub crc64: u64,
}

#[derive(Debug, Clone)]
pub struct Manifest {
    pub source: String,
    pub files: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ManifestSummary {
    pub files: usize,
    pub total_bytes: u64,
}

impl Manifest {
    pub fn empty() -> Self {
        Self {
            source: String::new(),
            files: Vec::new(),
        }
    }

    pub fn parse(json: &str) -> Result<Self> {
        let raw: RawManifest = serde_json::from_str(json)?;
        Self::from_raw(raw)
    }

    pub fn from_raw(raw: RawManifest) -> Result<Self> {
        if raw.file.is_empty() {
            return Err(Error::manifest("manifest contains no files"));
        }

        let mut files = Vec::with_capacity(raw.file.len());
        let mut seen = HashSet::with_capacity(raw.file.len());

        for (index, item) in raw.file.into_iter().enumerate() {
            let relative = normalize_manifest_path(&item.path).map_err(|error| {
                Error::manifest(format!("file #{index} ({}): {}", item.path, error.message))
            })?;

            let key = path_key(&relative);
            if !seen.insert(key.clone()) {
                return Err(Error::manifest(format!("duplicate manifest path: {key}")));
            }

            let size = item.size.trim().parse::<u64>().map_err(|_| {
                Error::manifest(format!("file #{index} has an invalid size: {}", item.size))
            })?;
            let crc64 = item.hash.trim().parse::<u64>().map_err(|_| {
                Error::manifest(format!("file #{index} has an invalid hash: {}", item.hash))
            })?;

            files.push(ManifestEntry {
                relative,
                original_path: item.path,
                size,
                crc64,
            });
        }

        Ok(Self {
            source: raw.source,
            files,
        })
    }

    pub fn summary(&self) -> ManifestSummary {
        ManifestSummary {
            files: self.files.len(),
            total_bytes: self.total_bytes(),
        }
    }

    pub fn total_bytes(&self) -> u64 {
        self.files.iter().map(|file| file.size).sum()
    }

    /// Build a download URL for a file. `base` is the CDN root, without a
    /// trailing slash. The official layout is `<cdn>/<source>/<file path>`;
    /// the source is the manifest's top-level `source` field.
    ///
    /// Path segments are percent-encoded because asset names can contain `#`,
    /// `?`, spaces, or non-ASCII characters.
    pub fn file_url(&self, base: &str, entry: &ManifestEntry) -> String {
        let base = base.trim_end_matches('/');
        let source = self.source.trim_matches('/');
        if source.is_empty() {
            return format!("{}/{}", base, encode_relative_path(&entry.relative));
        }
        format!(
            "{}/{}/{}",
            base,
            encode_path_text(source),
            encode_relative_path(&entry.relative)
        )
    }
}

pub async fn fetch_manifest(client: &reqwest::Client, url: &str) -> Result<Manifest> {
    let response = client.get(url).send().await?;
    let status = response.status();
    if !status.is_success() {
        return Err(Error::new(
            crate::error::ErrorCode::Http,
            format!("manifest request failed with HTTP {status}"),
        ));
    }
    let body = response.text().await?;
    Manifest::parse(&body)
}

pub fn load_manifest(path: &Path) -> Result<Manifest> {
    let body = std::fs::read_to_string(path)?;
    Manifest::parse(&body)
}

pub fn verify_entry(path: &Path, expected: u64) -> Result<bool> {
    Ok(crc64::crc64_file_blocking(path)? == expected)
}

/// Percent-encode every byte except unreserved characters and `/`.
pub fn encode_relative_path(path: &Path) -> String {
    let text = path
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    encode_path_text(&text)
}

pub fn encode_path_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                out.push(byte as char)
            }
            _ => {
                out.push('%');
                out.push(hex(byte >> 4));
                out.push(hex(byte & 0x0F));
            }
        }
    }
    out
}

fn hex(value: u8) -> char {
    match value {
        0..=9 => (b'0' + value) as char,
        _ => (b'A' + value - 10) as char,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "source": "/StellaSora_EN_1.13.0-game",
      "file": [
        {"path": "/StellaSora_Data/app.info", "hash": "15720943726513824584", "size": "37"},
        {"path": "/UnityPlayer.dll", "hash": "6400349585758476319", "size": "31006120"}
      ]
    }"#;

    #[test]
    fn parses_and_sums() {
        let manifest = Manifest::parse(SAMPLE).unwrap();
        assert_eq!(manifest.source, "/StellaSora_EN_1.13.0-game");
        assert_eq!(manifest.files.len(), 2);
        assert_eq!(manifest.total_bytes(), 37 + 31_006_120);
        assert_eq!(manifest.files[0].crc64, 15_720_943_726_513_824_584);
    }

    #[test]
    fn rejects_duplicates_and_traversal() {
        let duplicate = r#"{"source":"","file":[
          {"path":"/a","hash":"1","size":"1"},
          {"path":"/a","hash":"2","size":"2"}
        ]}"#;
        assert!(Manifest::parse(duplicate).is_err());

        let traversal = r#"{"source":"","file":[
          {"path":"/../evil","hash":"1","size":"1"}
        ]}"#;
        assert!(Manifest::parse(traversal).is_err());
    }

    #[test]
    fn encodes_reserved_url_characters() {
        assert_eq!(
            encode_path_text("a b/#c?d/é.unity3d"),
            "a%20b/%23c%3Fd/%C3%A9.unity3d"
        );
    }

    #[test]
    fn file_url_includes_the_manifest_source() {
        let manifest = Manifest::parse(SAMPLE).unwrap();
        let entry = &manifest.files[0];
        assert_eq!(
            manifest.file_url("https://cdn.example.com/", entry),
            "https://cdn.example.com/StellaSora_EN_1.13.0-game/StellaSora_Data/app.info"
        );
    }

    #[test]
    fn file_url_handles_a_missing_source() {
        let manifest =
            Manifest::parse(r#"{"source":"","file":[{"path":"/a b.txt","hash":"1","size":"1"}]}"#)
                .unwrap();
        assert_eq!(
            manifest.file_url("https://cdn.example.com", &manifest.files[0]),
            "https://cdn.example.com/a%20b.txt"
        );
    }
}
