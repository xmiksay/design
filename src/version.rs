//! Release version metadata, baked in at compile time by `build.rs`.
//!
//! Releases are tagged with a **semver-compatible** date version: `YYYY.M.D`
//! (year as major, month as minor, day as patch — no leading zeros, since
//! semver forbids them), with an optional `-a`–`-z` pre-release suffix to
//! disambiguate multiple releases on the same day, e.g. `2026.6.10` or
//! `2026.6.10-b`. See [`is_valid`].

/// Release version string (`YYYY.M.D[-a-z]` for tagged builds; the crate
/// version for local dev builds).
pub const VERSION: &str = env!("DESIGN_VERSION");

/// Short git commit the binary was built from.
pub const COMMIT: &str = env!("DESIGN_COMMIT");

/// UTC build timestamp (RFC 3339).
pub const BUILD_TIMESTAMP: &str = env!("DESIGN_BUILD_TIMESTAMP");

/// One-line version banner: `<version> (<commit>, built <timestamp>)`.
/// Used as clap's `--version` output.
pub const LONG_VERSION: &str = concat!(
    env!("DESIGN_VERSION"),
    " (",
    env!("DESIGN_COMMIT"),
    ", built ",
    env!("DESIGN_BUILD_TIMESTAMP"),
    ")"
);

/// True when `v` is a well-formed, semver-compatible release version: `YYYY.M.D`
/// with an optional `-a`–`-z` pre-release suffix. Year is exactly four digits,
/// month `1`–`12`, day `1`–`31`, with **no leading zeros** (semver forbids
/// them) — so `2026.6.10` and `2026.6.10-b` are valid but `2026.06.10` is not.
pub fn is_valid(v: &str) -> bool {
    // Split off an optional `-<letter>` semver pre-release suffix.
    let (date, pre) = match v.split_once('-') {
        Some((d, p)) => (d, Some(p)),
        None => (v, None),
    };

    if let Some(pre) = pre {
        let mut chars = pre.chars();
        match (chars.next(), chars.next()) {
            (Some(c), None) if c.is_ascii_lowercase() => {}
            _ => return false,
        }
    }

    let mut parts = date.split('.');
    let (year, month, day) = match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(y), Some(m), Some(d), None) => (y, m, d),
        _ => return false,
    };

    is_year(year) && is_num_in_range(month, 1, 12) && is_num_in_range(day, 1, 31)
}

/// True when `s` is exactly four ASCII digits with no leading zero.
fn is_year(s: &str) -> bool {
    s.len() == 4 && !s.starts_with('0') && s.bytes().all(|b| b.is_ascii_digit())
}

/// True when `s` is a semver-legal numeric identifier (one or two digits, no
/// leading zero) that parses into `lo..=hi`.
fn is_num_in_range(s: &str, lo: u32, hi: u32) -> bool {
    if s.is_empty() || s.len() > 2 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    if s.len() == 2 && s.starts_with('0') {
        return false; // leading zero — not semver-legal
    }
    matches!(s.parse::<u32>(), Ok(n) if (lo..=hi).contains(&n))
}

#[cfg(test)]
mod tests {
    use super::is_valid;

    #[test]
    fn accepts_plain_date() {
        assert!(is_valid("2026.6.10"));
        assert!(is_valid("2024.1.1"));
        assert!(is_valid("2026.12.31"));
    }

    #[test]
    fn accepts_letter_suffix() {
        assert!(is_valid("2026.6.10-a"));
        assert!(is_valid("2026.6.10-z"));
    }

    #[test]
    fn rejects_leading_zeros() {
        // semver forbids leading zeros in numeric identifiers
        assert!(!is_valid("2026.06.10"));
        assert!(!is_valid("2026.6.01"));
        assert!(!is_valid("2026.06.1"));
    }

    #[test]
    fn rejects_out_of_range_month_and_day() {
        assert!(!is_valid("2026.13.10"));
        assert!(!is_valid("2026.0.10"));
        assert!(!is_valid("2026.6.32"));
        assert!(!is_valid("2026.6.0"));
    }

    #[test]
    fn rejects_bad_suffix() {
        assert!(!is_valid("2026.6.10-A")); // uppercase
        assert!(!is_valid("2026.6.10-ab")); // two letters
        assert!(!is_valid("2026.6.10-1")); // digit
        assert!(!is_valid("2026.6.10-")); // empty pre-release
        assert!(!is_valid("2026.6.10.a")); // old dot-suffix form
    }

    #[test]
    fn rejects_malformed() {
        assert!(!is_valid(""));
        assert!(!is_valid("2026"));
        assert!(!is_valid("2026.6"));
        assert!(!is_valid("2026.6.10."));
        assert!(!is_valid("v2026.6.10"));
        assert!(!is_valid("2026-6-10"));
        assert!(!is_valid("26.6.10")); // two-digit year
        assert!(!is_valid("0.1.0"));
    }
}
