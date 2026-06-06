<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import FileTree from "./FileTree.vue";
import Chat from "./Chat.vue";
import Console from "./Console.vue";
import { agentClient } from "./agent.js";
import { computeSelector } from "./selector.js";

// Bootstrap injected by the server (workspace path, default preview path). Falls
// back to sensible defaults when running the SPA standalone via `vite dev`.
const boot = window.__DESIGN__ ?? {};
const workspace = ref(boot.workspace ?? "(dev) ui/");
const defaultPath = boot.previewPath ?? "preview/index.html";

// Tabbed "windows", in order: chat · console · files (browser) ·
// content (file preview) · preview (live preview).
const activeTab = ref("chat");

// Live preview: an editable, workspace-relative address served via /raw/, plus a
// cache-busting timestamp for the iframe. A fresh timestamp on every navigate /
// refresh guarantees a unique URL, so the browser can never serve a stale copy.
const previewPath = ref(defaultPath);
const addressInput = ref(defaultPath);
const reloadKey = ref(0);

function rawUrl(path) {
  return "/raw/" + path.split("/").map(encodeURIComponent).join("/");
}
const previewSrc = computed(() => {
  const base = rawUrl(previewPath.value);
  return reloadKey.value ? `${base}?t=${reloadKey.value}` : base;
});

function navigate() {
  previewPath.value = addressInput.value.trim().replace(/^\/+/, "");
  reloadKey.value = Date.now();
  activeTab.value = "preview";
}
function refreshPreview() {
  reloadKey.value = Date.now();
}

// The agent (via the MCP `show_preview` tool) asks to show a workspace file in
// the live preview. Navigate the iframe there and bring the tab to the front.
function showPreview(path) {
  const p = (path ?? "").trim().replace(/^\/+/, "");
  if (!p) return;
  previewPath.value = p; // watch(previewPath) keeps the address field in sync
  reloadKey.value = Date.now();
  activeTab.value = "preview";
}

// Keep the editable address field in sync whenever the iframe's src changes by
// any path (file-tree "set preview", future programmatic navigation, etc.).
watch(previewPath, (p) => {
  addressInput.value = p;
});

// ---- Object inspect ----
// The iframe serves /raw/ from the same origin, so we can reach into its
// document directly: highlight on hover, and on click capture a CSS selector +
// the preview path and drop them into the chat composer for the agent to act on.
const previewFrame = ref(null);
const chatRef = ref(null);
const inspecting = ref(false);
let inspectCleanup = null;
let highlightEl = null;

function frameDoc() {
  try {
    return previewFrame.value?.contentDocument ?? null;
  } catch {
    return null; // cross-origin address — inspection not available
  }
}

function moveHighlight(el) {
  const doc = el.ownerDocument;
  if (!highlightEl || highlightEl.ownerDocument !== doc) {
    highlightEl = doc.createElement("div");
    highlightEl.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      "z-index:2147483647",
      "background:rgba(74,163,255,0.18)",
      "outline:2px solid #4aa3ff",
      "border-radius:2px",
      "transition:all 40ms ease",
    ].join(";");
    doc.body.appendChild(highlightEl);
  }
  const r = el.getBoundingClientRect();
  Object.assign(highlightEl.style, {
    display: "block",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
}

// The real clicked node. With open shadow roots, `event.target` is retargeted to
// the shadow host; composedPath()[0] reveals the actual element inside the root.
function eventTarget(e) {
  const path = typeof e.composedPath === "function" ? e.composedPath() : null;
  const el = path && path.length ? path[0] : e.target;
  return el && el.nodeType === 1 && el !== highlightEl ? el : null;
}

function onInspectMove(e) {
  const el = eventTarget(e);
  if (el) moveHighlight(el);
}

function onInspectClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const el = eventTarget(e);
  if (el) pickElement(el);
}

async function pickElement(el) {
  const selector = computeSelector(el);
  const path = previewPath.value;
  const text =
    `In the live preview \`/raw/${path}\`, look at the element ` +
    `\`${selector}\`: `;
  inspecting.value = false;
  activeTab.value = "chat";
  if (!selectedAgentId.value) {
    await newChat();
    await nextTick();
  }
  chatRef.value?.appendDraft(text);
}

