//! Resumable HTTP downloader.
//!
//! Design goals:
//! - Range resume from a `.yayl-part` file next to the target.
//! - Verify CRC-64/XZ before the part file is committed.
//! - Bounded concurrency with a shared progress model.
//! - Cancellation leaves part files in place so the next run resumes.
//! - No global mutable state: the caller owns the downloader and token.

use crate::checksum::Checksum;
use crate::disk;
use crate::error::{Error, ErrorCode, Result};
use crate::proxy::{ProxySettings, build_client};
use futures_util::StreamExt;
use reqwest::header::{ACCEPT_ENCODING, CONTENT_RANGE, RANGE};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

/// Sync the part file and persist a durable length at this interval. On a
/// power loss the next run truncates back to the checkpoint instead of trusting
/// a file length whose tail may never have reached the disk.
const CHECKPOINT_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct FileJob {
    /// CDN URLs in fallback order.
    pub urls: Vec<String>,
    /// Absolute destination inside the install root.
    pub dest: PathBuf,
    pub size: u64,
    /// Provider-neutral checksum. Yostar plans use CRC-64/XZ, other games can
    /// use MD5, SHA-256, or no checksum.
    pub checksum: Checksum,
}

impl FileJob {
    /// Compatibility constructor for Yostar manifests.
    pub fn new(url: impl Into<String>, dest: impl Into<PathBuf>, size: u64, crc64: u64) -> Self {
        Self::new_with_checksum(url, dest, size, Checksum::Crc64(crc64))
    }

    pub fn new_with_checksum(
        url: impl Into<String>,
        dest: impl Into<PathBuf>,
        size: u64,
        checksum: Checksum,
    ) -> Self {
        Self {
            urls: vec![url.into()],
            dest: dest.into(),
            size,
            checksum,
        }
    }

    pub fn with_checksum(mut self, checksum: Checksum) -> Self {
        self.checksum = checksum;
        self
    }

    pub fn with_backup(mut self, url: impl Into<String>) -> Self {
        self.urls.push(url.into());
        self
    }
}

/// Order in which files are handed to the worker pool.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadOrder {
    /// Small files first, then progressively larger files. This gets the game
    /// to a launchable state sooner on slow connections.
    #[default]
    SmallestFirst,
    /// Largest files first.
    LargestFirst,
    /// Keep the manifest order.
    Manifest,
}

