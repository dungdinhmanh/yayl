//! Mutable download task state, persisted next to the immutable plan.

use crate::downloader::{DownloadReport, Phase, Progress};
use crate::error::{Error, ErrorCode, Result};
use crate::state;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const TASK_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Pending,
    Running,
    Verifying,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaskFailure {
    pub path: String,
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub schema_version: u32,
    pub game_id: String,
    pub version: String,
    pub basis: String,
    pub state: TaskState,
    pub started_at: u64,
    pub updated_at: u64,
    pub files_total: usize,
    pub files_done: usize,
    pub bytes_total: u64,
    pub bytes_done: u64,
    pub failures: Vec<TaskFailure>,
}

impl DownloadTask {
    pub fn new(
        game_id: impl Into<String>,
        version: impl Into<String>,
        basis: impl Into<String>,
        files_total: usize,
        bytes_total: u64,
    ) -> Self {
        let now = state::now_unix();
        Self {
            schema_version: TASK_SCHEMA_VERSION,
            game_id: game_id.into(),
            version: version.into(),
            basis: basis.into(),
            state: TaskState::Pending,
            started_at: now,
            updated_at: now,
            files_total,
            files_done: 0,
            bytes_total,
            bytes_done: 0,
            failures: Vec::new(),
        }
    }

    pub fn load(path: &Path) -> Result<Option<Self>> {
        if !path.exists() {
            return Ok(None);
        }
        let body = std::fs::read_to_string(path)?;
        let task: Self = serde_json::from_str(&body)?;
        if task.schema_version != TASK_SCHEMA_VERSION {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                format!(
                    "unsupported task schema {} (expected {})",
                    task.schema_version, TASK_SCHEMA_VERSION
                ),
            ));
        }
        Ok(Some(task))
    }

    /// Durable save for terminal states (paused, completed, failed).
    pub fn save(&self, path: &Path) -> Result<()> {
        state::write_json_atomic(path, self)
    }

    /// Progress snapshot without fsync. A crash loses at most the last second
    /// of counters; resume positions live in `.yayl-part` checkpoints.
    pub fn save_progress(&self, path: &Path) -> Result<()> {
        state::write_json_atomic_with(path, self, state::Durability::Relaxed)
    }

    pub fn apply(&mut self, progress: Progress) {
        self.state = match progress.phase {
            Phase::Verifying => TaskState::Verifying,
            _ => TaskState::Running,
        };
        self.files_done = progress.files_done.min(self.files_total);
        self.bytes_done = progress.downloaded.min(self.bytes_total);
        self.updated_at = state::now_unix();
    }

    pub fn finish(&mut self, report: &DownloadReport) {
        self.updated_at = state::now_unix();
        if report.is_complete() {
            self.state = TaskState::Completed;
            self.files_done = self.files_total;
            self.bytes_done = self.bytes_total;
            self.failures.clear();
            return;
        }

        self.state = TaskState::Failed;
        self.failures = report
            .failures
            .iter()
            .map(|failure| TaskFailure {
                path: failure.path.display().to_string(),
                code: failure.code,
                message: failure.message.clone(),
            })
            .collect();
    }

    pub fn fail(&mut self, error: &Error) {
        self.updated_at = state::now_unix();
        self.state = if error.code == ErrorCode::Cancelled {
            TaskState::Paused
        } else {
            TaskState::Failed
        };
        self.failures.push(TaskFailure {
            path: String::new(),
            code: error.code,
            message: error.message.clone(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::downloader::FileFailure;

    #[test]
    fn round_trips_through_task_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = state::task_path(dir.path());
        let mut task = DownloadTask::new("stella", "2.0.0", "basis", 10, 1000);
        task.apply(Progress {
            phase: Phase::Downloading,
            downloaded: 400,
            download_total: 1000,
            installed: 100,
            install_total: 1000,
            bytes_per_sec: 10,
            files_done: 2,
            files_total: 10,
        });
        task.save(&path).unwrap();

        let loaded = DownloadTask::load(&path).unwrap().unwrap();
        assert_eq!(loaded.state, TaskState::Running);
        assert_eq!(loaded.bytes_done, 400);
        assert_eq!(loaded.files_done, 2);
    }

    #[test]
    fn progress_snapshot_is_compact_and_loadable() {
        let dir = tempfile::tempdir().unwrap();
        let path = state::task_path(dir.path());
        let mut task = DownloadTask::new("stella", "2.0.0", "basis", 4, 400);
        task.apply(Progress {
            phase: Phase::Downloading,
            downloaded: 100,
            download_total: 400,
            installed: 100,
            install_total: 400,
            bytes_per_sec: 10,
            files_done: 1,
            files_total: 4,
        });
        task.save_progress(&path).unwrap();

        let body = std::fs::read_to_string(&path).unwrap();
        assert!(!body.contains('\n'));
        let loaded = DownloadTask::load(&path).unwrap().unwrap();
        assert_eq!(loaded.bytes_done, 100);
        assert_eq!(loaded.files_done, 1);
    }

    #[test]
    fn marks_complete_and_failed_tasks() {
        let mut task = DownloadTask::new("arknights", "042.0.0", "basis", 2, 100);
        task.finish(&DownloadReport {
            files: 2,
            bytes: 100,
            failures: Vec::new(),
        });
        assert_eq!(task.state, TaskState::Completed);
        assert_eq!(task.bytes_done, 100);

        let mut failed = DownloadTask::new("arknights", "042.0.0", "basis", 2, 100);
        failed.finish(&DownloadReport {
            files: 2,
            bytes: 100,
            failures: vec![FileFailure {
                path: "a.bin".into(),
                code: ErrorCode::Checksum,
                message: "bad hash".to_owned(),
            }],
        });
        assert_eq!(failed.state, TaskState::Failed);
        assert_eq!(failed.failures.len(), 1);
    }

    #[test]
    fn cancellation_is_paused_not_failed() {
        let mut task = DownloadTask::new("stella", "2.0.0", "basis", 1, 1);
        task.fail(&Error::cancelled());
        assert_eq!(task.state, TaskState::Paused);
    }
}