function startInspect() {
  const doc = frameDoc();
  if (!doc) {
    inspecting.value = false;
    return;
  }
  doc.addEventListener("mousemove", onInspectMove, true);
  doc.addEventListener("click", onInspectClick, true);
  try {
    doc.body.style.cursor = "crosshair";
  } catch {
    /* ignore */
  }
  inspectCleanup = () => {
    doc.removeEventListener("mousemove", onInspectMove, true);
    doc.removeEventListener("click", onInspectClick, true);
    try {
      doc.body.style.cursor = "";
    } catch {
      /* ignore */
    }
    if (highlightEl) {
      highlightEl.remove();
      highlightEl = null;
    }
  };
}

function teardownInspect() {
  if (inspectCleanup) {
    inspectCleanup();
    inspectCleanup = null;
  }
}

watch(inspecting, (on) => {
  teardownInspect();
  if (on) {
    activeTab.value = "preview";
    nextTick(startInspect);
  }
});

// On every iframe load — including in-page link clicks that navigate the iframe
// itself — reflect the iframe's real location back into the address field and
// state, then re-arm inspection if it's active.
function onFrameLoad() {
  syncAddressFromFrame();
  if (inspecting.value) {
    teardownInspect();
    startInspect();
  }
}

function syncAddressFromFrame() {
  try {
    const loc = previewFrame.value?.contentWindow?.location;
    if (!loc) return;
    let p = decodeURIComponent(loc.pathname);
    if (!p.startsWith("/raw/")) return; // off-workspace navigation: leave as-is
    p = p.slice("/raw/".length);
    addressInput.value = p;
    if (previewPath.value !== p) previewPath.value = p;
  } catch {
    /* cross-origin or not yet loaded */
  }
}

// File browser + content state.
const tree = ref(null);
const selectedPath = ref(null);
const fileContent = ref("");
const fileTruncated = ref(false);

// Map a file extension to a highlight.js language.
const EXT_LANG = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", vue: "xml", html: "xml", svg: "xml",
  css: "css", scss: "scss", json: "json", md: "markdown", rs: "rust",
  toml: "toml", yml: "yaml", yaml: "yaml", sh: "bash", py: "python",
};
function extOf(path) {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

// What a click on a file *name* does by default: things the iframe can render go
// to the live preview; textual/code files open in the source editor; everything
// else (fonts, binaries) has no default action — use the row's icons instead.
const PREVIEW_EXT = new Set([
  "html", "htm", "pdf",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp",
]);
const TEXT_EXT = new Set([
  ...Object.keys(EXT_LANG),
  "txt", "text", "csv", "tsv", "log", "xml", "map", "lock", "ini", "conf",
  "cfg", "env", "gitignore", "editorconfig", "mjs", "cjs",
]);
function defaultActionFor(path) {
  const e = extOf(path);
  if (PREVIEW_EXT.has(e)) return "preview";
  if (TEXT_EXT.has(e)) return "content";
  return null; // fonts, binaries, unknown: no default action
}
const highlighted = computed(() => {
  if (!selectedPath.value) return "";
  const lang = EXT_LANG[extOf(selectedPath.value)];
  try {
    return lang && hljs.getLanguage(lang)
      ? hljs.highlight(fileContent.value, { language: lang }).value
      : hljs.highlightAuto(fileContent.value).value;
  } catch {
    return hljs.highlightAuto(fileContent.value).value;
  }
});

async function loadTree() {
  try {
    const res = await fetch("/api/tree", { credentials: "same-origin" });
    if (res.ok) tree.value = await res.json();
  } catch {
    /* dev mode without server: tree stays null */
  }
}

// Re-fetch the tree every time the File browser tab is activated, so files the
// agent created/removed while another tab was up show up without a page reload.
watch(activeTab, (tab) => {
  if (tab === "files") loadTree();
});

// `mode` is "content" (source editor), "preview" (live preview), or "default"
// (resolve from the file type). A name click sends "default"; the row icons send
// an explicit mode.
async function openFile(path, mode = "default") {
  if (mode === "default") mode = defaultActionFor(path);
  if (!mode) return; // no default action for this file type

  selectedPath.value = path;
  if (mode === "preview") {
    addressInput.value = path;
    navigate();
    return;
  }
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = await res.json();
    fileContent.value = data.content;
    fileTruncated.value = data.truncated;
    activeTab.value = "content";
  } catch {
    /* ignore */
  }
}