impl DownloadOrder {
    pub fn sort(self, jobs: &mut [FileJob]) {
        match self {
            Self::Manifest => {}
            Self::SmallestFirst => jobs.sort_by(|left, right| {
                left.size
                    .cmp(&right.size)
                    .then_with(|| left.dest.cmp(&right.dest))
            }),
            Self::LargestFirst => jobs.sort_by(|left, right| {
                right
                    .size
                    .cmp(&left.size)
                    .then_with(|| left.dest.cmp(&right.dest))
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Preparing,
    Downloading,
    Verifying,
    Committing,
    Done,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Progress {
    pub phase: Phase,
    pub downloaded: u64,
    pub download_total: u64,
    pub installed: u64,
    pub install_total: u64,
    pub bytes_per_sec: u64,
    pub files_done: usize,
    pub files_total: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileFailure {
    pub path: PathBuf,
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadReport {
    pub files: usize,
    pub bytes: u64,
    pub failures: Vec<FileFailure>,
}

impl DownloadReport {
    pub fn is_complete(&self) -> bool {
        self.failures.is_empty()
    }
}

#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

pub fn http_client() -> Result<Client> {
    http_client_with(&ProxySettings::default())
}

pub fn http_client_with(proxy: &ProxySettings) -> Result<Client> {
    build_client(proxy)
}

#[derive(Clone)]
pub struct Downloader {
    client: Client,
    concurrency: usize,
    retries: u32,
    verify_existing: bool,
    order: DownloadOrder,
}

impl Downloader {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: http_client()?,
            concurrency: 8,
            retries: 3,
            verify_existing: true,
            order: DownloadOrder::default(),
        })
    }

    pub fn with_client(client: Client) -> Self {
        Self {
            client,
            concurrency: 8,
            retries: 3,
            verify_existing: true,
            order: DownloadOrder::default(),
        }
    }

    pub fn concurrency(mut self, concurrency: usize) -> Self {
        self.concurrency = concurrency.clamp(1, 32);
        self
    }

    pub fn retries(mut self, retries: u32) -> Self {
        self.retries = retries;
        self
    }

    pub fn verify_existing(mut self, verify: bool) -> Self {
        self.verify_existing = verify;
        self
    }

    pub fn order(mut self, order: DownloadOrder) -> Self {
        self.order = order;
        self
    }

    /// Download every job under `root`. Per-file failures are returned in the
    /// report instead of aborting the whole batch.
    pub async fn download_all<F>(
        &self,
        root: &Path,
        mut jobs: Vec<FileJob>,
        cancel: CancelToken,
        on_progress: F,
    ) -> Result<DownloadReport>
    where
        F: Fn(Progress) + Send + Sync + 'static,
    {
        if jobs.is_empty() {
            return Ok(DownloadReport {
                files: 0,
                bytes: 0,
                failures: Vec::new(),
            });
        }

        self.order.sort(&mut jobs);

        for job in &jobs {
            if !job.dest.starts_with(root) {
                return Err(Error::path(format!(
                    "download destination escapes the install root: {}",
                    job.dest.display()
                )));
            }
            crate::path::reject_symlink_components(root, &job.dest)?;
            for url in &job.urls {
                crate::url::validate_remote_url(url)?;
            }
        }

        let total_bytes: u64 = jobs.iter().map(|job| job.size).sum();
        crate::path::validate_install_root(root)?;
        tokio::fs::create_dir_all(root).await?;

        // Existing files and partial downloads already occupy disk. Counting
        // only the missing bytes keeps a resumed 20 GB install from failing a
        // free-space check that the first run already passed.
        let required_bytes = missing_bytes(&jobs).await;
        let space = disk::space_for(root)?;
        if space.free_bytes < required_bytes {
            return Err(Error::disk(format!(
                "not enough free space: need {}, available {}",
                disk::format_bytes(required_bytes),
                disk::format_bytes(space.free_bytes)
            )));
        }

        let files_total = jobs.len();
        let counters = Arc::new(Counters::new(total_bytes, files_total));
        let tracker = Arc::new(SpeedTracker::new());
        let progress = Arc::new(on_progress);
        let stop_monitor = Arc::new(AtomicBool::new(false));

        let monitor = tokio::spawn({
            let counters = counters.clone();
            let tracker = tracker.clone();
            let progress = progress.clone();
            let stop_monitor = stop_monitor.clone();
            async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    if stop_monitor.load(Ordering::SeqCst) {
                        break;
                    }
                    progress(counters.snapshot(&tracker));
                }
            }
        });

        let semaphore = Arc::new(Semaphore::new(self.concurrency));
        let mut set: JoinSet<(PathBuf, Result<()>)> = JoinSet::new();
        let root_buf = root.to_path_buf();

        for job in jobs {
            let permit = semaphore
                .clone()
                .acquire_owned()
                .await
                .map_err(|error| Error::new(ErrorCode::Unknown, error.to_string()))?;
            let this = self.clone();
            let counters = counters.clone();
            let tracker = tracker.clone();
            let cancel = cancel.clone();
            let root = root_buf.clone();
            set.spawn(async move {
                let _permit = permit;
                let dest = job.dest.clone();
                let result = this
                    .download_one(&root, &job, &counters, &tracker, &cancel)
                    .await;
                (dest, result)
            });
        }

        let mut failures = Vec::new();
        let mut cancelled = false;
        while let Some(joined) = set.join_next().await {
            match joined {
                Ok((path, Ok(()))) => {
                    let _ = path;
                }
                Ok((path, Err(error))) if error.code == ErrorCode::Cancelled => {
                    cancelled = true;
                    let _ = path;
                }
                Ok((path, Err(error))) => failures.push(FileFailure {
                    path,
                    code: error.code,
                    message: error.message,
                }),
                Err(error) => failures.push(FileFailure {
                    path: PathBuf::new(),
                    code: ErrorCode::Unknown,
                    message: error.to_string(),
                }),
            }
        }

        stop_monitor.store(true, Ordering::SeqCst);
        monitor.abort();

        if cancelled {
            return Err(Error::cancelled());
        }

        let report = DownloadReport {
            files: files_total,
            bytes: total_bytes,
            failures,
        };
        progress(Progress {
            phase: Phase::Done,
            ..counters.snapshot(&tracker)
        });
        Ok(report)
    }

    async fn download_one(
        &self,
        root: &Path,
        job: &FileJob,
        counters: &Counters,
        tracker: &SpeedTracker,
        cancel: &CancelToken,
    ) -> Result<()> {
        if cancel.is_cancelled() {
            return Err(Error::cancelled());
        }

        // Re-check right before reading or writing: a link planted after the
        // batch-level check must not redirect this file outside the root.
        crate::path::reject_symlink_components(root, &job.dest)?;

        if self.verify_existing && job.dest.is_file() {
            let size = tokio::fs::metadata(&job.dest)
                .await
                .map(|meta| meta.len())
                .unwrap_or(0);
            if size == job.size {
                counters.active_verifications.fetch_add(1, Ordering::SeqCst);
                let valid = job.checksum.verify(&job.dest).await.unwrap_or(false);
                counters.active_verifications.fetch_sub(1, Ordering::SeqCst);
                if valid {
                    let part = part_path(&job.dest);
                    tokio::fs::remove_file(&part).await.ok();
                    remove_checkpoint(&part).await;
                    counters.downloaded.fetch_add(job.size, Ordering::SeqCst);
                    counters.installed.fetch_add(job.size, Ordering::SeqCst);
                    counters.files_done.fetch_add(1, Ordering::SeqCst);
                    return Ok(());
                }
            }
            tokio::fs::remove_file(&job.dest).await.ok();
        }

        let part = part_path(&job.dest);
        if let Some(parent) = job.dest.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        crate::path::reject_symlink_components(root, &part)?;

        let mut part_len = tokio::fs::metadata(&part)
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);
        if part_len > job.size {
            remove_part(&part, counters, false).await;
            part_len = 0;
        }

        // A checkpoint older than the part means the tail was never guaranteed
        // durable. Drop that tail and resume from the last synced byte.
        if part_len > 0 {
            if let Some(durable) = read_checkpoint(&part).await {
                let durable = durable.min(part_len);
                if durable < part_len {
                    let file = tokio::fs::OpenOptions::new()
                        .write(true)
                        .open(&part)
                        .await?;
                    file.set_len(durable).await?;
                    file.sync_all().await?;
                    part_len = durable;
                }
            }
        }
        if part_len > 0 {
            counters.downloaded.fetch_add(part_len, Ordering::SeqCst);
        }

        let mut last_error = Error::new(ErrorCode::Unknown, "download did not start");

        for attempt in 0..=self.retries {
            if cancel.is_cancelled() {
                return Err(Error::cancelled());
            }

            let mut last_url_error: Option<Error> = None;
            let mut received = false;

            counters.active_downloads.fetch_add(1, Ordering::SeqCst);
            for url in &job.urls {
                match self
                    .stream_to_part(root, url, &part, job.size, counters, tracker, cancel)
                    .await
                {
                    Ok(()) => {
                        received = true;
                        break;
                    }
                    Err(error) if error.code == ErrorCode::Cancelled => {
                        counters.active_downloads.fetch_sub(1, Ordering::SeqCst);
                        return Err(error);
                    }
                    Err(error) => last_url_error = Some(error),
                }
            }
            counters.active_downloads.fetch_sub(1, Ordering::SeqCst);

            if !received {
                last_error = last_url_error
                    .unwrap_or_else(|| Error::new(ErrorCode::Network, "no CDN URL succeeded"));
                sleep_backoff(attempt).await;
                continue;
            }

            let actual_size = tokio::fs::metadata(&part)
                .await
                .map(|meta| meta.len())
                .unwrap_or(0);
            if actual_size != job.size {
                last_error = Error::new(
                    ErrorCode::Checksum,
                    format!(
                        "size mismatch for {}: expected {}, got {}",
                        job.dest.display(),
                        job.size,
                        actual_size
                    ),
                );
                // A short stream is the normal network-drop case: keep the
                // durable prefix and retry with a Range request. Only an
                // oversized part is unsafe to keep.
                if actual_size > job.size {
                    remove_part(&part, counters, true).await;
                }
                sleep_backoff(attempt).await;
                continue;
            }

            counters.active_verifications.fetch_add(1, Ordering::SeqCst);
            let verified = job.checksum.verify(&part).await;
            counters.active_verifications.fetch_sub(1, Ordering::SeqCst);

            match verified {
                Ok(true) => {
                    crate::path::reject_symlink_components(root, &job.dest)?;
                    counters.active_commits.fetch_add(1, Ordering::SeqCst);
                    let committed = commit(&part, &job.dest).await;
                    counters.active_commits.fetch_sub(1, Ordering::SeqCst);
                    committed?;
                    remove_checkpoint(&part).await;
                    counters.installed.fetch_add(job.size, Ordering::SeqCst);
                    counters.files_done.fetch_add(1, Ordering::SeqCst);
                    return Ok(());
                }
                Ok(false) => {
                    last_error = Error::new(
                        ErrorCode::Checksum,
                        format!(
                            "checksum mismatch for {}: expected {} ({})",
                            job.dest.display(),
                            job.checksum.expected(),
                            job.checksum.algorithm()
                        ),
                    );
                }
                Err(error) => last_error = error,
            }

            remove_part(&part, counters, true).await;
            sleep_backoff(attempt).await;
        }

        Err(last_error)
    }

    // The arguments are one cohesive download step; grouping them into a
    // struct would only move the same values around.
    #[allow(clippy::too_many_arguments)]
    async fn stream_to_part(
        &self,
        root: &Path,
        url: &str,
        part: &Path,
        size: u64,
        counters: &Counters,
        tracker: &SpeedTracker,
        cancel: &CancelToken,
    ) -> Result<()> {
        let offset = tokio::fs::metadata(part)
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);

        let mut request = self.client.get(url).header(ACCEPT_ENCODING, "identity");
        if offset > 0 {
            request = request.header(RANGE, format!("bytes={offset}-"));
        }

        let response = request.send().await?;
        let status = response.status();

        if status == StatusCode::RANGE_NOT_SATISFIABLE {
            if offset >= size {
                return Ok(());
            }
            return Err(Error::new(
                ErrorCode::Http,
                format!("range request rejected for {url}"),
            ));
        }
        if !status.is_success() {
            return Err(Error::new(
                ErrorCode::Http,
                format!("HTTP {status} for {url}"),
            ));
        }

        if status == StatusCode::PARTIAL_CONTENT {
            let header = response
                .headers()
                .get(CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    Error::new(
                        ErrorCode::Http,
                        format!("206 response without Content-Range for {url}"),
                    )
                })?;
            let start = content_range_start(header).ok_or_else(|| {
                Error::new(
                    ErrorCode::Http,
                    format!("invalid Content-Range header for {url}: {header}"),
                )
            })?;
            if start != offset {
                return Err(Error::new(
                    ErrorCode::Http,
                    format!("server resumed at byte {start}, expected {offset} for {url}"),
                ));
            }
        }

