//! `design` — library root.
//!
//! All logic lives here; the binary under `src/bin/design.rs` is a thin entry
//! that calls into this crate. Token compilation (DTCG → CSS) is owned by the
//! substrate's own build, so the tool only concerns itself with serving and
//! (later) driving the runner.

pub mod agent;
pub mod console;
pub mod embed;
pub mod server;
