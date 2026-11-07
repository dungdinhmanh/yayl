//! Game process launch.
//!
//! The launcher only starts an executable that belongs to the game profile and
//! lives inside the install root. It never runs downloaded files that are not
//! part of the installed game.
//!
//! The 1.6 launcher reads the executable base name and arguments from
//! `game-launcher-config.json` and appends `.exe` at launch time. YAYL follows
//! the same metadata so an executable rename in `game/config` does not require
//! a code change, and falls back to the profile when the file is missing.

use crate::error::{Error, ErrorCode, Result};
use crate::local_manifest::{GameConfigFile, LocalManifest, game_config_path, manifest_path};
use crate::path::{
    join_inside, normalize_manifest_path, reject_symlink_components, validate_install_root,
};
use crate::profile::GameProfile;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};

/// A resolved game executable and its launch arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchCommand {
    pub executable: PathBuf,
    pub args: Vec<String>,
}

/// Resolve the game executable and arguments inside `root`.
///
/// The local `game-launcher-config.json` is the source of truth when present,
/// because the official launcher writes the executable name there after a
/// verified download. A missing or invalid config falls back to the profile.
pub fn resolve(root: &Path, profile: &GameProfile) -> Result<LaunchCommand> {
    validate_install_root(root)?;

    let config = GameConfigFile::load(&game_config_path(root)).ok();
    let (relative, args) = match config {
        Some(config) if !config.name.trim().is_empty() => {
            (executable_name(&config.name), config.params)
        }
        _ => (profile.executable.to_owned(), Vec::new()),
    };

    let relative = PathBuf::from(relative);
    let path = join_inside(root, &relative)?;
    reject_symlink_components(root, &path)?;
    if !path.is_file() {
        return Err(Error::new(
            ErrorCode::Io,
            format!("game executable is missing: {}", path.display()),
        ));
    }
    Ok(LaunchCommand {
        executable: path,
        args,
    })
}

/// The official launcher stores `StellaSora` and appends `.exe`; keep accepting
/// a value that already has the extension.
fn executable_name(name: &str) -> String {
    let name = name.trim();
    if name.to_ascii_lowercase().ends_with(".exe") {
        name.to_owned()
    } else {
        format!("{name}.exe")
    }
}

/// Resolve the executable inside `root`.
pub fn executable(root: &Path, profile: &GameProfile) -> Result<PathBuf> {
    resolve(root, profile).map(|command| command.executable)
}

/// Spawn the game with the install root as its working directory.
pub fn launch(root: &Path, profile: &GameProfile) -> Result<Child> {
    let command = resolve(root, profile)?;
    Command::new(&command.executable)
        .args(&command.args)
        .current_dir(root)
        .spawn()
        .map_err(|error| Error::new(ErrorCode::Io, format!("cannot launch game: {error}")))
}

/// Compare installed file sizes with the local `manifest.json`, matching the
/// official launcher's pre-launch `checkStat` step. Returns the manifest paths
/// that are missing or the wrong size.
///
/// A missing manifest returns an empty list so an imported or manually
/// assembled install can still launch; a corrupt manifest is an error because
/// the file set cannot be trusted.
pub fn damaged_files(root: &Path) -> Result<Vec<String>> {
    validate_install_root(root)?;
    let path = manifest_path(root);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let manifest = LocalManifest::load(&path)?;
    let mut damaged = Vec::new();
    for file in &manifest.files {
        let Ok(relative) = normalize_manifest_path(&file.path) else {
            damaged.push(file.path.clone());
            continue;
        };
        let Ok(target) = join_inside(root, &relative) else {
            damaged.push(file.path.clone());
            continue;
        };
        let actual = std::fs::symlink_metadata(&target)
            .ok()
            .filter(|metadata| metadata.file_type().is_file())
            .map(|metadata| metadata.len());
        let expected = file.size.parse::<u64>().ok();
        if actual != expected {
            damaged.push(file.path.clone());
        }
    }
    Ok(damaged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_manifest::{GameConfigFile, LocalManifest};
    use crate::manifest::Manifest;
    use crate::profile::ARKNIGHTS_EN;

    #[test]
    fn resolves_the_profile_executable_inside_the_root() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(ARKNIGHTS_EN.executable), b"stub").unwrap();
        let path = executable(dir.path(), &ARKNIGHTS_EN).unwrap();
        assert_eq!(path, dir.path().join(ARKNIGHTS_EN.executable));
    }

    #[test]
    fn prefers_the_name_from_the_local_config() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Renamed.exe"), b"stub").unwrap();
        let config = GameConfigFile::new(
            "Arknights_EN",
            "Renamed",
            vec!["-test".to_owned()],
            "042.0.0",
            "",
        );
        config.save(&game_config_path(dir.path())).unwrap();
        let command = resolve(dir.path(), &ARKNIGHTS_EN).unwrap();
        assert_eq!(command.executable, dir.path().join("Renamed.exe"));
        assert_eq!(command.args, vec!["-test".to_owned()]);
    }

    #[test]
    fn accepts_a_config_name_that_already_has_the_extension() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Renamed.exe"), b"stub").unwrap();
        let config = GameConfigFile::new("Arknights_EN", "Renamed.exe", Vec::new(), "042.0.0", "");
        config.save(&game_config_path(dir.path())).unwrap();
        let command = resolve(dir.path(), &ARKNIGHTS_EN).unwrap();
        assert_eq!(command.executable, dir.path().join("Renamed.exe"));
    }

    #[test]
    fn rejects_a_missing_executable() {
        let dir = tempfile::tempdir().unwrap();
        let error = executable(dir.path(), &ARKNIGHTS_EN).unwrap_err();
        assert_eq!(error.code, ErrorCode::Io);
    }

    #[test]
    fn rejects_a_relative_root() {
        let error = executable(Path::new("games"), &ARKNIGHTS_EN).unwrap_err();
        assert_eq!(error.code, ErrorCode::PathInvalid);
    }

    fn write_manifest(root: &Path, entries: &[(&str, u64)]) {
        let raw = format!(
            r#"{{"source":"/test","file":[{}]}}"#,
            entries
                .iter()
                .map(|(path, size)| format!(r#"{{"path":"{path}","hash":"0","size":"{size}"}}"#))
                .collect::<Vec<_>>()
                .join(",")
        );
        let manifest = Manifest::parse(&raw).unwrap();
        let local = LocalManifest::from_manifest("Arknights_EN", "042.0.0", "basis", &manifest);
        local.save(&manifest_path(root)).unwrap();
    }

    #[test]
    fn damaged_files_reports_missing_and_wrong_sizes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ok.txt"), b"1234").unwrap();
        std::fs::write(dir.path().join("wrong.txt"), b"12").unwrap();
        write_manifest(
            dir.path(),
            &[("/ok.txt", 4), ("/wrong.txt", 4), ("/gone.txt", 1)],
        );
        let damaged = damaged_files(dir.path()).unwrap();
        assert_eq!(
            damaged,
            vec!["/wrong.txt".to_owned(), "/gone.txt".to_owned()]
        );
    }

    #[test]
    fn damaged_files_is_empty_without_a_local_manifest() {
        let dir = tempfile::tempdir().unwrap();
        assert!(damaged_files(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn damaged_files_rejects_a_corrupt_manifest() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(manifest_path(dir.path()), b"{not json").unwrap();
        assert!(damaged_files(dir.path()).is_err());
    }
}
