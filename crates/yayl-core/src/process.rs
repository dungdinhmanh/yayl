//! Game process launch.
//!
//! The launcher only starts an executable that belongs to the game profile and
//! lives inside the install root. It never runs downloaded files that are not
//! part of the installed game.

use crate::error::{Error, ErrorCode, Result};
use crate::path::{join_inside, reject_symlink_components, validate_install_root};
use crate::profile::GameProfile;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};

/// Resolve the game executable inside `root`.
pub fn executable(root: &Path, profile: &GameProfile) -> Result<PathBuf> {
    validate_install_root(root)?;
    let relative = Path::new(profile.executable);
    let path = join_inside(root, relative)?;
    reject_symlink_components(root, &path)?;
    if !path.is_file() {
        return Err(Error::new(
            ErrorCode::Io,
            format!("game executable is missing: {}", path.display()),
        ));
    }
    Ok(path)
}

/// Spawn the game with the install root as its working directory.
pub fn launch(root: &Path, profile: &GameProfile) -> Result<Child> {
    let path = executable(root, profile)?;
    Command::new(&path)
        .current_dir(root)
        .spawn()
        .map_err(|error| Error::new(ErrorCode::Io, format!("cannot launch game: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::ARKNIGHTS_EN;

    #[test]
    fn resolves_the_profile_executable_inside_the_root() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(ARKNIGHTS_EN.executable), b"stub").unwrap();
        let path = executable(dir.path(), &ARKNIGHTS_EN).unwrap();
        assert_eq!(path, dir.path().join(ARKNIGHTS_EN.executable));
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
}
