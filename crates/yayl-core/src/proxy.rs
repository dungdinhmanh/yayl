//! Proxy settings and HTTP client construction.
//!
//! The official launcher supports two modes: direct and system proxy. YAYL
//! keeps both and adds an explicit manual mode for HTTP/HTTPS/SOCKS proxies.
//! On Windows, system mode reads the same WinINET registry values as the
//! official launcher (`ProxyEnable`, `ProxyServer`, `ProxyOverride`). Other
//! platforms fall back to the standard proxy environment variables.

use crate::error::{Error, ErrorCode, Result};
use reqwest::{Client, NoProxy, Proxy};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedProxy {
    pub url: String,
    pub no_proxy: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedProxy {
    Direct,
    Manual {
        url: String,
        no_proxy: Option<String>,
    },
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

    /// Validate the manual proxy URL. System and direct modes do not require a
    /// URL, even if an old value is still present in the settings file.
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

    pub fn resolve(&self) -> Result<ResolvedProxy> {
        match self.mode {
            ProxyMode::Direct => Ok(ResolvedProxy::Direct),
            ProxyMode::System => Ok(detect_system_proxy()
                .map(|proxy| ResolvedProxy::Manual {
                    url: proxy.url,
                    no_proxy: proxy.no_proxy,
                })
                .unwrap_or(ResolvedProxy::Direct)),
            ProxyMode::Manual => {
                self.validate()?;
                let url = normalize_proxy_url(self.url.as_deref().unwrap_or_default().trim())
                    .ok_or_else(|| Error::new(ErrorCode::InvalidInput, "proxy URL is invalid"))?;
                Ok(ResolvedProxy::Manual {
                    url,
                    no_proxy: self.no_proxy.as_deref().and_then(normalize_no_proxy),
                })
            }
        }
    }
}

/// Build the shared reqwest client used by the API and downloader.
pub fn build_client(settings: &ProxySettings) -> Result<Client> {
    let builder = Client::builder()
        .user_agent(concat!("YAYL/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        // Per-read idle timeout, not a total request deadline: large files must
        // stay downloadable, but a stalled CDN connection must not hang resume.
        .read_timeout(Duration::from_secs(30));

    let builder = match settings.resolve()? {
        ResolvedProxy::Direct => builder.no_proxy(),
        ResolvedProxy::Manual { url, no_proxy } => {
            let mut proxy = Proxy::all(url.as_str()).map_err(|error| {
                Error::new(
                    ErrorCode::InvalidInput,
                    format!("invalid proxy URL: {error}"),
                )
            })?;
            if let Some(no_proxy) = no_proxy {
                proxy = proxy.no_proxy(NoProxy::from_string(&no_proxy));
            }
            builder.proxy(proxy)
        }
    };

    builder.build().map_err(Into::into)
}

/// Read the current operating-system proxy. Returns `None` when no proxy is
/// configured or the system proxy is disabled.
pub fn detect_system_proxy() -> Option<DetectedProxy> {
    #[cfg(windows)]
    {
        windows_system_proxy().or_else(env_proxy)
    }
    #[cfg(not(windows))]
    {
        env_proxy()
    }
}

fn env_proxy() -> Option<DetectedProxy> {
    let raw = [
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
        "ALL_PROXY",
        "all_proxy",
    ]
    .iter()
    .find_map(|name| std::env::var(name).ok())
    .filter(|value| !value.trim().is_empty())?;
    let url = normalize_proxy_url(&raw)?;
    let no_proxy = ["NO_PROXY", "no_proxy"]
        .iter()
        .find_map(|name| std::env::var(name).ok())
        .and_then(|value| normalize_no_proxy(&value));
    Some(DetectedProxy { url, no_proxy })
}

#[cfg(windows)]
fn windows_system_proxy() -> Option<DetectedProxy> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};

    const INTERNET_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(INTERNET_SETTINGS, KEY_READ)
        .ok()?;

    let enabled = key
        .get_value::<u32, _>("ProxyEnable")
        .map(|value| value != 0)
        .or_else(|_| {
            key.get_value::<String, _>("ProxyEnable")
                .map(|value| matches!(value.trim(), "1" | "0x1" | "0X1"))
        })
        .ok()?;
    if !enabled {
        return None;
    }

    let server: String = key.get_value("ProxyServer").ok()?;
    let url = parse_proxy_server(&server)?;
    let override_value: String = key.get_value("ProxyOverride").unwrap_or_default();
    let mut no_proxy = normalize_no_proxy(&override_value)
        .map(|value| value.split(',').map(str::to_owned).collect::<Vec<_>>())
        .unwrap_or_default();
    for host in ["localhost", "127.0.0.1", "::1"] {
        if !no_proxy.iter().any(|entry| entry == host) {
            no_proxy.push(host.to_owned());
        }
    }
    Some(DetectedProxy {
        url,
        no_proxy: normalize_no_proxy(&no_proxy.join(",")),
    })
}

/// Parse the WinINET `ProxyServer` value. It can be a bare `host:port`, a URL,
/// or a semicolon-separated `http=...;https=...;socks=...` list.
pub fn parse_proxy_server(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("socks://")
        || value.starts_with("socks4://")
        || value.starts_with("socks4a://")
        || value.starts_with("socks5://")
        || value.starts_with("socks5h://")
    {
        return normalize_proxy_url(value);
    }
    if value.contains('=') {
        let mut proxies = BTreeMap::new();
        for pair in value.split(';') {
            if let Some((scheme, host)) = pair.split_once('=') {
                proxies.insert(scheme.trim().to_ascii_lowercase(), host.trim());
            }
        }
        if let Some(host) = proxies.get("http").filter(|host| !host.is_empty()) {
            return Some(format!("http://{host}"));
        }
        if let Some(host) = proxies.get("socks").filter(|host| !host.is_empty()) {
            return Some(format!("socks5://{host}"));
        }
        if let Some(host) = proxies.get("https").filter(|host| !host.is_empty()) {
            return Some(format!("http://{host}"));
        }
        return None;
    }
    Some(format!("http://{value}"))
}

/// Normalize proxy URL spellings accepted by different platforms. `socks://`
/// is a common alias for SOCKS5 but reqwest requires an explicit version.
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

/// Windows uses semicolons and `<local>` in `ProxyOverride`; reqwest expects a
/// comma-separated `NoProxy` list. Keep the useful entries and drop `<local>`
/// because the caller adds localhost explicitly.
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
        assert!(matches!(settings.resolve().unwrap(), ResolvedProxy::Direct));
    }

    #[test]
    fn parses_wininet_proxy_server_forms() {
        assert_eq!(
            parse_proxy_server("127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_owned())
        );
        assert_eq!(
            parse_proxy_server("http://proxy.local:8080"),
            Some("http://proxy.local:8080".to_owned())
        );
        assert_eq!(
            parse_proxy_server("http=proxy.local:8080;https=secure.local:8443"),
            Some("http://proxy.local:8080".to_owned())
        );
        assert_eq!(
            parse_proxy_server("socks=127.0.0.1:1080"),
            Some("socks5://127.0.0.1:1080".to_owned())
        );
        assert_eq!(parse_proxy_server(""), None);
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
