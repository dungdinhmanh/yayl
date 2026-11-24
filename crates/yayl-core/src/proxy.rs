//! Proxy settings and HTTP client construction.
//! System mode uses reqwest's `system-proxy` feature; Direct and Manual are explicit.

use crate::error::{Error, ErrorCode, Result};
use reqwest::{Client, NoProxy, Proxy};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProxyMode {
    /// Do not use a proxy. This matches the official launcher default.
    #[default]
    Direct,
    /// Use the operating-system proxy settings.
    System,
    /// Use `url` and `no_proxy` from the settings file.
    Manual,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProxySettings {
    #[serde(default)]
    pub mode: ProxyMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no_proxy: Option<String>,
}

impl ProxySettings {
    pub fn system() -> Self {
        Self {
            mode: ProxyMode::System,
            url: None,
            no_proxy: None,
        }
    }

    pub fn direct() -> Self {
        Self::default()
    }

    pub fn manual(url: impl Into<String>) -> Self {
        Self {
            mode: ProxyMode::Manual,
            url: Some(url.into()),
            no_proxy: None,
        }
    }

    pub fn with_no_proxy(mut self, no_proxy: impl Into<String>) -> Self {
        self.no_proxy = Some(no_proxy.into());
        self
    }

    /// Manual mode requires a URL; direct and system modes ignore it.
    pub fn validate(&self) -> Result<()> {
        if self.mode != ProxyMode::Manual {
            return Ok(());
        }
        let raw = self
            .url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| Error::new(ErrorCode::InvalidInput, "proxy URL is empty"))?;
        let normalized = normalize_proxy_url(raw)
            .ok_or_else(|| Error::new(ErrorCode::InvalidInput, "proxy URL is invalid"))?;
        let parsed = reqwest::Url::parse(&normalized).map_err(|error| {
            Error::new(
                ErrorCode::InvalidInput,
                format!("invalid proxy URL: {error}"),
            )
        })?;
        if parsed.host_str().is_none() {
            return Err(Error::new(ErrorCode::InvalidInput, "proxy URL has no host"));
        }
        if !matches!(
            parsed.scheme(),
            "http" | "https" | "socks4" | "socks4a" | "socks5" | "socks5h"
        ) {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                format!("unsupported proxy scheme: {}", parsed.scheme()),
            ));
        }
        Ok(())
    }
}

/// Build the shared reqwest client used by the API and downloader.
/// Direct mode disables even environment proxies; System mode leaves reqwest's
/// built-in detection enabled; Manual mode applies the saved URL and bypass list.
pub fn build_client(settings: &ProxySettings) -> Result<Client> {
    let builder = Client::builder()
        .user_agent(concat!("YAYL/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        // Idle timeout per read; large downloads must not be cut off.
        .read_timeout(Duration::from_secs(30));

    let builder = match settings.mode {
        ProxyMode::Direct => builder.no_proxy(),
        ProxyMode::System => builder,
        ProxyMode::Manual => {
            settings.validate()?;
            let url = normalize_proxy_url(settings.url.as_deref().unwrap_or_default().trim())
                .ok_or_else(|| Error::new(ErrorCode::InvalidInput, "proxy URL is invalid"))?;
            let mut proxy = Proxy::all(url.as_str()).map_err(|error| {
                Error::new(
                    ErrorCode::InvalidInput,
                    format!("invalid proxy URL: {error}"),
                )
            })?;
            if let Some(no_proxy) = settings.no_proxy.as_deref().and_then(normalize_no_proxy) {
                proxy = proxy.no_proxy(NoProxy::from_string(&no_proxy));
            }
            builder.proxy(proxy)
        }
    };

    builder.build().map_err(Into::into)
}

/// Normalize proxy spellings; `socks://` becomes SOCKS5.
pub fn normalize_proxy_url(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(rest) = value.strip_prefix("socks://") {
        return Some(format!("socks5://{rest}"));
    }
    if value.contains("://") {
        return Some(value.to_owned());
    }
    Some(format!("http://{value}"))
}

/// Normalize a comma/semicolon bypass list for reqwest.
pub fn normalize_no_proxy(value: &str) -> Option<String> {
    let entries: Vec<&str> = value
        .split([',', ';'])
        .map(str::trim)
        .filter(|entry| !entry.is_empty() && *entry != "<local>")
        .collect();
    if entries.is_empty() {
        None
    } else {
        Some(entries.join(","))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_direct_like_the_official_launcher() {
        let settings = ProxySettings::default();
        assert_eq!(settings.mode, ProxyMode::Direct);
        assert!(build_client(&settings).is_ok());
    }

    #[test]
    fn normalizes_socks_and_no_proxy_lists() {
        assert_eq!(
            normalize_proxy_url("socks://127.0.0.1:1080"),
            Some("socks5://127.0.0.1:1080".to_owned())
        );
        assert_eq!(
            normalize_no_proxy("localhost; 127.0.0.1;<local>"),
            Some("localhost,127.0.0.1".to_owned())
        );
        assert_eq!(normalize_no_proxy(" ; "), None);
    }

    #[test]
    fn validates_manual_proxy_schemes() {
        assert!(
            ProxySettings::manual("socks5://127.0.0.1:1080")
                .validate()
                .is_ok()
        );
        assert!(
            ProxySettings::manual("http://proxy.local:8080")
                .with_no_proxy("localhost,127.0.0.1")
                .validate()
                .is_ok()
        );
        assert!(
            ProxySettings::manual("ftp://proxy.local:21")
                .validate()
                .is_err()
        );
        assert!(ProxySettings::manual("").validate().is_err());
    }

    #[test]
    fn builds_clients_for_every_mode() {
        assert!(build_client(&ProxySettings::direct()).is_ok());
        assert!(build_client(&ProxySettings::system()).is_ok());
        assert!(
            build_client(
                &ProxySettings::manual("http://127.0.0.1:8080").with_no_proxy("localhost")
            )
            .is_ok()
        );
    }

    #[test]
    fn settings_round_trip_keeps_proxy_and_no_proxy() {
        let settings =
            ProxySettings::manual("socks5://127.0.0.1:1080").with_no_proxy("localhost,*.local");
        let json = serde_json::to_string(&settings).unwrap();
        let parsed: ProxySettings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, settings);
    }
}
