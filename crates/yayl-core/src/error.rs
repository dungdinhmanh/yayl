use serde::{Deserialize, Serialize};
use std::fmt;

/// Stable error codes. The UI maps these to localized copy and never shows the
/// raw message unless the user opens diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Network,
    Http,
    Manifest,
    PathInvalid,
    DiskSpace,
    Permission,
    Io,
    Cancelled,
    Checksum,
    InvalidInput,
    Unknown,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Network => "network",
            Self::Http => "http",
            Self::Manifest => "manifest",
            Self::PathInvalid => "path_invalid",
            Self::DiskSpace => "disk_space",
            Self::Permission => "permission",
            Self::Io => "io",
            Self::Cancelled => "cancelled",
            Self::Checksum => "checksum",
            Self::InvalidInput => "invalid_input",
            Self::Unknown => "unknown",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, thiserror::Error)]
#[error("{code}: {message}")]
pub struct Error {
    pub code: ErrorCode,
    pub message: String,
}

impl Error {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn cancelled() -> Self {
        Self::new(ErrorCode::Cancelled, "operation cancelled")
    }

    pub fn path(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::PathInvalid, message)
    }

    pub fn manifest(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Manifest, message)
    }

    pub fn disk(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DiskSpace, message)
    }
}

impl From<std::io::Error> for Error {
    fn from(value: std::io::Error) -> Self {
        let code = match value.kind() {
            std::io::ErrorKind::PermissionDenied => ErrorCode::Permission,
            _ => ErrorCode::Io,
        };
        Self::new(code, value.to_string())
    }
}

impl From<reqwest::Error> for Error {
    fn from(value: reqwest::Error) -> Self {
        let code = if value.is_connect() || value.is_timeout() {
            ErrorCode::Network
        } else {
            ErrorCode::Http
        };
        Self::new(code, value.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(value: serde_json::Error) -> Self {
        Self::new(ErrorCode::Manifest, value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
