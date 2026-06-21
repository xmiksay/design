<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import FileTree from "./FileTree.vue";
import Chat from "./Chat.vue";
import Console from "./Console.vue";
import ThemeSwitch from "./ThemeSwitch.vue";
import DeviceFrame from "./DeviceFrame.vue";
import { agentClient } from "./agent.js";
import { computeSelector } from "./selector.js";

// Bootstrap injected by the server (workspace path, default preview path). Falls
// back to sensible defaults when running the SPA standalone via `vite dev`.
const boot = window.__DESIGN__ ?? {};
const workspace = ref(boot.workspace ?? "(dev) ui/");
const defaultPath = boot.previewPath ?? "preview/index.html";

// Three-zone app shell: a thin Files rail (collapsible), a Preview center, and
// an expandable Chat. The Preview center swaps between three views.
const previewView = ref("web"); // web | source | console
const railCollapsed = ref(false);
const chatWide = ref(false);

// ---- Resizable Files / Chat rails ----
// The grid columns are driven by --rail-w / --chat-w. We apply user-dragged
// widths inline on .zones, but only while the matching collapse/expand toggle is
// off — so a collapsed rail (46px) or an expanded chat (560px) class still wins.
// Widths persist across reloads in localStorage.
const RAIL_DEFAULT = 216;
const CHAT_DEFAULT = 360;
function storedW(key, fallback) {
  const v = Number(localStorage.getItem(key));
  return v > 0 ? v : fallback;
}
const railW = ref(storedW("design.railW", RAIL_DEFAULT));
const chatW = ref(storedW("design.chatW", CHAT_DEFAULT));
const dragging = ref(false);

const zonesStyle = computed(() => {
  const s = {};
  if (!railCollapsed.value) s["--rail-w"] = `${railW.value}px`;
  if (!chatWide.value) s["--chat-w"] = `${chatW.value}px`;
  return s;
});

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

let dragKind = null;
let dragStartX = 0;
let dragStartW = 0;
function startDrag(kind, e) {
  dragKind = kind;
  dragStartX = e.clientX;
  if (kind === "rail") {
    railCollapsed.value = false; // a drag implies "show me the rail"
    dragStartW = railW.value;
  } else {
    chatWide.value = false;
    dragStartW = chatW.value;
  }
  dragging.value = true;
  e.target.setPointerCapture(e.pointerId); // keep events even over the iframe
  e.target.addEventListener("pointermove", onDrag);
  e.target.addEventListener("pointerup", endDrag);
}
function onDrag(e) {
  const dx = e.clientX - dragStartX;
  if (dragKind === "rail") {
    railW.value = clamp(dragStartW + dx, 140, 480);
  } else {
    // The chat handle sits on the chat's left border, so dragging left widens it.
    chatW.value = clamp(dragStartW - dx, 280, 760);
  }
}
function endDrag(e) {
  dragging.value = false;
  dragKind = null;
  e.target.removeEventListener("pointermove", onDrag);
  e.target.removeEventListener("pointerup", endDrag);
  localStorage.setItem("design.railW", String(railW.value));
  localStorage.setItem("design.chatW", String(chatW.value));
}

// Pop the live preview into its own browser window. `previewSrc` is the
// same-origin /raw/ URL, so the launch token's Strict cookie carries with it.
function popOut() {
  window.open(previewSrc.value, "_blank", "noopener");
}

// Rebuild the substrate via the workspace Console (reuses the console.run WS op —
// no backend logic). Switch to the console to show progress; when the build
// process exits we refresh the live preview so it picks up the new output.
const building = ref(false);
function rebuild() {
  agentClient.consoleRun("npm run build");
  previewView.value = "console";
  building.value = true;
}

