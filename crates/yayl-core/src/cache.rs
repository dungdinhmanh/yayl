//! Last known launcher metadata, so an offline start still shows something.
//!
//! Only launcher-side data is cached here (news, social links). Game files and
//! manifests keep their own caches under `<install root>/.yayl`.

use crate::error::Result;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fs;
use std::path::Path;

/// Write `value` as JSON, replacing `path` in one step.
pub fn store<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let body = serde_json::to_vec(value)?;
    // A cache can be rebuilt from the network, so skip the fsync.
    crate::state::write_atomic_with(path, &body, crate::state::Durability::Relaxed)
}

/// Read a cached value. A missing, unreadable or corrupt file is `None`.
pub fn load<T: DeserializeOwned>(path: &Path) -> Option<T> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Sample {
        value: u32,
    }

    #[test]
    fn store_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("news").join("arknights.json");
        store(&path, &Sample { value: 7 }).unwrap();
        assert_eq!(load::<Sample>(&path), Some(Sample { value: 7 }));
    }

    #[test]
    fn a_corrupt_cache_reads_as_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("news.json");
        fs::write(&path, b"{not json").unwrap();
        assert_eq!(load::<Sample>(&path), None);
    }

    #[test]
    fn a_missing_cache_reads_as_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load::<Sample>(&dir.path().join("absent.json")), None);
    }
}
