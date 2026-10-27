//! Headless diagnostics for YAYL.
//!
//! Usage:
//!   yayl-cli hash <file>
//!   yayl-cli manifest <path-or-url>
//!   yayl-cli disk <path>
//!   yayl-cli plan <manifest-path-or-url> --root <dir> [--game <id>]
//!   yayl-cli download <manifest-path-or-url> --root <dir> --base <cdn-url> [--concurrency N]
//!   yayl-cli download --game <id> --root <dir> [--launcher-version V] [--concurrency N]
//!   yayl-cli probe --game <id> [--launcher-version V]
//!   yayl-cli news --game <id> [--json]
//!   yayl-cli manifest-url --game <id> [--launcher-version V]
//!   yayl-cli verify --root <dir> [--concurrency N] [--json]
//!   yayl-cli repair --root <dir> [--concurrency N]
//!   yayl-cli diff --game <id> --root <dir> [--json]
//!
//! Network commands accept `--proxy <url>` (http/https/socks4/socks5),
//! `--proxy system`, or `--direct`. The default is direct, matching the
//! official launcher.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use yayl_core::api::LauncherApi;
use yayl_core::download_plan::{DEFAULT_LAUNCHER_VERSION, DownloadPlan, RemoteGame};
use yayl_core::downloader::{
    CancelToken, DownloadOrder, DownloadReport, Downloader, FileJob, Progress,
};
use yayl_core::error::{Error, ErrorCode, Result};
use yayl_core::install::{InstallPlan, plan_from_local_manifest};
use yayl_core::local_manifest::{self, LocalManifest};
use yayl_core::manifest::{Manifest, fetch_manifest, load_manifest};
use yayl_core::profile::{self, GameProfile};
use yayl_core::proxy::{ProxySettings, build_client};
use yayl_core::state;
use yayl_core::verify::{self, ManifestDiff, VerifyReport};
use yayl_core::{crc64, disk};

