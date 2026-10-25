//! Resumable HTTP downloader.
//!
//! Design goals:
//! - Range resume from a `.yayl-part` file next to the target.
//! - Verify CRC-64/XZ before the part file is committed.
//! - Bounded concurrency with a shared progress model.
//! - Cancellation leaves part files in place so the next run resumes.
//! - No global mutable state: the caller owns the downloader and token.

use crate::crc64;
use crate::disk;
use crate::error::{Error, ErrorCode, Result};
use futures_util::StreamExt;
use reqwest::header::{ACCEPT_ENCODING, RANGE};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

#[derive(Debug, Clone)]
pub struct FileJob {
    /// CDN URLs in fallback order.
    pub urls: Vec<String>,
    /// Absolute destination inside the install root.
    pub dest: PathBuf,
    pub size: u64,
    pub crc64: u64,
}

impl FileJob {
    pub fn new(url: impl Into<String>, dest: impl Into<PathBuf>, size: u64, crc64: u64) -> Self {
        Self {
            urls: vec![url.into()],
            dest: dest.into(),
            size,
            crc64,
        }
    }

    pub fn with_backup(mut self, url: impl Into<String>) -> Self {
        self.urls.push(url.into());
        self
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
    Client::builder()
        .user_agent(concat!("YAYL/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(Into::into)
}

#[derive(Clone)]
pub struct Downloader {
    client: Client,
    concurrency: usize,
    retries: u32,
    verify_existing: bool,
}

impl Downloader {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: http_client()?,
            concurrency: 8,
            retries: 3,
            verify_existing: true,
        })
    }

    pub fn with_client(client: Client) -> Self {
        Self {
            client,
            concurrency: 8,
            retries: 3,
            verify_existing: true,
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

    /// Download every job under `root`. Per-file failures are returned in the
    /// report instead of aborting the whole batch.
    pub async fn download_all<F>(
        &self,
        root: &Path,
        jobs: Vec<FileJob>,
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

        for job in &jobs {
            if !job.dest.starts_with(root) {
                return Err(Error::path(format!(
                    "download destination escapes the install root: {}",
                    job.dest.display()
                )));
            }
        }

        let total_bytes: u64 = jobs.iter().map(|job| job.size).sum();
        let space = disk::space_for(root)?;
        if space.free_bytes < total_bytes {
            return Err(Error::disk(format!(
                "not enough free space: need {}, available {}",
                disk::format_bytes(total_bytes),
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
            set.spawn(async move {
                let _permit = permit;
                let dest = job.dest.clone();
                let result = this.download_one(&job, &counters, &tracker, &cancel).await;
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
        job: &FileJob,
        counters: &Counters,
        tracker: &SpeedTracker,
        cancel: &CancelToken,
    ) -> Result<()> {
        if cancel.is_cancelled() {
            return Err(Error::cancelled());
        }

        if self.verify_existing && job.dest.is_file() {
            let size = tokio::fs::metadata(&job.dest)
                .await
                .map(|meta| meta.len())
                .unwrap_or(0);
            if size == job.size {
                counters.active_verifications.fetch_add(1, Ordering::SeqCst);
                let valid = crc64::crc64_file(&job.dest)
                    .await
                    .map(|hash| hash == job.crc64)
                    .unwrap_or(false);
                counters.active_verifications.fetch_sub(1, Ordering::SeqCst);
                if valid {
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

        let mut part_len = tokio::fs::metadata(&part)
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);
        if part_len > job.size {
            remove_part(&part, counters).await;
            part_len = 0;
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
                    .stream_to_part(url, &part, job.size, counters, tracker, cancel)
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
                remove_part(&part, counters).await;
                sleep_backoff(attempt).await;
                continue;
            }

            counters.active_verifications.fetch_add(1, Ordering::SeqCst);
            let hash = crc64::crc64_file(&part).await;
            counters.active_verifications.fetch_sub(1, Ordering::SeqCst);

            match hash {
                Ok(hash) if hash == job.crc64 => {
                    counters.active_commits.fetch_add(1, Ordering::SeqCst);
                    let committed = commit(&part, &job.dest).await;
                    counters.active_commits.fetch_sub(1, Ordering::SeqCst);
                    committed?;
                    counters.installed.fetch_add(job.size, Ordering::SeqCst);
                    counters.files_done.fetch_add(1, Ordering::SeqCst);
                    return Ok(());
                }
                Ok(hash) => {
                    last_error = Error::new(
                        ErrorCode::Checksum,
                        format!(
                            "checksum mismatch for {}: expected {}, got {}",
                            job.dest.display(),
                            job.crc64,
                            hash
                        ),
                    );
                }
                Err(error) => last_error = error,
            }

            remove_part(&part, counters).await;
            sleep_backoff(attempt).await;
        }

        Err(last_error)
    }

    async fn stream_to_part(
        &self,
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

        let append = status == StatusCode::PARTIAL_CONTENT && offset > 0;
        if offset > 0 && !append {
            counters.downloaded.fetch_sub(offset, Ordering::SeqCst);
        }

        let mut file = if append {
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(part)
                .await?
        } else {
            tokio::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(part)
                .await?
        };

        let mut written = if append { offset } else { 0 };
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            if cancel.is_cancelled() {
                file.flush().await?;
                return Err(Error::cancelled());
            }

            let chunk = chunk?;
            if chunk.is_empty() {
                continue;
            }

            let mut slice = chunk.as_ref();
            if size > 0 && written >= size {
                break;
            }
            if size > 0 && written + slice.len() as u64 > size {
                slice = &slice[..(size - written) as usize];
            }

            file.write_all(slice).await?;
            let written_now = slice.len() as u64;
            written += written_now;
            counters.downloaded.fetch_add(written_now, Ordering::SeqCst);
            tracker.add(written_now);

            if size > 0 && written >= size {
                break;
            }
        }

        file.flush().await?;
        Ok(())
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

async fn remove_part(part: &Path, counters: &Counters) {
    let len = tokio::fs::metadata(part)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    if len > 0 {
        counters.downloaded.fetch_sub(len, Ordering::SeqCst);
    }
    tokio::fs::remove_file(part).await.ok();
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
    use std::sync::atomic::AtomicBool;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn part_path_keeps_the_extension() {
        assert_eq!(
            part_path(Path::new("D:/game/UnityPlayer.dll")),
            PathBuf::from("D:/game/UnityPlayer.dll.yayl-part")
        );
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
            let mut buffer = vec![0u8; 4096];
            let read = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            let offset = request
                .lines()
                .find_map(|line| {
                    line.strip_prefix("Range: bytes=")
                        .or_else(|| line.strip_prefix("range: bytes="))
                        .map(|value| value.trim_end_matches('-').parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if offset > 0 {
                server_range.store(true, Ordering::SeqCst);
            }
            let slice = &server_body[offset..];
            let header = if offset > 0 {
                format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nConnection: close\r\n\r\n",
                    slice.len(),
                    offset,
                    server_body.len() - 1,
                    server_body.len()
                )
            } else {
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    slice.len()
                )
            };
            socket.write_all(header.as_bytes()).await.unwrap();
            socket.write_all(slice).await.unwrap();
            socket.shutdown().await.ok();
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
}
