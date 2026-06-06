//! Agent session manager + WebSocket multiplexer.
//!
//! The backend owns long-lived agent processes keyed by UUID, **decoupled from
//! any socket**: closing the browser detaches but does not kill; only an
//! explicit `close` op terminates a process. A WebSocket is just a multiplexed
//! transport — every data frame carries the agent UUID, and one socket can
//! attach to several agents.
//!
//! The backend stays **agent-protocol-agnostic**: it never parses the agent's
//! stream-json. Each `AgentSession`'s stdout/stderr is shuttled verbatim as
//! opaque lines (to a bounded history buffer + a broadcast), and client input is
//! written verbatim to stdin. Only [`AgentSpec`] knows how to *spawn* each agent
//! type; the SPA owns all protocol knowledge.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;
use uuid::Uuid;

/// Cap on per-session replay history (output + stderr frames).
const HISTORY_MAX: usize = 5000;

/// System prompt injected at spawn so every agent shares one consistent,
/// substrate-focused framing — independent of whatever `CLAUDE.md` the workspace
/// happens to carry. **Appended**, not replaced: Claude Code's built-in tool and
/// safety guidance must stay intact, so we only layer the `design`-tool role on
/// top. The text lives in `prompts/design_system_prompt.md` and is baked into the
/// binary at compile time via `include_str!` (edit the `.md`, not this line).
const DESIGN_SYSTEM_PROMPT: &str = include_str!("prompts/design_system_prompt.md");

// ---- Agent kinds + spawn spec --------------------------------------------

/// Supported agent kinds. New kinds are new variants — no protocol knowledge
/// leaks into the backend.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentType {
    ClaudeCode,
}

impl AgentType {
    fn from_wire(s: &str) -> Option<Self> {
        match s {
            "claude-code" | "claude" => Some(Self::ClaudeCode),
            _ => None,
        }
    }
    fn wire(self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude-code",
        }
    }
}

/// How to launch an agent: just a program + args. The backend shuttles bytes.
struct AgentSpec {
    program: String,
    args: Vec<String>,
}

impl AgentSpec {
    fn for_type(
        t: AgentType,
        allowed: &[String],
        resume: Option<&str>,
        extra_prompt: Option<&str>,
    ) -> Self {
        match t {
            AgentType::ClaudeCode => Self::claude(allowed, resume, extra_prompt),
        }
    }

    /// Claude Code in long-lived streaming-input relay mode. `--permission-prompt-tool
    /// stdio` routes tool-permission prompts over the stdio control protocol
    /// (captured as `control_request` lines the SPA answers with `control_response`);
    /// `--allowedTools` pre-approves the user's rule set so prompts stay rare.
    /// When `resume` is set, `--resume <id>` reattaches to a prior session for this
    /// workspace (the transcript is seeded separately, see [`seed_history`]).
    fn claude(allowed: &[String], resume: Option<&str>, extra_prompt: Option<&str>) -> Self {
        // Our built-in role, plus the user's launch-time extension (`--prompt`/
        // `--prompt-file`) when given — the whole thing is appended to Claude
        // Code's default system prompt.
        let mut system = DESIGN_SYSTEM_PROMPT.to_string();
        if let Some(extra) = extra_prompt.map(str::trim).filter(|s| !s.is_empty()) {
            system.push_str("\n\n");
            system.push_str(extra);
        }
        let mut args = vec![
            "-p".into(),
            "--input-format".into(),
            "stream-json".into(),
            "--output-format".into(),
            "stream-json".into(),
            "--verbose".into(),
            "--include-partial-messages".into(),
            "--replay-user-messages".into(),
            "--permission-prompt-tool".into(),
            "stdio".into(),
            "--permission-mode".into(),
            "default".into(),
            // Layer the substrate-focused role on top of Claude Code's defaults.
            "--append-system-prompt".into(),
            system,
        ];
        // Pre-approve the user's rule set so tool prompts stay rare. The live
        // preview is driven by a text marker the agent writes (parsed by the SPA),
        // so no MCP tool or extra allowlist entry is needed.
        if !allowed.is_empty() {
            args.push("--allowedTools".into());
            args.push(allowed.join(","));
        }
        if let Some(id) = resume {
            args.push("--resume".into());
            args.push(id.to_string());
        }
        Self {
            program: "claude".into(),
            args,
        }
    }
}

