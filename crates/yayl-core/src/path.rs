//! Path validation for untrusted manifest entries and install roots.

use crate::error::{Error, Result};
use std::path::{Component, Path, PathBuf};

/// Normalize a manifest path; reject anything that escapes the root.
pub fn normalize_manifest_path(raw: &str) -> Result<PathBuf> {
    if raw.is_empty() {
        return Err(Error::path("manifest path is empty"));
    }
    if raw.contains('\0') {
        return Err(Error::path("manifest path contains a NUL byte"));
    }
    if raw.contains('\\') {
        return Err(Error::path(format!(
            "manifest path uses a backslash: {raw}"
        )));
    }

    let trimmed = raw.trim_start_matches('/');
    if trimmed.is_empty() {
        return Err(Error::path("manifest path has no file name"));
    }

    let mut out = PathBuf::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err(Error::path(format!(
                "manifest path escapes the root: {raw}"
            )));
        }
        if part.contains(':') {
            return Err(Error::path(format!(
                "manifest path contains a drive or stream separator: {raw}"
            )));
        }
        if is_reserved_windows_name(part) {
            return Err(Error::path(format!(
                "manifest path uses a reserved device name: {raw}"
            )));
        }
        out.push(part);
    }

    if out.as_os_str().is_empty() {
        return Err(Error::path("manifest path has no file name"));
    }

    Ok(out)
}

/// Stable forward-slash key for plans and diffs.
pub fn path_key(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Join a relative path to `root` and prove it stays inside.
pub fn join_inside(root: &Path, relative: &Path) -> Result<PathBuf> {
    if relative.is_absolute() {
        return Err(Error::path("expected a relative manifest path"));
    }
    for component in relative.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(Error::path("manifest path contains a non-normal component")),
        }
    }
    Ok(root.join(relative))
}

/// Reject symlinks/junctions below `root`; missing components are allowed.
pub fn reject_symlink_components(root: &Path, path: &Path) -> Result<()> {
    let relative = path.strip_prefix(root).map_err(|_| {
        Error::path(format!(
            "path is outside the install root: {}",
            path.display()
        ))
    })?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            return Err(Error::path(format!(
                "path contains a non-normal component: {}",
                path.display()
            )));
        };
        current.push(part);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(Error::path(format!(
                    "refusing to write through a symlink or junction: {}",
                    current.display()
                )));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

/// Validate an install root before planning or writing.
pub fn validate_install_root(root: &Path) -> Result<()> {
    if root.as_os_str().is_empty() {
        return Err(Error::path("install root is empty"));
    }
    if !root.is_absolute() {
        return Err(Error::path(format!(
            "install root must be absolute: {}",
            root.display()
        )));
    }
    if root.exists() && !root.is_dir() {
        return Err(Error::path(format!(
            "install root is not a directory: {}",
            root.display()
        )));
    }
    Ok(())
}

/// Nearest existing ancestor, used to query disk space.
pub fn nearest_existing(path: &Path) -> Result<PathBuf> {
    let mut current = path.to_path_buf();
    loop {
        if current.exists() {
            return Ok(current);
        }
        if !current.pop() {
            return Err(Error::path(format!(
                "no existing ancestor for {}",
                path.display()
            )));
        }
    }
}

fn is_reserved_windows_name(part: &str) -> bool {
    if !cfg!(windows) {
        return false;
    }
    let stem = part.split('.').next().unwrap_or(part).trim_end();
    let upper = stem.to_ascii_uppercase();
    matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_manifest_paths() {
        let path = normalize_manifest_path("/StellaSora_Data/app.info").unwrap();
        assert_eq!(path, PathBuf::from("StellaSora_Data").join("app.info"));
    }

    #[test]
    fn trims_duplicate_slashes_and_dot_segments() {
        let path = normalize_manifest_path("//a//./b/c").unwrap();
        assert_eq!(path, PathBuf::from("a").join("b").join("c"));
    }

    #[test]
    fn rejects_traversal() {
        assert!(normalize_manifest_path("/a/../../evil").is_err());
        assert!(normalize_manifest_path("../evil").is_err());
    }

    #[test]
    fn rejects_absolute_and_windows_paths() {
        let absolute = Path::new("C:").join("Windows").join("system32");
        assert!(normalize_manifest_path(&absolute.to_string_lossy()).is_err());
        assert!(normalize_manifest_path(r"a\b").is_err());
        assert!(normalize_manifest_path("/a/stream:name").is_err());
    }

    #[test]
    fn join_stays_inside_root() {
        let dir = tempfile::tempdir().unwrap();
        let path = join_inside(dir.path(), Path::new("a/b")).unwrap();
        assert!(path.starts_with(dir.path()));
    }

    #[test]
    fn path_keys_are_forward_slashed() {
        assert_eq!(
            path_key(Path::new("StellaSora_Data").join("app.info").as_path()),
            "StellaSora_Data/app.info"
        );
    }

    #[test]
    fn accepts_missing_components_under_the_root() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("new").join("nested").join("file.bin");
        reject_symlink_components(dir.path(), &target).unwrap();
    }

    #[test]
    fn rejects_paths_outside_the_root() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("other");
        assert!(reject_symlink_components(&dir.path().join("root"), &outside).is_err());
    }

    #[test]
    fn rejects_a_symlinked_component() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("root");
        std::fs::create_dir_all(&root).unwrap();
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let link = root.join("link");

        #[cfg(windows)]
        {
            let status = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&link)
                .arg(&outside)
                .status()
                .unwrap();
            assert!(status.success(), "could not create a test junction");
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, &link).unwrap();
        }

        let error = reject_symlink_components(&root, &link.join("file.bin")).unwrap_err();
        assert_eq!(error.code, crate::error::ErrorCode::PathInvalid);
    }
}
