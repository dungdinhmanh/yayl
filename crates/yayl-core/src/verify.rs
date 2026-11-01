//! Verify, repair support, and manifest diffing.
//!
//! Verification is intentionally provider-neutral: a plan supplies a relative
//! path, a size, and a checksum. The Yostar adapter fills those from CRC-64/XZ
//! manifest entries, but other games can use MD5 or SHA-256.

use crate::checksum::Checksum;
use crate::error::{Error, ErrorCode, Result};
use crate::manifest::{Manifest, ManifestEntry};
use crate::path::{join_inside, path_key, validate_install_root};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerifyIssueKind {
    Missing,
    SizeMismatch,
    ChecksumMismatch,
}

impl VerifyIssueKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::SizeMismatch => "size_mismatch",
            Self::ChecksumMismatch => "checksum_mismatch",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VerifyIssue {
    pub path: PathBuf,
    pub kind: VerifyIssueKind,
    pub expected_size: u64,
    pub actual_size: Option<u64>,
    pub expected_checksum: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerifyReport {
    pub files: usize,
    pub verified: usize,
    pub bytes_verified: u64,
    pub issues: Vec<VerifyIssue>,
}

impl VerifyReport {
    pub fn is_healthy(&self) -> bool {
        self.issues.is_empty()
    }

    pub fn issue_paths(&self) -> HashSet<PathBuf> {
        self.issues.iter().map(|issue| issue.path.clone()).collect()
    }

    /// Expected bytes that a repair pass needs to fetch.
    pub fn bytes_to_repair(&self) -> u64 {
        self.issues.iter().map(|issue| issue.expected_size).sum()
    }
}

#[derive(Debug, Clone)]
pub struct VerifyTarget {
    pub relative: PathBuf,
    pub size: u64,
    pub checksum: Checksum,
}

impl From<&ManifestEntry> for VerifyTarget {
    fn from(entry: &ManifestEntry) -> Self {
        Self {
            relative: entry.relative.clone(),
            size: entry.size,
            checksum: Checksum::Crc64(entry.crc64),
        }
    }
}

/// Verify every target under `root`, hashing at most `concurrency` files at a
/// time. Files are hashed on blocking threads so the UI stays responsive.
pub async fn verify_targets(
    root: &Path,
    targets: &[VerifyTarget],
    concurrency: usize,
) -> Result<VerifyReport> {
    verify_targets_with_progress(root, targets, concurrency, |_, _| {}).await
}

/// Same as [`verify_targets`] but reports `(files_done, bytes_done)` after each
/// file. The callback runs on the verification task, so it must be cheap.
pub async fn verify_targets_with_progress<F>(
    root: &Path,
    targets: &[VerifyTarget],
    concurrency: usize,
    on_progress: F,
) -> Result<VerifyReport>
where
    F: Fn(usize, u64) + Send + Sync,
{
    validate_install_root(root)?;
    let concurrency = concurrency.clamp(1, 32);
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut set: JoinSet<(VerifyTarget, Result<Option<VerifyIssue>>)> = JoinSet::new();

    for target in targets {
        let dest = join_inside(root, &target.relative)?;
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|error| Error::new(ErrorCode::Unknown, error.to_string()))?;
        let target = target.clone();
        set.spawn(async move {
            let _permit = permit;
            let metadata = tokio::fs::metadata(&dest).await;
            let actual_size = match metadata {
                Ok(meta) if meta.is_file() => meta.len(),
                Ok(_) => {
                    return (
                        target.clone(),
                        Ok(Some(issue(&target, VerifyIssueKind::Missing, None))),
                    );
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    return (
                        target.clone(),
                        Ok(Some(issue(&target, VerifyIssueKind::Missing, None))),
                    );
                }
                Err(error) => return (target, Err(error.into())),
            };

            if actual_size != target.size {
                return (
                    target.clone(),
                    Ok(Some(issue(
                        &target,
                        VerifyIssueKind::SizeMismatch,
                        Some(actual_size),
                    ))),
                );
            }

            let checksum = target.checksum.clone();
            let path = dest.clone();
            let verified =
                tokio::task::spawn_blocking(move || checksum.verify_blocking(&path)).await;
            match verified {
                Ok(Ok(true)) => (target, Ok(None)),
                Ok(Ok(false)) => (
                    target.clone(),
                    Ok(Some(issue(
                        &target,
                        VerifyIssueKind::ChecksumMismatch,
                        Some(actual_size),
                    ))),
                ),
                Ok(Err(error)) => (target, Err(error)),
                Err(error) => (
                    target,
                    Err(Error::new(ErrorCode::Unknown, error.to_string())),
                ),
            }
        });
    }

    let mut report = VerifyReport {
        files: targets.len(),
        verified: 0,
        bytes_verified: 0,
        issues: Vec::new(),
    };
    let mut checked_files = 0usize;
    let mut checked_bytes = 0u64;
    while let Some(joined) = set.join_next().await {
        let (target, result) =
            joined.map_err(|error| Error::new(ErrorCode::Unknown, error.to_string()))?;
        checked_files += 1;
        checked_bytes = checked_bytes.saturating_add(target.size);
        match result? {
            None => {
                report.verified += 1;
                report.bytes_verified = report.bytes_verified.saturating_add(target.size);
            }
            Some(issue) => report.issues.push(issue),
        }
        on_progress(checked_files, checked_bytes);
    }
    report
        .issues
        .sort_by(|left, right| left.path.cmp(&right.path));
    Ok(report)
}

