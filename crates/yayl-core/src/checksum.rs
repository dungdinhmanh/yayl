//! File checksums used by download plans.
//!
//! Yostar manifests use CRC-64/XZ, but the downloader itself is game-agnostic.
//! A plan can therefore carry CRC-64, MD5, SHA-256, or no checksum at all. The
//! downloader only needs to know whether a completed file matches the plan.

use crate::crc64;
use crate::error::{Error, ErrorCode, Result};
use md5::{Digest as _, Md5};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Lowercase hex for hash output; digest 0.11 no longer formats as hex.
pub(crate) fn hex_lower(bytes: impl AsRef<[u8]>) -> String {
    use std::fmt::Write as _;
    let bytes = bytes.as_ref();
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "algorithm", content = "value", rename_all = "snake_case")]
pub enum Checksum {
    /// No checksum is available. Size is still checked before commit.
    None,
    Crc64(u64),
    Md5(#[serde(deserialize_with = "deserialize_lowercase")] String),
    Sha256(#[serde(deserialize_with = "deserialize_lowercase")] String),
}

fn deserialize_lowercase<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    Ok(value.to_ascii_lowercase())
}

impl Checksum {
    pub fn crc64(value: u64) -> Self {
        Self::Crc64(value)
    }

    pub fn md5(value: impl Into<String>) -> Self {
        Self::Md5(value.into().to_ascii_lowercase())
    }

    pub fn sha256(value: impl Into<String>) -> Self {
        Self::Sha256(value.into().to_ascii_lowercase())
    }

    pub fn is_none(&self) -> bool {
        matches!(self, Self::None)
    }

    pub fn as_crc64(&self) -> Option<u64> {
        match self {
            Self::Crc64(value) => Some(*value),
            _ => None,
        }
    }

    /// Human-readable expected value for diagnostics and plan files.
    pub fn expected(&self) -> String {
        match self {
            Self::None => "none".to_owned(),
            Self::Crc64(value) => value.to_string(),
            Self::Md5(value) | Self::Sha256(value) => value.clone(),
        }
    }

    pub fn algorithm(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Crc64(_) => "crc64",
            Self::Md5(_) => "md5",
            Self::Sha256(_) => "sha256",
        }
    }

    /// Verify a file on a blocking thread.
    pub async fn verify(&self, path: &Path) -> Result<bool> {
        let checksum = self.clone();
        let path = path.to_path_buf();
        tokio::task::spawn_blocking(move || checksum.verify_blocking(&path))
            .await
            .map_err(|error| Error::new(ErrorCode::Unknown, error.to_string()))?
    }

    /// Synchronous verification for callers that already run on a blocking
    /// thread.
    pub fn verify_blocking(&self, path: &Path) -> Result<bool> {
        match self {
            Self::None => Ok(true),
            Self::Crc64(expected) => Ok(crc64::crc64_file_blocking(path)? == *expected),
            Self::Md5(expected) => Ok(md5_file_blocking(path)?.eq_ignore_ascii_case(expected)),
            Self::Sha256(expected) => {
                Ok(sha256_file_blocking(path)?.eq_ignore_ascii_case(expected))
            }
        }
    }
}

fn read_hashed<F>(path: &Path, mut update: F) -> Result<()>
where
    F: FnMut(&[u8]),
{
    let mut file = std::fs::File::open(path)?;
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        update(&buffer[..read]);
    }
    Ok(())
}

fn md5_file_blocking(path: &Path) -> Result<String> {
    let mut hasher = Md5::new();
    read_hashed(path, |bytes| hasher.update(bytes))?;
    Ok(hex_lower(hasher.finalize()))
}

fn sha256_file_blocking(path: &Path) -> Result<String> {
    let mut hasher = Sha256::new();
    read_hashed(path, |bytes| hasher.update(bytes))?;
    Ok(hex_lower(hasher.finalize()))
}

/// Small helper used by tests and provider adapters that only have a path.
pub async fn verify_file(path: impl Into<PathBuf>, checksum: &Checksum) -> Result<bool> {
    checksum.verify(&path.into()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc64_matches_the_reference_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.bin");
        std::fs::write(&path, b"123456789").unwrap();
        assert!(
            Checksum::Crc64(0x995D_C9BB_DF19_39FA)
                .verify_blocking(&path)
                .unwrap()
        );
        assert!(
            !Checksum::Crc64(0x995D_C9BB_DF19_39FB)
                .verify_blocking(&path)
                .unwrap()
        );
    }

    #[test]
    fn md5_and_sha256_match_known_vectors() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.bin");
        std::fs::write(&path, b"123456789").unwrap();

        assert!(
            Checksum::md5("25f9e794323b453885f5181f1b624d0b")
                .verify_blocking(&path)
                .unwrap()
        );
        assert!(
            Checksum::sha256("15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225")
                .verify_blocking(&path)
                .unwrap()
        );
    }

    #[test]
    fn none_accepts_any_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.bin");
        std::fs::write(&path, b"anything").unwrap();
        assert!(Checksum::None.verify_blocking(&path).unwrap());
    }

    #[test]
    fn serializes_as_a_tagged_plan_value() {
        let value = serde_json::to_value(Checksum::Crc64(42)).unwrap();
        assert_eq!(value["algorithm"], "crc64");
        assert_eq!(value["value"], 42);

        let empty = serde_json::to_value(Checksum::None).unwrap();
        assert_eq!(empty["algorithm"], "none");

        let parsed: Checksum =
            serde_json::from_str(r#"{"algorithm":"sha256","value":"ABCD"}"#).unwrap();
        assert_eq!(parsed, Checksum::Sha256("abcd".to_owned()));
    }
}