        let append = status == StatusCode::PARTIAL_CONTENT && offset > 0;
        if offset > 0 && !append {
            counters.downloaded.fetch_sub(offset, Ordering::SeqCst);
        }

        crate::path::reject_symlink_components(root, part)?;
        let mut file = if append {
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(part)
                .await?
        } else {
            // Remove the old part (including a link planted at this path) and
            // create a fresh file. `create_new` refuses to follow a link.
            tokio::fs::remove_file(part).await.ok();
            tokio::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(part)
                .await?
        };

        if !append {
            remove_checkpoint(part).await;
        }

        let mut written = if append { offset } else { 0 };
        let mut last_checkpoint = written;
        let mut stream = response.bytes_stream();

        let stream_result: Result<()> = async {
            while let Some(chunk) = stream.next().await {
                if cancel.is_cancelled() {
                    return Err(Error::cancelled());
                }

                let chunk = chunk?;
                if chunk.is_empty() {
                    continue;
                }
                if size == 0 {
                    break;
                }

                let mut slice = chunk.as_ref();
                if written >= size {
                    break;
                }
                if written + slice.len() as u64 > size {
                    slice = &slice[..(size - written) as usize];
                }

                file.write_all(slice).await?;
                let written_now = slice.len() as u64;
                written += written_now;
                counters.downloaded.fetch_add(written_now, Ordering::SeqCst);
                tracker.add(written_now);

                if written >= size {
                    break;
                }

                if written - last_checkpoint >= CHECKPOINT_BYTES {
                    file.sync_data().await?;
                    write_checkpoint(part, written).await?;
                    last_checkpoint = written;
                }
            }
            Ok(())
        }
        .await;

