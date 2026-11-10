# YAYL Code Audit

**Repository:** `dungdinhmanh/yayl`\
**Audit basis:** Static review of repository source retrieved during
this conversation\
**Audit date:** 2026-11-10\
**Scope:** Identify opportunities to simplify implementation while
preserving existing behavior, and flag correctness or maintainability
risks.

> **Important limitation:** This is a static code review. Rust/Cargo
> were not available in the execution sandbox, and the repository could
> not be cloned because GitHub DNS/network access failed. No
> `cargo check`, `cargo test`, Clippy, benchmarks, or runtime tests were
> executed. Findings below are therefore recommendations to verify, not
> claims of tested fixes.

------------------------------------------------------------------------

## 1. Executive summary

YAYL does not appear to need a broad refactor just to reduce line count.
Its downloader contains meaningful complexity: resumable transfers, CDN
fallback, range validation, durable checkpoints, checksum verification,
cancellation, and recovery. Removing that complexity without a precise
behavioral model would risk regressions.

The best opportunities are narrower:

1.  Remove duplicated CRC64 reader logic without changing the algorithm.
2.  Make task-file loading distinguish `NotFound` from other filesystem
    errors.
3.  Audit metadata error handling in the downloader; several
    `unwrap_or(0)` patterns may conceal real I/O or permission errors.
4.  Make state-file migration failures visible instead of silently
    ignoring them.
5.  Review atomic state writes for concurrent writers and cross-platform
    replacement semantics.
6.  Reassess system proxy handling against reqwest's existing
    `system-proxy` feature.
7.  Reduce duplicated orchestration in the desktop download commands
    only after extracting genuinely shared behavior and preserving
    terminal event semantics.

The priority should be correctness and maintainability, not minimum line
count.

------------------------------------------------------------------------

## 2. Findings and recommendations

### A-01 --- CRC64 file reader may duplicate the reader implementation

**Area:** `crates/yayl-core/src/crc64.rs`\
**Priority:** Low\
**Risk of change:** Low, if existing tests cover both paths

The file-reading and generic-reader paths appear to perform the same
buffered CRC calculation. If `crc64_reader()` already owns the
buffer/read/update loop, the file helper can delegate to it:

``` rust
pub fn crc64_file_blocking(path: &Path) -> Result<u64> {
    let mut file = std::fs::File::open(path)?;
    Ok(crc64_reader(&mut file)?)
}
```

**Benefits** - One implementation of the CRC update loop. - Less
duplicated code to maintain. - No algorithm change and no expected
performance regression if buffer sizing remains the same.

**Before merging** - Confirm the exact signatures and error types. - Run
the existing CRC-64/XZ test vectors. - Compare file and reader results
on empty files, small files, and large files. - Benchmark if the
refactor changes buffering or dispatch.

**Do not** replace the custom slicing-by-8 CRC implementation with
another crate solely to reduce code. Existing worklog information
reports strong throughput, and CRC is on a performance-sensitive path.

### A-02 --- `DownloadTask::load()` should distinguish missing files from filesystem errors

**Area:** `crates/yayl-core/src/task.rs`\
**Priority:** Medium\
**Risk of change:** Low

The current pattern checks `path.exists()` before reading. `exists()`
can return false when metadata lookup fails, not only when the file is
absent. That can turn permission or filesystem problems into an apparent
missing task.

Prefer reading directly and handling only `NotFound` as `Ok(None)`:

``` rust
pub fn load(path: &Path) -> Result<Option<Self>> {
    let body = match std::fs::read_to_string(path) {
        Ok(body) => body,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(None);
        }
        Err(error) => return Err(error.into()),
    };

    let task: Self = serde_json::from_str(&body)?;

    if task.schema_version != TASK_SCHEMA_VERSION {
        return Err(Error::new(
            ErrorCode::InvalidInput,
            format!(
                "unsupported task schema {} (expected {})",
                task.schema_version, TASK_SCHEMA_VERSION
            ),
        ));
    }

    Ok(Some(task))
}
```

**Before merging** - Confirm `std::io::Error` converts into the
project's `Result` error type. - Add tests for missing file, malformed
JSON, unsupported schema, and permission/read failure where the platform
permits it.

### A-03 --- Downloader metadata handling may hide real filesystem errors

**Area:** `crates/yayl-core/src/downloader.rs`\
**Priority:** High\
**Risk of change:** Medium

Several metadata lookups use a pattern similar to:

``` rust
tokio::fs::metadata(&part)
    .await
    .map(|meta| meta.len())
    .unwrap_or(0)
```

This treats every metadata error as if the file does not exist. However,
errors can also indicate permission denial, I/O failure, or filesystem
trouble.

Use explicit `NotFound` handling and propagate other errors. A helper
could centralize the behavior:

``` rust
async fn file_len_or_zero(path: &Path) -> Result<u64> {
    match tokio::fs::metadata(path).await {
        Ok(metadata) => Ok(metadata.len()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(0),
        Err(error) => Err(error.into()),
    }
}
```

