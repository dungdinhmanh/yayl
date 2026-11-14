//! Per-process disk I/O counters for the download monitor.
//!
//! The counters are cumulative; callers sample them and take the difference.

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ProcessIo {
    pub read: u64,
    pub write: u64,
}

/// Bytes this process has read from and written to disk.
#[cfg(windows)]
pub fn process_io() -> ProcessIo {
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, GetProcessIoCounters, IO_COUNTERS,
    };

    let mut counters = IO_COUNTERS {
        ReadOperationCount: 0,
        WriteOperationCount: 0,
        OtherOperationCount: 0,
        ReadTransferCount: 0,
        WriteTransferCount: 0,
        OtherTransferCount: 0,
    };
    // SAFETY: the handle is the current process and the out-pointer is valid.
    if unsafe { GetProcessIoCounters(GetCurrentProcess(), &mut counters) } == 0 {
        return ProcessIo::default();
    }
    ProcessIo {
        read: counters.ReadTransferCount,
        write: counters.WriteTransferCount,
    }
}

#[cfg(target_os = "linux")]
pub fn process_io() -> ProcessIo {
    let text = std::fs::read_to_string("/proc/self/io").unwrap_or_default();
    let mut io = ProcessIo::default();
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("read_bytes:") {
            io.read = value.trim().parse().unwrap_or(0);
        } else if let Some(value) = line.strip_prefix("write_bytes:") {
            io.write = value.trim().parse().unwrap_or(0);
        }
    }
    io
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn process_io() -> ProcessIo {
    ProcessIo::default()
}
