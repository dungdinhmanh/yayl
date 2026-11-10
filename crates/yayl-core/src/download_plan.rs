//! Download orchestration and persistent plans.

use crate::api::{CdnConfig, GameConfig, LauncherApi};
use crate::checksum::Checksum;
use crate::downloader::{
    CancelToken, DownloadOrder, DownloadReport, Downloader, FileJob, Progress,
};
use crate::error::{Error, ErrorCode, Result};
use crate::local_manifest::{GameConfigFile, LocalManifest, game_config_path, manifest_path};
use crate::manifest::{Manifest, RawManifest, RawManifestFile};
use crate::path::{join_inside, normalize_manifest_path, path_key, validate_install_root};
use crate::profile::GameProfile;
use crate::state;
use crate::task::{DownloadTask, TaskState};
use crate::verify::{self, ManifestDiff, VerifyReport, VerifyTarget};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Version sent in the signed envelope; not the game version.
pub const DEFAULT_LAUNCHER_VERSION: &str = "0.1.0";
pub const PLAN_SCHEMA_VERSION: u32 = 1;
pub const YOSTAR_PROVIDER: &str = "yostar";

/// Everything fetched from the API/CDN before the first game byte is written.
#[derive(Debug, Clone)]
pub struct RemoteGame {
    pub profile: GameProfile,
    pub launcher_version: String,
    pub game: GameConfig,
    pub cdn: CdnConfig,
    pub manifest_url: String,
    pub manifest: Manifest,
    /// Exact manifest bytes, persisted before the download starts.
    pub raw_manifest: String,
}

impl RemoteGame {
    pub async fn fetch(profile: GameProfile, launcher_version: impl Into<String>) -> Result<Self> {
        let client = crate::downloader::http_client()?;
        Self::fetch_with_client(profile, launcher_version, client).await
    }