The exact return type/conversion should match the project's error
abstraction.

**Potential call sites to inspect** - Existing destination size
checks. - Partial-file length and resume offset checks. - Post-download
size checks.

**Caution** - Do not replace every `unwrap_or(0)` mechanically. Some
locations may intentionally treat a missing or unreadable optional file
as absent. Review each call site's intended semantics. - Preserve
recovery behavior for genuinely missing `.yayl-part` files and
checkpoints.

**Tests to add** - Missing partial file. - Existing partial file. -
Permission-denied metadata lookup, where testable. - Unexpected I/O
error behavior. - Resume behavior with a valid checkpoint and a
truncated partial file.

### A-04 --- State migration should not silently ignore rename failures

**Area:** `crates/yayl-core/src/state.rs`\
**Priority:** Medium\
**Risk of change:** Medium

A migration path reportedly ignores a rename result:

``` rust
let _ = std::fs::rename(&legacy, &path);
```

If the rename fails, the caller may behave as though migration succeeded
even though the legacy file remains and the new state file was not
created.

Make the migration outcome explicit: - Return the rename error when
migration is required and cannot complete; or - Deliberately fall back
to using the legacy file, while reporting that migration did not occur.

Do not delete the legacy file until the new state is safely written and
validated.

**Before merging** - Inspect the full migration function and all
callers. - Test successful migration, missing legacy file, destination
already present, and rename failure. - Verify Windows behavior when the
destination exists.

### A-05 --- Atomic state writes need a concurrency and cross-platform review

**Area:** `crates/yayl-core/src/state.rs`\
**Priority:** High\
**Risk of change:** Medium--High

The temporary path appears to be derived using a fixed extension such as
`.tmp`. If two writers target the same state file concurrently, they may
contend for or overwrite the same temporary file.

Recommended properties: - Unique temporary file name per write. -
Temporary file created in the destination directory (same filesystem). -
Explicit cleanup on failure. - Atomic replacement semantics on supported
platforms. - Preserve the distinction between `Durability::Full` and
`Durability::Relaxed`. - Avoid following attacker-controlled symlinks
when opening or replacing state files, consistent with the existing
path-safety model.

Do not replace the current implementation with a generic helper until
Windows and Linux replacement semantics are verified. In particular,
test replacement when the destination already exists and behavior after
interrupted writes.

**Tests to add** - Two concurrent writes to the same destination. -
Destination already exists. - Failure before rename/replace. -
Temporary-file cleanup. - Full versus relaxed durability behavior. -
Windows and Linux integration tests.

### A-06 --- Reassess system proxy implementation before adding more custom logic

**Area:** `crates/yayl-core/src/proxy.rs`, workspace `Cargo.toml`\
**Priority:** Medium\
**Risk of change:** Medium--High

The workspace already enables reqwest's `system-proxy` feature.
Therefore, the likely question is not whether the feature is enabled,
but whether `ProxyMode::System` adds redundant manual proxy discovery or
overrides reqwest's automatic behavior.

Review: - Whether the default reqwest client already honors system proxy
settings for each supported platform. - Whether calling `.proxy(...)` or
`.no_proxy()` changes or disables automatic proxy behavior. - Whether
manual proxy mode and direct mode remain explicit and deterministic. -
Whether Windows-specific WinINET discovery is still needed for
requirements reqwest does not cover.

**Recommendation** - Keep `Direct`, `System`, and `Manual` behavior
distinct. - Simplify only the system path if reqwest's built-in behavior
satisfies the product requirements. - Test on Windows and Linux,
including no proxy configured, HTTP proxy, HTTPS proxy, and
bypass/no-proxy rules.

Do not assume that `system-proxy` fully reproduces every platform's
proxy behavior without testing.

### A-07 --- Desktop download commands have opportunities for shared preparation logic

**Area:** `apps/desktop/src-tauri/src/download.rs`\
**Priority:** Medium\
**Risk of change:** Medium

`run_download()`, `run_verify()`, and `run_repair()` share some setup
steps: - Load settings. - Build a proxy-aware HTTP client. - Load an
existing plan or prepare a new one. - Derive file and byte totals. -
Emit progress events.

A small helper for genuinely common setup may reduce duplication.
However, these commands have different semantics: - Download can resume
an unfinished task. - Verify should not modify game files. - Repair
verifies first, downloads only damaged files, then verifies again. -
Each path emits different terminal states and error details.

**Recommendation** - Extract only common, behaviorally identical
setup. - Keep command-specific control flow explicit. - Avoid a large
generic orchestration framework or callback-heavy abstraction. -
Preserve cancellation and terminal event behavior exactly.

### A-08 --- `App.tsx` state management does not justify Zustand by itself

**Area:** Frontend `App.tsx`\
**Priority:** Low\
**Risk of change:** Medium

The observed count of `useState` and `useEffect` calls is not enough to
justify a new state-management dependency.

Try, in order: 1. Extract cohesive custom hooks. 2. Use `useReducer` for
state with related transitions. 3. Introduce Zustand only if state is
genuinely shared across distant components or synchronization has become
difficult.

