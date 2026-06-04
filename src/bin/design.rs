//! `design` binary entry — a thin wrapper over the `design` library crate.
//!
//! Usage: `design <folder>` — serve the driver SPA against a design-system
//! workspace. The folder is the only argument.

use std::path::PathBuf;

use clap::Parser;

#[derive(Parser)]
#[command(name = "design", version, about = "Drive a code agent against an agent-neutral design-system repo")]
struct Cli {
    /// Path to the design-system workspace to serve.
    #[arg(default_value = ".")]
    path: PathBuf,
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cli = Cli::parse();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(design::server::serve(cli.path))
}
