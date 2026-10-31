//! Stable command errors for the webview.
//!
//! The UI maps `code` to localized copy. `detail` is diagnostics only and must
//! never be rendered on the home screen.

use serde::Serialize;
use yayl_core::{Error as CoreError, ErrorCode};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl CommandError {
    pub fn new(code: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            detail: Some(detail.into()),
        }
    }
}

impl From<CoreError> for CommandError {
    fn from(value: CoreError) -> Self {
        Self::new(value.code.as_str(), value.message)
    }
}

impl From<std::io::Error> for CommandError {
    fn from(value: std::io::Error) -> Self {
        let code = if value.kind() == std::io::ErrorKind::PermissionDenied {
            ErrorCode::Permission.as_str()
        } else {
            ErrorCode::Io.as_str()
        };
        Self::new(code, value.to_string())
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(value: serde_json::Error) -> Self {
        Self::new(ErrorCode::Io.as_str(), value.to_string())
    }
}

impl From<tauri::Error> for CommandError {
    fn from(value: tauri::Error) -> Self {
        Self::new(ErrorCode::Unknown.as_str(), value.to_string())
    }
}
