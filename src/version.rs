//! Release version metadata, baked in at compile time by `build.rs`.
//!
//! Releases are tagged `YYYY.mm.dd` (zero-padded month/day) with an optional
//! single lowercase letter suffix (`.a`–`.z`) to disambiguate multiple releases
//! on the same day, e.g. `2026.06.10` or `2026.06.10.b`. See [`is_valid`].

/// Release version string (`YYYY.mm.dd[.a-z]` for tagged builds; the crate
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

/// True when `v` is a well-formed release version: `YYYY.mm.dd` with an
/// optional `.a`–`.z` suffix. Month is `01`–`12`, day `01`–`31`; both segments
/// are exactly two digits, the year exactly four.
pub fn is_valid(v: &str) -> bool {
    let mut parts = v.split('.');
    let (year, month, day) = match (parts.next(), parts.next(), parts.next()) {
        (Some(y), Some(m), Some(d)) => (y, m, d),
        _ => return false,
    };

    // Optional single-letter suffix; nothing may follow it.
    match parts.next() {
        None => {}
        Some(suffix) => {
            if parts.next().is_some() {
                return false;
            }
            let mut chars = suffix.chars();
            match (chars.next(), chars.next()) {
                (Some(c), None) if c.is_ascii_lowercase() => {}
                _ => return false,
            }
        }
    }

    is_n_digits(year, 4) && in_range(month, 2, 1, 12) && in_range(day, 2, 1, 31)
}

/// True when `s` is exactly `n` ASCII digits.
fn is_n_digits(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_digit())
}

/// True when `s` is exactly `width` ASCII digits and parses into `lo..=hi`.
fn in_range(s: &str, width: usize, lo: u32, hi: u32) -> bool {
    is_n_digits(s, width) && matches!(s.parse::<u32>(), Ok(n) if (lo..=hi).contains(&n))
}

#[cfg(test)]
mod tests {
    use super::is_valid;

    #[test]
    fn accepts_plain_date() {
        assert!(is_valid("2026.06.10"));
        assert!(is_valid("2024.01.01"));
        assert!(is_valid("2026.12.31"));
    }

    #[test]
    fn accepts_letter_suffix() {
        assert!(is_valid("2026.06.10.a"));
        assert!(is_valid("2026.06.10.z"));
    }

    #[test]
    fn rejects_unpadded_segments() {
        assert!(!is_valid("2026.6.10"));
        assert!(!is_valid("2026.06.1"));
        assert!(!is_valid("26.06.10"));
    }

    #[test]
    fn rejects_out_of_range_month_and_day() {
        assert!(!is_valid("2026.13.10"));
        assert!(!is_valid("2026.00.10"));
        assert!(!is_valid("2026.06.32"));
        assert!(!is_valid("2026.06.00"));
    }

    #[test]
    fn rejects_bad_suffix() {
        assert!(!is_valid("2026.06.10.A")); // uppercase
        assert!(!is_valid("2026.06.10.ab")); // two letters
        assert!(!is_valid("2026.06.10.1")); // digit
        assert!(!is_valid("2026.06.10.a.b")); // trailing segment
    }

    #[test]
    fn rejects_malformed() {
        assert!(!is_valid(""));
        assert!(!is_valid("2026"));
        assert!(!is_valid("2026.06"));
        assert!(!is_valid("2026.06.10."));
        assert!(!is_valid("v2026.06.10"));
        assert!(!is_valid("2026-06-10"));
        assert!(!is_valid("0.1.0"));
    }
}
