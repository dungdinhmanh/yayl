//! CRC-64/XZ, the checksum used by Yostar manifests.
//!
//! Parameters: poly 0x42F0E1EBA9EA3693 (reflected 0xC96C5795D7870F42),
//! init !0, refin/refout true, xorout !0. Check value for "123456789" is
//! 0x995DC9BBDF1939FA.

use crate::error::{Error, Result};
use std::io::Read;
use std::path::Path;

const POLY: u64 = 0xC96C_5795_D787_0F42;

const TABLE: [u64; 256] = build_table();

const fn build_table() -> [u64; 256] {
    let mut table = [0u64; 256];
    let mut i = 0usize;
    while i < 256 {
        let mut crc = i as u64;
        let mut bit = 0;
        while bit < 8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ POLY
            } else {
                crc >> 1
            };
            bit += 1;
        }
        table[i] = crc;
        i += 1;
    }
    table
}

pub fn crc64(bytes: &[u8]) -> u64 {
    let mut crc = !0u64;
    for byte in bytes {
        crc = TABLE[((crc ^ u64::from(*byte)) & 0xFF) as usize] ^ (crc >> 8);
    }
    !crc
}

/// Hash a file on a blocking thread. Use this for large game files.
pub async fn crc64_file(path: &Path) -> Result<u64> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || crc64_file_blocking(&path))
        .await
        .map_err(|error| Error::new(crate::error::ErrorCode::Unknown, error.to_string()))?
}

pub fn crc64_file_blocking(path: &Path) -> Result<u64> {
    let mut file = std::fs::File::open(path)?;
    let mut crc = !0u64;
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        for byte in &buffer[..read] {
            crc = TABLE[((crc ^ u64::from(*byte)) & 0xFF) as usize] ^ (crc >> 8);
        }
    }
    Ok(!crc)
}

/// Hash a file from an explicit path without allocating a second PathBuf.
pub fn crc64_reader<R: Read>(reader: &mut R) -> std::io::Result<u64> {
    let mut crc = !0u64;
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        for byte in &buffer[..read] {
            crc = TABLE[((crc ^ u64::from(*byte)) & 0xFF) as usize] ^ (crc >> 8);
        }
    }
    Ok(!crc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_xz_check_value() {
        assert_eq!(crc64(b"123456789"), 0x995D_C9BB_DF19_39FA);
    }

    #[test]
    fn empty_input_is_zero() {
        assert_eq!(crc64(b""), 0);
    }

    #[test]
    fn hashes_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.bin");
        std::fs::write(&path, b"123456789").unwrap();
        assert_eq!(crc64_file_blocking(&path).unwrap(), 0x995D_C9BB_DF19_39FA);
    }
}
