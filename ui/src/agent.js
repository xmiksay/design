// Shared WebSocket client for the agent channel.
//
// The backend is a session manager: agents live independently of this socket,
// so a dropped connection (browser closed) does NOT kill them. On reconnect we
// re-`attach` to whatever chats we had open and the backend replays history.
//
// This client knows nothing about the agent's stream-json protocol — it just
// routes framed messages by `op`. `Chat.vue` parses the `output` lines.

import { reactive } from "vue";

const LISTENERS = Symbol("listeners");

function makeClient() {
  const state = reactive({
    connected: false,
    agents: [], // [{ id, agentType, chats }]
  });

  let ws = null;
  let reconnectTimer = null;
  // id → Set<fn(frame)>: per-agent output subscribers (Chat.vue instances).
  const outputSubs = new Map();
  // Console output subscribers (Console.vue).
  const consoleSubs = new Set();
  // ids we want to stay attached to, so we can re-attach after a reconnect.
  const wanted = new Set();
  // one-shot resolvers waiting for the next `spawned` frame.
  const spawnWaiters = [];

  function url() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    ws = new WebSocket(url());
    ws.onopen = () => {
      state.connected = true;
      send({ op: "list" });
      // Re-attach to chats we had open before the drop.
      for (const id of wanted) send({ op: "attach", id });
    };
    ws.onclose = () => {
      state.connected = false;
      scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    ws.onmessage = (ev) => {
      let frame;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      route(frame);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1000);
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function route(frame) {
    switch (frame.op) {
      case "agents":
        state.agents = frame.agents ?? [];
        break;
      case "spawned": {
        const w = spawnWaiters.shift();
        if (w) w(frame.id);
        break;
      }
      case "output":
      case "stderr":
      case "exit": {
        const subs = outputSubs.get(frame.id);
        if (subs) for (const fn of subs) fn(frame);
        break;
      }
      case "console.output":
      case "console.exit":
        for (const fn of consoleSubs) fn(frame);
        break;
      case "error":
        // Surface protocol errors on the console; Chat shows agent-level issues.
        console.warn("[agent]", frame.message);
        break;
      default:
        break;
    }
  }

  // ---- public API ----

  function spawn(agentType = "claude-code", resume = null) {
    return new Promise((resolve) => {
      spawnWaiters.push(resolve);
      const msg = { op: "spawn", agentType };
      if (resume) msg.resume = resume;
      send(msg);
    });
  }

  // Prior Claude transcripts for this workspace, newest first (for "resume past
  // chat"). REST, not WS — it's an on-demand query, not part of the live stream.
  async function listSessions() {
    try {
      const res = await fetch("/api/sessions", { credentials: "same-origin" });
      if (res.ok) return (await res.json()).sessions ?? [];
    } catch {
      /* dev mode without server */
    }
    return [];
  }

  function attach(id) {
    wanted.add(id);
    send({ op: "attach", id });
  }

  function detach(id) {
    wanted.delete(id);
    send({ op: "detach", id });
  }

  function close(id) {
    wanted.delete(id);
    send({ op: "close", id });
  }

  // Send a raw stream-json payload line to an agent's stdin (user message or
  // control_response). The SPA owns the framing; the backend just forwards it.
  function input(id, payload) {
    send({ op: "input", id, payload });
  }

  function onOutput(id, fn) {
    let subs = outputSubs.get(id);
    if (!subs) {
      subs = new Set();
      outputSubs.set(id, subs);
    }
    subs.add(fn);
    return () => {
      const s = outputSubs.get(id);
      if (s) {
        s.delete(fn);
        if (s.size === 0) outputSubs.delete(id);
      }
    };
  }

  function refresh() {
    send({ op: "list" });
  }

  // ---- console ----

  function consoleRun(command) {
    send({ op: "console.run", command });
  }
  function consoleKill() {
    send({ op: "console.kill" });
  }
  function onConsole(fn) {
    consoleSubs.add(fn);
    return () => consoleSubs.delete(fn);
  }

  return {
    state,
    connect,
    spawn,
    listSessions,
    attach,
    detach,
    close,
    input,
    onOutput,
    refresh,
    consoleRun,
    consoleKill,
    onConsole,
  };
}

// Single shared instance for the whole SPA.
export const agentClient = makeClient();
