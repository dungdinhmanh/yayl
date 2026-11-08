//! Bounded cache for the official launcher background art.

use crate::crc64;
use crate::error::{Error, ErrorCode, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// How many background versions to keep per game.
pub const MAX_VERSIONS: usize = 3;

/// The background announced by `base/config`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackgroundImage {
    pub url: String,
    pub crc64: String,
}

/// Parse the two background fields; `None` when either is missing or unsafe.
pub fn image_from_config(url: &str, checksum: &str) -> Option<BackgroundImage> {
    let url = url.trim();
    if url.is_empty() || crate::url::validate_remote_url(url).is_err() {
        return None;
    }
    let checksum = checksum.trim();
    if checksum.parse::<u64>().is_err() {
        return None;
    }
    Some(BackgroundImage {
        url: url.to_owned(),
        crc64: checksum.to_owned(),
    })
}

fn extension(url: &str) -> &'static str {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "jpg"
    } else if lower.ends_with(".webp") {
        "webp"
    } else if lower.ends_with(".avif") {
        "avif"
    } else {
        "png"
    }
}

pub fn cached_path(dir: &Path, image: &BackgroundImage) -> PathBuf {
    dir.join(format!("{}.{}", image.crc64, extension(&image.url)))
}

/// Verify and store `bytes`, then prune older versions. Returns the cached path.
pub fn store(dir: &Path, image: &BackgroundImage, bytes: &[u8]) -> Result<PathBuf> {
    let expected = image.crc64.parse::<u64>().map_err(|_| {
        Error::new(
            ErrorCode::InvalidInput,
            "background checksum is not a decimal CRC-64",
        )
    })?;
    if crc64::crc64(bytes) != expected {
        return Err(Error::new(
            ErrorCode::Checksum,
            "background image checksum mismatch",
        ));
    }

    fs::create_dir_all(dir)?;
    let target = cached_path(dir, image);
    let temp = target.with_extension("part");
    fs::write(&temp, bytes)?;
    fs::rename(&temp, &target)?;
    prune(dir, MAX_VERSIONS, Some(&target))?;
    Ok(target)
}

/// Keep at most `keep` files, pinning `current` first.
pub fn prune(dir: &Path, keep: usize, current: Option<&Path>) -> Result<()> {
    let keep = keep.max(1);
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("part"))
        {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        entries.push((modified, path));
    }

    entries.sort_by(|left, right| {
        let left_current = current.is_some_and(|value| same_path(value, &left.1));
        let right_current = current.is_some_and(|value| same_path(value, &right.1));
        right_current
            .cmp(&left_current)
            .then_with(|| right.0.cmp(&left.0))
    });

    for (index, (_, path)) in entries.into_iter().enumerate() {
        if index >= keep {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

/// Newest cached image, used as an offline fallback.
pub fn newest(dir: &Path) -> Option<PathBuf> {
    let mut best: Option<(SystemTime, PathBuf)> = None;
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        let is_file = entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false);
        if !is_file
            || path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("part"))
        {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if best.as_ref().is_none_or(|(time, _)| modified > *time) {
            best = Some((modified, path));
        }
    }
    best.map(|(_, path)| path)
}

fn same_path(left: &Path, right: &Path) -> bool {
    if cfg!(windows) {
        left.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&right.as_os_str().to_string_lossy())
    } else {
        left == right
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_image(checksum: &str, url: &str) -> BackgroundImage {
        BackgroundImage {
            url: url.to_owned(),
            crc64: checksum.to_owned(),
        }
    }

    #[test]
    fn accepts_a_complete_background_config() {
        let parsed = image_from_config(
            "https://launcher-pkg-ss-en.yo-star.com/prod/StellaSora_EN/launcher_background_img/a.png",
            "6294675761579384272",
        )
        .unwrap();
        assert_eq!(parsed.crc64, "6294675761579384272");
    }

    #[test]
    fn rejects_insecure_or_incomplete_background_configs() {
        assert!(image_from_config("", "1").is_none());
        assert!(image_from_config("http://cdn.example.com/a.png", "1").is_none());
        assert!(image_from_config("https://cdn.example.com/a.png", "").is_none());
        assert!(image_from_config("https://cdn.example.com/a.png", "nope").is_none());
    }

    #[test]
    fn derives_the_extension_from_the_url() {
        assert_eq!(extension("https://cdn/a.PNG?x=1"), "png");
        assert_eq!(extension("https://cdn/a.jpeg"), "jpg");
        assert_eq!(extension("https://cdn/a.webp#frag"), "webp");
        assert_eq!(extension("https://cdn/a"), "png");
    }

    #[test]
    fn stores_a_verified_image_and_rejects_a_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = b"background art";
        let checksum = crc64::crc64(bytes).to_string();
        let stored = make_image(&checksum, "https://cdn.example.com/a.png");
        let path = store(dir.path(), &stored, bytes).unwrap();
        assert_eq!(path, dir.path().join(format!("{checksum}.png")));
        assert_eq!(fs::read(&path).unwrap(), bytes);

        let wrong = make_image("1", "https://cdn.example.com/b.png");
        assert!(store(dir.path(), &wrong, bytes).is_err());
        assert!(!dir.path().join("1.png").exists());
    }

    #[test]
    fn keeps_only_the_newest_three_versions() {
        let dir = tempfile::tempdir().unwrap();
        for index in 0..5u64 {
            let bytes = format!("version-{index}");
            let checksum = crc64::crc64(bytes.as_bytes()).to_string();
            let path = dir.path().join(format!("{checksum}.png"));
            fs::write(&path, bytes).unwrap();
            // Space out mtimes so ordering is deterministic on every filesystem.
            let modified = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(index + 1);
            let file = fs::File::options().write(true).open(&path).unwrap();
            file.set_modified(modified).unwrap();
            prune(dir.path(), MAX_VERSIONS, Some(&path)).unwrap();
        }
        let mut names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names.len(), MAX_VERSIONS);
    }

    #[test]
    fn newest_skips_partial_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("old.png"), b"old").unwrap();
        fs::write(dir.path().join("new.part"), b"new").unwrap();
        let cached = newest(dir.path()).unwrap();
        assert_eq!(cached, dir.path().join("old.png"));
        let missing = dir.path().join("missing");
        assert!(newest(&missing).is_none());
    }
}