// ---- Claude session discovery (for "resume past chat") -------------------

/// Public view of a resumable Claude session on disk, for the sessions list.
#[derive(Serialize)]
struct SessionInfo {
    id: String,
    /// Human label: Claude's auto-generated `ai-title`, else the first prompt.
    title: String,
    /// Last-modified, seconds since the Unix epoch (for sorting + display).
    mtime: u64,
}

/// Claude Code stores per-project transcripts under
/// `~/.claude/projects/<encoded>/`, where `<encoded>` is the workspace's absolute
/// path with every `/` and `.` turned into `-`.
fn claude_project_dir(workspace: &std::path::Path) -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let encoded: String = workspace
        .to_string_lossy()
        .chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect();
    Some(PathBuf::from(home).join(".claude/projects").join(encoded))
}

/// Best-effort label for a session file: the latest `ai-title`, else the first
/// user prompt (truncated), else `None`.
fn session_title(path: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut title = None;
    let mut first_user = None;
    for line in content.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        match v.get("type").and_then(Value::as_str) {
            Some("ai-title") => {
                if let Some(t) = v.get("aiTitle").and_then(Value::as_str) {
                    title = Some(t.to_string());
                }
            }
            Some("user") if first_user.is_none() => {
                if let Some(s) = v.get("message").and_then(|m| m.get("content")).and_then(Value::as_str) {
                    first_user = Some(s.chars().take(80).collect::<String>());
                }
            }
            _ => {}
        }
    }
    title.or(first_user)
}

/// Seed a fresh session's replay history from a prior transcript on disk, so a
/// resumed chat repaints. The `.jsonl`'s `user`/`assistant` lines are already in
/// the SPA's stream-json shape, so they are forwarded verbatim (sidechains and
/// non-conversation bookkeeping lines are skipped).
fn seed_history(history: &Arc<Mutex<VecDeque<SessionEvent>>>, workspace: &std::path::Path, session_id: &str) {
    let Some(path) = claude_project_dir(workspace).map(|d| d.join(format!("{session_id}.jsonl"))) else {
        return;
    };
    let Ok(content) = std::fs::read_to_string(&path) else { return };
    let mut h = history.lock().unwrap();
    for line in content.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        let t = v.get("type").and_then(Value::as_str).unwrap_or("");
        if !matches!(t, "assistant" | "user") {
            continue;
        }
        if v.get("isSidechain").and_then(Value::as_bool).unwrap_or(false) {
            continue;
        }
        if h.len() >= HISTORY_MAX {
            h.pop_front();
        }
        h.push_back(SessionEvent::Output(line.to_string()));
    }
}

// ---- Session ------------------------------------------------------------

/// One opaque line of agent I/O, fanned out to attached sockets and stored in
/// history for replay on reconnect.
#[derive(Clone)]
enum SessionEvent {
    Output(String),
    Stderr(String),
    Exit(Option<i32>),
}

impl SessionEvent {
    fn to_message(&self, id: Uuid) -> Message {
        let v = match self {
            SessionEvent::Output(l) => json!({ "op": "output", "id": id.to_string(), "line": l }),
            SessionEvent::Stderr(l) => json!({ "op": "stderr", "id": id.to_string(), "line": l }),
            SessionEvent::Exit(code) => json!({ "op": "exit", "id": id.to_string(), "code": code }),
        };
        Message::Text(v.to_string().into())
    }
}