        // Persist the durable prefix even when the stream failed or was
        // cancelled. The next run can resume from this checkpoint.
        file.sync_data().await?;
        write_checkpoint(part, written).await?;
        stream_result
    }
}

struct Counters {
    downloaded: AtomicU64,
    installed: AtomicU64,
    files_done: AtomicU64,
    active_downloads: AtomicU64,
    active_verifications: AtomicU64,
    active_commits: AtomicU64,
    total_bytes: u64,
    files_total: usize,
}

impl Counters {
    fn new(total_bytes: u64, files_total: usize) -> Self {
        Self {
            downloaded: AtomicU64::new(0),
            installed: AtomicU64::new(0),
            files_done: AtomicU64::new(0),
            active_downloads: AtomicU64::new(0),
            active_verifications: AtomicU64::new(0),
            active_commits: AtomicU64::new(0),
            total_bytes,
            files_total,
        }
    }

    fn snapshot(&self, tracker: &SpeedTracker) -> Progress {
        let downloaded = self.downloaded.load(Ordering::SeqCst).min(self.total_bytes);
        let installed = self.installed.load(Ordering::SeqCst).min(self.total_bytes);
        let phase = if self.active_commits.load(Ordering::SeqCst) > 0 {
            Phase::Committing
        } else if self.active_verifications.load(Ordering::SeqCst) > 0 {
            Phase::Verifying
        } else if self.active_downloads.load(Ordering::SeqCst) > 0 {
            Phase::Downloading
        } else if downloaded == 0 && self.files_done.load(Ordering::SeqCst) == 0 {
            Phase::Preparing
        } else {
            Phase::Downloading
        };

        Progress {
            phase,
            downloaded,
            download_total: self.total_bytes,
            installed,
            install_total: self.total_bytes,
            bytes_per_sec: tracker.speed(),
            files_done: self.files_done.load(Ordering::SeqCst) as usize,
            files_total: self.files_total,
        }
    }
}

