//! Minimal stdio MCP server that the `design` tool registers with Claude Code
//! (via `--mcp-config`). It speaks JSON-RPC 2.0 over stdio — newline-delimited,
//! the MCP stdio transport — and exposes tools that drive the running design UI
//! by POSTing to the server's loopback API.
//!
//! Spawned as `design --mcp`; reads `DESIGN_PORT` + `DESIGN_TOKEN` from the env
//! (injected by the parent server when it spawns the agent). **stdout is the
//! protocol channel** and must carry only JSON-RPC — all diagnostics go to stderr.
//!
//! Adding a tool: extend [`tools_list`] with its schema and add a match arm in
//! [`handle_call`]. The bridge ([`Bridge::post`]) is the generic way to reach the
//! server, so most new commands are just "describe + POST to a new endpoint".

use std::io::{BufRead, Read, Write};

use anyhow::Context;
use serde_json::{json, Value};

/// Loopback bridge back to the running `design` server.
struct Bridge {
    port: u16,
    token: String,
}

impl Bridge {
    /// From the env vars the parent injects into the MCP server's environment.
    fn from_env() -> Option<Self> {
        let port = std::env::var("DESIGN_PORT").ok()?.parse().ok()?;
        let token = std::env::var("DESIGN_TOKEN").ok()?;
        Some(Self { port, token })
    }

    /// One-shot HTTP/1.1 POST of `body` to a loopback API path, authorized by the
    /// per-launch token in the query string (the same gate the SPA uses). Raw
    /// sockets keep this dependency-free.
    fn post(&self, path: &str, body: &Value) -> anyhow::Result<()> {
        let body = body.to_string();
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", self.port))
            .with_context(|| format!("connect 127.0.0.1:{}", self.port))?;
        let req = format!(
            "POST {path}?t={token} HTTP/1.1\r\n\
             Host: 127.0.0.1:{port}\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {len}\r\n\
             Connection: close\r\n\r\n{body}",
            token = self.token,
            port = self.port,
            len = body.len(),
        );
        stream.write_all(req.as_bytes())?;
        let mut resp = String::new();
        stream.read_to_string(&mut resp)?;
        let status = resp.lines().next().unwrap_or("");
        if !status.contains(" 200") {
            anyhow::bail!("server returned: {status}");
        }
        Ok(())
    }
}

/// Run the stdio MCP server until stdin closes. Blocking std I/O — this runs as a
/// short-lived child process, no async runtime needed.
pub fn run() -> anyhow::Result<()> {
    let bridge = Bridge::from_env();
    if bridge.is_none() {
        eprintln!("design --mcp: DESIGN_PORT/DESIGN_TOKEN unset; tools will error");
    }

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(line) else {
            continue; // ignore malformed frames
        };
        if let Some(resp) = handle(&req, bridge.as_ref()) {
            writeln!(out, "{resp}")?;
            out.flush()?;
        }
    }
    Ok(())
}

/// Dispatch one JSON-RPC request. Returns `None` for notifications (no `id`), for
/// which the protocol forbids a response.
fn handle(req: &Value, bridge: Option<&Bridge>) -> Option<Value> {
    let id = req.get("id").cloned();
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    match method {
        "initialize" => id.map(|id| result(id, initialize_result(req))),
        "tools/list" => id.map(|id| result(id, json!({ "tools": tools_list() }))),
        "tools/call" => id.map(|id| handle_call(id, req.get("params"), bridge)),
        "ping" => id.map(|id| result(id, json!({}))),
        // notifications/initialized, notifications/cancelled, … → no id → no reply.
        _ => id.map(|id| error(id, -32601, &format!("method not found: {method}"))),
    }
}

fn initialize_result(req: &Value) -> Value {
    // Echo the client's protocol version (a version we can speak), else a default.
    let version = req
        .get("params")
        .and_then(|p| p.get("protocolVersion"))
        .cloned()
        .unwrap_or_else(|| json!("2025-06-18"));
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "design", "version": env!("CARGO_PKG_VERSION") },
    })
}

/// The tool catalogue advertised to the agent. New tools are new entries here.
fn tools_list() -> Value {
    json!([
        {
            "name": "show_preview",
            "description": "Switch the design tool's live preview pane to a workspace file and bring it to the front. Use it after you change something visual so the person immediately sees the result. Pass a workspace-relative path such as \"preview/index.html\"; a leading \"/raw/\" is accepted and stripped.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative path to show in the live preview, e.g. preview/index.html"
                    }
                },
                "required": ["path"]
            }
        }
    ])
}

fn handle_call(id: Value, params: Option<&Value>, bridge: Option<&Bridge>) -> Value {
    let name = params
        .and_then(|p| p.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let args = params
        .and_then(|p| p.get("arguments"))
        .cloned()
        .unwrap_or_else(|| json!({}));

    match name {
        "show_preview" => match show_preview(&args, bridge) {
            Ok(msg) => tool_result(id, &msg, false),
            Err(e) => tool_result(id, &format!("show_preview failed: {e}"), true),
        },
        other => tool_result(id, &format!("unknown tool: {other}"), true),
    }
}

fn show_preview(args: &Value, bridge: Option<&Bridge>) -> anyhow::Result<String> {
    let raw = args
        .get("path")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if raw.is_empty() {
        anyhow::bail!("missing `path`");
    }
    // Accept both "preview/index.html" and "/raw/preview/index.html".
    let path = raw.trim_start_matches('/');
    let path = path.strip_prefix("raw/").unwrap_or(path);
    let bridge = bridge.context("design bridge not configured (DESIGN_PORT/DESIGN_TOKEN unset)")?;
    bridge.post("/api/preview", &json!({ "path": path }))?;
    Ok(format!("Now showing {path} in the live preview."))
}

// ---- JSON-RPC envelope helpers ------------------------------------------

fn result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// An MCP `tools/call` result: a single text content block, with `isError`.
fn tool_result(id: Value, text: &str, is_error: bool) -> Value {
    result(
        id,
        json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }),
    )
}