struct AgentSession {
    id: Uuid,
    agent_type: AgentType,
    /// Lines to write to the child's stdin (already-framed stream-json).
    stdin_tx: mpsc::Sender<String>,
    /// Fan-out of `SessionEvent`s to every attached socket.
    out_tx: broadcast::Sender<SessionEvent>,
    /// Bounded replay buffer (output + stderr), so a reconnecting client can
    /// catch up on the conversation.
    history: Arc<Mutex<VecDeque<SessionEvent>>>,
    /// Number of sockets currently attached ("active chats").
    chats: AtomicUsize,
    /// Process-group id (== child pid via `process_group(0)` on Unix).
    pgid: i32,
}

/// Push to history (bounded) and broadcast — **atomically** w.r.t. `subscribe`
/// so a freshly-attached socket sees each event exactly once (no dup, no loss).
fn emit(history: &Arc<Mutex<VecDeque<SessionEvent>>>, out_tx: &broadcast::Sender<SessionEvent>, ev: SessionEvent) {
    let mut h = history.lock().unwrap();
    if h.len() >= HISTORY_MAX {
        h.pop_front();
    }
    h.push_back(ev.clone());
    let _ = out_tx.send(ev); // Err only when there are no subscribers — fine.
}

/// Public, JSON-friendly view of an agent for the `agents` list frame.
#[derive(Serialize)]
struct AgentInfo {
    id: String,
    #[serde(rename = "agentType")]
    agent_type: &'static str,
    chats: usize,
}

// ---- Manager ------------------------------------------------------------

/// Owns the live agent processes. Cheaply cloneable (everything is behind an
/// `Arc`); stored in `AppState`.
#[derive(Clone)]
pub struct AgentManager {
    agents: Arc<Mutex<HashMap<Uuid, Arc<AgentSession>>>>,
    workspace: Arc<PathBuf>,
    allowed: Arc<Vec<String>>,
    /// User-supplied system-prompt extension (`--prompt`/`--prompt-file`), appended
    /// to the built-in design prompt for every agent. `None` when not provided.
    extra_prompt: Option<Arc<String>>,
    /// Ticks whenever the registry changes, so every socket re-sends the list.
    registry_tx: broadcast::Sender<()>,
}

impl AgentManager {
    pub fn new(
        workspace: Arc<PathBuf>,
        allowed: Arc<Vec<String>>,
        extra_prompt: Option<Arc<String>>,
    ) -> Self {
        let (registry_tx, _) = broadcast::channel(16);
        Self {
            agents: Arc::new(Mutex::new(HashMap::new())),
            workspace,
            allowed,
            extra_prompt,
            registry_tx,
        }
    }

    fn notify_registry(&self) {
        let _ = self.registry_tx.send(());
    }

    fn subscribe_registry(&self) -> broadcast::Receiver<()> {
        self.registry_tx.subscribe()
    }

    fn get(&self, id: Uuid) -> Option<Arc<AgentSession>> {
        self.agents.lock().unwrap().get(&id).cloned()
    }

    /// The workspace the agents (and console commands) run in.
    pub(crate) fn workspace(&self) -> Arc<PathBuf> {
        self.workspace.clone()
    }

    /// JSON `{ "agents": [...] }` for the REST endpoint.
    pub fn list_json(&self) -> Value {
        json!({ "agents": self.list() })
    }

    /// JSON `{ "sessions": [...] }` — prior Claude transcripts for this workspace,
    /// newest first, that the SPA can offer to resume.
    pub fn list_sessions_json(&self) -> Value {
        json!({ "sessions": self.list_sessions() })
    }