const VALUE_OPTIONS: &[&str] = &[
    "--root",
    "--base",
    "--game",
    "--concurrency",
    "--launcher-version",
    "--proxy",
    "--order",
];

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
        "probe" => probe_command(&args[1..]).await,
        "news" => news_command(&args[1..]).await,
        "manifest-url" => manifest_url_command(&args[1..]).await,
        "verify" => verify_command(&args[1..]).await,
        "repair" => repair_command(&args[1..]).await,
        "diff" => diff_command(&args[1..]).await,
        "-h" | "--help" | "help" => {
            print_usage();
            return ExitCode::SUCCESS;
        }
        other => Err(Error::new(
            ErrorCode::InvalidInput,
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
         download <manifest> --root <dir> --base <cdn-url> [--concurrency N]\n  \
         download --game <id> --root <dir> [--launcher-version V] [--concurrency N]\n  \
         probe --game <id> [--launcher-version V]     Fetch config, CDN, and manifest\n  \
         news --game <id> [--json]                    Fetch banners and news\n  \
         manifest-url --game <id>                     Print the current manifest URL\n  \
         verify --root <dir> [--concurrency N] [--json]   Verify plan or local manifest\n  \
         repair --root <dir> [--concurrency N]        Re-download files reported by verify\n  \
         diff --game <id> --root <dir> [--json]       Compare remote plan to local manifest\n\n\
         Network options: --proxy <url> | --proxy system | --direct\n\
         Download order:  --order smallest-first|largest-first|manifest (default: smallest-first)\n",
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
    let client = client_for(args)?;
    let manifest = load_manifest_target(target, client).await?;
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
        let client = client_for(args)?;
        yayl_core::install::plan_install_with_client(target, &root, profile, client).await?
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
    let root =
        PathBuf::from(option(args, "--root").ok_or_else(|| missing("download", "--root <dir>"))?);
    let concurrency = concurrency_option(args);
    let order = order_option(args)?;
    let client = client_for(args)?;
    let target = positional_target(args);
    let has_game = option(args, "--game").is_some();

    match (has_game, target) {
        (true, Some(_)) => Err(Error::new(
            ErrorCode::InvalidInput,
            "download accepts either <manifest> or --game, not both",
        )),
        (true, None) => download_game(args, &root, concurrency, order, client).await,
        (false, Some(target)) => {
            download_manifest(args, target, &root, concurrency, order, client).await
        }
        (false, None) => Err(missing("download", "<manifest> or --game <id>")),
    }
}

async fn download_manifest(
    args: &[String],
    target: &str,
    root: &Path,
    concurrency: usize,
    order: DownloadOrder,
    client: reqwest::Client,
) -> Result<()> {
    let base = option(args, "--base").ok_or_else(|| missing("download", "--base <cdn-url>"))?;

    let manifest = load_manifest_target(target, client.clone()).await?;
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

    let downloader = Downloader::with_client(client)
        .concurrency(concurrency)
        .order(order);
    let report = downloader
        .download_all(root, jobs, CancelToken::new(), progress_printer())
        .await?;
    finish_report(report)
}

async fn download_game(
    args: &[String],
    root: &Path,
    concurrency: usize,
    order: DownloadOrder,
    client: reqwest::Client,
) -> Result<()> {
    let profile = required_game(args, "download")?;
    let plan = DownloadPlan::prepare_with(
        *profile,
        root.to_path_buf(),
        launcher_version(args),
        client.clone(),
        order,
    )
    .await?;

    let files = plan.document.manifest.files.len();
    let bytes: u64 = plan
        .document
        .manifest
        .files
        .iter()
        .map(|file| file.size)
        .sum();

    println!(
        "game: {} ({})",
        plan.document.game.id, plan.document.game.tag
    );
    println!("version: {}", plan.document.game.version);
    println!("basis: {}", plan.document.game.basis);
    println!("manifest: {}", plan.document.manifest.url);
    println!("files: {files}");
    println!("size: {}", disk::format_bytes(bytes));
    println!("root: {}", plan.root.display());
    println!(
        "primary_cdn: {}",
        plan.document
            .cdns
            .first()
            .ok_or_else(|| Error::new(ErrorCode::Http, "plan has no CDN host"))?
    );
    if let Some(backup) = plan.document.cdns.get(1) {
        println!("backup_cdn: {backup}");
    }

    let downloader = Downloader::with_client(client)
        .concurrency(concurrency)
        .order(order);
    let report = plan
        .run(&downloader, CancelToken::new(), progress_printer())
        .await?;
    finish_report(report)?;

    println!("plan: {}", plan.plan_path().display());
    println!("task: {}", plan.task_path().display());
    println!("manifest cache: {}", plan.remote_manifest_path().display());
    println!(
        "metadata: {}",
        local_manifest::manifest_path(&plan.root).display()
    );
    println!(
        "config: {}",
        local_manifest::game_config_path(&plan.root).display()
    );
    Ok(())
}

async fn probe_command(args: &[String]) -> Result<()> {
    let profile = required_game(args, "probe")?;
    let client = client_for(args)?;
    let remote =
        RemoteGame::fetch_with_client(*profile, launcher_version(args), client.clone()).await?;
    let api = LauncherApi::with_client(profile, launcher_version(args), client)?;
    let base = api.base_config().await?;
    let summary = remote.manifest.summary();

    println!("game: {} ({})", profile.id, profile.game_tag);
    println!("latest: {}", remote.game.game_latest_version);
    println!("minimum: {}", remote.game.game_lowest_version);
    println!("basis: {}", remote.game.game_latest_file_path);
    println!("exe: {}", remote.game.game_start_exe_name);
    println!("manifest: {}", remote.manifest_url);
    println!("files: {}", summary.files);
    println!(
        "size: {} ({})",
        summary.total_bytes,
        disk::format_bytes(summary.total_bytes)
    );
    println!("primary_cdn: {}", remote.primary_cdn()?);
    if let Some(backup) = remote.backup_cdn() {
        println!("backup_cdn: {backup}");
    }
    println!("notice_pop_open: {}", base.notice_pop_open);
    if !base.notice_content.is_empty() {
        println!("notice: {}", base.notice_content);
    }
    Ok(())
}

async fn news_command(args: &[String]) -> Result<()> {
    let profile = required_game(args, "news")?;
    let client = client_for(args)?;
    let api = LauncherApi::with_client(profile, launcher_version(args), client)?;
    let feed = api.news().await?;

    if args.iter().any(|arg| arg == "--json") {
        println!("{}", serde_json::to_string_pretty(&feed)?);
        return Ok(());
    }

    println!("banners: {}", feed.banners.len());
    for banner in &feed.banners {
        println!("- {}", banner.remark);
        println!("  {}", banner.url);
        println!("  image: {}", banner.image);
    }
    println!("sections: {}", feed.sections.len());
    for section in &feed.sections {
        println!("[{}]", section.label);
        for item in &section.items {
            println!("- {} ({})", item.title, item.date);
            println!("  {}", item.url);
            if !item.image.is_empty() {
                println!("  image: {}", item.image);
            }
        }
    }
    Ok(())
}

async fn manifest_url_command(args: &[String]) -> Result<()> {
    let profile = required_game(args, "manifest-url")?;
    let client = client_for(args)?;
    let api = LauncherApi::with_client(profile, launcher_version(args), client)?;
    let game = api.game_config().await?;
    let url = api
        .manifest_url(&game.game_latest_version, &game.game_latest_file_path)
        .await?;
    println!("{url}");
    Ok(())
}

async fn verify_command(args: &[String]) -> Result<()> {
    let root =
        PathBuf::from(option(args, "--root").ok_or_else(|| missing("verify", "--root <dir>"))?);
    let concurrency = concurrency_option(args);
    let report = verify_root(&root, concurrency).await?;

    if args.iter().any(|arg| arg == "--json") {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_verify(&report);
    }

    if report.is_healthy() {
        Ok(())
    } else {
        Err(Error::new(
            ErrorCode::Checksum,
            format!("{} file(s) need repair", report.issues.len()),
        ))
    }
}

async fn repair_command(args: &[String]) -> Result<()> {
    let root =
        PathBuf::from(option(args, "--root").ok_or_else(|| missing("repair", "--root <dir>"))?);
    let concurrency = concurrency_option(args);
    let plan = DownloadPlan::load(&root)?;
    ensure_plan_game(args, &plan)?;

    let report = plan.verify(concurrency).await?;
    if report.is_healthy() {
        println!("healthy: {} files verified", report.verified);
        return Ok(());
    }

    println!(
        "repairing {} file(s), {}",
        report.issues.len(),
        disk::format_bytes(report.bytes_to_repair())
    );
    let client = client_for(args)?;
    let downloader = Downloader::with_client(client)
        .concurrency(concurrency)
        .order(order_option(args)?);
    let result = plan
        .repair(&downloader, CancelToken::new(), &report, progress_printer())
        .await?;
    finish_report(result)?;

    let after = plan.verify(concurrency).await?;
    if !after.is_healthy() {
        print_verify(&after);
        return Err(Error::new(
            ErrorCode::Checksum,
            format!("{} file(s) still need repair", after.issues.len()),
        ));
    }
    println!("repair complete: {} files verified", after.verified);
    Ok(())
}

async fn diff_command(args: &[String]) -> Result<()> {
    let root =
        PathBuf::from(option(args, "--root").ok_or_else(|| missing("diff", "--root <dir>"))?);
    let profile = required_game(args, "diff")?;
    let client = client_for(args)?;
    let plan = DownloadPlan::prepare_with(
        *profile,
        root,
        launcher_version(args),
        client,
        order_option(args)?,
    )
    .await?;
    let diff = plan.diff_against_local()?;

    if args.iter().any(|arg| arg == "--json") {
        println!("{}", serde_json::to_string_pretty(&diff)?);
        return Ok(());
    }
    print_diff(&diff);
    Ok(())
}

async fn verify_root(root: &Path, concurrency: usize) -> Result<VerifyReport> {
    if state::plan_path(root).exists() {
        return DownloadPlan::load(root)?.verify(concurrency).await;
    }
    let local = LocalManifest::load(&local_manifest::manifest_path(root))?;
    verify::verify_manifest(root, &local.to_manifest()?, concurrency).await
}

fn print_verify(report: &VerifyReport) {
    println!("files: {}", report.files);
    println!("verified: {}", report.verified);
    println!(
        "bytes_verified: {}",
        disk::format_bytes(report.bytes_verified)
    );
    println!("issues: {}", report.issues.len());
    for issue in &report.issues {
        let actual = issue
            .actual_size
            .map(disk::format_bytes)
            .unwrap_or_else(|| "missing".to_owned());
        println!(
            "{} [{}] expected {}, got {}",
            issue.path.display(),
            issue.kind.as_str(),
            disk::format_bytes(issue.expected_size),
            actual
        );
    }
}

fn print_diff(diff: &ManifestDiff) {
    println!(
        "added: {} ({})",
        diff.added.len(),
        disk::format_bytes(diff.added_bytes)
    );
    for entry in &diff.added {
        println!(
            "  + {} ({})",
            entry.path.display(),
            disk::format_bytes(entry.size)
        );
    }
    println!(
        "removed: {} ({})",
        diff.removed.len(),
        disk::format_bytes(diff.removed_bytes)
    );
    for entry in &diff.removed {
        println!(
            "  - {} ({})",
            entry.path.display(),
            disk::format_bytes(entry.size)
        );
    }
    println!(
        "changed: {} ({})",
        diff.changed.len(),
        disk::format_bytes(diff.changed_bytes)
    );
    for entry in &diff.changed {
        println!(
            "  ~ {} ({} -> {})",
            entry.path.display(),
            disk::format_bytes(entry.old_size),
            disk::format_bytes(entry.new_size)
        );
    }
    println!("unchanged: {}", diff.unchanged);
    if diff.is_empty() {
        println!("up to date");
    }
}

fn ensure_plan_game(args: &[String], plan: &DownloadPlan) -> Result<()> {
    if let Some(id) = option(args, "--game") {
        if id != plan.document.game.id {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                format!("plan belongs to {}, not {id}", plan.document.game.id),
            ));
        }
    }
    Ok(())
}

