//! Signed client for the official Yostar launcher API.
//! Auth headers and signatures are never logged.

use crate::error::{Error, ErrorCode, Result};
use crate::manifest::Manifest;
use crate::profile::GameProfile;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthHead {
    pub game_tag: String,
    pub time: u64,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthEnvelope {
    pub head: AuthHead,
    pub sign: String,
}

/// Build the `Authorization` header value. `data` must be the exact body.
pub fn auth_header(
    game_tag: &str,
    launcher_version: &str,
    data: &str,
    salt: &str,
    unix_time: u64,
) -> Result<String> {
    let head = AuthHead {
        game_tag: game_tag.to_owned(),
        time: unix_time,
        version: launcher_version.to_owned(),
    };
    let head_json = serde_json::to_string(&head)?;
    let mut hasher = Md5::new();
    hasher.update(head_json.as_bytes());
    hasher.update(data.as_bytes());
    hasher.update(salt.as_bytes());
    let sign = crate::checksum::hex_lower(hasher.finalize());
    serde_json::to_string(&AuthEnvelope { head, sign }).map_err(Into::into)
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Deserialize)]
struct ApiEnvelope<T> {
    code: Option<i64>,
    data: Option<T>,
    msg: Option<String>,
    message: Option<String>,
}

impl<T> ApiEnvelope<T> {
    fn into_data(self, endpoint: &str) -> Result<T> {
        if let Some(code) = self.code
            && code != 200
        {
            let message = self
                .msg
                .or(self.message)
                .unwrap_or_else(|| format!("API returned code {code}"));
            return Err(Error::new(
                ErrorCode::Http,
                format!("{endpoint}: {message}"),
            ));
        }
        self.data
            .ok_or_else(|| Error::new(ErrorCode::Http, format!("{endpoint}: empty data")))
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct GameConfig {
    #[serde(default)]
    pub game_lowest_version: String,
    #[serde(default)]
    pub game_latest_version: String,
    #[serde(default)]
    pub game_latest_file_path: String,
    #[serde(default)]
    pub game_start_exe_name: String,
    #[serde(default)]
    pub game_start_params: Vec<String>,
    #[serde(default)]
    pub game_uninstall_script: String,
    #[serde(default)]
    pub decompression_size: String,
    #[serde(default)]
    pub size: u64,
}

impl GameConfig {
    pub fn needs_update(&self, local_version: &str) -> bool {
        compare_versions(local_version, &self.game_latest_version).is_lt()
    }

    pub fn is_below_minimum(&self, local_version: &str) -> bool {
        compare_versions(local_version, &self.game_lowest_version).is_lt()
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct BaseConfig {
    #[serde(default)]
    pub launcher_background_img: String,
    #[serde(default)]
    pub launcher_background_img_crc64: String,
    #[serde(default)]
    pub config_open: bool,
    #[serde(default)]
    pub user_agreement: String,
    #[serde(default)]
    pub privacy_policy: String,
    #[serde(default)]
    pub copyright_information: String,
    #[serde(default)]
    pub notice_pop_open: bool,
    #[serde(default)]
    pub notice_content: String,
    #[serde(default)]
    pub exit_launcher_open: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct CdnConfig {
    #[serde(default)]
    pub primary_cdn: String,
    #[serde(default)]
    pub back_up_cdn: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct SocialResource {
    #[serde(default)]
    pub social_media_resource_open: bool,
    #[serde(default)]
    pub social_media_resource_list: Vec<SocialChannel>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct SocialChannel {
    #[serde(default)]
    pub social_media_channel: String,
    #[serde(default)]
    pub jump_url: String,
    #[serde(default)]
    pub qr_img: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SocialLink {
    pub channel: String,
    pub url: String,
    pub qr: String,
}

impl SocialResource {
    /// Drop channels without a safe HTTPS URL.
    pub fn links(&self) -> Vec<SocialLink> {
        if !self.social_media_resource_open {
            return Vec::new();
        }
        self.social_media_resource_list
            .iter()
            .filter_map(|item| {
                let url = item.jump_url.trim();
                if url.is_empty() || crate::url::validate_remote_url(url).is_err() {
                    return None;
                }
                let channel = item.social_media_channel.trim().to_owned();
                let qr = item.qr_img.trim();
                let qr = if !qr.is_empty() && crate::url::validate_remote_url(qr).is_ok() {
                    qr.to_owned()
                } else {
                    String::new()
                };
                Some(SocialLink {
                    channel,
                    url: url.to_owned(),
                    qr,
                })
            })
            .collect()
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct BannerItem {
    #[serde(default)]
    pub banner_img: String,
    #[serde(default)]
    pub jump_url: String,
    #[serde(default)]
    pub remark: String,
    #[serde(default)]
    pub start_at: i64,
    #[serde(default)]
    pub end_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NoticeSection {
    #[serde(default)]
    pub notice_type: String,
    #[serde(default)]
    pub notice_detail_list: Vec<NoticeItem>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NoticeItem {
    #[serde(default)]
    pub notice_title: String,
    #[serde(default)]
    pub notice_time: String,
    #[serde(default)]
    pub jump_url: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NewsList {
    #[serde(default)]
    pub code: i64,
    #[serde(default)]
    pub data: Option<NewsData>,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub timestamp: i64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NewsData {
    #[serde(default)]
    pub news: Vec<NewsSection>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NewsSection {
    #[serde(default, rename = "typeLabel")]
    pub type_label: String,
    #[serde(default)]
    pub rows: Vec<NewsRow>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NewsRow {
    #[serde(default)]
    pub link: String,
    #[serde(default, rename = "publishTime")]
    pub publish_time: i64,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub title: String,
    #[serde(default, rename = "typeLabel")]
    pub type_label: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct OperationsResource {
    #[serde(default)]
    pub banner_loop: bool,
    #[serde(default)]
    pub operations_resource_open: bool,
    #[serde(default)]
    pub time_interval: u64,
    #[serde(default)]
    pub operations_banner_list: Vec<BannerItem>,
    #[serde(default)]
    pub news_list: Option<NewsList>,
    #[serde(default)]
    pub notice_list: Option<Vec<NoticeSection>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NewsFeed {
    pub banners: Vec<NewsBanner>,
    pub sections: Vec<NewsSectionView>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NewsBanner {
    pub image: String,
    pub url: String,
    pub remark: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NewsSectionView {
    pub label: String,
    pub items: Vec<NewsItemView>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NewsItemView {
    pub title: String,
    pub url: String,
    pub date: String,
    pub image: String,
}

/// Keep HTTPS URLs only; unsafe values become empty so the UI drops them.
fn safe_url(raw: &str) -> String {
    let url = raw.trim();
    if crate::url::validate_https_url(url).is_ok() {
        url.to_owned()
    } else {
        String::new()
    }
}

impl OperationsResource {
    /// Normalize the Arknights `rows[]` and Stella `notice_detail_list[]` shapes.
    pub fn feed(&self) -> NewsFeed {
        let banners = self
            .operations_banner_list
            .iter()
            .filter_map(|item| {
                let image = safe_url(&item.banner_img);
                if image.is_empty() {
                    return None;
                }
                Some(NewsBanner {
                    image,
                    url: safe_url(&item.jump_url),
                    remark: item.remark.clone(),
                })
            })
            .collect();

        let mut sections = Vec::new();
        if let Some(news) = &self.news_list
            && let Some(data) = &news.data
        {
            for section in &data.news {
                if section.rows.is_empty() {
                    continue;
                }
                sections.push(NewsSectionView {
                    label: section.type_label.clone(),
                    items: section
                        .rows
                        .iter()
                        .map(|row| NewsItemView {
                            title: row.title.clone(),
                            url: safe_url(&row.link),
                            date: format_timestamp_ms(row.publish_time),
                            image: safe_url(&row.thumbnail),
                        })
                        .collect(),
                });
            }
        }

        if sections.is_empty()
            && let Some(notices) = &self.notice_list
        {
            for section in notices {
                if section.notice_detail_list.is_empty() {
                    continue;
                }
                sections.push(NewsSectionView {
                    label: section.notice_type.clone(),
                    items: section
                        .notice_detail_list
                        .iter()
                        .map(|item| NewsItemView {
                            title: item.notice_title.clone(),
                            url: safe_url(&item.jump_url),
                            date: item.notice_time.clone(),
                            image: String::new(),
                        })
                        .collect(),
                });
            }
        }

        NewsFeed { banners, sections }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct ManifestUrlData {
    #[serde(default)]
    url: String,
}

#[derive(Debug, Clone)]
pub struct FetchedManifest {
    pub url: String,
    pub raw: String,
    pub manifest: Manifest,
}

/// A small signed client bound to one game profile.
#[derive(Clone)]
pub struct LauncherApi {
    client: reqwest::Client,
    base_url: String,
    game_tag: String,
    auth_salt: String,
    launcher_version: String,
}

impl LauncherApi {
    pub fn new(profile: &GameProfile, launcher_version: impl Into<String>) -> Result<Self> {
        Self::with_client(profile, launcher_version, crate::downloader::http_client()?)
    }

    pub fn with_client(
        profile: &GameProfile,
        launcher_version: impl Into<String>,
        client: reqwest::Client,
    ) -> Result<Self> {
        if profile.api_base.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                "game profile has no API base",
            ));
        }
        crate::url::validate_remote_url(profile.api_base.trim())?;
        Ok(Self {
            client,
            base_url: profile.api_base.trim_end_matches('/').to_owned(),
            game_tag: profile.game_tag.to_owned(),
            auth_salt: profile.auth_salt.to_owned(),
            launcher_version: launcher_version.into(),
        })
    }

    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }

    pub fn game_tag(&self) -> &str {
        &self.game_tag
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn endpoint(&self, path: &str) -> Result<reqwest::Url> {
        reqwest::Url::parse(&format!(
            "{}/{}",
            self.base_url,
            path.trim_start_matches('/')
        ))
        .map_err(|error| Error::new(ErrorCode::InvalidInput, error.to_string()))
    }

    async fn get_data<T: for<'de> Deserialize<'de>>(&self, url: reqwest::Url) -> Result<T> {
        let auth = auth_header(
            &self.game_tag,
            &self.launcher_version,
            "",
            &self.auth_salt,
            now_unix(),
        )?;
        let response = self
            .client
            .get(url.clone())
            .header(reqwest::header::AUTHORIZATION, auth)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await?;
        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            return Err(Error::new(
                ErrorCode::Http,
                format!("{} returned HTTP {status}", url.path()),
            ));
        }
        let envelope: ApiEnvelope<T> = serde_json::from_str(&body).map_err(|error| {
            Error::new(
                ErrorCode::Http,
                format!("{} returned invalid JSON: {error}", url.path()),
            )
        })?;
        envelope.into_data(url.path())
    }

    pub async fn game_config(&self) -> Result<GameConfig> {
        self.get_data(self.endpoint("/api/launcher/game/config")?)
            .await
    }

    pub async fn base_config(&self) -> Result<BaseConfig> {
        self.get_data(self.endpoint("/api/launcher/base/config")?)
            .await
    }

    pub async fn operations(&self) -> Result<OperationsResource> {
        self.get_data(self.endpoint("/api/launcher/operations/resource")?)
            .await
    }

    pub async fn social(&self) -> Result<Vec<SocialLink>> {
        let resource: SocialResource = self
            .get_data(self.endpoint("/api/launcher/social/media/resource")?)
            .await?;
        Ok(resource.links())
    }

    pub async fn news(&self) -> Result<NewsFeed> {
        Ok(self.operations().await?.feed())
    }

    pub async fn cdn(&self) -> Result<CdnConfig> {
        self.get_data(self.endpoint("/api/launcher/advanced/game/download/cdn")?)
            .await
    }

    /// Download the background image announced by `base/config`.
    pub async fn background_image(&self, config: &BaseConfig) -> Result<Vec<u8>> {
        const MAX_BACKGROUND_BYTES: usize = 32 * 1024 * 1024;
        let url = config.launcher_background_img.trim();
        if url.is_empty() {
            return Err(Error::new(
                ErrorCode::InvalidInput,
                "base config has no background image",
            ));
        }
        crate::url::validate_remote_url(url)?;
        let response = self
            .client
            .get(url)
            .header(reqwest::header::CACHE_CONTROL, "no-cache")
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(Error::new(
                ErrorCode::Http,
                format!("background image returned HTTP {status}"),
            ));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_BACKGROUND_BYTES as u64)
        {
            return Err(Error::new(ErrorCode::Http, "background image is too large"));
        }
        let bytes = response.bytes().await?;
        if bytes.is_empty() {
            return Err(Error::new(ErrorCode::Http, "background image is empty"));
        }
        if bytes.len() > MAX_BACKGROUND_BYTES {
            return Err(Error::new(ErrorCode::Http, "background image is too large"));
        }
        Ok(bytes.to_vec())
    }

    /// Ask the API for the manifest URL of a specific game version/basis.
    pub async fn manifest_url(&self, game_version: &str, basis: &str) -> Result<String> {
        let mut url = self.endpoint("/api/launcher/game/config/json")?;
        url.query_pairs_mut()
            .append_pair("version", game_version)
            .append_pair("file_path", basis);
        let data: ManifestUrlData = self.get_data(url).await?;
        if data.url.trim().is_empty() {
            return Err(Error::new(
                ErrorCode::Manifest,
                "API returned an empty manifest URL",
            ));
        }
        Ok(data.url)
    }

    /// Fetch the remote manifest from the CDN.
    pub async fn fetch_manifest(&self, game_version: &str, basis: &str) -> Result<FetchedManifest> {
        let url = self.manifest_url(game_version, basis).await?;
        crate::url::validate_remote_url(&url)?;
        let response = self
            .client
            .get(&url)
            .header(reqwest::header::CACHE_CONTROL, "no-cache")
            .send()
            .await?;
        let status = response.status();
        let raw = response.text().await?;
        if !status.is_success() {
            return Err(Error::new(
                ErrorCode::Http,
                format!("manifest returned HTTP {status}"),
            ));
        }
        let manifest = Manifest::parse(&raw)?;
        Ok(FetchedManifest { url, raw, manifest })
    }
}

/// Compare dotted numeric versions; non-numeric parts count as zero.
pub fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let mut left = left.split('.');
    let mut right = right.split('.');
    loop {
        let a = left.next();
        let b = right.next();
        if a.is_none() && b.is_none() {
            return std::cmp::Ordering::Equal;
        }
        let a = a.and_then(|value| value.parse::<u64>().ok()).unwrap_or(0);
        let b = b.and_then(|value| value.parse::<u64>().ok()).unwrap_or(0);
        match a.cmp(&b) {
            std::cmp::Ordering::Equal => {}
            other => return other,
        }
    }
}

/// Convert milliseconds since the Unix epoch to `YYYY-MM-DD` (UTC).
pub fn format_timestamp_ms(value: i64) -> String {
    if value <= 0 {
        return String::new();
    }
    let days = value.div_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    // Howard Hinnant's civil_from_days, with the epoch shifted to 0000-03-01.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = y + i64::from(m <= 2);
    (y, m as u32, d as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::EN_AUTH_SALT;

    #[test]
    fn auth_matches_the_official_algorithm() {
        // Generated from the same JSON serialization used by the A9 launcher.
        let header = auth_header("Arknights_EN", "0.1.0", "", EN_AUTH_SALT, 1_710_000_000).unwrap();
        assert_eq!(
            header,
            r#"{"head":{"game_tag":"Arknights_EN","time":1710000000,"version":"0.1.0"},"sign":"49bf8d0127ebccc9018a3c1e0d64c2c0"}"#
        );
    }

    #[test]
    fn auth_changes_with_data() {
        let a = auth_header("Arknights_EN", "0.1.0", "", EN_AUTH_SALT, 1_710_000_000).unwrap();
        let b = auth_header("Arknights_EN", "0.1.0", "{}", EN_AUTH_SALT, 1_710_000_000).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn compares_versions_numerically() {
        use std::cmp::Ordering;
        assert_eq!(compare_versions("042.0.0", "42.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("042.0.0", "042.1.0"), Ordering::Less);
        assert_eq!(compare_versions("2.0.0", "1.9.9"), Ordering::Greater);
    }

    #[test]
    fn detects_updates_and_minimum_versions() {
        let config = GameConfig {
            game_lowest_version: "2.0.0".to_owned(),
            game_latest_version: "2.2.0".to_owned(),
            ..GameConfig::default()
        };
        assert!(config.needs_update("2.1.0"));
        assert!(!config.is_below_minimum("2.1.0"));
        assert!(config.is_below_minimum("1.9.9"));
        assert!(!config.needs_update("2.2.0"));
    }

    #[test]
    fn normalizes_both_news_shapes() {
        let arknights: OperationsResource = serde_json::from_str(
            r#"{
              "operations_banner_list": [{"banner_img":"https://cdn/a.png","jump_url":"https://a","remark":"r"}],
              "news_list": {"data": {"news": [{"typeLabel":"LATEST","rows":[
                {"link":"https://n","publishTime":1710000000000,"thumbnail":"https://cdn/t.png","title":"Title"}
              ]}]}}
            }"#,
        )
        .unwrap();
        let feed = arknights.feed();
        assert_eq!(feed.banners.len(), 1);
        assert_eq!(feed.banners[0].image, "https://cdn/a.png");
        assert_eq!(feed.sections[0].label, "LATEST");
        assert_eq!(feed.sections[0].items[0].date, "2024-03-09");
        assert_eq!(feed.sections[0].items[0].image, "https://cdn/t.png");

        let stella: OperationsResource = serde_json::from_str(
            r#"{
              "notice_list": [{"notice_type":"News","notice_detail_list":[
                {"notice_title":"Title","notice_time":"2026/10/20","jump_url":"https://n"}
              ]}]
            }"#,
        )
        .unwrap();
        let feed = stella.feed();
        assert_eq!(feed.sections[0].label, "News");
        assert_eq!(feed.sections[0].items[0].date, "2026/10/20");
    }

    #[test]
    fn drops_unsafe_news_urls() {
        let resource: OperationsResource = serde_json::from_str(
            r#"{
              "operations_banner_list": [
                {"banner_img":"http://cdn/a.png","jump_url":"https://a"},
                {"banner_img":"javascript:alert(1)","jump_url":"https://a"}
              ],
              "news_list": {"data": {"news": [{"typeLabel":"LATEST","rows":[
                {"link":"javascript:alert(1)","publishTime":1710000000000,"thumbnail":"http://cdn/t.png","title":"Title"}
              ]}]}}
            }"#,
        )
        .unwrap();
        let feed = resource.feed();
        assert!(feed.banners.is_empty());
        assert_eq!(feed.sections[0].items[0].url, "");
        assert_eq!(feed.sections[0].items[0].image, "");
    }

    #[test]
    fn formats_dates() {
        assert_eq!(format_timestamp_ms(0), "");
        assert_eq!(format_timestamp_ms(1_710_000_000_000), "2024-03-09");
    }

    #[test]
    fn normalizes_social_channels_and_drops_unsafe_urls() {
        let resource: SocialResource = serde_json::from_str(
            r#"{
              "social_media_resource_open": true,
              "social_media_resource_list": [
                {"social_media_channel":"官网","jump_url":"https://stellasora.global/","qr_img":""},
                {"social_media_channel":"X","jump_url":"https://x.com/StellaSoraEN","qr_img":"https://cdn.example.com/qr.png"},
                {"social_media_channel":"Bad","jump_url":"javascript:alert(1)","qr_img":""},
                {"social_media_channel":"Insecure","jump_url":"http://example.com/","qr_img":""},
                {"social_media_channel":"Empty","jump_url":"","qr_img":""}
              ]
            }"#,
        )
        .unwrap();
        let links = resource.links();
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].channel, "官网");
        assert_eq!(links[0].url, "https://stellasora.global/");
        assert_eq!(links[1].qr, "https://cdn.example.com/qr.png");
    }

    #[test]
    fn hides_social_channels_when_the_api_toggle_is_off() {
        let resource: SocialResource = serde_json::from_str(
            r#"{
              "social_media_resource_open": false,
              "social_media_resource_list": [
                {"social_media_channel":"X","jump_url":"https://x.com/StellaSoraEN","qr_img":""}
              ]
            }"#,
        )
        .unwrap();
        assert!(resource.links().is_empty());
    }
}
