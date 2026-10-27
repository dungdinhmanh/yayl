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

/// Slicing-by-8 tables. `TABLES[0]` is the classic byte table; each following
/// table shifts the previous one by one byte. Processing eight bytes at a time
/// keeps CRC verification well ahead of a typical game download.
const TABLES: [[u64; 256]; 8] = build_tables();

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

const fn build_tables() -> [[u64; 256]; 8] {
    let mut tables = [[0u64; 256]; 8];
    tables[0] = build_table();
    let mut n = 1usize;
    while n < 8 {
        let mut i = 0usize;
        while i < 256 {
            let previous = tables[n - 1][i];
            tables[n][i] = (previous >> 8) ^ tables[0][(previous & 0xFF) as usize];
            i += 1;
        }
        n += 1;
    }
    tables
}

pub fn crc64(bytes: &[u8]) -> u64 {
    !update(!0u64, bytes)
}

fn update(mut crc: u64, bytes: &[u8]) -> u64 {
    let mut chunks = bytes.chunks_exact(8);
    for chunk in &mut chunks {
        let word = u64::from_le_bytes(chunk.try_into().expect("chunk is exactly 8 bytes"));
        let mixed = crc ^ word;
        crc = TABLES[7][(mixed & 0xFF) as usize]
            ^ TABLES[6][((mixed >> 8) & 0xFF) as usize]
            ^ TABLES[5][((mixed >> 16) & 0xFF) as usize]
            ^ TABLES[4][((mixed >> 24) & 0xFF) as usize]
            ^ TABLES[3][((mixed >> 32) & 0xFF) as usize]
            ^ TABLES[2][((mixed >> 40) & 0xFF) as usize]
            ^ TABLES[1][((mixed >> 48) & 0xFF) as usize]
            ^ TABLES[0][((mixed >> 56) & 0xFF) as usize];
    }
    for byte in chunks.remainder() {
        crc = TABLE[((crc ^ u64::from(*byte)) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc
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
        crc = update(crc, &buffer[..read]);
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
        crc = update(crc, &buffer[..read]);
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

    #[test]
    fn slicing_matches_the_byte_algorithm() {
        let mut bytes = vec![0u8; 100_003];
        let mut state = 0x1234_5678_9ABC_DEF0u64;
        for byte in &mut bytes {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            *byte = (state >> 33) as u8;
        }
        let mut expected = !0u64;
        for byte in &bytes {
            expected = TABLE[((expected ^ u64::from(*byte)) & 0xFF) as usize] ^ (expected >> 8);
        }
        assert_eq!(crc64(&bytes), !expected);
    }

    #[test]
    fn handles_lengths_around_the_eight_byte_block() {
        let bytes: Vec<u8> = (0..64).collect();
        for len in 0..bytes.len() {
            let mut expected = !0u64;
            for byte in &bytes[..len] {
                expected = TABLE[((expected ^ u64::from(*byte)) & 0xFF) as usize] ^ (expected >> 8);
            }
            assert_eq!(crc64(&bytes[..len]), !expected, "length {len}");
        }
    }
}
