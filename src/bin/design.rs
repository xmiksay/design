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

    /// Loopback port to bind. Optional — defaults to a random free port.
    #[arg(short = 'p', long = "port", default_value_t = 0)]
    port: u16,

    /// Bind on all interfaces (0.0.0.0) instead of loopback only, exposing the
    /// server to your network. Off by default; the token still gates access.
    #[arg(long = "public")]
    public: bool,

    /// Tool-permission rule pre-approved for spawned agents (repeatable, e.g.
    /// `--allow Read --allow "Bash(npm *)"`). Anything outside the set prompts
    /// in the chat. Passed through to Claude Code's `--allowedTools`.
    #[arg(long = "allow", value_name = "RULE")]
    allow: Vec<String>,
}

/// Sensible default allowlist when the user passes no `--allow` rules: read-only
/// inspection plus edits and the common build/VCS-status commands a design loop
/// needs. Anything else (arbitrary Bash, git mutations, …) prompts in the chat.
fn default_allow() -> Vec<String> {
    [
        "Read",
        "Glob",
        "Grep",
        "Edit",
        "Write",
        "Bash(npm run *)",
        "Bash(git status*)",
        "Bash(git diff*)",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cli = Cli::parse();
    let allowed = if cli.allow.is_empty() {
        default_allow()
    } else {
        cli.allow
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(design::server::serve(cli.path, cli.port, cli.public, allowed))
}
