//! Build script: bake release metadata into the binary as `rustc-env` values
//! that `src/version.rs` reads back with `env!`.
//!
//! - `DESIGN_VERSION` — the release version (`YYYY.mm.dd[.a-z]`). CI sets this
//!   from the pushed git tag; local dev builds fall back to the crate version.
//! - `DESIGN_COMMIT` — short git commit the binary was built from.
//! - `DESIGN_BUILD_TIMESTAMP` — UTC build time (RFC 3339), honoring
//!   `SOURCE_DATE_EPOCH` for reproducible builds when set.

use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    println!("cargo:rerun-if-env-changed=DESIGN_VERSION");
    println!("cargo:rerun-if-env-changed=DESIGN_COMMIT");
    println!("cargo:rerun-if-env-changed=SOURCE_DATE_EPOCH");
    // Pick up new commits in local dev builds.
    println!("cargo:rerun-if-changed=.git/HEAD");

    // Version baked into the binary. CI exports DESIGN_VERSION from the release
    // tag (`YYYY.mm.dd[.a-z]`); otherwise fall back to the crate version so dev
    // builds still report something sensible.
    let version = env("DESIGN_VERSION")
        .filter(|v| !v.is_empty())
        .or_else(|| env("CARGO_PKG_VERSION"))
        .unwrap_or_else(|| "0.0.0".to_string());
    println!("cargo:rustc-env=DESIGN_VERSION={version}");

    // Short commit hash. CI passes DESIGN_COMMIT; otherwise ask git directly.
    let commit = env("DESIGN_COMMIT")
        .filter(|c| !c.is_empty())
        .or_else(git_short_commit)
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=DESIGN_COMMIT={commit}");

    // Build timestamp. Honor SOURCE_DATE_EPOCH (reproducible builds) when set,
    // otherwise stamp the current wall-clock time.
    let epoch = env("SOURCE_DATE_EPOCH")
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        });
    println!(
        "cargo:rustc-env=DESIGN_BUILD_TIMESTAMP={}",
        format_utc(epoch)
    );
}

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok()
}

fn git_short_commit() -> Option<String> {
    let out = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8(out.stdout).ok()?.trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Format a Unix timestamp as `YYYY-MM-DDTHH:MM:SSZ` (UTC), without pulling in a
/// date crate just for the build stamp.
fn format_utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// Convert days-since-Unix-epoch to a `(year, month, day)` civil date.
/// Howard Hinnant's algorithm: http://howardhinnant.github.io/date_algorithms.html
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
