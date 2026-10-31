//! Remote URL validation.
//!
//! YAYL only talks to official HTTPS endpoints. Plain HTTP is accepted for
//! loopback hosts so tests can run against a local server; any other host must
//! use TLS so a network attacker cannot replace a manifest and its hashes.

use crate::error::{Error, ErrorCode, Result};
use reqwest::Url;

/// Require an `https` URL, or `http` on a loopback host for tests.
pub fn validate_remote_url(raw: &str) -> Result<()> {
    let parsed = Url::parse(raw).map_err(|error| {
        Error::new(
            ErrorCode::InvalidInput,
            format!("invalid remote URL {raw}: {error}"),
        )
    })?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(Error::new(
            ErrorCode::InvalidInput,
            format!("remote URL must not embed credentials: {raw}"),
        ));
    }
    match parsed.scheme() {
        "https" => Ok(()),
        "http" if is_loopback(&parsed) => Ok(()),
        scheme => Err(Error::new(
            ErrorCode::InvalidInput,
            format!("remote URL must use https (got {scheme}): {raw}"),
        )),
    }
}

fn is_loopback(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.parse::<std::net::IpAddr>()
        .is_ok_and(|address| address.is_loopback())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https() {
        validate_remote_url("https://cdn.example.com/game/manifest.json").unwrap();
    }

    #[test]
    fn rejects_plain_http_for_remote_hosts() {
        assert!(validate_remote_url("http://cdn.example.com/manifest.json").is_err());
        assert!(validate_remote_url("http://192.0.2.10/manifest.json").is_err());
    }

    #[test]
    fn allows_loopback_http_for_tests() {
        validate_remote_url("http://127.0.0.1:8080/manifest.json").unwrap();
        validate_remote_url("http://localhost:8080/manifest.json").unwrap();
        validate_remote_url("http://[::1]:8080/manifest.json").unwrap();
    }

    #[test]
    fn rejects_credentials() {
        assert!(validate_remote_url("https://user:secret@cdn.example.com/a").is_err());
        assert!(validate_remote_url("https://user@cdn.example.com/a").is_err());
    }

    #[test]
    fn rejects_other_schemes() {
        assert!(validate_remote_url("file:///C:/Windows/System32/drivers/etc/hosts").is_err());
        assert!(validate_remote_url("ftp://cdn.example.com/a").is_err());
        assert!(validate_remote_url("not a url").is_err());
    }
}
