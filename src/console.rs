//! Workspace console: run a shell command in the workspace and stream its
//! output to the browser over the same WebSocket.
//!
//! Each run is one `bash -lc <command>` process in its own process group (so a
//! cancel or socket-close kills the whole tree). Like the agent relay, the
//! backend stays a thin pipe — it just shuttles output lines as frames; the SPA
//! renders the console.

use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use axum::extract::ws::Message;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::agent::kill_group;

/// A running console command. Tied to the socket that started it.
pub struct ConsoleRun {
    pgid: i32,
    alive: Arc<AtomicBool>,
}

impl ConsoleRun {
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }
    /// Kill the command and its descendants.
    pub fn kill(&self) {
        kill_group(self.pgid);
    }
}

fn frame(v: Value) -> Message {
    Message::Text(v.to_string().into())
}

/// Spawn `command` via `bash -lc` in `cwd`, streaming `console.output` frames to
/// `tx` and a final `console.exit` frame when it finishes.
pub fn run(command: &str, cwd: &Path, tx: mpsc::Sender<Message>) -> std::io::Result<ConsoleRun> {
    let mut cmd = Command::new("bash");
    cmd.arg("-lc")
        .arg(command)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);

    let mut child = cmd.spawn()?;
    let pid = child.id().unwrap_or(0) as i32;
    let alive = Arc::new(AtomicBool::new(true));

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let out = {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx
                    .send(frame(json!({ "op": "console.output", "stream": "stdout", "line": l })))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        })
    };
    let err = {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx
                    .send(frame(json!({ "op": "console.output", "stream": "stderr", "line": l })))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        })
    };

    // Waiter: drain both streams first so all output precedes the exit frame.
    {
        let alive = alive.clone();
        tokio::spawn(async move {
            let _ = out.await;
            let _ = err.await;
            let code = child.wait().await.ok().and_then(|s| s.code());
            alive.store(false, Ordering::Relaxed);
            let _ = tx.send(frame(json!({ "op": "console.exit", "code": code }))).await;
        });
    }

    Ok(ConsoleRun { pgid: pid, alive })
}