    fn list_sessions(&self) -> Vec<SessionInfo> {
        let Some(dir) = claude_project_dir(&self.workspace) else {
            return Vec::new();
        };
        let Ok(read) = std::fs::read_dir(&dir) else {
            return Vec::new();
        };
        let mut out: Vec<SessionInfo> = read
            .flatten()
            .filter_map(|e| {
                let path = e.path();
                if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                    return None;
                }
                let id = path.file_stem()?.to_str()?.to_string();
                let mtime = e
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let title = session_title(&path).unwrap_or_else(|| id.clone());
                Some(SessionInfo { id, title, mtime })
            })
            .collect();
        out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
        out
    }

    fn list(&self) -> Vec<AgentInfo> {
        let map = self.agents.lock().unwrap();
        let mut out: Vec<AgentInfo> = map
            .values()
            .map(|s| AgentInfo {
                id: s.id.to_string(),
                agent_type: s.agent_type.wire(),
                chats: s.chats.load(Ordering::Relaxed),
            })
            .collect();
        out.sort_by(|a, b| a.id.cmp(&b.id));
        out
    }

    /// Spawn a new agent process in the workspace and wire up its I/O pumps.
    /// When `resume` is set, reattach to that prior Claude session and seed the
    /// replay history from its transcript so the chat repaints.
    fn spawn(&self, agent_type: AgentType, resume: Option<&str>) -> anyhow::Result<Uuid> {
        let spec = AgentSpec::for_type(
            agent_type,
            &self.allowed,
            resume,
            self.extra_prompt.as_deref().map(String::as_str),
        );

        let mut cmd = Command::new(&spec.program);
        cmd.args(&spec.args)
            .current_dir(self.workspace.as_path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            // New process group so the child + its tool subprocesses share a
            // pgid we can signal as one.
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .with_context(|| format!("failed to spawn `{}` (is it on PATH?)", spec.program))?;
        let pid = child.id().context("spawned child has no pid")? as i32;
        let id = Uuid::new_v4();

        let mut stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(64);
        let (out_tx, _) = broadcast::channel::<SessionEvent>(2048);
        let history = Arc::new(Mutex::new(VecDeque::new()));

        // Pre-fill history from the prior transcript BEFORE the stdout pump starts,
        // so the recovered conversation sits ahead of any fresh output.
        if let Some(sid) = resume {
            seed_history(&history, self.workspace.as_path(), sid);
        }

        let session = Arc::new(AgentSession {
            id,
            agent_type,
            stdin_tx,
            out_tx: out_tx.clone(),
            history: history.clone(),
            chats: AtomicUsize::new(0),
            pgid: pid,
        });

        // stdin writer: drain client input → child stdin (one line each).
        tokio::spawn(async move {
            while let Some(line) = stdin_rx.recv().await {
                if stdin.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                if !line.ends_with('\n') {
                    let _ = stdin.write_all(b"\n").await;
                }
                if stdin.flush().await.is_err() {
                    break;
                }
            }
        });

        // stdout pump: verbatim lines → history + broadcast.
        {
            let history = history.clone();
            let out_tx = out_tx.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit(&history, &out_tx, SessionEvent::Output(line));
                }
            });
        }

        // stderr pump: diagnostics → history + broadcast (tagged distinctly).
        {
            let history = history.clone();
            let out_tx = out_tx.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit(&history, &out_tx, SessionEvent::Stderr(line));
                }
            });
        }

        // waiter: on natural exit, emit Exit and drop the dead agent.
        {
            let manager = self.clone();
            let history = history.clone();
            tokio::spawn(async move {
                let code = child.wait().await.ok().and_then(|s| s.code());
                emit(&history, &out_tx, SessionEvent::Exit(code));
                manager.remove(id);
            });
        }

        self.agents.lock().unwrap().insert(id, session);
        self.notify_registry();
        tracing::info!(%id, kind = agent_type.wire(), pid, "agent spawned");
        Ok(id)
    }

    /// Remove an agent from the registry (used by the waiter on natural exit).
    fn remove(&self, id: Uuid) {
        if self.agents.lock().unwrap().remove(&id).is_some() {
            self.notify_registry();
            tracing::info!(%id, "agent removed");
        }
    }

    /// Terminate an agent immediately (explicit "close chat"): kill the whole
    /// process group, then drop it. The waiter emits the Exit frame.
    fn close(&self, id: Uuid) {
        let removed = self.agents.lock().unwrap().remove(&id);
        if let Some(session) = removed {
            kill_group(session.pgid);
            self.notify_registry();
            tracing::info!(%id, "agent closed");
        }
    }

    /// Kill every agent (server shutdown) so nothing is orphaned.
    pub fn kill_all(&self) {
        let map = std::mem::take(&mut *self.agents.lock().unwrap());
        for (_, session) in map {
            kill_group(session.pgid);
        }
    }
}