struct SpeedTracker {
    total: AtomicU64,
    last_total: AtomicU64,
    last_time: Mutex<Instant>,
    ema: AtomicU64,
}

impl SpeedTracker {
    fn new() -> Self {
        Self {
            total: AtomicU64::new(0),
            last_total: AtomicU64::new(0),
            last_time: Mutex::new(Instant::now()),
            ema: AtomicU64::new(0),
        }
    }

    fn add(&self, bytes: u64) {
        self.total.fetch_add(bytes, Ordering::SeqCst);
    }

    fn speed(&self) -> u64 {
        let mut last_time = match self.last_time.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let elapsed = last_time.elapsed();
        if elapsed < Duration::from_millis(250) {
            return self.ema.load(Ordering::SeqCst);
        }

        let total = self.total.load(Ordering::SeqCst);
        let previous = self.last_total.swap(total, Ordering::SeqCst);
        let delta = total.saturating_sub(previous);
        let instant = (delta as f64 / elapsed.as_secs_f64()) as u64;
        let previous_ema = self.ema.load(Ordering::SeqCst);
        let next = if previous_ema == 0 {
            instant
        } else {
            ((instant as f64 * 0.25) + (previous_ema as f64 * 0.75)) as u64
        };
        self.ema.store(next, Ordering::SeqCst);
        *last_time = Instant::now();
        next
    }
}

pub fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_default();
    name.push(".yayl-part");
    dest.with_file_name(name)
}

async fn remove_part(part: &Path, counters: &Counters, counted: bool) {
    let len = tokio::fs::metadata(part)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    if counted && len > 0 {
        counters.downloaded.fetch_sub(len, Ordering::SeqCst);
    }
    tokio::fs::remove_file(part).await.ok();
    remove_checkpoint(part).await;
}

