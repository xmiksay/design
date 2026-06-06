//! `design` binary entry — a thin wrapper over the `design` library crate.
//!
//! Usage: `design <folder>` — serve the driver SPA against a design-system
//! workspace. The folder is the only argument.

use std::path::PathBuf;

use anyhow::Context;
use clap::Parser;

#[derive(Parser)]
#[command(name = "design", version, about = "Drive a code agent against an agent-neutral design-system repo")]
struct Cli {
    /// Path to the design-system workspace to serve.
    #[arg(default_value = ".", env = "DESIGN_PATH")]
    path: PathBuf,

    /// Loopback port to bind. Optional — defaults to a random free port.
    #[arg(short = 'p', long = "port", default_value_t = 0, env = "DESIGN_PORT")]
    port: u16,

    /// Bind on all interfaces (0.0.0.0) instead of loopback only, exposing the
    /// server to your network. Off by default; the token still gates access.
    #[arg(long = "public", env = "DESIGN_PUBLIC")]
    public: bool,

    /// Tool-permission rule pre-approved for spawned agents (repeatable, e.g.
    /// `--allow Read --allow "Bash(npm *)"`). Anything outside the set prompts
    /// in the chat. Passed through to Claude Code's `--allowedTools`.
    /// `DESIGN_ALLOW` takes a comma-separated list.
    #[arg(long = "allow", value_name = "RULE", env = "DESIGN_ALLOW", value_delimiter = ',')]
    allow: Vec<String>,

    /// Extra system-prompt text to append to the built-in design prompt for every
    /// agent (repeatable, e.g. `--prompt "You are designing a multi-tenant
    /// system."`). Combines freely with `--prompt-file`; all parts are joined.
    #[arg(long = "prompt", value_name = "TEXT", env = "DESIGN_PROMPT")]
    prompt: Vec<String>,

    /// Like `--prompt`, but read the extra text from a file (repeatable). Files
    /// are read in order, then `--prompt` texts are appended.
    #[arg(long = "prompt-file", value_name = "PATH", env = "DESIGN_PROMPT_FILE")]
    prompt_file: Vec<PathBuf>,

    /// Internal: run as the stdio MCP server (spawned by Claude Code via the
    /// `--mcp-config` we register). Not for direct use.
    #[arg(long = "mcp", hide = true)]
    mcp: bool,
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
    // Load a `.env` (from cwd, searching parent dirs) so `DESIGN_*` settings can be
    // configured there. Variables already present in the real environment win —
    // dotenvy never overrides them, so the MCP child's injected DESIGN_PORT/
    // DESIGN_TOKEN stay intact.
    dotenvy::dotenv().ok();

    let cli = Cli::parse();

    // MCP stdio server mode: stdout is the JSON-RPC channel, so we must NOT init a
    // stdout logger here. Runs synchronously, no Tokio runtime.
    if cli.mcp {
        return design::mcp::run();
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let allowed = if cli.allow.is_empty() {
        default_allow()
    } else {
        cli.allow
    };

    // Optional user extensions to the system prompt: any number of files and/or
    // literal texts, joined (all files in order, then all texts). The result is
    // appended to the built-in design prompt for every spawned agent.
    let mut parts = Vec::new();
    for path in &cli.prompt_file {
        parts.push(
            std::fs::read_to_string(path)
                .with_context(|| format!("reading --prompt-file {}", path.display()))?,
        );
    }
    parts.extend(cli.prompt);
    let extra_prompt = if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    };

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(design::server::serve(
        cli.path,
        cli.port,
        cli.public,
        allowed,
        extra_prompt,
    ))
}