/// SIGKILL the whole process group (child + tool subprocesses). `pgid == pid`
/// because the child was started with `process_group(0)`.
pub(crate) fn kill_group(pgid: i32) {
    #[cfg(unix)]
    unsafe {
        // SIGTERM first for a chance to flush, then SIGKILL to guarantee death.
        libc::killpg(pgid, libc::SIGTERM);
        libc::killpg(pgid, libc::SIGKILL);
    }
    #[cfg(not(unix))]
    {
        let _ = pgid; // best-effort handled by kill_on_drop on non-Unix.
    }
}

// ---- WebSocket multiplexer ----------------------------------------------

/// JSON `{op:"agents", agents:[…]}` snapshot frame.
fn agents_message(manager: &AgentManager) -> Message {
    let v = json!({ "op": "agents", "agents": manager.list() });
    Message::Text(v.to_string().into())
}

fn simple_message(op: &str, id: Uuid) -> Message {
    Message::Text(json!({ "op": op, "id": id.to_string() }).to_string().into())
}

fn error_message(msg: &str) -> Message {
    Message::Text(json!({ "op": "error", "message": msg }).to_string().into())
}

/// Serve one WebSocket: a multiplexed control + data channel over the agent
/// registry. Attachments are per-socket and torn down on disconnect — agents
/// keep running.
pub async fn serve_socket(socket: WebSocket, manager: AgentManager) {
    let (mut sink, mut stream) = socket.split();

    // All writes to the sink funnel through one mpsc so forward tasks, control
    // replies and the registry ticker never race on the sink.
    let (tx, mut rx) = mpsc::channel::<Message>(512);
    let writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
    });

    // id → forward task pumping that agent's broadcast into `tx`.
    let mut attachments: HashMap<Uuid, JoinHandle<()>> = HashMap::new();
    // The console command currently running on this socket (if any).
    let mut console: Option<crate::console::ConsoleRun> = None;
    let workspace = manager.workspace();
    let mut registry = manager.subscribe_registry();

    // First paint: current agents list.
    let _ = tx.send(agents_message(&manager)).await;

    loop {
        tokio::select! {
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(t))) => {
                        handle_client_frame(&t, &manager, &tx, &mut attachments, workspace.as_path(), &mut console).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {} // ignore binary / ping / pong
                    Some(Err(_)) => break,
                }
            }
            _ = registry.recv() => {
                let _ = tx.send(agents_message(&manager)).await;
            }
        }
    }

    // Socket gone: kill any console command (it is tied to this socket)...
    if let Some(run) = console.as_ref() {
        if run.is_alive() {
            run.kill();
        }
    }
    // ...and detach every agent (never kills the child), update counts.
    let had_attachments = !attachments.is_empty();
    for (id, handle) in attachments.drain() {
        handle.abort();
        if let Some(s) = manager.get(id) {
            s.chats.fetch_sub(1, Ordering::Relaxed);
        }
    }
    if had_attachments {
        manager.notify_registry();
    }
    drop(tx);
    let _ = writer.await;
}