/// Bytes still needed for this batch, accounting for completed files and
/// resumable partials already on disk.
async fn missing_bytes(jobs: &[FileJob]) -> u64 {
    let mut total = 0u64;
    for job in jobs {
        let existing = tokio::fs::metadata(&job.dest)
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);
        let part = tokio::fs::metadata(part_path(&job.dest))
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);
        let have = existing.max(part).min(job.size);
        total = total.saturating_add(job.size - have);
    }
    total
}

fn checkpoint_path(part: &Path) -> PathBuf {
    let mut name = part
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_default();
    name.push(".ckpt");
    part.with_file_name(name)
}

async fn read_checkpoint(part: &Path) -> Option<u64> {
    tokio::fs::read_to_string(checkpoint_path(part))
        .await
        .ok()
        .and_then(|body| body.trim().parse::<u64>().ok())
}

async fn write_checkpoint(part: &Path, durable: u64) -> Result<()> {
    let path = checkpoint_path(part);
    let tmp = path.with_extension("ckpt.tmp");
    // A planted symlink at the temp path must not redirect this write. Remove
    // the link itself (remove_file never follows it) and create the file fresh.
    tokio::fs::remove_file(&tmp).await.ok();
    let mut file = tokio::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&tmp)
        .await?;
    file.write_all(durable.to_string().as_bytes()).await?;
    file.sync_all().await?;
    drop(file);
    if path.exists() {
        tokio::fs::remove_file(&path).await.ok();
    }
    tokio::fs::rename(&tmp, &path).await?;
    Ok(())
}

async fn remove_checkpoint(part: &Path) {
    tokio::fs::remove_file(checkpoint_path(part)).await.ok();
}

/// Parse the start offset from `bytes <start>-<end>/<total>`.
fn content_range_start(header: &str) -> Option<u64> {
    let rest = header.trim().strip_prefix("bytes")?.trim_start();
    let range = rest.split('/').next()?;
    let start = range.split('-').next()?.trim();
    start.parse::<u64>().ok()
}

async fn commit(part: &Path, dest: &Path) -> Result<()> {
    if dest.exists() {
        tokio::fs::remove_file(dest).await?;
    }
    tokio::fs::rename(part, dest).await?;
    Ok(())
}