pub async fn verify_manifest(
    root: &Path,
    manifest: &Manifest,
    concurrency: usize,
) -> Result<VerifyReport> {
    let targets: Vec<VerifyTarget> = manifest.files.iter().map(VerifyTarget::from).collect();
    verify_targets(root, &targets, concurrency).await
}

fn issue(target: &VerifyTarget, kind: VerifyIssueKind, actual_size: Option<u64>) -> VerifyIssue {
    VerifyIssue {
        path: target.relative.clone(),
        kind,
        expected_size: target.size,
        actual_size,
        expected_checksum: target.checksum.expected(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManifestDiffEntry {
    pub path: PathBuf,
    pub size: u64,
    pub checksum: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManifestChange {
    pub path: PathBuf,
    pub old_size: u64,
    pub new_size: u64,
    pub old_checksum: String,
    pub new_checksum: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ManifestDiff {
    pub added: Vec<ManifestDiffEntry>,
    pub removed: Vec<ManifestDiffEntry>,
    pub changed: Vec<ManifestChange>,
    pub unchanged: usize,
    pub added_bytes: u64,
    pub removed_bytes: u64,
    pub changed_bytes: u64,
}

impl ManifestDiff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.removed.is_empty() && self.changed.is_empty()
    }

    pub fn change_count(&self) -> usize {
        self.added.len() + self.removed.len() + self.changed.len()
    }
}

/// Compare an old manifest (local install) with a new manifest (remote).
pub fn diff_manifests(old: &Manifest, new: &Manifest) -> ManifestDiff {
    let mut old_by_path: BTreeMap<String, &ManifestEntry> = old
        .files
        .iter()
        .map(|entry| (path_key(&entry.relative), entry))
        .collect();

    let mut diff = ManifestDiff::default();
    for entry in &new.files {
        let key = path_key(&entry.relative);
        match old_by_path.remove(&key) {
            None => {
                diff.added_bytes = diff.added_bytes.saturating_add(entry.size);
                diff.added.push(ManifestDiffEntry {
                    path: entry.relative.clone(),
                    size: entry.size,
                    checksum: entry.crc64.to_string(),
                });
            }
            Some(previous) if previous.size != entry.size || previous.crc64 != entry.crc64 => {
                diff.changed_bytes = diff.changed_bytes.saturating_add(entry.size);
                diff.changed.push(ManifestChange {
                    path: entry.relative.clone(),
                    old_size: previous.size,
                    new_size: entry.size,
                    old_checksum: previous.crc64.to_string(),
                    new_checksum: entry.crc64.to_string(),
                });
            }
            Some(_) => diff.unchanged += 1,
        }
    }

    for (_, entry) in old_by_path {
        diff.removed_bytes = diff.removed_bytes.saturating_add(entry.size);
        diff.removed.push(ManifestDiffEntry {
            path: entry.relative.clone(),
            size: entry.size,
            checksum: entry.crc64.to_string(),
        });
    }

    diff.added.sort_by(|left, right| left.path.cmp(&right.path));
    diff.removed
        .sort_by(|left, right| left.path.cmp(&right.path));
    diff.changed
        .sort_by(|left, right| left.path.cmp(&right.path));
    diff
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crc64;

    fn manifest(entries: &[(&str, u64, u64)]) -> Manifest {
        let files = entries
            .iter()
            .map(|(path, size, hash)| {
                format!(r#"{{"path":"/{path}","hash":"{hash}","size":"{size}"}}"#)
            })
            .collect::<Vec<_>>()
            .join(",");
        Manifest::parse(&format!(r#"{{"source":"/test","file":[{files}]}}"#)).unwrap()
    }

    #[tokio::test]
    async fn reports_missing_size_and_checksum_issues() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("a")).unwrap();
        std::fs::write(root.join("a/ok.bin"), b"ok").unwrap();
        std::fs::write(root.join("a/short.bin"), b"x").unwrap();
        std::fs::write(root.join("a/bad.bin"), b"bad").unwrap();

        let entries = vec![
            ("a/ok.bin", 2, crc64::crc64(b"ok")),
            ("a/short.bin", 2, crc64::crc64(b"xx")),
            ("a/bad.bin", 3, crc64::crc64(b"good")),
            ("a/missing.bin", 4, crc64::crc64(b"none")),
        ];
        let report = verify_manifest(root, &manifest(&entries), 2).await.unwrap();

        assert_eq!(report.files, 4);
        assert_eq!(report.verified, 1);
        assert_eq!(report.bytes_verified, 2);
        assert_eq!(report.issues.len(), 3);
        assert_eq!(report.issues[0].kind, VerifyIssueKind::ChecksumMismatch);
        assert_eq!(report.issues[1].kind, VerifyIssueKind::Missing);
        assert_eq!(report.issues[2].kind, VerifyIssueKind::SizeMismatch);
        assert_eq!(report.bytes_to_repair(), 2 + 3 + 4);
    }

    #[test]
    fn diffs_added_removed_and_changed_files() {
        let old = manifest(&[
            ("same.bin", 10, 1),
            ("changed.bin", 20, 2),
            ("removed.bin", 30, 3),
        ]);
        let new = manifest(&[
            ("same.bin", 10, 1),
            ("changed.bin", 21, 4),
            ("added.bin", 40, 5),
        ]);

        let diff = diff_manifests(&old, &new);
        assert_eq!(diff.unchanged, 1);
        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0].path, PathBuf::from("added.bin"));
        assert_eq!(diff.added_bytes, 40);
        assert_eq!(diff.removed.len(), 1);
        assert_eq!(diff.removed[0].path, PathBuf::from("removed.bin"));
        assert_eq!(diff.removed_bytes, 30);
        assert_eq!(diff.changed.len(), 1);
        assert_eq!(diff.changed[0].old_size, 20);
        assert_eq!(diff.changed[0].new_size, 21);
        assert_eq!(diff.changed_bytes, 21);
        assert!(!diff.is_empty());
    }

    #[test]
    fn identical_manifests_have_no_changes() {
        let manifest = manifest(&[("a.bin", 1, 2)]);
        assert!(diff_manifests(&manifest, &manifest).is_empty());
    }
}
