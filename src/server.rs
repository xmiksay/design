//! Localhost-only HTTP server: serves the embedded Vue driver SPA and the
//! workspace's built preview, behind three layers of defense:
//!
//! 1. **Loopback bind** — only `127.0.0.1` (never `0.0.0.0`).
//! 2. **Host + Origin checks** — block DNS-rebinding and cross-site requests.
//! 3. **Per-launch token** — a random token, accepted once via `?t=…` on the
//!    initial navigation, then pinned to a `Strict` cookie for the session.
//!
//! The runner (Phase 2) and the prompt→diff loop (Phase 3) hang off this server;
//! today it only serves static content into the live-view iframe.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Context;
use axum::body::Body;
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::http::{header, HeaderValue, Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tower_http::services::ServeDir;

use crate::agent::AgentManager;
use crate::embed::Spa;

const COOKIE_NAME: &str = "design_token";

/// Directories never shown in the file browser or walked.
const IGNORED_DIRS: &[&str] = &[".git", "node_modules", "target", ".DS_Store"];

/// Max bytes returned by the file-read endpoint.
const MAX_FILE_BYTES: usize = 512 * 1024;

/// Shared, cheaply-cloneable request context.
#[derive(Clone)]
struct AppState {
    /// Per-launch secret required to authorize requests.
    token: String,
    /// Acceptable `Origin` values (loopback only).
    origins: Vec<String>,
    /// Acceptable `Host` authorities (loopback only).
    hosts: Vec<String>,
    /// Canonical absolute path of the workspace being served.
    root: Arc<PathBuf>,
    /// Display string for the workspace path (shown in the SPA).
    workspace_label: String,
    /// Live agent processes, keyed by UUID (decoupled from sockets).
    agents: AgentManager,
}

/// Run the server against `workspace` until Ctrl-C. Binds a random loopback port
/// and prints the tokenized URL to open. `allowed` is the tool-permission rule
/// set pre-approved for spawned agents (passed through to `--allowedTools`).
pub async fn serve(workspace: PathBuf, allowed: Vec<String>) -> anyhow::Result<()> {
    let workspace = workspace
        .canonicalize()
        .with_context(|| format!("workspace not found: {}", workspace.display()))?;
    // The tool is folder-agnostic — any directory works. `preview/index.html` is
    // only the *default* live-view address (the address bar is editable), so a
    // missing preview/ is a hint, not an error.
    if !workspace.join("preview").is_dir() {
        tracing::warn!(
            "no preview/ in {} — the live view defaults to preview/index.html; \
             point the address bar at whatever you want to preview",
            workspace.display()
        );
    }

    let listener = tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
        .await
        .context("binding loopback socket")?;
    let port = listener.local_addr()?.port();
    let token = uuid::Uuid::new_v4().simple().to_string();

    let root = Arc::new(workspace.clone());
    let agents = AgentManager::new(root.clone(), Arc::new(allowed));

    let state = AppState {
        token: token.clone(),
        origins: vec![
            format!("http://127.0.0.1:{port}"),
            format!("http://localhost:{port}"),
        ],
        hosts: vec![format!("127.0.0.1:{port}"), format!("localhost:{port}")],
        root,
        workspace_label: workspace.display().to_string(),
        agents: agents.clone(),
    };

    let app = Router::new()
        .route("/api/tree", get(tree_handler))
        .route("/api/file", get(file_handler))
        .route("/api/agents", get(agents_handler))
        // Multiplexed agent channel. Behind the security layer (below), so the
        // upgrade is authenticated by the same cookie/token + Host/Origin gate.
        .route("/ws", get(ws_handler))
        // Raw workspace files served with their guessed mime: this is what the
        // live-view iframe points at, so any file (e.g. preview/index.html) can
        // be used as an address. ServeDir confines access to the workspace root.
        .nest_service("/raw", ServeDir::new(workspace.as_path()))
        .fallback(spa_handler)
        .layer(middleware::from_fn_with_state(state.clone(), security))
        .with_state(state);

    let url = format!("http://127.0.0.1:{port}/?t={token}");
    tracing::info!(%url, workspace = %workspace.display(), "design server listening");
    println!("\n  design → {url}\n");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")?;

    // Reap every spawned agent (and its tool subprocesses) on exit.
    agents.kill_all();
    tracing::info!("server stopped");
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("ctrl-c received, shutting down");
}

/// Security gate: loopback Host/Origin enforcement plus per-launch token.
async fn security(State(state): State<AppState>, req: Request<Body>, next: Next) -> Response {
    // DNS-rebinding guard: the Host must be a loopback authority we bound.
    if let Some(host) = header_str(&req, header::HOST) {
        if !state.hosts.iter().any(|h| h == host) {
            return forbidden("unexpected Host");
        }
    }
    // Cross-site guard: when an Origin is present it must be ours.
    if let Some(origin) = header_str(&req, header::ORIGIN) {
        if !state.origins.iter().any(|o| o == origin) {
            return forbidden("unexpected Origin");
        }
    }

    let query_token = query_param(req.uri(), "t");
    let cookie_token = cookie_value(&req, COOKIE_NAME);
    let via_query = query_token.as_deref() == Some(state.token.as_str());
    let authorized = via_query || cookie_token.as_deref() == Some(state.token.as_str());

    if !authorized {
        return forbidden("missing or invalid token");
    }

    let mut resp = next.run(req).await;
    // On first valid `?t=…` navigation, pin the token to a Strict cookie so
    // subsequent asset/preview requests carry it automatically.
    if via_query {
        if let Ok(cookie) = HeaderValue::from_str(&format!(
            "{COOKIE_NAME}={}; Path=/; SameSite=Strict; HttpOnly",
            state.token
        )) {
            resp.headers_mut().append(header::SET_COOKIE, cookie);
        }
    }
    resp
}

/// Serve the embedded SPA, injecting the bootstrap config into `index.html` and
/// falling back to it for client-side routes.
async fn spa_handler(uri: Uri, State(state): State<AppState>) -> Response {
    let path = uri.path().trim_start_matches('/');
    let asset = if path.is_empty() { "index.html" } else { path };

    if asset == "index.html" {
        return index_html(&state);
    }
    match Spa::get(asset) {
        Some(file) => {
            let mime = mime_guess::from_path(asset).first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref())],
                file.data.into_owned(),
            )
                .into_response()
        }
        // Unknown path → SPA fallback (client routing).
        None => index_html(&state),
    }
}