async fn sleep_backoff(attempt: u32) {
    let millis = 300u64.saturating_mul(u64::from(attempt) + 1);
    tokio::time::sleep(Duration::from_millis(millis.min(2_000))).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crc64;
    use std::sync::atomic::AtomicBool;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    async fn read_request(socket: &mut TcpStream) -> String {
        let mut buffer = [0u8; 4096];
        let mut request = Vec::new();
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
        String::from_utf8_lossy(&request).into_owned()
    }

    fn request_range(request: &str) -> Option<u64> {
        request.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if !name.eq_ignore_ascii_case("range") {
                return None;
            }
            value
                .trim()
                .strip_prefix("bytes=")?
                .trim_end_matches('-')
                .parse()
                .ok()
        })
    }

    async fn write_response(socket: &mut TcpStream, head: &str, body: &[u8]) {
        socket.write_all(head.as_bytes()).await.unwrap();
        socket.write_all(body).await.unwrap();
        socket.shutdown().await.ok();
    }

    fn partial_head(offset: usize, body_len: usize, slice_len: usize) -> String {
        format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Length: {slice_len}\r\nContent-Range: bytes {offset}-{}/{body_len}\r\nConnection: close\r\n\r\n",
            body_len - 1
        )
    }

    fn sample_body() -> Arc<Vec<u8>> {
        Arc::new(
            (0..20_000u32)
                .map(|value| (value % 251) as u8)
                .collect::<Vec<u8>>(),
        )
    }

    #[tokio::test]
    async fn rejects_plain_http_remote_urls() {
        let dir = tempfile::tempdir().unwrap();
        let job = FileJob::new("http://example.com/a.bin", dir.path().join("a.bin"), 1, 0);
        let error = Downloader::new()
            .unwrap()
            .download_all(dir.path(), vec![job], CancelToken::new(), |_| {})
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput);
    }

    #[test]
    fn part_path_keeps_the_extension() {
        let path = PathBuf::from("game").join("UnityPlayer.dll");
        assert_eq!(
            part_path(&path),
            PathBuf::from("game").join("UnityPlayer.dll.yayl-part")
        );
    }

    #[test]
    fn orders_files_by_size() {
        let mut jobs = vec![
            FileJob::new("u", "large.bin", 1000, 0),
            FileJob::new("u", "small.bin", 10, 0),
            FileJob::new("u", "medium.bin", 100, 0),
        ];

        DownloadOrder::SmallestFirst.sort(&mut jobs);
        assert_eq!(
            jobs.iter().map(|job| job.size).collect::<Vec<_>>(),
            vec![10, 100, 1000]
        );

        DownloadOrder::LargestFirst.sort(&mut jobs);
        assert_eq!(
            jobs.iter().map(|job| job.size).collect::<Vec<_>>(),
            vec![1000, 100, 10]
        );

        DownloadOrder::Manifest.sort(&mut jobs);
        assert_eq!(
            jobs.iter().map(|job| job.size).collect::<Vec<_>>(),
            vec![1000, 100, 10]
        );
    }

    #[test]
    fn parses_content_range_start() {
        assert_eq!(content_range_start("bytes 123-456/789"), Some(123));
        assert_eq!(content_range_start("bytes 0-0/0"), Some(0));
        assert_eq!(content_range_start("items 1-2/3"), None);
        assert_eq!(content_range_start("bytes */100"), None);
    }

    #[tokio::test]
    async fn falls_back_to_the_backup_url() {
        let body = sample_body();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = body.clone();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = read_request(&mut socket).await;
            write_response(
                &mut socket,
                "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                &[],
            )
            .await;

            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = read_request(&mut socket).await;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                server_body.len()
            );
            write_response(&mut socket, &header, &server_body).await;
        });

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("file.bin");
        let job = FileJob::new(
            format!("http://127.0.0.1:{port}/missing.bin"),
            dest.clone(),
            body.len() as u64,
            crc64::crc64(&body),
        )
        .with_backup(format!("http://127.0.0.1:{port}/file.bin"));

        let report = Downloader::new()
            .unwrap()
            .retries(0)
            .download_all(dir.path(), vec![job], CancelToken::new(), |_| {})
            .await
            .unwrap();

        server.await.unwrap();
        assert!(report.is_complete());
        assert_eq!(std::fs::read(&dest).unwrap(), body.as_slice());
    }

    #[tokio::test]
    async fn resumes_and_verifies() {
        let body = Arc::new(b"abcdefghijklmnopqrstuvwxyz".repeat(4096));
        let saw_range = Arc::new(AtomicBool::new(false));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = body.clone();
        let server_range = saw_range.clone();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            let offset = request_range(&request).unwrap_or(0) as usize;
            if offset > 0 {
                server_range.store(true, Ordering::SeqCst);
            }
            let slice = &server_body[offset..];
            let header = if offset > 0 {
                partial_head(offset, server_body.len(), slice.len())
            } else {
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    slice.len()
                )
            };
            write_response(&mut socket, &header, slice).await;
        });

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("file.bin");
        std::fs::write(part_path(&dest), &body[..5000]).unwrap();

        let downloader = Downloader::new().unwrap().concurrency(2);
        let job = FileJob::new(
            format!("http://127.0.0.1:{port}/file.bin"),
            dest.clone(),
            body.len() as u64,
            crc64::crc64(&body),
        );
        let report = downloader
            .download_all(dir.path(), vec![job], CancelToken::new(), |_| {})
            .await
            .unwrap();

        server.await.unwrap();
        assert!(report.is_complete());
        assert!(saw_range.load(Ordering::SeqCst));
        assert_eq!(std::fs::read(&dest).unwrap(), body.as_slice());
        assert!(!part_path(&dest).exists());
    }

    #[tokio::test]
    async fn resumes_from_the_durable_checkpoint() {
        let body = sample_body();
        let saw_offset = Arc::new(AtomicU64::new(u64::MAX));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = body.clone();
        let server_offset = saw_offset.clone();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            let offset = request_range(&request).unwrap_or(0) as usize;
            server_offset.store(offset as u64, Ordering::SeqCst);
            let slice = &server_body[offset..];
            let header = partial_head(offset, server_body.len(), slice.len());
            write_response(&mut socket, &header, slice).await;
        });

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("file.bin");
        let part = part_path(&dest);
        std::fs::write(&part, &body[..5000]).unwrap();
        std::fs::write(checkpoint_path(&part), "4000").unwrap();

        let downloader = Downloader::new().unwrap().retries(0);
        let job = FileJob::new(
            format!("http://127.0.0.1:{port}/file.bin"),
            dest.clone(),
            body.len() as u64,
            crc64::crc64(&body),
        );
        let report = downloader
            .download_all(dir.path(), vec![job], CancelToken::new(), |_| {})
            .await
            .unwrap();

        server.await.unwrap();
        assert!(report.is_complete());
        assert_eq!(saw_offset.load(Ordering::SeqCst), 4000);
        assert_eq!(std::fs::read(&dest).unwrap(), body.as_slice());
        assert!(!part.exists());
        assert!(!checkpoint_path(&part).exists());
    }

    #[tokio::test]
    async fn retries_a_short_stream_with_range() {
        let body = sample_body();
        let offsets = Arc::new(Mutex::new(Vec::new()));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = body.clone();
        let server_offsets = offsets.clone();
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let request = read_request(&mut socket).await;
                let offset = request_range(&request).unwrap_or(0) as usize;
                server_offsets.lock().unwrap().push(offset as u64);
                if offset == 0 {
                    // A dropped connection after 7000 bytes: no Content-Length,
                    // so the body is complete but shorter than the manifest.
                    write_response(
                        &mut socket,
                        "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n",
                        &server_body[..7000],
                    )
                    .await;
                } else {
                    let slice = &server_body[offset..];
                    let header = partial_head(offset, server_body.len(), slice.len());
                    write_response(&mut socket, &header, slice).await;
                }
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("file.bin");
        let downloader = Downloader::new().unwrap().retries(1);
        let job = FileJob::new(
            format!("http://127.0.0.1:{port}/file.bin"),
            dest.clone(),
            body.len() as u64,
            crc64::crc64(&body),
        );
        let report = downloader
            .download_all(dir.path(), vec![job], CancelToken::new(), |_| {})
            .await
            .unwrap();

        server.await.unwrap();
        assert!(report.is_complete());
        assert_eq!(*offsets.lock().unwrap(), vec![0, 7000]);
        assert_eq!(std::fs::read(&dest).unwrap(), body.as_slice());
    }

    #[tokio::test]
    async fn rejects_a_wrong_content_range() {
        let body = sample_body();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = body.clone();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            assert_eq!(request_range(&request), Some(1000));
            // Claim the range starts at 0 even though the client asked for
            // 1000. The downloader must reject this before appending.
            let slice = &server_body[..];
            let header = partial_head(0, server_body.len(), slice.len());
            write_response(&mut socket, &header, slice).await;
        });

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("file.bin");
        let part = part_path(&dest);
        std::fs::write(&part, &body[..1000]).unwrap();

        let downloader = Downloader::new().unwrap().retries(0);
        let job = FileJob::new(
            format!("http://127.0.0.1:{port}/file.bin"),
            dest.clone(),
            body.len() as u64,
            crc64::crc64(&body),
        );
        let report = downloader
            .download_all(dir.path(), vec![job], CancelToken::new(), |_| {})
            .await
            .unwrap();

        server.await.unwrap();
        assert!(!report.is_complete());
        assert_eq!(report.failures[0].code, ErrorCode::Http);
        assert!(!dest.exists());
        assert_eq!(std::fs::read(&part).unwrap().len(), 1000);
    }

    #[tokio::test]
    async fn counts_only_missing_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let complete = dir.path().join("complete.bin");
        std::fs::write(&complete, vec![0u8; 100]).unwrap();
        let partial = dir.path().join("partial.bin");
        std::fs::write(part_path(&partial), vec![0u8; 40]).unwrap();
        let missing = dir.path().join("missing.bin");

        let jobs = vec![
            FileJob::new("http://example.invalid/a", complete, 100, 0),
            FileJob::new("http://example.invalid/b", partial, 100, 0),
            FileJob::new("http://example.invalid/c", missing, 100, 0),
        ];
        assert_eq!(missing_bytes(&jobs).await, 60 + 100);
    }
}