// Device-frame controls (web view only).
const device = ref("desktop");
const touch = ref(false);
const DEVICES = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet · 820×1180" },
  { value: "tablet-sm", label: "Small tablet · 768×1024" },
  { value: "mobile-lg", label: "Large phone · 430×932" },
  { value: "mobile-sm", label: "Small phone · 360×740" },
];

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
  previewView.value = "web";
}
function refreshPreview() {
  reloadKey.value = Date.now();
}

// The agent asks to show a workspace file in the live preview by writing a
// `<!-- preview: path -->` marker in its reply (parsed by Chat.vue, emitted up
// here). Navigate the iframe there and bring the web view to the front. A
// leading `/raw/` is tolerated and stripped, like the editable address bar.
function showPreview(path) {
  const p = (path ?? "").trim().replace(/^\/+/, "").replace(/^raw\//, "");
  if (!p) return;
  previewPath.value = p; // watch(previewPath) keeps the address field in sync
  reloadKey.value = Date.now();
  previewView.value = "web";
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
const deviceRef = ref(null);
const chatRef = ref(null);
const inspecting = ref(false);
let inspectCleanup = null;
let highlightEl = null;
let labelEl = null;

function getFrame() {
  return deviceRef.value?.getFrame?.() ?? null;
}

function frameDoc() {
  try {
    return getFrame()?.contentDocument ?? null;
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
    // A label that shows the element's selector under the cursor, so the user
    // sees what they're about to pick. The selector lives here on hover — it is
    // never surfaced in the chat options panel.
    labelEl = doc.createElement("div");
    labelEl.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      "z-index:2147483647",
      "background:#4aa3ff",
      "color:#fff",
      "font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
      "padding:1px 6px",
      "border-radius:3px",
      "max-width:80vw",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "white-space:nowrap",
    ].join(";");
    doc.body.appendChild(highlightEl);
    doc.body.appendChild(labelEl);
  }
  const r = el.getBoundingClientRect();
  Object.assign(highlightEl.style, {
    display: "block",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
  // Sit the label just above the box, dropping inside it when there's no room.
  labelEl.textContent = computeSelector(el);
  const labelTop = r.top >= 20 ? r.top - 19 : r.top + 2;
  Object.assign(labelEl.style, { display: "block", left: `${r.left}px`, top: `${labelTop}px` });
}

// The real clicked node. With open shadow roots, `event.target` is retargeted to
// the shadow host; composedPath()[0] reveals the actual element inside the root.
function eventTarget(e) {
  const path = typeof e.composedPath === "function" ? e.composedPath() : null;
  const el = path && path.length ? path[0] : e.target;
  return el && el.nodeType === 1 && el !== highlightEl && el !== labelEl ? el : null;
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
  inspecting.value = false;
  if (!selectedAgentId.value) {
    await newChat();
    await nextTick();
  }
  chatRef.value?.addInspectionDraft(selector);
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
    if (labelEl) {
      labelEl.remove();
      labelEl = null;
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
    previewView.value = "web";
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
    const loc = getFrame()?.contentWindow?.location;
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
// to the live preview; textual/code files open in the source view; everything
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

// `mode` is "content" (source view), "preview" (live preview), or "default"
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
    previewView.value = "source";
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

// Spawn-time model knobs, applied to both "+ New" and "Resume". Empty string =
// "Default" = omit the flag and inherit Claude Code's global settings.
const newModel = ref("");
const newEffort = ref("");
const newThinking = ref("");
const MODELS = [
  { value: "", label: "Model: default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
  { value: "fable", label: "Fable" },
  { value: "opusplan", label: "Opus Plan" },
  { value: "opus[1m]", label: "Opus · 1M" },
  { value: "sonnet[1m]", label: "Sonnet · 1M" },
];
const EFFORTS = [
  { value: "", label: "Effort: default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];
const THINKINGS = [
  { value: "", label: "Thinking: default" },
  { value: "0", label: "Off" },
  { value: "4000", label: "Think" },
  { value: "10000", label: "Think hard" },
  { value: "31999", label: "Ultrathink" },
];
function spawnOpts() {
  return { model: newModel.value, effort: newEffort.value, thinking: newThinking.value };
}

async function newChat() {
  const id = await agentClient.spawn(newAgentType.value, null, spawnOpts());
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
  const newId = await agentClient.spawn("claude-code", id, spawnOpts());
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
  agentClient.connect();
  // When a rebuild we launched finishes, drop the flag and refresh the preview.
  agentClient.onConsole((frame) => {
    if (frame.op === "console.exit" && building.value) {
      building.value = false;
      refreshPreview();
    }
  });
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">◆</span>
        <span class="wordmark">design</span>
      </div>
      <div class="workspace" :title="workspace">
        <span class="ws-label">workspace</span>
        <code class="ws-path">{{ workspace }}</code>
      </div>
      <div class="topbar-spacer" />
      <ThemeSwitch />
      <span class="status" :class="{ on: connected }">
        <span class="status-dot" />
        <span class="status-label">{{ connected ? "agent · live" : "connecting…" }}</span>
      </span>
    </header>

    <div
      class="zones"
      :class="{ 'rail-collapsed': railCollapsed, 'chat-wide': chatWide, dragging }"
      :style="zonesStyle"
    >
      <!-- Files (thin, collapsible) -->
      <section class="zone files-zone">
        <div class="zone-head">
          <span class="zone-title">Files</span>
          <span class="grow" />
          <button
            v-if="!railCollapsed"
            class="icon-btn"
            title="Refresh file tree"
            @click="loadTree"
          >
            ⟳
          </button>
          <button
            class="icon-btn"
            :title="railCollapsed ? 'Expand' : 'Collapse'"
            @click="railCollapsed = !railCollapsed"
          >
            {{ railCollapsed ? "⟩" : "⟨" }}
          </button>
        </div>
        <div v-show="!railCollapsed" class="files-scroll">
          <FileTree
            v-if="tree && tree.children"
            :nodes="tree.children"
            :selected="selectedPath"
            @open="openFile"
          />
          <p v-else class="placeholder">Loading workspace…</p>
        </div>
      </section>

      <!-- Preview (web / source / console) -->
      <section class="zone preview-zone">
        <!-- Drag handles on the Files|Preview and Preview|Chat borders. -->
        <div
          v-if="!railCollapsed"
          class="resize-handle left"
          title="Drag to resize the Files rail"
          @pointerdown.prevent="startDrag('rail', $event)"
        />
        <div
          class="resize-handle right"
          title="Drag to resize the Chat panel"
          @pointerdown.prevent="startDrag('chat', $event)"
        />
        <div class="zone-head">
          <div class="seg">
            <button :class="{ on: previewView === 'web' }" @click="previewView = 'web'">web</button>
            <button :class="{ on: previewView === 'source' }" @click="previewView = 'source'">source</button>
            <button :class="{ on: previewView === 'console' }" @click="previewView = 'console'">console</button>
          </div>
          <template v-if="previewView === 'web'">
            <select v-model="device" class="device-select" title="Device size">
              <option v-for="d in DEVICES" :key="d.value" :value="d.value">{{ d.label }}</option>
            </select>
            <button
              class="icon-btn"
              :class="{ on: touch }"
              title="Touch cursor"
              @click="touch = !touch"
            >
              ☝
            </button>
          </template>
          <span class="grow" />
          <template v-if="previewView === 'web'">
            <form class="address" @submit.prevent="navigate">
              <span class="address-prefix">/raw/</span>
              <input
                v-model="addressInput"
                class="address-input"
                spellcheck="false"
                title="Edit the iframe address (workspace-relative), Enter to go"
              />
            </form>
            <button
              class="icon-btn"
              :class="{ on: inspecting }"
              title="Object inspect: click an element to reference it in chat"
              @click="inspecting = !inspecting"
            >
              ⌖
            </button>
            <button class="icon-btn" title="Reload preview" @click="refreshPreview">⟳</button>
            <button
              class="icon-btn"
              :class="{ on: building }"
              title="Rebuild (npm run build) then refresh the preview"
              @click="rebuild"
            >
              ⚒
            </button>
            <button class="icon-btn" title="Open preview in a new window" @click="popOut">⧉</button>
          </template>
          <span v-else-if="previewView === 'source'" class="src-path">
            {{ selectedPath || "no file selected" }}
          </span>
        </div>

        <div class="preview-body">
          <!-- Web view -->
          <div v-show="previewView === 'web'" class="web-view">
            <DeviceFrame
              ref="deviceRef"
              :src="previewSrc"
              :device="device"
              :touch="touch"
              @load="onFrameLoad"
            />
          </div>

          <!-- Source view -->
          <div v-show="previewView === 'source'" class="src-view">
            <template v-if="selectedPath">
              <p v-if="fileTruncated" class="truncated">⚠ file truncated</p>
              <pre><code class="hljs" v-html="highlighted"></code></pre>
            </template>
            <p v-else class="placeholder">Open a file from the Files rail (‹/›) to view its source.</p>
          </div>

          <!-- Console view -->
          <div v-show="previewView === 'console'" class="console-view">
            <Console />
          </div>
        </div>
      </section>

      <!-- Chat (always present, expandable) -->
      <section class="zone chat-zone">
        <div class="zone-head">
          <span class="zone-title">Chat</span>
          <span class="grow" />
          <button
            class="icon-btn"
            :title="chatWide ? 'Shrink' : 'Expand'"
            @click="chatWide = !chatWide"
          >
            {{ chatWide ? "⤡" : "⤢" }}
          </button>
        </div>

        <div class="chat-controls">
          <select v-model="newAgentType" class="agent-select">
            <option value="claude-code">Claude Code</option>
          </select>
          <select v-model="newModel" class="agent-select" title="Model (spawn-time)">
            <option v-for="m in MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <select v-model="newEffort" class="agent-select" title="Reasoning effort (spawn-time)">
            <option v-for="e in EFFORTS" :key="e.value" :value="e.value">{{ e.label }}</option>
          </select>
          <select v-model="newThinking" class="agent-select" title="Thinking budget (spawn-time)">
            <option v-for="t in THINKINGS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <button class="new-chat-btn" :disabled="!connected" @click="newChat">+ New</button>
          <div class="resume-wrap">
            <button
              class="resume-btn"
              :disabled="!connected"
              title="Resume a past Claude chat in this workspace"
              @click="toggleResume"
            >
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
        </div>

        <div v-if="agents.length" class="chat-tabs">
          <div
            v-for="a in agents"
            :key="a.id"
            class="chat-tab"
            :class="{ active: a.id === selectedAgentId }"
            @click="selectChat(a.id)"
          >
            <span class="chat-tab-label">{{ shortId(a.id) }}</span>
            <span v-if="a.chats > 1" class="chat-tab-badge" title="active views">{{ a.chats }}</span>
            <button class="chat-close" title="Close chat (terminates the agent)" @click.stop="closeChat(a.id)">×</button>
          </div>
        </div>

        <div class="chat-host">
          <Chat
            v-if="selectedAgentId"
            ref="chatRef"
            :key="selectedAgentId"
            :agent-id="selectedAgentId"
            @preview="showPreview"
          />
          <div v-else class="chat-empty">
            <p class="placeholder">
              No chat selected. Start one with <strong>+ New</strong> to drive an agent
              against this workspace.
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-rows: 52px 1fr;
  height: 100%;
}

/* ── Topbar ────────────────────────────────────────────────── */
.topbar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
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
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tool-muted);
}
.status.on .status-dot {
  background: var(--tool-accent);
  box-shadow: 0 0 8px var(--tool-accent);
}
.status-label {
  font-family: var(--tool-mono);
  font-size: 0.72rem;
  color: var(--tool-muted);
}
.status.on .status-label {
  color: var(--tool-text);
}

/* ── Zones grid ────────────────────────────────────────────── */
.zones {
  display: grid;
  grid-template-columns: var(--rail-w, 216px) minmax(0, 1fr) var(--chat-w, 360px);
  min-height: 0;
  transition: grid-template-columns 160ms ease;
}
.zones.rail-collapsed {
  --rail-w: 46px;
}
.zones.chat-wide {
  --chat-w: 560px;
}
/* Suspend the column transition while dragging so the rail tracks the cursor. */
.zones.dragging {
  transition: none;
  cursor: col-resize;
  user-select: none;
}
/* Thin grab strips straddling the Preview center's left/right borders. They sit
   above the iframe so the pointer never falls through to it mid-drag. */
.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  z-index: 5;
  cursor: col-resize;
}
.resize-handle.left {
  left: -4px;
}
.resize-handle.right {
  right: -4px;
}
.resize-handle:hover,
.zones.dragging .resize-handle {
  background: color-mix(in srgb, var(--tool-accent) 40%, transparent);
}
.zone {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--tool-border);
}
.zone:last-child {
  border-right: none;
}
.zone-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 38px;
  flex: none;
  padding: 0 0.7rem;
  border-bottom: 1px solid var(--tool-border);
}
.zone-title {
  font-family: var(--tool-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--tool-muted);
}
.zone-head .grow {
  flex: 1;
}
.icon-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--tool-muted);
  border-radius: 4px;
  min-width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.86rem;
  line-height: 1;
  padding: 0 0.3rem;
}
.icon-btn:hover {
  color: var(--tool-accent);
  border-color: var(--tool-border);
}
.icon-btn.on {
  color: var(--tool-accent);
  border-color: var(--tool-border);
  background: var(--tool-panel);
}

/* ── Files rail ────────────────────────────────────────────── */
.files-zone {
  background: var(--tool-panel);
}
.files-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem 0.4rem;
}