// ---- Agent chats ----
// The backend owns the agent processes; this is just the switcher. Agents
// survive a page reload (we re-list + re-attach on connect).
const agents = computed(() => agentClient.state.agents);
const connected = computed(() => agentClient.state.connected);
const selectedAgentId = ref(null);
const newAgentType = ref("claude-code");

async function newChat() {
  const id = await agentClient.spawn(newAgentType.value);
  if (id) selectedAgentId.value = id;
}

// ---- Resume past chats (Claude transcripts bound to this workspace) ----
const sessions = ref([]);
const showResume = ref(false);
const loadingSessions = ref(false);

async function toggleResume() {
  showResume.value = !showResume.value;
  if (showResume.value) {
    loadingSessions.value = true;
    sessions.value = await agentClient.listSessions();
    loadingSessions.value = false;
  }
}

async function resumeChat(id) {
  showResume.value = false;
  const newId = await agentClient.spawn("claude-code", id);
  if (newId) selectedAgentId.value = newId;
}

// Compact "3h ago" style age from a Unix-seconds timestamp.
function ago(secs) {
  if (!secs) return "";
  const d = Math.max(0, Math.floor(Date.now() / 1000) - secs);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
function selectChat(id) {
  selectedAgentId.value = id;
}
function closeChat(id) {
  agentClient.close(id);
  if (selectedAgentId.value === id) selectedAgentId.value = null;
}
function shortId(id) {
  return id.slice(0, 8);
}

// Keep a valid selection as the agent list changes (reload, close, etc.).
watch(
  agents,
  (list) => {
    const ids = list.map((a) => a.id);
    if (selectedAgentId.value && !ids.includes(selectedAgentId.value)) {
      selectedAgentId.value = null;
    }
    if (!selectedAgentId.value && ids.length > 0) {
      selectedAgentId.value = ids[0];
    }
  },
  { deep: true },
);

onMounted(() => {
  loadTree();
  agentClient.onPreview((frame) => showPreview(frame.path));
  agentClient.connect();
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">◳</span>
        <span class="wordmark">design</span>
      </div>
      <div class="workspace" :title="workspace">
        <span class="ws-label">workspace</span>
        <code class="ws-path">{{ workspace }}</code>
      </div>
      <div class="topbar-spacer" />
      <span class="phase-pill">localhost driver</span>
    </header>

    <main class="body">
      <section class="viewarea">
        <div class="tabbar">
          <button
            class="tab"
            :class="{ active: activeTab === 'chat' }"
            @click="activeTab = 'chat'"
          >
            <span class="conn" :class="{ on: connected }" /> Chat
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'console' }"
            @click="activeTab = 'console'"
          >
            ▷_ Console
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'files' }"
            @click="activeTab = 'files'"
          >
            ☰ File browser
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'content' }"
            :disabled="!selectedPath"
            @click="activeTab = 'content'"
          >
            ‹/› {{ selectedPath ? "File preview · " + selectedPath : "File preview" }}
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'preview' }"
            @click="activeTab = 'preview'"
          >
            <span class="dot" /> Live preview
          </button>

          <div class="toolbar-spacer" />
          <form
            v-if="activeTab === 'preview'"
            class="address"
            @submit.prevent="navigate"
          >
            <span class="address-prefix">/raw/</span>
            <input
              v-model="addressInput"
              class="address-input"
              spellcheck="false"
              title="Edit the iframe address (workspace-relative), Enter to go"
            />
          </form>
          <button
            v-if="activeTab === 'preview'"
            class="refresh-btn inspect-btn"
            :class="{ active: inspecting }"
            title="Object inspect: click an element to reference it in chat"
            @click="inspecting = !inspecting"
          >
            ⌖
          </button>
          <button
            v-if="activeTab === 'preview'"
            class="refresh-btn"
            title="Reload preview"
            @click="refreshPreview"
          >
            ⟳
          </button>
          <button
            v-if="activeTab === 'files'"
            class="refresh-btn"
            title="Refresh file tree"
            @click="loadTree"
          >
            ⟳
          </button>
        </div>

        <!-- Window: Chat -->
        <div class="window chatwin" v-show="activeTab === 'chat'">
          <div class="chat-bar">
            <select v-model="newAgentType" class="agent-select">
              <option value="claude-code">Claude Code</option>
            </select>
            <button class="new-chat-btn" :disabled="!connected" @click="newChat">+ New chat</button>
            <div class="resume-wrap">
              <button class="resume-btn" :disabled="!connected" title="Resume a past Claude chat in this workspace" @click="toggleResume">
                ⤺ Resume
              </button>
              <div v-if="showResume" class="resume-menu">
                <p v-if="loadingSessions" class="resume-empty">Loading…</p>
                <p v-else-if="!sessions.length" class="resume-empty">No past chats for this workspace.</p>
                <button
                  v-for="s in sessions"
                  :key="s.id"
                  class="resume-item"
                  :title="s.id"
                  @click="resumeChat(s.id)"
                >
                  <span class="resume-title">{{ s.title }}</span>
                  <span class="resume-age">{{ ago(s.mtime) }}</span>
                </button>
              </div>
            </div>
            <div class="chat-tabs">
              <div
                v-for="a in agents"
                :key="a.id"
                class="chat-tab"
                :class="{ active: a.id === selectedAgentId }"
                @click="selectChat(a.id)"
              >
                <span class="chat-tab-label">{{ a.agentType }} · {{ shortId(a.id) }}</span>
                <span v-if="a.chats > 1" class="chat-tab-badge" title="active views">{{ a.chats }}</span>
                <button class="chat-close" title="Close chat (terminates the agent)" @click.stop="closeChat(a.id)">×</button>
              </div>
            </div>
          </div>
          <div class="chat-host">
            <Chat v-if="selectedAgentId" ref="chatRef" :key="selectedAgentId" :agent-id="selectedAgentId" />
            <div v-else class="chat-empty">
              <p class="placeholder">
                No chat selected. Start one with <strong>+ New chat</strong> to drive an agent
                against this workspace.
              </p>
            </div>
          </div>
        </div>

        <!-- Window: Console -->
        <div class="window consolewin" v-show="activeTab === 'console'">
          <Console />
        </div>

        <!-- Window: Live preview -->
        <div class="window frame" v-show="activeTab === 'preview'">
          <iframe
            ref="previewFrame"
            :src="previewSrc"
            title="Design preview"
            frameborder="0"
            @load="onFrameLoad"
          />
        </div>

        <!-- Window 2: File content -->
        <div class="window code" v-show="activeTab === 'content'">
          <template v-if="selectedPath">
            <p v-if="fileTruncated" class="truncated">⚠ file truncated</p>
            <pre><code class="hljs" v-html="highlighted"></code></pre>
          </template>
          <p v-else class="placeholder">Select a file in the Files tab.</p>
        </div>

        <!-- Window 3: File list -->
        <div class="window files" v-show="activeTab === 'files'">
          <div class="files-scroll">
            <FileTree
              v-if="tree && tree.children"
              :nodes="tree.children"
              :selected="selectedPath"
              @open="openFile"
            />
            <p v-else class="placeholder">Loading workspace…</p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  height: 52px;
  padding: 0 1rem;
  border-bottom: 1px solid var(--tool-border);
  background: var(--tool-panel);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.logo {
  color: var(--tool-accent);
  font-size: 1.1rem;
}
.wordmark {
  font-weight: 700;
  letter-spacing: 0.02em;
}
.workspace {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}
.ws-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--tool-muted);
}
.ws-path {
  font-family: var(--tool-mono);
  font-size: 0.8rem;
  color: var(--tool-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topbar-spacer {
  flex: 1;
}
.phase-pill {
  font-size: 0.7rem;
  color: var(--tool-muted);
  border: 1px solid var(--tool-border);
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* Chat window: a switcher bar on top, the conversation below. */
.chat-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--tool-border);
}
.conn {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tool-muted);
}
.conn.on {
  background: var(--tool-accent);
  box-shadow: 0 0 7px var(--tool-accent);
}
.agent-select {
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0.4rem 0.5rem;
  font-size: 0.82rem;
}
.new-chat-btn {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 7px;
  padding: 0.4rem 0.7rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.new-chat-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.resume-wrap {
  position: relative;
}
.resume-btn {
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0.4rem 0.7rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.resume-btn:hover:not(:disabled) {
  border-color: var(--tool-accent);
  color: var(--tool-accent);
}
.resume-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.resume-menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  z-index: 20;
  width: 22rem;
  max-height: 20rem;
  overflow-y: auto;
  background: var(--tool-panel);
  border: 1px solid var(--tool-border);
  border-radius: 9px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
  padding: 0.3rem;
}
.resume-empty {
  margin: 0;
  padding: 0.6rem;
  font-size: 0.8rem;
  color: var(--tool-muted);
}
.resume-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  cursor: pointer;
  color: var(--tool-text);
}
.resume-item:hover {
  background: var(--tool-bg);
}
.resume-title {
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resume-age {
  flex: none;
  font-family: var(--tool-mono);
  font-size: 0.7rem;
  color: var(--tool-muted);
}
.chat-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.chat-tab {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 999px;
  padding: 0.2rem 0.3rem 0.2rem 0.6rem;
  font-family: var(--tool-mono);
  font-size: 0.72rem;
  color: var(--tool-muted);
  cursor: pointer;
}
.chat-tab.active {
  border-color: var(--tool-accent);
  color: var(--tool-text);
}
.chat-tab-badge {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border-radius: 999px;
  padding: 0 0.35rem;
  font-size: 0.66rem;
  font-weight: 700;
}
.chat-close {
  background: transparent;
  border: none;
  color: var(--tool-muted);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 0.15rem;
  border-radius: 50%;
}
.chat-close:hover {
  color: var(--tool-danger);
}
.window.chatwin,
.window.consolewin {
  display: flex;
  flex-direction: column;
}
.chat-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.chat-empty {
  padding: 1rem 0.85rem;
}
.placeholder {
  font-size: 0.85rem;
  color: var(--tool-muted);
  line-height: 1.5;
  padding: 0.5rem 0.25rem;
}

/* Right pane: tab bar + the three windows. */
.viewarea {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--tool-bg);
}
.tabbar {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  height: 42px;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--tool-border);
}
.tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  color: var(--tool-muted);
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 0.3rem 0.65rem;
  font-family: var(--tool-mono);
  font-size: 0.78rem;
  cursor: pointer;
  max-width: 24rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tab.active {
  color: var(--tool-text);
  border-color: var(--tool-border);
  background: var(--tool-panel);
}
.tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--tool-accent);
  box-shadow: 0 0 8px var(--tool-accent);
}
.toolbar-spacer {
  flex: 1;
}
.address {
  display: flex;
  align-items: center;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0 0.4rem;
  height: 28px;
  min-width: 14rem;
  max-width: 28rem;
  flex: 0 1 22rem;
}
.address:focus-within {
  border-color: var(--tool-accent);
}
.address-prefix {
  font-family: var(--tool-mono);
  font-size: 0.76rem;
  color: var(--tool-muted);
}
.address-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--tool-text);
  font-family: var(--tool-mono);
  font-size: 0.78rem;
  padding: 0 0.2rem;
}
.refresh-btn {
  background: transparent;
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0.3rem 0.6rem;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
}
.refresh-btn:hover {
  border-color: var(--tool-accent);
  color: var(--tool-accent);
}
.inspect-btn.active {
  border-color: var(--tool-accent);
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
}

.window {
  flex: 1;
  min-height: 0;
}
.window.frame {
  padding: 1rem;
}
.window.frame iframe {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
}
.window.code {
  overflow: auto;
  padding: 1rem;
}
.window.code .truncated {
  color: var(--tool-danger);
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}
.window.code pre {
  margin: 0;
  font-family: var(--tool-mono);
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--tool-text);
  white-space: pre;
}
.window.files {
  display: flex;
  flex-direction: column;
}
.files-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem 0.75rem;
}
</style>
