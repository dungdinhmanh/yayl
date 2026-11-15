//! Game profiles. Shared code reads these; it never branches on a game id.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameProfile {
    pub id: &'static str,
    /// Official `game_tag`; the EN API signs the store id, not the short name.
    pub game_tag: &'static str,
    pub api_base: &'static str,
    /// Public protocol constant, not a secret.
    pub auth_salt: &'static str,
    /// Official launcher version; the API gates some content on it.
    pub protocol_version: &'static str,
    pub install_dir: &'static str,
    pub executable: &'static str,
}

/// Salt shared by every regional build; public protocol data.
pub const AUTH_SALT: &str = "DE7108E9B2842FD460F4777702727869";

pub const ARKNIGHTS_EN: GameProfile = GameProfile {
    id: "arknights",
    game_tag: "Arknights_EN",
    api_base: "https://api-launcher-en.yo-star.com",
    auth_salt: AUTH_SALT,
    protocol_version: "1.8.1",
    install_dir: "Arknights_EN",
    executable: "Arknights.exe",
};

pub const STELLA_SORA_EN: GameProfile = GameProfile {
    id: "stella",
    game_tag: "StellaSora_EN",
    api_base: "https://api-launcher-en.yo-star.com",
    auth_salt: AUTH_SALT,
    protocol_version: "1.6.0",
    install_dir: "StellaSora_EN",
    executable: "StellaSora.exe",
};

pub const ARKNIGHTS_JP: GameProfile = GameProfile {
    id: "arknights-jp",
    game_tag: "Arknights_JP",
    api_base: "https://api-launcher-jp.yo-star.com",
    auth_salt: AUTH_SALT,
    protocol_version: "1.8.1",
    install_dir: "Arknights_JP",
    executable: "Arknights.exe",
};

pub const ARKNIGHTS_KR: GameProfile = GameProfile {
    id: "arknights-kr",
    game_tag: "Arknights_KR",
    api_base: "https://api-launcher-kr.yo-star.com",
    auth_salt: AUTH_SALT,
    protocol_version: "1.8.1",
    install_dir: "Arknights_KR",
    executable: "Arknights.exe",
};

pub const STELLA_SORA_JP: GameProfile = GameProfile {
    id: "stella-jp",
    game_tag: "StellaSora_JP",
    api_base: "https://api-launcher-jp.yo-star.com",
    auth_salt: AUTH_SALT,
    protocol_version: "1.6.0",
    install_dir: "StellaSora_JP",
    executable: "StellaSora.exe",
};

pub const STELLA_SORA_KR: GameProfile = GameProfile {
    id: "stella-kr",
    game_tag: "StellaSora_KR",
    api_base: "https://api-launcher-kr.yo-star.com",
    auth_salt: AUTH_SALT,
    protocol_version: "1.6.0",
    install_dir: "StellaSora_KR",
    executable: "StellaSora.exe",
};

pub const PROFILES: [&GameProfile; 6] = [
    &ARKNIGHTS_EN,
    &ARKNIGHTS_JP,
    &ARKNIGHTS_KR,
    &STELLA_SORA_EN,
    &STELLA_SORA_JP,
    &STELLA_SORA_KR,
];

pub fn by_id(id: &str) -> Option<&'static GameProfile> {
    PROFILES.iter().copied().find(|profile| profile.id == id)
}

pub fn default_root(base: &Path, profile: &GameProfile) -> PathBuf {
    base.join(profile.install_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profiles_are_unique() {
        assert!(by_id("arknights").is_some());
        assert!(by_id("stella").is_some());
        assert!(by_id("arknights-jp").is_some());
        assert!(by_id("arknights-kr").is_some());
        assert!(by_id("stella-jp").is_some());
        assert!(by_id("stella-kr").is_some());
        assert!(by_id("unknown").is_none());
        let mut ids: Vec<_> = PROFILES.iter().map(|profile| profile.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), PROFILES.len());
    }

    #[test]
    fn default_root_uses_the_profile_folder() {
        let root = default_root(Path::new("games"), &STELLA_SORA_EN);
        assert_eq!(root, Path::new("games").join(STELLA_SORA_EN.install_dir));
    }

    #[test]
    fn stella_protocol_version_keeps_the_news_list_visible() {
        // The operations endpoint hides `notice_list` below 1.5.0.
        assert!(crate::api::compare_versions(STELLA_SORA_EN.protocol_version, "1.5.0").is_ge());
    }
}
