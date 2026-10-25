//! Headless diagnostics for YAYL.
//!
//! Usage:
//!   yayl-cli hash <file>
//!   yayl-cli manifest <path-or-url>
//!   yayl-cli disk <path>
//!   yayl-cli plan <manifest-path-or-url> --root <dir> [--game <id>]
//!   yayl-cli download <manifest-path-or-url> --root <dir> --base <cdn-url> [--concurrency N]

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;

use yayl_core::downloader::{CancelToken, Downloader, FileJob};
use yayl_core::error::{Error, Result};
use yayl_core::install::{InstallPlan, plan_from_local_manifest};
use yayl_core::manifest::{Manifest, fetch_manifest, load_manifest};
use yayl_core::profile::{self, GameProfile};
use yayl_core::{crc64, disk};

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        print_usage();
        return ExitCode::FAILURE;
    }

    let result = match args[0].as_str() {
        "hash" => hash_command(&args[1..]).await,
        "manifest" => manifest_command(&args[1..]).await,
        "disk" => disk_command(&args[1..]),
        "plan" => plan_command(&args[1..]).await,
        "download" => download_command(&args[1..]).await,
        "-h" | "--help" | "help" => {
            print_usage();
            return ExitCode::SUCCESS;
        }
        other => Err(Error::new(
            yayl_core::ErrorCode::InvalidInput,
            format!("unknown command: {other}"),
        )),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error [{}]: {}", error.code, error.message);
            ExitCode::FAILURE
        }
    }
}

fn print_usage() {
    eprintln!(
        "yayl-cli {}\n\n\
         Commands:\n  \
         hash <file>                                  Print the CRC-64/XZ of a file\n  \
         manifest <path-or-url>                       Summarize an official manifest\n  \
         disk <path>                                  Print free/total space for a path\n  \
         plan <manifest> --root <dir> [--game <id>]   Plan an install\n  \
         download <manifest> --root <dir> --base <cdn-url> [--concurrency N]\n",
        env!("CARGO_PKG_VERSION")
    );
}

async fn hash_command(args: &[String]) -> Result<()> {
    let path = Path::new(args.first().ok_or_else(|| missing("hash", "<file>"))?);
    let hash = crc64::crc64_file(path).await?;
    println!("{hash}");
    Ok(())
}

async fn manifest_command(args: &[String]) -> Result<()> {
    let target = args
        .first()
        .ok_or_else(|| missing("manifest", "<path-or-url>"))?;
    let manifest = load_manifest_target(target).await?;
    let summary = manifest.summary();
    println!("source: {}", manifest.source);
    println!("files: {}", summary.files);
    println!("bytes: {}", summary.total_bytes);
    println!("size: {}", disk::format_bytes(summary.total_bytes));
    Ok(())
}

fn disk_command(args: &[String]) -> Result<()> {
    let path = Path::new(args.first().ok_or_else(|| missing("disk", "<path>"))?);
    let space = disk::space_for(path)?;
    println!("drive: {}", disk::drive_label(path));
    println!("free: {}", disk::format_bytes(space.free_bytes));
    println!("total: {}", disk::format_bytes(space.total_bytes));
    Ok(())
}

async fn plan_command(args: &[String]) -> Result<()> {
    let target = args.first().ok_or_else(|| missing("plan", "<manifest>"))?;
    let root =
        PathBuf::from(option(args, "--root").ok_or_else(|| missing("plan", "--root <dir>"))?);
    let profile = game_option(args)?;

    let plan = if target.starts_with("http://") || target.starts_with("https://") {
        yayl_core::install::plan_install(target, &root, profile).await?
    } else {
        plan_from_local_manifest(Path::new(target), &root, profile)?
    };
    print_plan(&plan);
    Ok(())
}

fn print_plan(plan: &InstallPlan) {
    println!("root: {}", plan.root.display());
    println!("drive: {}", plan.drive);
    println!("download: {}", plan.display_download());
    println!("install: {}", plan.display_install());
    println!("free: {}", plan.display_free());
    println!("total: {}", disk::format_bytes(plan.total_bytes));
    println!("enough_space: {}", plan.enough_space);
    if !plan.enough_space {
        println!("missing: {}", plan.display_missing());
    }
    println!("existing_install: {}", plan.existing_install);
}

async fn download_command(args: &[String]) -> Result<()> {
    let target = args
        .first()
        .ok_or_else(|| missing("download", "<manifest>"))?;
    let root =
        PathBuf::from(option(args, "--root").ok_or_else(|| missing("download", "--root <dir>"))?);
    let base = option(args, "--base").ok_or_else(|| missing("download", "--base <cdn-url>"))?;
    let concurrency = option(args, "--concurrency")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(10);

    let manifest = load_manifest_target(target).await?;
    let mut jobs = Vec::with_capacity(manifest.files.len());
    for entry in &manifest.files {
        let dest = root.join(&entry.relative);
        jobs.push(FileJob::new(
            manifest.file_url(base, entry),
            dest,
            entry.size,
            entry.crc64,
        ));
    }

    println!(
        "downloading {} files ({}) to {}",
        jobs.len(),
        disk::format_bytes(manifest.total_bytes()),
        root.display()
    );

    let downloader = Downloader::new()?.concurrency(concurrency);
    let cancel = CancelToken::new();
    let last_percent = Arc::new(std::sync::atomic::AtomicU64::new(u64::MAX));
    let progress = {
        let last_percent = last_percent.clone();
        move |progress: yayl_core::downloader::Progress| {
            let percent = progress
                .downloaded
                .checked_mul(100)
                .and_then(|value| value.checked_div(progress.download_total))
                .unwrap_or(0);
            let previous = last_percent.swap(percent, std::sync::atomic::Ordering::SeqCst);
            if percent != previous {
                eprintln!(
                    "{}% {} / {} ({} files, {}/s)",
                    percent,
                    disk::format_bytes(progress.downloaded),
                    disk::format_bytes(progress.download_total),
                    progress.files_done,
                    disk::format_bytes(progress.bytes_per_sec)
                );
            }
        }
    };

    let report = downloader
        .download_all(&root, jobs, cancel, progress)
        .await?;

    if report.is_complete() {
        println!(
            "done: {} files, {}",
            report.files,
            disk::format_bytes(report.bytes)
        );
        Ok(())
    } else {
        for failure in &report.failures {
            eprintln!(
                "{} [{}]: {}",
                failure.path.display(),
                failure.code,
                failure.message
            );
        }
        Err(Error::new(
            yayl_core::ErrorCode::Unknown,
            format!("{} of {} files failed", report.failures.len(), report.files),
        ))
    }
}

async fn load_manifest_target(target: &str) -> Result<Manifest> {
    if target.starts_with("http://") || target.starts_with("https://") {
        let client = yayl_core::downloader::http_client()?;
        fetch_manifest(&client, target).await
    } else {
        load_manifest(Path::new(target))
    }
}

fn option<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .position(|value| value == name)
        .and_then(|index| args.get(index + 1))
        .map(String::as_str)
}

fn game_option(args: &[String]) -> Result<Option<&'static GameProfile>> {
    match option(args, "--game") {
        Some(id) => profile::by_id(id).map(Some).ok_or_else(|| {
            Error::new(
                yayl_core::ErrorCode::InvalidInput,
                format!("unknown game profile: {id}"),
            )
        }),
        None => Ok(None),
    }
}

fn missing(command: &str, what: &str) -> Error {
    Error::new(
        yayl_core::ErrorCode::InvalidInput,
        format!("{command} requires {what}"),
    )
}
