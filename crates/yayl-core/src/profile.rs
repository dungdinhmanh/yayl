//! Game profiles. Shared code reads these; it never branches on a game id.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameProfile {
    /// Stable local id used by settings and the UI.
    pub id: &'static str,
    /// Official `game_tag` used by the signed API envelope.
    pub game_tag: &'static str,
    /// API host for this region.
    pub api_base: &'static str,
    /// MD5 salt from the official launcher; public protocol data, not a secret.
    pub auth_salt: &'static str,
    /// Official launcher version whose API contract this profile targets.
    /// The signed envelope sends it, and the API gates some content on it:
    /// Stella Sora only returns `notice_list` for launchers at 1.5.0 or newer.
    pub protocol_version: &'static str,
    /// Default folder name under the user's install base.
    pub install_dir: &'static str,
    /// Relative executable path inside the install root.
    pub executable: &'static str,
}

/// Salt shipped by both extracted EN launchers.
pub const EN_AUTH_SALT: &str = "DE7108E9B2842FD460F4777702727869";

pub const ARKNIGHTS_EN: GameProfile = GameProfile {
    id: "arknights",
    // The EN API signs `game_tag` as the store id, not the short game name.
    game_tag: "Arknights_EN",
    api_base: "https://api-launcher-en.yo-star.com",
    auth_salt: EN_AUTH_SALT,
    protocol_version: "1.8.1",
    install_dir: "Arknights_EN",
    executable: "Arknights.exe",
};

pub const STELLA_SORA_EN: GameProfile = GameProfile {
    id: "stella",
    game_tag: "StellaSora_EN",
    api_base: "https://api-launcher-en.yo-star.com",
    auth_salt: EN_AUTH_SALT,
    protocol_version: "1.6.0",
    install_dir: "StellaSora_EN",
    executable: "StellaSora.exe",
};

pub const PROFILES: [&GameProfile; 2] = [&ARKNIGHTS_EN, &STELLA_SORA_EN];

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
        assert!(by_id("unknown").is_none());
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
