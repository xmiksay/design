//! `design` — library root.
//!
//! All logic lives here; the binary under `src/bin/design.rs` is a thin entry
//! that calls into this crate. Modules mirror the three separable concerns from
//! the plan: the substrate/core, the runner, and the server. Only `core` is
//! implemented in Phase 0; `runner` and `server` arrive in later phases.

pub mod core;
pub mod embed;
pub mod server;
