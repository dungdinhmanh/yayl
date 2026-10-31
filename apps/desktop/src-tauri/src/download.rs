//! Download commands and progress events.
//!
//! The webview never sees a `DownloadPlan`. It starts a game download, listens
//! for `download-progress`, and asks for a resume snapshot on startup.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, Manager, State};
use yayl_core::download_plan::{DEFAULT_LAUNCHER_VERSION, DownloadPlan};
use yayl_core::downloader::{CancelToken, DownloadOrder, Downloader, Phase, Progress};
use yayl_core::profile::{self, GameProfile};
use yayl_core::task::{DownloadTask, TaskState};
use yayl_core::{ErrorCode, install, state as core_state};

use crate::commands::ensure_allowed_root;
use crate::error::CommandError;
use crate::state::AppState;

pub const PROGRESS_EVENT: &str = "download-progress";
const DEFAULT_CONCURRENCY: usize = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEvent {
    pub game: String,
    pub phase: String,
    pub downloaded: u64,
    pub download_total: u64,
    pub installed: u64,
    pub install_total: u64,
    pub bytes_per_sec: u64,
    pub files_done: usize,
    pub files_total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl DownloadEvent {
    fn preparing(game: &str, bytes_total: u64, files_total: usize) -> Self {
        Self {
            game: game.to_owned(),
            phase: "preparing".to_owned(),
            downloaded: 0,
            download_total: bytes_total,
            installed: 0,
            install_total: bytes_total,
            bytes_per_sec: 0,
            files_done: 0,
            files_total,
            code: None,
            detail: None,
        }
    }

    fn from_progress(game: &str, progress: Progress) -> Self {
        Self {
            game: game.to_owned(),
            phase: phase_name(progress.phase).to_owned(),
            downloaded: progress.downloaded,
            download_total: progress.download_total,
            installed: progress.installed,
            install_total: progress.install_total,
            bytes_per_sec: progress.bytes_per_sec,
            files_done: progress.files_done,
            files_total: progress.files_total,
            code: None,
            detail: None,
        }
    }

    fn terminal(
        game: &str,
        phase: &str,
        progress: Option<Progress>,
        code: Option<&str>,
        detail: Option<String>,
    ) -> Self {
        let base = progress.unwrap_or(Progress {
            phase: Phase::Preparing,
            downloaded: 0,
            download_total: 0,
            installed: 0,
            install_total: 0,
            bytes_per_sec: 0,
            files_done: 0,
            files_total: 0,
        });
        Self {
            game: game.to_owned(),
            phase: phase.to_owned(),
            downloaded: base.downloaded,
            download_total: base.download_total,
            installed: base.installed,
            install_total: base.install_total,
            bytes_per_sec: base.bytes_per_sec,
            files_done: base.files_done,
            files_total: base.files_total,
            code: code.map(str::to_owned),
            detail,
        }
    }
}

fn phase_name(phase: Phase) -> &'static str {
    match phase {
        Phase::Preparing => "preparing",
        Phase::Downloading => "downloading",
        Phase::Verifying => "verifying",
        Phase::Committing => "committing",
        // The downloader reports Done before the official metadata is written.
        // The command emits the authoritative `done` event after `run` returns.
        Phase::Done => "committing",
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSnapshot {
    pub game: String,
    pub version: String,
    pub state: String,
    pub files_done: usize,
    pub files_total: usize,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub installed: bool,
    pub resumable: bool,
    pub active: bool,
}

fn task_state_name(state: TaskState) -> &'static str {
    match state {
        TaskState::Pending => "pending",
        TaskState::Running => "running",
        TaskState::Verifying => "verifying",
        TaskState::Paused => "paused",
        TaskState::Completed => "completed",
        TaskState::Failed => "failed",
    }
}

/// Load the plan and task under `root` without touching the network.
pub fn load_snapshot(
    root: &Path,
    is_active: impl Fn(&str) -> bool,
) -> Result<Option<DownloadSnapshot>, CommandError> {
    if !core_state::plan_path(root).is_file() {
        return Ok(None);
    }

    let plan = DownloadPlan::load(root)?;
    let game = plan.document.game.id.clone();
    let active = is_active(&game);
    let files_total_plan = plan.document.jobs.len();
    let bytes_total_plan: u64 = plan.document.jobs.iter().map(|job| job.size).sum();

    let task = DownloadTask::load(&plan.task_path())?;
    let has_task = task.is_some();
    let (mut state, files_done, files_total, bytes_done, bytes_total) = match task {
        Some(task) => (
            task.state,
            task.files_done,
            task.files_total,
            task.bytes_done,
            task.bytes_total,
        ),
        None => (TaskState::Pending, 0, files_total_plan, 0, bytes_total_plan),
    };

    // A persisted `running` state means the previous process stopped before it
    // could write a terminal state. Without a live token it is a pause.
    if !active && matches!(state, TaskState::Running | TaskState::Verifying) {
        state = TaskState::Paused;
    }

    // An executable can appear early in a download. Only trust it when there is
    // no task yet (an official install imported into the folder); an unfinished
    // task always means the install is not ready.
    let installed = state == TaskState::Completed
        || (!has_task
            && profile::by_id(&game)
                .map(|profile| install::detect_existing(root, profile))
                .unwrap_or(false));
    let resumable = !installed
        && matches!(
            state,
            TaskState::Pending
                | TaskState::Running
                | TaskState::Verifying
                | TaskState::Paused
                | TaskState::Failed
        );

    Ok(Some(DownloadSnapshot {
        game,
        version: plan.document.game.version.clone(),
        state: task_state_name(state).to_owned(),
        files_done,
        files_total,
        bytes_done,
        bytes_total,
        installed,
        resumable,
        active,
    }))
}

/// Reuse the saved plan only while the task is unfinished. A completed task
/// means the next start is a fresh check (update/repair), not a resume.
pub fn resume_plan(root: &Path, game: &str) -> Result<Option<DownloadPlan>, CommandError> {
    if !core_state::plan_path(root).is_file() {
        return Ok(None);
    }
    yayl_core::path::reject_symlink_components(root, &core_state::state_dir(root))?;
    let plan = DownloadPlan::load(root)?;
    if plan.document.game.id != game {
        return Ok(None);
    }
    match DownloadTask::load(&plan.task_path())? {
        Some(task) if task.state == TaskState::Completed => Ok(None),
        _ => Ok(Some(plan)),
    }
}

#[tauri::command]
pub fn download_status(
    app: AppHandle,
    state: State<'_, AppState>,
    game: String,
    path: String,
) -> Result<Option<DownloadSnapshot>, CommandError> {
    if path.trim().is_empty() {
        return Ok(None);
    }
    let root = PathBuf::from(&path);
    ensure_allowed_root(&app, &game, &root)?;
    yayl_core::path::reject_symlink_components(&root, &core_state::state_dir(&root))?;
    load_snapshot(&root, |game| state.is_active(game))
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    state: State<'_, AppState>,
    game: String,
    path: String,
) -> Result<(), CommandError> {
    let profile = profile::by_id(&game)
        .copied()
        .ok_or_else(|| CommandError::new("invalid_input", format!("unknown game: {game}")))?;
    let root = PathBuf::from(path);
    ensure_allowed_root(&app, &game, &root)?;

    let cancel = CancelToken::new();
    let Some(handle_id) = state.begin(game.clone(), cancel.clone()) else {
        return Err(CommandError::new(
            "already_running",
            "a download is already running for this game",
        ));
    };

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_download(handle.clone(), profile, root, cancel).await;
        handle.state::<AppState>().finish(&game, handle_id);
        if let Err(_error) = result {
            #[cfg(debug_assertions)]
            eprintln!(
                "download {game} stopped: {} {}",
                _error.code,
                _error.detail.unwrap_or_default()
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_download(state: State<'_, AppState>, game: String) -> Result<(), CommandError> {
    state.cancel(&game);
    Ok(())
}

/// Drop the resumable plan/task but keep downloaded and partial files. The
/// next start re-verifies those files instead of downloading them again.
#[tauri::command]
pub fn discard_download(app: AppHandle, game: String, path: String) -> Result<(), CommandError> {
    let root = PathBuf::from(path);
    ensure_allowed_root(&app, &game, &root)?;
    discard_state(&root)?;
    Ok(())
}

fn discard_state(root: &Path) -> Result<(), CommandError> {
    yayl_core::path::reject_symlink_components(root, &core_state::state_dir(root))?;
    for path in [
        core_state::plan_path(root),
        core_state::task_path(root),
        core_state::remote_manifest_path(root),
    ] {
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

async fn run_download(
    app: AppHandle,
    profile: GameProfile,
    root: PathBuf,
    cancel: CancelToken,
) -> Result<(), CommandError> {
    let game = profile.id.to_owned();
    emit(&app, DownloadEvent::preparing(&game, 0, 0));

    let client = yayl_core::downloader::http_client()?;
    let plan = match resume_plan(&root, &game) {
        Ok(Some(plan)) => plan,
        Ok(None) => match DownloadPlan::prepare_with(
            profile,
            root.clone(),
            DEFAULT_LAUNCHER_VERSION,
            client.clone(),
            DownloadOrder::default(),
        )
        .await
        {
            Ok(plan) => plan,
            Err(error) => return Err(fail_core(&app, &game, error)),
        },
        Err(error) => return Err(fail_command(&app, &game, error)),
    };

    let files_total = plan.document.jobs.len();
    let bytes_total: u64 = plan.document.jobs.iter().map(|job| job.size).sum();
    emit(
        &app,
        DownloadEvent::preparing(&game, bytes_total, files_total),
    );

    let downloader = Downloader::with_client(client)
        .concurrency(DEFAULT_CONCURRENCY)
        .order(DownloadOrder::default());
    let last = Arc::new(Mutex::new(None::<Progress>));

    let result = {
        let last = last.clone();
        let app = app.clone();
        let game = game.clone();
        plan.run(&downloader, cancel.clone(), move |progress| {
            *lock(&last) = Some(progress);
            emit(&app, DownloadEvent::from_progress(&game, progress));
        })
        .await
    };

    let last_progress = *lock(&last);
    match result {
        Ok(report) if report.is_complete() => {
            emit(
                &app,
                DownloadEvent::terminal(&game, "done", last_progress, None, None),
            );
            Ok(())
        }
        Ok(report) => {
            let failure = report.failures.first();
            let code = failure
                .map(|failure| failure.code.as_str())
                .unwrap_or(ErrorCode::Unknown.as_str());
            let detail = failure
                .map(|failure| failure.message.clone())
                .unwrap_or_else(|| "download finished with failures".to_owned());
            emit(
                &app,
                DownloadEvent::terminal(
                    &game,
                    "failed",
                    last_progress,
                    Some(code),
                    Some(detail.clone()),
                ),
            );
            Err(CommandError::new(code, detail))
        }
        Err(error) if error.code == ErrorCode::Cancelled => {
            emit(
                &app,
                DownloadEvent::terminal(&game, "paused", last_progress, None, None),
            );
            Ok(())
        }
        Err(error) => {
            emit(
                &app,
                DownloadEvent::terminal(
                    &game,
                    "failed",
                    last_progress,
                    Some(error.code.as_str()),
                    Some(error.message.clone()),
                ),
            );
            Err(error.into())
        }
    }
}

fn fail_core(app: &AppHandle, game: &str, error: yayl_core::Error) -> CommandError {
    emit(
        app,
        DownloadEvent::terminal(
            game,
            "failed",
            None,
            Some(error.code.as_str()),
            Some(error.message.clone()),
        ),
    );
    error.into()
}

fn fail_command(app: &AppHandle, game: &str, error: CommandError) -> CommandError {
    emit(
        app,
        DownloadEvent::terminal(
            game,
            "failed",
            None,
            Some(error.code.as_str()),
            error.detail.clone(),
        ),
    );
    error
}

fn emit(app: &AppHandle, event: DownloadEvent) {
    let _ = app.emit(PROGRESS_EVENT, event);
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use yayl_core::Checksum;
    use yayl_core::download_plan::{
        PLAN_SCHEMA_VERSION, PlanDocument, PlanFile, PlanGame, PlanJob, PlanManifest,
    };

    fn sample_plan(root: &Path, game: &str) -> DownloadPlan {
        let checksum = Checksum::Crc64(1);
        let document = PlanDocument {
            schema_version: PLAN_SCHEMA_VERSION,
            game: PlanGame {
                id: game.to_owned(),
                tag: "Demo_EN".to_owned(),
                provider: "generic".to_owned(),
                launcher_version: DEFAULT_LAUNCHER_VERSION.to_owned(),
                version: "1.0.0".to_owned(),
                basis: "basis".to_owned(),
                launch: Default::default(),
            },
            cdns: vec!["https://example.invalid".to_owned()],
            manifest: PlanManifest {
                url: "https://example.invalid/manifest.json".to_owned(),
                source: "/demo".to_owned(),
                files: vec![PlanFile {
                    path: "a.bin".to_owned(),
                    original_path: "/a.bin".to_owned(),
                    size: 4,
                    checksum: checksum.clone(),
                }],
            },
            jobs: vec![PlanJob {
                path: "a.bin".to_owned(),
                size: 4,
                checksum,
                urls: vec!["https://example.invalid/demo/a.bin".to_owned()],
            }],
            order: DownloadOrder::SmallestFirst,
            created_at: 0,
        };
        DownloadPlan::from_document(document, root, "").unwrap()
    }

    fn save_task(plan: &DownloadPlan, state: TaskState) {
        let game = &plan.document.game;
        let mut task = DownloadTask::new(
            game.id.clone(),
            game.version.clone(),
            game.basis.clone(),
            1,
            4,
        );
        task.state = state;
        task.files_done = usize::from(state == TaskState::Completed);
        task.bytes_done = if state == TaskState::Completed { 4 } else { 2 };
        task.save(&plan.task_path()).unwrap();
    }

    #[test]
    fn missing_plan_has_no_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_snapshot(dir.path(), |_| false).unwrap().is_none());
    }

    #[test]
    fn resume_reuses_an_unfinished_plan() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path(), "demo");
        plan.save_plan().unwrap();
        save_task(&plan, TaskState::Paused);

        let resumed = resume_plan(dir.path(), "demo").unwrap();
        assert!(resumed.is_some());

        save_task(&plan, TaskState::Completed);
        assert!(resume_plan(dir.path(), "demo").unwrap().is_none());
    }

    #[test]
    fn resume_ignores_another_game() {
        let dir = tempfile::tempdir().unwrap();
        sample_plan(dir.path(), "demo").save_plan().unwrap();
        assert!(resume_plan(dir.path(), "stella").unwrap().is_none());
    }

    #[test]
    fn snapshot_turns_a_dead_running_task_into_paused() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path(), "demo");
        plan.save_plan().unwrap();
        save_task(&plan, TaskState::Running);

        let snapshot = load_snapshot(dir.path(), |_| false).unwrap().unwrap();
        assert_eq!(snapshot.state, "paused");
        assert!(!snapshot.active);
        assert!(snapshot.resumable);
        assert!(!snapshot.installed);
        assert_eq!(snapshot.files_total, 1);
        assert_eq!(snapshot.bytes_total, 4);
    }

    #[test]
    fn snapshot_keeps_a_live_running_task() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path(), "demo");
        plan.save_plan().unwrap();
        save_task(&plan, TaskState::Running);

        let snapshot = load_snapshot(dir.path(), |_| true).unwrap().unwrap();
        assert_eq!(snapshot.state, "running");
        assert!(snapshot.active);
    }

    #[test]
    fn snapshot_marks_completed_installs() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path(), "demo");
        plan.save_plan().unwrap();
        save_task(&plan, TaskState::Completed);

        let snapshot = load_snapshot(dir.path(), |_| false).unwrap().unwrap();
        assert_eq!(snapshot.state, "completed");
        assert!(snapshot.installed);
        assert!(!snapshot.resumable);
    }

    #[test]
    fn snapshot_does_not_call_a_partial_install_complete() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path(), "arknights");
        plan.save_plan().unwrap();
        save_task(&plan, TaskState::Paused);
        std::fs::write(dir.path().join("Arknights.exe"), b"early file").unwrap();

        let snapshot = load_snapshot(dir.path(), |_| false).unwrap().unwrap();
        assert_eq!(snapshot.state, "paused");
        assert!(!snapshot.installed);
        assert!(snapshot.resumable);
    }

    #[test]
    fn snapshot_recognizes_an_existing_install_without_a_task() {
        let dir = tempfile::tempdir().unwrap();
        sample_plan(dir.path(), "arknights").save_plan().unwrap();
        std::fs::write(dir.path().join("Arknights.exe"), b"official install").unwrap();

        let snapshot = load_snapshot(dir.path(), |_| false).unwrap().unwrap();
        assert_eq!(snapshot.state, "pending");
        assert!(snapshot.installed);
        assert!(!snapshot.resumable);
    }

    #[test]
    fn discard_removes_resume_state_but_keeps_partial_files() {
        let dir = tempfile::tempdir().unwrap();
        let plan = sample_plan(dir.path(), "demo");
        plan.save_plan().unwrap();
        save_task(&plan, TaskState::Paused);

        let part = yayl_core::downloader::part_path(&dir.path().join("a.bin"));
        std::fs::write(&part, b"partial").unwrap();

        discard_state(dir.path()).unwrap();

        assert!(!core_state::plan_path(dir.path()).exists());
        assert!(!plan.task_path().exists());
        assert!(part.is_file());
        assert!(load_snapshot(dir.path(), |_| false).unwrap().is_none());
    }
}
