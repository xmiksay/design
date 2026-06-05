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
// cache-busting reload counter for the iframe.
const previewPath = ref(defaultPath);
const addressInput = ref(defaultPath);
const reloadKey = ref(0);

function rawUrl(path) {
  return "/raw/" + path.split("/").map(encodeURIComponent).join("/");
}
const previewSrc = computed(() => `${rawUrl(previewPath.value)}?r=${reloadKey.value}`);

function navigate() {
  previewPath.value = addressInput.value.trim().replace(/^\/+/, "");
  reloadKey.value += 1;
  activeTab.value = "preview";
}
function refreshPreview() {
  reloadKey.value += 1;
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

function onInspectMove(e) {
  if (e.target && e.target !== highlightEl) moveHighlight(e.target);
}

function onInspectClick(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.target) pickElement(e.target);
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

// What clicking a file in the tree does: show its content, or set it as the
// live-preview address.
const clickMode = ref("content"); // "content" | "preview"

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

async function openFile(path) {
  selectedPath.value = path;
  if (clickMode.value === "preview") {
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
        </div>

        <!-- Window: Chat -->
        <div class="window chatwin" v-show="activeTab === 'chat'">
          <div class="chat-bar">
            <select v-model="newAgentType" class="agent-select">
              <option value="claude-code">Claude Code</option>
            </select>
            <button class="new-chat-btn" :disabled="!connected" @click="newChat">+ New chat</button>
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
          <div class="files-modes">
            <span class="modes-label">On click</span>
            <div class="click-mode" role="group">
              <button
                class="seg"
                :class="{ active: clickMode === 'content' }"
                @click="clickMode = 'content'"
              >
                Show content
              </button>
              <button
                class="seg"
                :class="{ active: clickMode === 'preview' }"
                @click="clickMode = 'preview'"
              >
                Set preview address
              </button>
            </div>
          </div>
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
.files-modes {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--tool-border);
}
.modes-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--tool-muted);
}
.click-mode {
  display: flex;
  gap: 2px;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
  padding: 2px;
}
.seg {
  background: transparent;
  color: var(--tool-muted);
  border: none;
  border-radius: 6px;
  padding: 0.28rem 0.7rem;
  font-size: 0.76rem;
  cursor: pointer;
}
.seg.active {
  background: var(--tool-panel);
  color: var(--tool-text);
  box-shadow: inset 0 0 0 1px var(--tool-border);
}
.seg:hover:not(.active) {
  color: var(--tool-text);
}
.files-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem 0.75rem;
}
</style>