async fn handle_client_frame(
    text: &str,
    manager: &AgentManager,
    tx: &mpsc::Sender<Message>,
    attachments: &mut HashMap<Uuid, JoinHandle<()>>,
    workspace: &std::path::Path,
    console: &mut Option<crate::console::ConsoleRun>,
) {
    let Ok(frame) = serde_json::from_str::<Value>(text) else {
        let _ = tx.send(error_message("invalid JSON frame")).await;
        return;
    };
    let op = frame.get("op").and_then(Value::as_str).unwrap_or("");

    match op {
        "console.run" => {
            let command = frame.get("command").and_then(Value::as_str).unwrap_or("").trim();
            if command.is_empty() {
                let _ = tx.send(error_message("console.run: empty command")).await;
                return;
            }
            if console.as_ref().is_some_and(|c| c.is_alive()) {
                let _ = tx.send(error_message("a command is already running")).await;
                return;
            }
            match crate::console::run(command, workspace, tx.clone()) {
                Ok(run) => *console = Some(run),
                Err(e) => {
                    let _ = tx.send(error_message(&format!("console spawn failed: {e}"))).await;
                }
            }
        }
        "console.kill" => {
            if let Some(run) = console.as_ref() {
                run.kill();
            }
        }
        "list" => {
            let _ = tx.send(agents_message(manager)).await;
        }
        "spawn" => {
            let kind = frame
                .get("agentType")
                .and_then(Value::as_str)
                .unwrap_or("claude-code");
            let resume = frame.get("resume").and_then(Value::as_str);
            match AgentType::from_wire(kind) {
                Some(t) => match manager.spawn(t, resume) {
                    Ok(id) => {
                        let _ = tx.send(simple_message("spawned", id)).await;
                    }
                    Err(e) => {
                        let _ = tx.send(error_message(&format!("spawn failed: {e}"))).await;
                    }
                },
                None => {
                    let _ = tx
                        .send(error_message(&format!("unknown agentType: {kind}")))
                        .await;
                }
            }
        }
        "attach" => {
            let Some(id) = frame_id(&frame) else {
                let _ = tx.send(error_message("attach: missing/invalid id")).await;
                return;
            };
            if attachments.contains_key(&id) {
                return; // already attached
            }
            let Some(session) = manager.get(id) else {
                let _ = tx.send(error_message("attach: no such agent")).await;
                return;
            };
            // Subscribe + snapshot history under one lock so the replay and the
            // live stream join seamlessly (see `emit`).
            let (mut sub, snapshot) = {
                let hist = session.history.lock().unwrap();
                let sub = session.out_tx.subscribe();
                let snapshot: Vec<SessionEvent> = hist.iter().cloned().collect();
                (sub, snapshot)
            };
            for ev in &snapshot {
                let _ = tx.send(ev.to_message(id)).await;
            }
            session.chats.fetch_add(1, Ordering::Relaxed);

            let tx2 = tx.clone();
            let handle = tokio::spawn(async move {
                loop {
                    match sub.recv().await {
                        Ok(ev) => {
                            if tx2.send(ev.to_message(id)).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
            attachments.insert(id, handle);
            let _ = tx.send(simple_message("attached", id)).await;
            manager.notify_registry();
        }
        "detach" => {
            let Some(id) = frame_id(&frame) else { return };
            if let Some(handle) = attachments.remove(&id) {
                handle.abort();
                if let Some(s) = manager.get(id) {
                    s.chats.fetch_sub(1, Ordering::Relaxed);
                }
                let _ = tx.send(simple_message("detached", id)).await;
                manager.notify_registry();
            }
        }
        "input" => {
            let Some(id) = frame_id(&frame) else {
                let _ = tx.send(error_message("input: missing/invalid id")).await;
                return;
            };
            let Some(payload) = frame.get("payload") else {
                let _ = tx.send(error_message("input: missing payload")).await;
                return;
            };
            match manager.get(id) {
                Some(session) => {
                    let line = payload.to_string();
                    if session.stdin_tx.send(line).await.is_err() {
                        let _ = tx.send(error_message("input: agent not accepting input")).await;
                    }
                }
                None => {
                    let _ = tx.send(error_message("input: no such agent")).await;
                }
            }
        }
        "close" => {
            let Some(id) = frame_id(&frame) else { return };
            if let Some(handle) = attachments.remove(&id) {
                handle.abort();
            }
            manager.close(id);
            let _ = tx.send(simple_message("closed", id)).await;
        }
        other => {
            let _ = tx.send(error_message(&format!("unknown op: {other}"))).await;
        }
    }
}

fn frame_id(frame: &Value) -> Option<Uuid> {
    frame
        .get("id")
        .and_then(Value::as_str)
        .and_then(|s| Uuid::parse_str(s).ok())
}