    pub async fn fetch_with_client(
        profile: GameProfile,
        launcher_version: impl Into<String>,
        client: Client,
    ) -> Result<Self> {
        let launcher_version = launcher_version.into();
        if launcher_version.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                "launcher version is empty",
            ));
        }

        let api = LauncherApi::with_client(&profile, launcher_version.clone(), client)?;
        let (game, cdn) = tokio::join!(api.game_config(), api.cdn());
        let game = game?;
        let cdn = cdn?;

        if game.game_latest_version.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "game config has no latest version",
            ));
        }
        if game.game_latest_file_path.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "game config has no manifest basis",
            ));
        }
        if cdn.primary_cdn.trim().is_empty() && cdn.back_up_cdn.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Http,
                "CDN config has no download host",
            ));
        }

        let fetched = api
            .fetch_manifest(&game.game_latest_version, &game.game_latest_file_path)
            .await?;
        if fetched.manifest.source.trim_matches('/').is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "remote manifest has no source prefix",
            ));
        }

        Ok(Self {
            profile,
            launcher_version,
            game,
            cdn,
            manifest_url: fetched.url,
            manifest: fetched.manifest,
            raw_manifest: fetched.raw,
        })
    }

    /// Primary CDN, falling back to the backup host when the primary is empty.
    pub fn primary_cdn(&self) -> Result<&str> {
        let primary = self.cdn.primary_cdn.trim();
        if !primary.is_empty() {
            return Ok(primary);
        }
        let backup = self.cdn.back_up_cdn.trim();
        if !backup.is_empty() {
            return Ok(backup);
        }
        Err(Error::new(
            ErrorCode::Http,
            "CDN config has no download host",
        ))
    }

    /// Backup CDN when it differs from the primary host.
    pub fn backup_cdn(&self) -> Option<&str> {
        let primary = self.primary_cdn().ok()?;
        let backup = self.cdn.back_up_cdn.trim();
        if backup.is_empty() || backup == primary {
            None
        } else {
            Some(backup)
        }
    }

    /// CDN hosts in fallback order.
    pub fn cdns(&self) -> Result<Vec<String>> {
        let mut cdns = vec![self.primary_cdn()?.to_owned()];
        if let Some(backup) = self.backup_cdn() {
            cdns.push(backup.to_owned());
        }
        Ok(cdns)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchSpec {
    #[serde(default)]
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub uninstall_script: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanGame {
    pub id: String,
    pub tag: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    pub launcher_version: String,
    pub version: String,
    pub basis: String,
    #[serde(default)]
    pub launch: LaunchSpec,
}

fn default_provider() -> String {
    "generic".to_owned()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanFile {
    /// Normalized relative path with forward slashes.
    pub path: String,
    /// Original manifest path, including the leading slash when present.
    #[serde(default)]
    pub original_path: String,
    pub size: u64,
    pub checksum: Checksum,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanJob {
    pub path: String,
    pub size: u64,
    pub checksum: Checksum,
    /// CDN URLs in fallback order.
    pub urls: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanManifest {
    pub url: String,
    pub source: String,
    pub files: Vec<PlanFile>,
}

/// Provider-neutral, serializable download plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanDocument {
    pub schema_version: u32,
    pub game: PlanGame,
    pub cdns: Vec<String>,
    pub manifest: PlanManifest,
    pub jobs: Vec<PlanJob>,
    pub order: DownloadOrder,
    pub created_at: u64,
}

impl PlanDocument {
    pub fn from_remote(remote: &RemoteGame, order: DownloadOrder) -> Result<Self> {
        let cdns = remote.cdns()?;
        let mut files = Vec::with_capacity(remote.manifest.files.len());
        let mut jobs = Vec::with_capacity(remote.manifest.files.len());

        for entry in &remote.manifest.files {
            let path = path_key(&entry.relative);
            let original_path = if entry.original_path.trim().is_empty() {
                format!("/{path}")
            } else {
                entry.original_path.clone()
            };
            let checksum = Checksum::Crc64(entry.crc64);
            let urls = cdns
                .iter()
                .map(|base| remote.manifest.file_url(base, entry))
                .collect();

            files.push(PlanFile {
                path: path.clone(),
                original_path,
                size: entry.size,
                checksum: checksum.clone(),
            });
            jobs.push(PlanJob {
                path,
                size: entry.size,
                checksum,
                urls,
            });
        }

        let executable = if remote.game.game_start_exe_name.trim().is_empty() {
            remote.profile.executable.to_owned()
        } else {
            remote.game.game_start_exe_name.clone()
        };

        Ok(Self {
            schema_version: PLAN_SCHEMA_VERSION,
            game: PlanGame {
                id: remote.profile.id.to_owned(),
                tag: remote.profile.game_tag.to_owned(),
                provider: YOSTAR_PROVIDER.to_owned(),
                launcher_version: remote.launcher_version.clone(),
                version: remote.game.game_latest_version.clone(),
                basis: remote.game.game_latest_file_path.clone(),
                launch: LaunchSpec {
                    executable,
                    args: remote.game.game_start_params.clone(),
                    uninstall_script: remote.game.game_uninstall_script.clone(),
                },
            },
            cdns,
            manifest: PlanManifest {
                url: remote.manifest_url.clone(),
                source: remote.manifest.source.clone(),
                files,
            },
            jobs,
            order,
            created_at: state::now_unix(),
        })
    }

    pub fn validate(&self) -> Result<()> {
        if self.schema_version != PLAN_SCHEMA_VERSION {
            return Err(plan_error(format!(
                "unsupported plan schema {} (expected {})",
                self.schema_version, PLAN_SCHEMA_VERSION
            )));
        }
        if self.game.id.trim().is_empty() {
            return Err(plan_error("plan has no game id"));
        }
        if self.game.tag.trim().is_empty() {
            return Err(plan_error("plan has no game tag"));
        }
        if self.game.version.trim().is_empty() {
            return Err(plan_error("plan has no game version"));
        }
        if self.cdns.is_empty() {
            return Err(plan_error("plan has no CDN hosts"));
        }
        for cdn in &self.cdns {
            validate_http_url(cdn)?;
        }
        if self.manifest.files.is_empty() {
            return Err(plan_error("plan manifest contains no files"));
        }

        let mut files = BTreeMap::new();
        for file in &self.manifest.files {
            let normalized = normalize_manifest_path(&file.path)?;
            let key = path_key(&normalized);
            if key != file.path {
                return Err(plan_error(format!(
                    "plan file path is not normalized: {}",
                    file.path
                )));
            }
            if files.insert(key, file).is_some() {
                return Err(plan_error(format!(
                    "duplicate plan file path: {}",
                    file.path
                )));
            }
        }

        if self.jobs.len() != self.manifest.files.len() {
            return Err(plan_error(format!(
                "plan has {} files but {} jobs",
                self.manifest.files.len(),
                self.jobs.len()
            )));
        }

        let mut seen = HashSet::with_capacity(self.jobs.len());
        for job in &self.jobs {
            if !seen.insert(job.path.clone()) {
                return Err(plan_error(format!("duplicate plan job: {}", job.path)));
            }
            let file = files.get(&job.path).ok_or_else(|| {
                plan_error(format!("plan job has no manifest file: {}", job.path))
            })?;
            if file.size != job.size || file.checksum != job.checksum {
                return Err(plan_error(format!(
                    "plan job does not match manifest file: {}",
                    job.path
                )));
            }
            if job.urls.is_empty() {
                return Err(plan_error(format!("plan job has no URL: {}", job.path)));
            }
            for url in &job.urls {
                validate_http_url(url)?;
            }
        }
        Ok(())
    }

    /// Reconstruct the official remote manifest shape.
    pub fn to_raw_manifest_json(&self) -> Result<String> {
        let mut files = Vec::with_capacity(self.manifest.files.len());
        for file in &self.manifest.files {
            let hash = match &file.checksum {
                Checksum::Crc64(value) => value.to_string(),
                other => {
                    return Err(plan_error(format!(
                        "cannot write a Yostar manifest for {} checksums",
                        other.algorithm()
                    )));
                }
            };
            files.push(RawManifestFile {
                path: if file.original_path.trim().is_empty() {
                    format!("/{}", file.path)
                } else {
                    file.original_path.clone()
                },
                hash,
                size: file.size.to_string(),
            });
        }
        let raw = RawManifest {
            source: self.manifest.source.clone(),
            file: files,
        };
        serde_json::to_string(&raw).map_err(Into::into)
    }

    pub fn to_manifest(&self) -> Result<Manifest> {
        Manifest::parse(&self.to_raw_manifest_json()?)
    }
}

/// A prepared install: plan document plus the local install root.
#[derive(Debug, Clone)]
pub struct DownloadPlan {
    pub document: PlanDocument,
    pub root: PathBuf,
    /// Exact manifest bytes when fetched live; empty after loading from disk.
    pub raw_manifest: String,
}

impl DownloadPlan {
    /// Fetch remote metadata and bind it to an install root.
    pub async fn prepare(
        profile: GameProfile,
        root: impl Into<PathBuf>,
        launcher_version: impl Into<String>,
    ) -> Result<Self> {
        let client = crate::downloader::http_client()?;
        Self::prepare_with(
            profile,
            root,
            launcher_version,
            client,
            DownloadOrder::default(),
        )
        .await
    }

    pub async fn prepare_with(
        profile: GameProfile,
        root: impl Into<PathBuf>,
        launcher_version: impl Into<String>,
        client: Client,
        order: DownloadOrder,
    ) -> Result<Self> {
        let root = root.into();
        validate_install_root(&root)?;
        let remote = RemoteGame::fetch_with_client(profile, launcher_version, client).await?;
        Self::from_remote(remote, root, order)
    }

    pub fn from_remote(
        remote: RemoteGame,
        root: impl Into<PathBuf>,
        order: DownloadOrder,
    ) -> Result<Self> {
        let document = PlanDocument::from_remote(&remote, order)?;
        Self::from_document(document, root, remote.raw_manifest)
    }

    /// Build a provider-neutral plan.
    pub fn from_document(
        document: PlanDocument,
        root: impl Into<PathBuf>,
        raw_manifest: impl Into<String>,
    ) -> Result<Self> {
        let root = root.into();
        validate_install_root(&root)?;
        document.validate()?;
        Ok(Self {
            document,
            root,
            raw_manifest: raw_manifest.into(),
        })
    }

    pub fn load(root: &Path) -> Result<Self> {
        validate_install_root(root)?;
        let path = state::plan_path(root);
        let body = std::fs::read_to_string(&path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                plan_error(format!("no plan found at {}", path.display()))
            } else {
                error.into()
            }
        })?;
        let document: PlanDocument = serde_json::from_str(&body)?;
        document.validate()?;
        let raw_manifest = state::load_remote_manifest(root)?.unwrap_or_default();
        Ok(Self {
            document,
            root: root.to_path_buf(),
            raw_manifest,
        })
    }

    pub fn plan_path(&self) -> PathBuf {
        state::plan_path(&self.root)
    }

    pub fn task_path(&self) -> PathBuf {
        state::task_path(&self.root)
    }

    pub fn remote_manifest_path(&self) -> PathBuf {
        state::remote_manifest_path(&self.root)
    }

    pub fn save_plan(&self) -> Result<PathBuf> {
        self.document.validate()?;
        let path = self.plan_path();
        state::write_json_atomic(&path, &self.document)?;
        Ok(path)
    }

    /// Persist the exact server manifest before downloading.
    pub fn save_remote_manifest(&self) -> Result<PathBuf> {
        let path = self.remote_manifest_path();
        let raw = if self.raw_manifest.trim().is_empty() {
            if self.document.game.provider == YOSTAR_PROVIDER {
                return Err(plan_error("yostar plan is missing its raw manifest"));
            }
            self.document.to_raw_manifest_json()?
        } else {
            self.raw_manifest.clone()
        };
        state::write_atomic(&path, raw.as_bytes())?;
        Ok(path)
    }

    pub fn manifest(&self) -> Result<Manifest> {
        self.document.to_manifest()
    }

    /// Build one resumable job per plan job, with CDN fallbacks in order.
    pub fn jobs(&self) -> Result<Vec<FileJob>> {
        self.document.validate()?;
        self.document
            .jobs
            .iter()
            .map(|job| self.file_job(job))
            .collect()
    }

    /// Jobs for a subset of relative paths, used by repair.
    pub fn jobs_for(&self, paths: &HashSet<PathBuf>) -> Result<Vec<FileJob>> {
        self.document.validate()?;
        let keys: HashSet<String> = paths.iter().map(|path| path_key(path)).collect();
        self.document
            .jobs
            .iter()
            .filter(|job| keys.contains(&job.path))
            .map(|job| self.file_job(job))
            .collect()
    }

    fn file_job(&self, job: &PlanJob) -> Result<FileJob> {
        let relative = normalize_manifest_path(&job.path)?;
        let dest = join_inside(&self.root, &relative)?;
        let mut urls = job.urls.iter();
        let first = urls
            .next()
            .ok_or_else(|| plan_error(format!("plan job has no URL: {}", job.path)))?;
        let mut file_job =
            FileJob::new_with_checksum(first.clone(), dest, job.size, job.checksum.clone());
        for url in urls {
            file_job = file_job.with_backup(url.clone());
        }
        Ok(file_job)
    }

    pub fn targets(&self) -> Result<Vec<VerifyTarget>> {
        self.document
            .manifest
            .files
            .iter()
            .map(|file| {
                Ok(VerifyTarget {
                    relative: normalize_manifest_path(&file.path)?,
                    size: file.size,
                    checksum: file.checksum.clone(),
                })
            })
            .collect()
    }

    pub async fn verify(&self, concurrency: usize) -> Result<VerifyReport> {
        let targets = self.targets()?;
        verify::verify_targets(&self.root, &targets, concurrency).await
    }

    /// Verify with per-file progress for the desktop UI.
    pub async fn verify_with_progress<F>(
        &self,
        concurrency: usize,
        on_progress: F,
    ) -> Result<VerifyReport>
    where
        F: Fn(usize, u64) + Send + Sync,
    {
        let targets = self.targets()?;
        verify::verify_targets_with_progress(&self.root, &targets, concurrency, on_progress).await
    }

    /// Compare this remote plan with the official local `manifest.json`.
    pub fn diff_against_local(&self) -> Result<ManifestDiff> {
        let path = manifest_path(&self.root);
        let old = if path.exists() {
            LocalManifest::load(&path)?.to_manifest()?
        } else {
            Manifest::empty()
        };
        Ok(verify::diff_manifests(&old, &self.manifest()?))
    }

    /// Write the official local metadata after a verified download.
    pub fn write_local_metadata(&self) -> Result<()> {
        if self.document.game.provider != YOSTAR_PROVIDER {
            return Ok(());
        }

        let manifest = self.manifest()?;
        let game = &self.document.game;
        let local = LocalManifest::from_manifest(
            game.tag.clone(),
            game.version.clone(),
            game.basis.clone(),
            &manifest,
        );
        crate::path::reject_symlink_components(&self.root, &manifest_path(&self.root))?;
        local.save(&manifest_path(&self.root))?;

        // Store the base name; the official launcher appends `.exe`.
        let name = if game.launch.executable.trim().is_empty() {
            game.tag.clone()
        } else {
            config_executable_name(&game.launch.executable)
        };
        let config = GameConfigFile::new(
            game.tag.clone(),
            name,
            game.launch.args.clone(),
            game.version.clone(),
            game.launch.uninstall_script.clone(),
        );
        crate::path::reject_symlink_components(&self.root, &game_config_path(&self.root))?;
        config.save(&game_config_path(&self.root))?;
        Ok(())
    }

    /// Download, verify, then write the official metadata.
    pub async fn run<F>(
        &self,
        downloader: &Downloader,
        cancel: CancelToken,
        on_progress: F,
    ) -> Result<DownloadReport>
    where
        F: Fn(Progress) + Send + Sync + 'static,
    {
        std::fs::create_dir_all(&self.root)?;
        crate::path::reject_symlink_components(&self.root, &state::state_dir(&self.root))?;
        // Yostar keeps the raw manifest cache; generic plans keep it in plan.json.
        if !self.raw_manifest.trim().is_empty() || self.document.game.provider == YOSTAR_PROVIDER {
            self.save_remote_manifest()?;
        }
        self.save_plan()?;

        let report = self
            .run_jobs(self.jobs()?, downloader, cancel, on_progress, true)
            .await?;
        if report.is_complete() {
            self.write_local_metadata()?;
        }
        Ok(report)
    }

    /// Re-download only the files reported by `verify`.
    pub async fn repair<F>(
        &self,
        downloader: &Downloader,
        cancel: CancelToken,
        report: &VerifyReport,
        on_progress: F,
    ) -> Result<DownloadReport>
    where
        F: Fn(Progress) + Send + Sync + 'static,
    {
        let jobs = self.jobs_for(&report.issue_paths())?;
        if jobs.is_empty() {
            return Ok(DownloadReport {
                files: 0,
                bytes: 0,
                failures: Vec::new(),
            });
        }

        let result = self
            .run_jobs(jobs, downloader, cancel, on_progress, false)
            .await?;
        if result.is_complete() {
            self.write_local_metadata()?;
        }
        Ok(result)
    }

    async fn run_jobs<F>(
        &self,
        jobs: Vec<FileJob>,
        downloader: &Downloader,
        cancel: CancelToken,
        on_progress: F,
        track_task: bool,
    ) -> Result<DownloadReport>
    where
        F: Fn(Progress) + Send + Sync + 'static,
    {
        let files_total = jobs.len();
        let bytes_total: u64 = jobs.iter().map(|job| job.size).sum();
        let task_path = track_task.then(|| self.task_path());

        let mut task = if track_task {
            self.resumable_task(files_total, bytes_total)?
        } else {
            DownloadTask::new(
                self.document.game.id.clone(),
                self.document.game.version.clone(),
                self.document.game.basis.clone(),
                files_total,
                bytes_total,
            )
        };
        // Keep persisted counters as a floor so resume never moves the bar back.
        let resume_counters = matches!(
            task.state,
            TaskState::Running | TaskState::Verifying | TaskState::Paused | TaskState::Failed
        );
        if !resume_counters {
            task.files_done = 0;
            task.bytes_done = 0;
        }
        task.state = TaskState::Running;
        task.failures.clear();
        if let Some(path) = &task_path {
            task.save(path)?;
        }

        let task = Arc::new(Mutex::new(task));
        let last_save = Arc::new(Mutex::new(ProgressSave::new()));
        let user = Arc::new(on_progress);
        let callback = {
            let task = task.clone();
            let last_save = last_save.clone();
            let task_path = task_path.clone();
            move |mut progress: Progress| {
                let snapshot = {
                    let mut task = lock(&task);
                    progress = resume_progress(progress, &task, resume_counters);
                    task.apply(progress);
                    let mut last = lock(&last_save);
                    if last.due(&task, last.at.elapsed()) {
                        last.begin();
                        Some(task.clone())
                    } else {
                        None
                    }
                };
                if let Some(snapshot) = snapshot
                    && let Some(path) = &task_path
                {
                    let saved = snapshot.save_progress(path).is_ok();
                    let current = lock(&task);
                    lock(&last_save).finish(&current, saved);
                }
                user.as_ref()(progress);
            }
        };

        let result = downloader
            .download_all(&self.root, jobs, cancel, callback)
            .await;

        let mut task = lock(&task);
        match &result {
            Ok(report) => task.finish(report),
            Err(error) => task.fail(error),
        }
        let save_result = task_path.as_ref().map(|path| task.save(path));

        match result {
            Ok(report) => {
                if let Some(saved) = save_result {
                    saved?;
                }
                Ok(report)
            }
            Err(error) => {
                let _ = save_result;
                Err(error)
            }
        }
    }

    /// Reuse the persisted task when it still describes this plan.
    fn resumable_task(&self, files_total: usize, bytes_total: u64) -> Result<DownloadTask> {
        let game = &self.document.game;
        if let Some(task) = DownloadTask::load(&self.task_path())?
            && task.game_id == game.id
            && task.version == game.version
            && task.basis == game.basis
            && task.files_total == files_total
            && task.bytes_total == bytes_total
        {
            return Ok(task);
        }
        Ok(DownloadTask::new(
            game.id.clone(),
            game.version.clone(),
            game.basis.clone(),
            files_total,
            bytes_total,
        ))
    }
}

/// Keep persisted counters as a floor on resume.
fn resume_progress(mut progress: Progress, task: &DownloadTask, resumed: bool) -> Progress {
    if resumed {
        progress.downloaded = progress.downloaded.max(task.bytes_done);
        progress.files_done = progress.files_done.max(task.files_done);
    }
    progress
}

/// Throttle and deduplicate progress snapshots.
struct ProgressSave {
    at: Instant,
    last: Option<(TaskState, usize, u64)>,
    saving: bool,
}

impl ProgressSave {
    fn new() -> Self {
        Self {
            at: Instant::now(),
            last: None,
            saving: false,
        }
    }

    fn due(&self, task: &DownloadTask, elapsed: Duration) -> bool {
        !self.saving && elapsed >= Duration::from_secs(1) && self.last != Some(signature(task))
    }

    fn begin(&mut self) {
        self.saving = true;
    }

    fn finish(&mut self, task: &DownloadTask, saved: bool) {
        self.saving = false;
        if saved {
            self.at = Instant::now();
            self.last = Some(signature(task));
        }
    }
}

fn signature(task: &DownloadTask) -> (TaskState, usize, u64) {
    (task.state, task.files_done, task.bytes_done)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn plan_error(message: impl Into<String>) -> Error {
    Error::new(ErrorCode::InvalidInput, message)
}

fn validate_http_url(url: &str) -> Result<()> {
    crate::url::validate_remote_url(url)
}

/// `game-launcher-config.json` stores the executable without its extension.
fn config_executable_name(value: &str) -> String {
    let value = value.trim();
    if value.len() > 4 && value.to_ascii_lowercase().ends_with(".exe") {
        value[..value.len() - 4].to_owned()
    } else {
        value.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::downloader::Phase;
    use crate::profile::ARKNIGHTS_EN;
    use sha2::{Digest as _, Sha256};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn progress_snapshots_are_throttled_and_deduplicated() {
        let mut task = DownloadTask::new("stella", "2.0.0", "basis", 10, 1000);
        let mut save = ProgressSave::new();

        assert!(!save.due(&task, Duration::from_millis(500)));
        assert!(save.due(&task, Duration::from_secs(1)));

        save.begin();
        assert!(!save.due(&task, Duration::from_secs(5)));
        save.finish(&task, true);
        assert!(!save.due(&task, Duration::from_secs(5)));

        task.apply(Progress {
            phase: Phase::Downloading,
            downloaded: 100,
            download_total: 1000,
            installed: 0,
            install_total: 1000,
            bytes_per_sec: 10,
            files_done: 1,
            files_total: 10,
        });
        assert!(save.due(&task, Duration::from_secs(2)));
    }

    #[test]
    fn failed_progress_saves_are_retried_immediately() {
        let task = DownloadTask::new("stella", "2.0.0", "basis", 10, 1000);
        let mut save = ProgressSave::new();

        save.begin();
        save.finish(&task, false);

        assert!(save.due(&task, Duration::from_secs(1)));
    }

    #[test]
    fn resumed_progress_never_moves_backwards() {
        let mut task = DownloadTask::new("stella", "2.0.0", "basis", 10, 1000);
        task.files_done = 5;
        task.bytes_done = 500;

        let progress = Progress {
            phase: Phase::Verifying,
            downloaded: 100,
            download_total: 1000,
            installed: 0,
            install_total: 1000,
            bytes_per_sec: 0,
            files_done: 1,
            files_total: 10,
        };

        let resumed = resume_progress(progress, &task, true);
        assert_eq!(resumed.downloaded, 500);
        assert_eq!(resumed.files_done, 5);

        let ahead = resume_progress(
            Progress {
                downloaded: 600,
                files_done: 6,
                ..progress
            },
            &task,
            true,
        );
        assert_eq!(ahead.downloaded, 600);
        assert_eq!(ahead.files_done, 6);

        let fresh = resume_progress(progress, &task, false);
        assert_eq!(fresh.downloaded, 100);
        assert_eq!(fresh.files_done, 1);
    }

    #[test]
    fn resumes_a_matching_task_only() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());
        let game = &plan.document.game;
        let mut task = DownloadTask::new(
            game.id.clone(),
            game.version.clone(),
            game.basis.clone(),
            2,
            675_304,
        );
        task.started_at = 123;
        task.save(&plan.task_path()).unwrap();

        let resumed = plan.resumable_task(2, 675_304).unwrap();
        assert_eq!(resumed.started_at, 123);

        let fresh = plan.resumable_task(3, 675_304).unwrap();
        assert_ne!(fresh.started_at, 123);
    }

    const REMOTE: &str = r#"{
      "source": "/Arknights_EN-042.0.0-game",
      "file": [
        {"path": "/Arknights.exe", "hash": "1726476550168236827", "size": "675304"},
        {"path": "/Arknights_Data/app.info", "hash": "0", "size": "0"}
      ]
    }"#;

    fn sample_remote() -> RemoteGame {
        RemoteGame {
            profile: ARKNIGHTS_EN,
            launcher_version: DEFAULT_LAUNCHER_VERSION.to_owned(),
            game: GameConfig {
                game_latest_version: "042.0.0".to_owned(),
                game_lowest_version: "042.0.0".to_owned(),
                game_latest_file_path:
                    "prod/ZIP_TEMP/Arknights_EN_TEMP/Arknights_EN-042.0.0-game.zip".to_owned(),
                game_start_exe_name: "Arknights".to_owned(),
                game_start_params: vec!["-force-d3d11".to_owned()],
                ..GameConfig::default()
            },
            cdn: CdnConfig {
                primary_cdn: "https://cdn.example.com".to_owned(),
                back_up_cdn: "https://backup.example.com".to_owned(),
            },
            manifest_url: "https://cdn.example.com/manifest.json".to_owned(),
            manifest: Manifest::parse(REMOTE).unwrap(),
            raw_manifest: REMOTE.to_owned(),
        }
    }

    fn sample_plan(root: PathBuf) -> DownloadPlan {
        DownloadPlan::from_remote(sample_remote(), root, DownloadOrder::SmallestFirst).unwrap()
    }

    #[test]
    fn builds_source_aware_urls_with_backup() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());
        let jobs = plan.jobs().unwrap();

        assert_eq!(jobs.len(), 2);
        assert_eq!(
            jobs[0].urls[0],
            "https://cdn.example.com/Arknights_EN-042.0.0-game/Arknights.exe"
        );
        assert_eq!(
            jobs[0].urls[1],
            "https://backup.example.com/Arknights_EN-042.0.0-game/Arknights.exe"
        );
        assert_eq!(jobs[0].dest, dir.path().join("Arknights.exe"));
        assert_eq!(jobs[0].size, 675_304);
        assert_eq!(jobs[1].size, 0);
    }

    #[test]
    fn yostar_plan_requires_a_raw_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let remote = sample_remote();
        let document = PlanDocument::from_remote(&remote, DownloadOrder::Manifest).unwrap();
        let plan =
            DownloadPlan::from_document(document, dir.path().to_path_buf(), String::new()).unwrap();

        assert!(plan.save_remote_manifest().is_err());
    }

    #[test]
    fn persists_the_manifest_before_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());

        let cache = plan.save_remote_manifest().unwrap();
        assert_eq!(cache, dir.path().join(".yayl/manifest.json"));
        assert_eq!(std::fs::read_to_string(&cache).unwrap(), REMOTE);
        assert!(!manifest_path(dir.path()).exists());

        plan.write_local_metadata().unwrap();
        let local = LocalManifest::load(&manifest_path(dir.path())).unwrap();
        assert_eq!(local.name, "Arknights_EN");
        assert_eq!(local.version, "042.0.0");
        assert_eq!(
            local.basis,
            "prod/ZIP_TEMP/Arknights_EN_TEMP/Arknights_EN-042.0.0-game.zip"
        );
        assert_eq!(local.files.len(), 2);

        let config = GameConfigFile::load(&game_config_path(dir.path())).unwrap();
        assert_eq!(config.tag, "Arknights_EN");
        assert_eq!(config.name, "Arknights");
        assert_eq!(config.params, vec!["-force-d3d11".to_owned()]);
        assert_eq!(config.version, "042.0.0");
        let text = std::fs::read_to_string(game_config_path(dir.path())).unwrap();
        assert!(text.contains("\"gameUninstallScript\""));
        assert!(!text.contains("\"game_uninstall_script\""));
    }

    #[test]
    fn config_name_drops_the_exe_extension() {
        assert_eq!(config_executable_name("StellaSora.exe"), "StellaSora");
        assert_eq!(config_executable_name("StellaSora.EXE"), "StellaSora");
        assert_eq!(config_executable_name(" StellaSora "), "StellaSora");
        assert_eq!(config_executable_name("StellaSora"), "StellaSora");
    }

    #[test]
    fn falls_back_to_the_backup_cdn() {
        let dir = tempfile::tempdir().unwrap();
        let mut remote = sample_remote();
        remote.cdn.primary_cdn.clear();
        let plan = DownloadPlan::from_remote(
            remote,
            dir.path().to_path_buf(),
            DownloadOrder::SmallestFirst,
        )
        .unwrap();
        let jobs = plan.jobs().unwrap();
        assert_eq!(
            jobs[0].urls[0],
            "https://backup.example.com/Arknights_EN-042.0.0-game/Arknights.exe"
        );
        assert_eq!(jobs[0].urls.len(), 1);
    }

    #[test]
    fn plan_round_trips_through_plan_json() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());
        let path = plan.save_plan().unwrap();
        assert_eq!(path, dir.path().join(".yayl/plan.json"));

        let loaded = DownloadPlan::load(dir.path()).unwrap();
        assert_eq!(loaded.document, plan.document);
        assert_eq!(loaded.document.order, DownloadOrder::SmallestFirst);
        assert_eq!(loaded.jobs().unwrap()[0].urls, plan.jobs().unwrap()[0].urls);
        assert_eq!(loaded.manifest().unwrap().files.len(), 2);
    }

    #[test]
    fn diff_against_the_official_local_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path().to_path_buf());

        let old = Manifest::parse(
            r#"{"source":"/old","file":[
              {"path":"/Arknights.exe","hash":"1","size":"1"},
              {"path":"/removed.bin","hash":"2","size":"2"}
            ]}"#,
        )
        .unwrap();
        let local = LocalManifest::from_manifest("Arknights_EN", "041.0.0", "old", &old);
        local.save(&manifest_path(dir.path())).unwrap();

        let diff = plan.diff_against_local().unwrap();
        assert_eq!(diff.changed.len(), 1);
        assert_eq!(diff.changed[0].path, PathBuf::from("Arknights.exe"));
        assert_eq!(diff.removed.len(), 1);
        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0].path, PathBuf::from("Arknights_Data/app.info"));
    }

    #[test]
    fn rejects_a_plan_that_escapes_the_root() {
        let dir = tempfile::tempdir().unwrap();
        let mut plan = sample_plan(dir.path().to_path_buf());
        plan.document.manifest.files[0].path = "../evil".to_owned();
        assert!(plan.document.validate().is_err());
        assert!(plan.jobs().is_err());
    }

    #[test]
    fn generic_provider_skips_yostar_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let mut plan = sample_plan(dir.path().to_path_buf());
        plan.document.game.provider = "generic".to_owned();
        plan.write_local_metadata().unwrap();
        assert!(!manifest_path(dir.path()).exists());
        assert!(!game_config_path(dir.path()).exists());
    }

    #[tokio::test]
    async fn generic_plan_downloads_and_repairs_with_task_state() {
        let body = b"generic game file".repeat(1000);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = body.clone();
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 4096];
                loop {
                    let read = socket.read(&mut buffer).await.unwrap();
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..read]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    server_body.len()
                );
                socket.write_all(head.as_bytes()).await.unwrap();
                socket.write_all(&server_body).await.unwrap();
                socket.shutdown().await.ok();
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let url = format!("http://127.0.0.1:{port}/a.bin");
        let checksum = Checksum::Sha256(crate::checksum::hex_lower(Sha256::digest(&body)));
        let document = PlanDocument {
            schema_version: PLAN_SCHEMA_VERSION,
            game: PlanGame {
                id: "demo".to_owned(),
                tag: "Demo".to_owned(),
                provider: "generic".to_owned(),
                launcher_version: DEFAULT_LAUNCHER_VERSION.to_owned(),
                version: "1.0.0".to_owned(),
                basis: String::new(),
                launch: LaunchSpec::default(),
            },
            cdns: vec![format!("http://127.0.0.1:{port}")],
            manifest: PlanManifest {
                url: url.clone(),
                source: String::new(),
                files: vec![PlanFile {
                    path: "a.bin".to_owned(),
                    original_path: "/a.bin".to_owned(),
                    size: body.len() as u64,
                    checksum: checksum.clone(),
                }],
            },
            jobs: vec![PlanJob {
                path: "a.bin".to_owned(),
                size: body.len() as u64,
                checksum,
                urls: vec![url],
            }],
            order: DownloadOrder::SmallestFirst,
            created_at: 0,
        };
        let plan =
            DownloadPlan::from_document(document, dir.path().to_path_buf(), String::new()).unwrap();
        let downloader = Downloader::new().unwrap().concurrency(1);

        let report = plan
            .run(&downloader, CancelToken::new(), |_| {})
            .await
            .unwrap();
        assert!(report.is_complete());
        assert_eq!(std::fs::read(dir.path().join("a.bin")).unwrap(), body);
        assert!(plan.plan_path().exists());
        assert!(!plan.remote_manifest_path().exists());
        let task = DownloadTask::load(&plan.task_path()).unwrap().unwrap();
        assert_eq!(task.state, TaskState::Completed);
        let task_before = std::fs::read(plan.task_path()).unwrap();

        std::fs::remove_file(dir.path().join("a.bin")).unwrap();
        let before = plan.verify(2).await.unwrap();
        assert_eq!(before.issues.len(), 1);
        assert_eq!(
            before.issues[0].kind,
            crate::verify::VerifyIssueKind::Missing
        );

        let repaired = plan
            .repair(&downloader, CancelToken::new(), &before, |_| {})
            .await
            .unwrap();
        assert!(repaired.is_complete());
        assert_eq!(std::fs::read(dir.path().join("a.bin")).unwrap(), body);
        assert_eq!(std::fs::read(plan.task_path()).unwrap(), task_before);
        server.await.unwrap();
    }
}