The goal is to make state transitions easier to understand, not to
replace React primitives for stylistic reasons.

### A-09 --- Generate frontend IPC types from Rust incrementally

**Area:** Frontend IPC definitions and Rust command types\
**Priority:** Medium\
**Risk of change:** Medium

There are numerous manually maintained TypeScript interfaces around IPC.
A generator such as `ts-rs` may reduce drift between Rust and
TypeScript.

Recommended approach: - Start with stable request/response DTOs. -
Generate into a clearly defined frontend directory. - Keep UI-only types
handwritten. - Avoid generating internal backend types that are not part
of the IPC contract. - Add a reproducible command to regenerate types
and document when it must be run.

This is a worthwhile maintainability improvement, but it is not a
prerequisite for the downloader to function.

------------------------------------------------------------------------

## 3. Areas that should not be simplified without evidence

### Downloader retry/resume/checkpoint logic

Do not remove or merge logic merely because `downloader.rs` is long. The
code handles important failure modes: - HTTP range requests and
`Content-Range` validation. - CDN fallback. - Retry/backoff. - Partial
downloads. - Durable checkpoints. - CRC verification before commit. -
Cancellation and progress accounting.

Any refactor here should be supported by tests that cover interruption,
invalid range responses, short responses, oversized responses, checksum
mismatch, fallback CDN success, and cancellation.

### Custom CRC64 implementation

Keep the current implementation unless benchmarks show a better
alternative with equivalent CRC-64/XZ semantics. Correctness and
throughput matter more than reducing source lines.

### `devNewsPlugin` and `devLauncherPlugin`

The Vite configuration uses `apply: "serve"` for development-only
behavior. These plugins are not automatically part of the production
bundle. Understand the development workflow before deleting them.

### `design/` directory

The repository guidance identifies this directory as a prototype or
design source of truth. Do not delete it until its useful assets and
workflow have been replaced or intentionally retired.

### i18n keys

A static search reporting unused keys is not enough to establish that
they are dead. Dynamic translation keys may be constructed at runtime.
Validate references before deleting translations.

### Zustand migration

Do not introduce Zustand just because the root component has many hooks.
First establish that the current state structure causes concrete
maintenance problems.

------------------------------------------------------------------------

## 4. Suggested implementation order

  ---------------------------------------------------------------------------
                         Order Item                     Reason
  ---------------------------- ------------------------ ---------------------
                             1 Fix                      Small, low-risk
                               `DownloadTask::load()`   correctness
                               error distinction        improvement

                             2 Review metadata error    Prevent real I/O
                               handling in downloader   errors from being
                                                        mistaken for missing
                                                        files

                             3 Remove duplicate CRC     Small cleanup without
                               reader logic             algorithm changes

                             4 Fix state migration      Avoid false success
                               error handling           during migration

                             5 Review atomic writes     Important reliability
                                                        work; needs
                                                        cross-platform tests

                             6 Reassess system proxy    Potentially remove
                               implementation           custom code, but
                                                        platform behavior
                                                        must be verified

                             7 Extract shared desktop   Reduce duplication
                               command setup            without hiding
                                                        command semantics

                             8 Introduce generated IPC  Reduce
                               types                    frontend/backend type
                                                        drift

                             9 Revisit frontend state   Only if complexity is
                               organization             demonstrably
                                                        increasing
  ---------------------------------------------------------------------------

------------------------------------------------------------------------

## 5. Validation checklist

Before merging changes that affect core download behavior:

-   [ ] `cargo fmt --check`
-   [ ] `cargo check --workspace`
-   [ ] `cargo test --workspace`
-   [ ] `cargo clippy --workspace --all-targets`
-   [ ] Run existing CRC-64/XZ test vectors.
-   [ ] Test interrupted download and resume from checkpoint.
-   [ ] Test primary CDN failure and backup CDN success.
-   [ ] Test HTTP 200 response to a range request.
-   [ ] Test malformed or mismatched `Content-Range`.
-   [ ] Test short response, oversized response, and checksum mismatch.
-   [ ] Test cancellation during transfer and verification.
-   [ ] Test state persistence and recovery after process termination.
-   [ ] Test Windows and Linux filesystem replacement behavior.
-   [ ] Test system proxy, direct connection, and manual proxy modes.

These commands are recommendations; they were not run as part of this
audit.

------------------------------------------------------------------------

## 6. Final assessment

The strongest candidates for immediate simplification are duplicated CRC
reader logic and repeated setup code where behavior is genuinely
identical. The strongest correctness concerns are swallowed filesystem
errors, migration error handling, and atomic-write concurrency.

The downloader itself should remain deliberately robust. A resumable
game launcher is expected to survive network failures, interrupted
processes, corrupted partial files, and filesystem edge cases. Its
complexity is justified when each branch protects one of those
requirements.

**Recommended principle:** simplify duplicated mechanics and ambiguous
error handling; do not simplify away recovery guarantees.