fn finish_report(report: DownloadReport) -> Result<()> {
    if report.is_complete() {
        println!(
            "done: {} files, {}",
            report.files,
            disk::format_bytes(report.bytes)
        );
        return Ok(());
    }

    for failure in &report.failures {
        eprintln!(
            "{} [{}]: {}",
            failure.path.display(),
            failure.code,
            failure.message
        );
    }
    Err(Error::new(
        ErrorCode::Unknown,
        format!("{} of {} files failed", report.failures.len(), report.files),
    ))
}

fn progress_printer() -> impl Fn(Progress) + Send + Sync + 'static {
    let last_percent = Arc::new(AtomicU64::new(u64::MAX));
    move |progress: Progress| {
        let percent = progress
            .downloaded
            .checked_mul(100)
            .and_then(|value| value.checked_div(progress.download_total))
            .unwrap_or(0);
        let previous = last_percent.swap(percent, Ordering::SeqCst);
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
}

async fn load_manifest_target(target: &str, client: reqwest::Client) -> Result<Manifest> {
    if target.starts_with("http://") || target.starts_with("https://") {
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

fn positional_target(args: &[String]) -> Option<&str> {
    let mut index = 0usize;
    while index < args.len() {
        let arg = args[index].as_str();
        if arg.starts_with("--") {
            if VALUE_OPTIONS.contains(&arg) {
                index += 2;
            } else {
                index += 1;
            }
            continue;
        }
        return Some(arg);
    }
    None
}

fn concurrency_option(args: &[String]) -> usize {
    option(args, "--concurrency")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(10)
}

fn order_option(args: &[String]) -> Result<DownloadOrder> {
    match option(args, "--order").unwrap_or("smallest-first") {
        "smallest-first" | "smallest" => Ok(DownloadOrder::SmallestFirst),
        "largest-first" | "largest" => Ok(DownloadOrder::LargestFirst),
        "manifest" => Ok(DownloadOrder::Manifest),
        other => Err(Error::new(
            ErrorCode::InvalidInput,
            format!("unknown download order: {other}"),
        )),
    }
}

fn proxy_settings(args: &[String]) -> Result<ProxySettings> {
    if args.iter().any(|arg| arg == "--direct") {
        return Ok(ProxySettings::direct());
    }
    match option(args, "--proxy") {
        Some("system") => Ok(ProxySettings::system()),
        Some("direct") => Ok(ProxySettings::direct()),
        Some(url) => {
            let settings = ProxySettings::manual(url);
            settings.validate()?;
            Ok(settings)
        }
        None => Ok(ProxySettings::default()),
    }
}

fn client_for(args: &[String]) -> Result<reqwest::Client> {
    build_client(&proxy_settings(args)?)
}

fn launcher_version(args: &[String]) -> &str {
    option(args, "--launcher-version").unwrap_or(DEFAULT_LAUNCHER_VERSION)
}

fn required_game(args: &[String], command: &str) -> Result<&'static GameProfile> {
    let id = option(args, "--game").ok_or_else(|| missing(command, "--game <id>"))?;
    profile::by_id(id).ok_or_else(|| {
        Error::new(
            ErrorCode::InvalidInput,
            format!("unknown game profile: {id}"),
        )
    })
}

fn game_option(args: &[String]) -> Result<Option<&'static GameProfile>> {
    match option(args, "--game") {
        Some(id) => profile::by_id(id).map(Some).ok_or_else(|| {
            Error::new(
                ErrorCode::InvalidInput,
                format!("unknown game profile: {id}"),
            )
        }),
        None => Ok(None),
    }
}

fn missing(command: &str, what: &str) -> Error {
    Error::new(
        ErrorCode::InvalidInput,
        format!("{command} requires {what}"),
    )
}
