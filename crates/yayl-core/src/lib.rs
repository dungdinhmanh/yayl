//! YAYL core: official manifest handling, resumable downloads, install planning.
//!
//! The crate intentionally has no Tauri dependency so the protocol layer can be
//! exercised by `yayl-cli` and unit tests without a window.

pub mod crc64;
pub mod disk;
pub mod downloader;
pub mod error;
pub mod install;
pub mod manifest;
pub mod path;
pub mod profile;
pub mod settings;

pub use error::{Error, ErrorCode, Result};
pub use install::{InstallPlan, plan_install};
pub use manifest::{Manifest, ManifestEntry, ManifestSummary};