/// Render `index.html` with the `window.__DESIGN__` bootstrap injected.
fn index_html(state: &AppState) -> Response {
    let Some(file) = Spa::get("index.html") else {
        return (StatusCode::INTERNAL_SERVER_ERROR, "SPA not built (run: cd ui && npm run build)")
            .into_response();
    };
    let html = String::from_utf8_lossy(&file.data);
    let boot = serde_json::json!({
        "workspace": state.workspace_label,
        // Workspace-relative path the live-view iframe opens by default; the SPA
        // prefixes it with /raw/ and lets the user edit it.
        "previewPath": "preview/index.html",
    });
    let inject = format!("<script>window.__DESIGN__={boot};</script>");
    let html = match html.split_once("</head>") {
        Some((head, rest)) => format!("{head}{inject}</head>{rest}"),
        None => format!("{inject}{html}"),
    };
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response()
}

// ---- Agent API -----------------------------------------------------------

/// GET `/api/agents` — JSON list of live agents (mirrors the WS `agents` frame
/// for first paint before the socket opens).
async fn agents_handler(State(state): State<AppState>) -> Response {
    Json(state.agents.list_json()).into_response()
}

/// GET `/ws` — upgrade to the multiplexed agent channel. Already authenticated
/// by the `security` layer (cookie/token + Host/Origin) on the handshake.
async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| crate::agent::serve_socket(socket, state.agents))
}

// ---- File browser API ----------------------------------------------------

/// A node in the workspace file tree.
#[derive(Serialize)]
struct FileNode {
    name: String,
    /// Workspace-relative path with `/` separators.
    path: String,
    /// `"dir"` or `"file"`.
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
}

/// GET `/api/tree` — the workspace file tree (ignored dirs pruned).
async fn tree_handler(State(state): State<AppState>) -> Response {
    match build_tree(&state.root, &state.root) {
        Ok(children) => Json(FileNode {
            name: state
                .root
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| ".".into()),
            path: String::new(),
            kind: "dir",
            children: Some(children),
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(%err, "tree walk failed");
            (StatusCode::INTERNAL_SERVER_ERROR, "tree walk failed").into_response()
        }
    }
}

fn build_tree(root: &Path, dir: &Path) -> std::io::Result<Vec<FileNode>> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)?.filter_map(Result::ok).collect();
    entries.sort_by_key(|e| e.file_name());
    let mut nodes = Vec::new();
    // Directories first, then files — both alphabetical.
    for want_dir in [true, false] {
        for entry in &entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') && name != ".gitignore" {
                continue;
            }
            let is_dir = entry.path().is_dir();
            if is_dir != want_dir {
                continue;
            }
            if is_dir && IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            let rel = entry
                .path()
                .strip_prefix(root)
                .unwrap_or(&entry.path())
                .to_string_lossy()
                .replace('\\', "/");
            nodes.push(FileNode {
                name,
                path: rel,
                kind: if is_dir { "dir" } else { "file" },
                children: if is_dir {
                    Some(build_tree(root, &entry.path())?)
                } else {
                    None
                },
            });
        }
    }
    Ok(nodes)
}

#[derive(Deserialize)]
struct FileQuery {
    path: String,
}

#[derive(Serialize)]
struct FileContent {
    path: String,
    content: String,
    truncated: bool,
}

/// GET `/api/file?path=…` — read a workspace file as text. Path-traversal safe:
/// the resolved path must stay within the workspace root.
async fn file_handler(Query(q): Query<FileQuery>, State(state): State<AppState>) -> Response {
    let candidate = state.root.join(&q.path);
    let resolved = match candidate.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "no such file").into_response(),
    };
    if !resolved.starts_with(state.root.as_path()) {
        return forbidden("path escapes workspace");
    }
    if !resolved.is_file() {
        return (StatusCode::BAD_REQUEST, "not a file").into_response();
    }
    let bytes = match std::fs::read(&resolved) {
        Ok(b) => b,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response(),
    };
    let truncated = bytes.len() > MAX_FILE_BYTES;
    let slice = &bytes[..bytes.len().min(MAX_FILE_BYTES)];
    let content = String::from_utf8_lossy(slice).into_owned();
    Json(FileContent {
        path: q.path,
        content,
        truncated,
    })
    .into_response()
}

fn forbidden(reason: &str) -> Response {
    (StatusCode::FORBIDDEN, format!("forbidden: {reason}")).into_response()
}

fn header_str<'a>(req: &'a Request<Body>, name: header::HeaderName) -> Option<&'a str> {
    req.headers().get(name).and_then(|v| v.to_str().ok())
}

fn query_param(uri: &Uri, key: &str) -> Option<String> {
    uri.query()?.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

fn cookie_value(req: &Request<Body>, name: &str) -> Option<String> {
    let cookies = header_str(req, header::COOKIE)?;
    cookies.split(';').find_map(|c| {
        let (k, v) = c.trim().split_once('=')?;
        (k == name).then(|| v.to_string())
    })
}
