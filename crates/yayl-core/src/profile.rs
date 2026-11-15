//! Game profiles. Shared code reads these; it never branches on a game id.

use std::path::{Path, PathBuf};

// Protocol version, auth salt and hosts, generated from the lock file.
include!(concat!(env!("OUT_DIR"), "/launcher_facts.rs"));

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

pub const ARKNIGHTS_EN: GameProfile = GameProfile {
    id: "arknights",
    game_tag: "Arknights_EN",
    api_base: ARKNIGHTS_API_BASE,
    auth_salt: ARKNIGHTS_AUTH_SALT,
    protocol_version: ARKNIGHTS_PROTOCOL_VERSION,
    install_dir: "Arknights_EN",
    executable: "Arknights.exe",
};

pub const STELLA_SORA_EN: GameProfile = GameProfile {
    id: "stella",
    game_tag: "StellaSora_EN",
    api_base: STELLA_API_BASE,
    auth_salt: STELLA_AUTH_SALT,
    protocol_version: STELLA_PROTOCOL_VERSION,
    install_dir: "StellaSora_EN",
    executable: "StellaSora.exe",
};

pub const ARKNIGHTS_JP: GameProfile = GameProfile {
    id: "arknights-jp",
    game_tag: "Arknights_JP",
    api_base: API_HOST_JP,
    auth_salt: ARKNIGHTS_AUTH_SALT,
    protocol_version: ARKNIGHTS_PROTOCOL_VERSION,
    install_dir: "Arknights_JP",
    executable: "Arknights.exe",
};

pub const ARKNIGHTS_KR: GameProfile = GameProfile {
    id: "arknights-kr",
    game_tag: "Arknights_KR",
    api_base: API_HOST_KR,
    auth_salt: ARKNIGHTS_AUTH_SALT,
    protocol_version: ARKNIGHTS_PROTOCOL_VERSION,
    install_dir: "Arknights_KR",
    executable: "Arknights.exe",
};

pub const STELLA_SORA_JP: GameProfile = GameProfile {
    id: "stella-jp",
    game_tag: "StellaSora_JP",
    api_base: API_HOST_JP,
    auth_salt: STELLA_AUTH_SALT,
    protocol_version: STELLA_PROTOCOL_VERSION,
    install_dir: "StellaSora_JP",
    executable: "StellaSora.exe",
};

pub const STELLA_SORA_KR: GameProfile = GameProfile {
    id: "stella-kr",
    game_tag: "StellaSora_KR",
    api_base: API_HOST_KR,
    auth_salt: STELLA_AUTH_SALT,
    protocol_version: STELLA_PROTOCOL_VERSION,
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
    fn stella_protocol_version_is_above_the_notice_gate() {
        // The operations endpoint nulls `notice_list` below 1.5.0. Stella never
        // fills `news_list`, so this gate is the only one it has.
        assert!(crate::api::compare_versions(STELLA_SORA_EN.protocol_version, "1.5.0").is_ge());
    }

    #[test]
    fn regions_share_the_protocol_facts() {
        // One salt is accepted by the EN, JP and KR hosts, and the lock only
        // tracks EN, so a region must never gain its own version.
        for profile in [&ARKNIGHTS_JP, &ARKNIGHTS_KR] {
            assert_eq!(profile.auth_salt, ARKNIGHTS_EN.auth_salt);
            assert_eq!(profile.protocol_version, ARKNIGHTS_EN.protocol_version);
        }
        for profile in [&STELLA_SORA_JP, &STELLA_SORA_KR] {
            assert_eq!(profile.auth_salt, STELLA_SORA_EN.auth_salt);
            assert_eq!(profile.protocol_version, STELLA_SORA_EN.protocol_version);
        }
    }
}
