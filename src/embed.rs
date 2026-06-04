//! Embeds the built Vue driver SPA (`ui/dist`) into the binary.
//!
//! In debug builds rust-embed reads from disk at runtime (fast iteration); in
//! release builds the assets are baked into the binary, so the single `design`
//! executable needs no companion files. Build the SPA first: `cd ui && npm run build`.

use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "ui/dist"]
pub struct Spa;
