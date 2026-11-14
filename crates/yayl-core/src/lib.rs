//! YAYL core: official manifest handling, resumable downloads, install planning.
//!
//! The crate intentionally has no Tauri dependency so the protocol layer can be
//! exercised by `yayl-cli` and unit tests without a window.

pub mod api;
pub mod background;
pub mod checksum;
pub mod crc64;
pub mod disk;
pub mod download_plan;
pub mod downloader;
pub mod error;
pub mod install;
pub mod local_manifest;
pub mod manifest;
pub mod path;
pub mod playtime;
pub mod process;
pub mod profile;
pub mod proxy;
pub mod settings;
pub mod state;
pub mod sys;
pub mod task;
pub mod url;
pub mod verify;

pub use api::{
    BaseConfig, CdnConfig, GameConfig, LauncherApi, NewsFeed, NewsItemView, NewsSectionView,
    OperationsResource, SocialLink, SocialResource, auth_header, compare_versions,
};
pub use background::{BackgroundImage, MAX_VERSIONS as MAX_BACKGROUND_VERSIONS};
pub use checksum::Checksum;
pub use download_plan::{
    DEFAULT_LAUNCHER_VERSION, DownloadPlan, LaunchSpec, PlanDocument, PlanFile, PlanGame, PlanJob,
    PlanManifest, RemoteGame,
};
pub use downloader::{DownloadOrder, Downloader, FileJob};
pub use error::{Error, ErrorCode, Result};
pub use install::{InstallPlan, plan_install, plan_install_with_client};
pub use local_manifest::{GameConfigFile, LocalManifest, LocalManifestFile};
pub use manifest::{Manifest, ManifestEntry, ManifestSummary};
pub use playtime::{PlaytimeEntry, PlaytimeStore};
pub use process::{executable, launch};
pub use proxy::{ProxyMode, ProxySettings};
pub use task::{DownloadTask, TaskState};
pub use verify::{ManifestDiff, VerifyIssue, VerifyIssueKind, VerifyReport};
