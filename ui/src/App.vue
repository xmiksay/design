<script setup>
import { ref, computed, onMounted } from "vue";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import FileTree from "./FileTree.vue";

// Bootstrap injected by the server (workspace path, default preview path). Falls
// back to sensible defaults when running the SPA standalone via `vite dev`.
const boot = window.__DESIGN__ ?? {};
const workspace = ref(boot.workspace ?? "(dev) ui/");
const defaultPath = boot.previewPath ?? "preview/index.html";

// The right pane is a set of three tabbed "windows", in order:
// files (browser) · content (file preview) · preview (live preview).
const activeTab = ref("files");

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

// Prompt box — wired to the runner in Phase 2. Inert for now.
const prompt = ref("");
const canRun = computed(() => prompt.value.trim().length > 0);

onMounted(loadTree);
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
      <aside class="sidebar">
        <section class="panel">
          <h2 class="panel-title">Prompt</h2>
          <textarea
            v-model="prompt"
            class="prompt-input"
            rows="4"
            placeholder="Describe the change… (runner lands in Phase 2)"
          />
          <button class="run-btn" :disabled="!canRun" title="Runner wired in Phase 2">
            Run ▸
          </button>
        </section>

        <section class="panel grow">
          <h2 class="panel-title">Changes</h2>
          <p class="placeholder">
            Git diff &amp; keep / discard appear here once a run lands a commit.
          </p>
        </section>
      </aside>

      <section class="viewarea">
        <div class="tabbar">
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
            class="refresh-btn"
            title="Reload preview"
            @click="refreshPreview"
          >
            ⟳
          </button>
        </div>

        <!-- Window 1: Live preview -->
        <div class="window frame" v-show="activeTab === 'preview'">
          <iframe :src="previewSrc" title="Design preview" frameborder="0" />
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

.sidebar {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--tool-border);
  background: var(--tool-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel {
  padding: 1rem;
  border-bottom: 1px solid var(--tool-border);
}
.panel.grow {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.panel-title {
  margin: 0 0 0.6rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--tool-muted);
}
.prompt-input {
  width: 100%;
  resize: vertical;
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  font-family: var(--tool-sans);
  font-size: 0.9rem;
  line-height: 1.4;
}
.prompt-input:focus {
  outline: none;
  border-color: var(--tool-accent);
}
.run-btn {
  margin-top: 0.6rem;
  width: 100%;
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 8px;
  padding: 0.55rem;
  font-weight: 700;
  cursor: pointer;
}
.run-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
