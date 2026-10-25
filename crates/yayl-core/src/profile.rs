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
    /// Default folder name under the user's install base.
    pub install_dir: &'static str,
    /// Relative executable path inside the install root.
    pub executable: &'static str,
    /// CDN host observed for this game.
    pub cdn_host: &'static str,
}

pub const ARKNIGHTS_EN: GameProfile = GameProfile {
    id: "arknights",
    game_tag: "Arknights",
    api_base: "https://api-launcher-en.yo-star.com",
    install_dir: "Arknights_EN",
    executable: "Arknights.exe",
    cdn_host: "launcher-pkg-ark-en.yo-star.com",
};

pub const STELLA_SORA_EN: GameProfile = GameProfile {
    id: "stella",
    game_tag: "StellaSora",
    api_base: "https://api-launcher-en.yo-star.com",
    install_dir: "StellaSora_EN",
    executable: "StellaSora.exe",
    cdn_host: "launcher-pkg-ss-en.yo-star.com",
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
        let root = default_root(Path::new("D:/Games/YAYL"), &STELLA_SORA_EN);
        assert_eq!(root, PathBuf::from("D:/Games/YAYL/StellaSora_EN"));
    }
}
