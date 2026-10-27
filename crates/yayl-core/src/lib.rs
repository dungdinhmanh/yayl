//! YAYL core: official manifest handling, resumable downloads, install planning.
//!
//! The crate intentionally has no Tauri dependency so the protocol layer can be
//! exercised by `yayl-cli` and unit tests without a window.

pub mod api;
pub mod crc64;
pub mod disk;
pub mod download_plan;
pub mod downloader;
pub mod error;
pub mod install;
pub mod local_manifest;
pub mod manifest;
pub mod path;
pub mod profile;
pub mod settings;

pub use api::{
    BaseConfig, CdnConfig, GameConfig, LauncherApi, NewsFeed, NewsItemView, NewsSectionView,
    OperationsResource, auth_header, compare_versions,
};
pub use download_plan::{DEFAULT_LAUNCHER_VERSION, DownloadPlan, RemoteGame};
pub use error::{Error, ErrorCode, Result};
pub use install::{InstallPlan, plan_install};
pub use local_manifest::{GameConfigFile, LocalManifest, LocalManifestFile};
pub use manifest::{Manifest, ManifestEntry, ManifestSummary};