/* ── Preview center ────────────────────────────────────────── */
.preview-zone {
  position: relative;
  background: var(--tool-bg);
}
.seg {
  display: inline-flex;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 2px;
}
.seg button {
  background: transparent;
  border: none;
  color: var(--tool-muted);
  font-family: var(--tool-mono);
  font-size: 0.78rem;
  padding: 0.2rem 0.7rem;
  border-radius: 4px;
  cursor: pointer;
}
.seg button.on {
  background: var(--tool-panel);
  color: var(--tool-text);
}
.device-select {
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0.2rem 0.4rem;
  font-family: var(--tool-mono);
  font-size: 0.76rem;
  cursor: pointer;
}
.device-select:focus {
  outline: none;
  border-color: var(--tool-accent);
}
.src-path {
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  color: var(--tool-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.address {
  display: flex;
  align-items: center;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0 0.4rem;
  height: 28px;
  min-width: 12rem;
  max-width: 26rem;
  flex: 0 1 20rem;
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
.preview-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.web-view {
  height: 100%;
}
.src-view {
  height: 100%;
  overflow: auto;
  padding: 1rem;
}
.src-view .truncated {
  color: var(--tool-danger);
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}
.src-view pre {
  margin: 0;
  font-family: var(--tool-mono);
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--tool-text);
  white-space: pre;
}
.console-view {
  height: 100%;
}

/* ── Chat right ────────────────────────────────────────────── */
.chat-zone {
  background: var(--tool-panel);
}
.chat-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex: none;
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--tool-border);
}
.agent-select {
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0.3rem 0.4rem;
  font-size: 0.78rem;
}
.new-chat-btn {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 7px;
  padding: 0.3rem 0.7rem;
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
  padding: 0.3rem 0.7rem;
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
  right: 0;
  z-index: 20;
  width: 20rem;
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
  flex: none;
  padding: 0.45rem 0.7rem;
  border-bottom: 1px solid var(--tool-border);
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
</style>
