<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";
import { agentClient } from "./agent.js";

// A simple workspace console: type a command, run it in the workspace root, and
// stream stdout/stderr. Each run is one `bash -lc <command>`; the backend kills
// it on cancel or disconnect.
const entries = ref([]); // { kind: 'cmd'|'stdout'|'stderr'|'exit', text?, code? }
const draft = ref("");
const running = ref(false);
const scroller = ref(null);

const SUGGESTIONS = ["npm run build", "npm run tokens", "git status", "git diff"];

let unsub = null;

function scrollDown() {
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}
function push(entry) {
  entries.value.push(entry);
  scrollDown();
}

function handle(frame) {
  if (frame.op === "console.output") {
    push({ kind: frame.stream === "stderr" ? "stderr" : "stdout", text: frame.line });
  } else if (frame.op === "console.exit") {
    running.value = false;
    push({ kind: "exit", code: frame.code });
  }
}

function run(command) {
  const cmd = (command ?? draft.value).trim();
  if (!cmd || running.value) return;
  push({ kind: "cmd", text: cmd });
  agentClient.consoleRun(cmd);
  running.value = true;
  draft.value = "";
}
function kill() {
  if (running.value) agentClient.consoleKill();
}
function clearLog() {
  entries.value = [];
}

onMounted(() => {
  unsub = agentClient.onConsole(handle);
});
onBeforeUnmount(() => {
  if (unsub) unsub();
});
</script>

<template>
  <div class="console">
    <div class="console-toolbar">
      <span class="con-label">Console</span>
      <span class="con-cwd">workspace root</span>
      <div class="con-spacer" />
      <button
        v-for="s in SUGGESTIONS"
        :key="s"
        class="suggest"
        :disabled="running"
        @click="run(s)"
      >
        {{ s }}
      </button>
      <button class="clear" @click="clearLog">clear</button>
    </div>

    <div ref="scroller" class="console-log">
      <div v-for="(e, i) in entries" :key="i" class="line" :class="e.kind">
        <template v-if="e.kind === 'cmd'"><span class="prompt">$</span> {{ e.text }}</template>
        <template v-else-if="e.kind === 'exit'">
          <span :class="e.code === 0 ? 'ok' : 'bad'">
            ↳ exit {{ e.code == null ? "(killed)" : e.code }}
          </span>
        </template>
        <template v-else>{{ e.text }}</template>
      </div>
      <p v-if="!entries.length" class="hint">
        Run a command in the workspace (e.g. <code>npm run build</code>). Output streams here.
      </p>
    </div>

    <form class="console-composer" @submit.prevent="run()">
      <span class="prompt">$</span>
      <input
        v-model="draft"
        class="console-input"
        spellcheck="false"
        placeholder="type a command and press Enter…"
      />
      <button v-if="running" type="button" class="kill" @click="kill">Stop</button>
      <button v-else type="submit" class="run" :disabled="!draft.trim()">Run ▸</button>
    </form>
  </div>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.console-toolbar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--tool-border);
}
.con-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--tool-muted);
}
.con-cwd {
  font-family: var(--tool-mono);
  font-size: 0.72rem;
  color: var(--tool-muted);
}
.con-spacer {
  flex: 1;
}
.suggest,
.clear {
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 7px;
  padding: 0.25rem 0.55rem;
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  cursor: pointer;
}
.suggest:hover:not(:disabled),
.clear:hover {
  border-color: var(--tool-accent);
  color: var(--tool-accent);
}
.suggest:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.console-log {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.75rem;
  font-family: var(--tool-mono);
  font-size: 0.8rem;
  line-height: 1.5;
}
.line {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--tool-text);
}
.line.cmd {
  color: var(--tool-accent);
  margin-top: 0.4rem;
}
.line.stderr {
  color: var(--tool-danger);
}
.line.exit .ok {
  color: var(--tool-accent);
}
.line.exit .bad {
  color: var(--tool-danger);
}
.prompt {
  color: var(--tool-accent);
  user-select: none;
}
.hint {
  color: var(--tool-muted);
  font-family: var(--tool-sans);
  font-size: 0.85rem;
}
.console-composer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-top: 1px solid var(--tool-border);
  padding: 0.5rem 0.75rem;
}
.console-input {
  flex: 1;
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font-family: var(--tool-mono);
  font-size: 0.82rem;
}
.console-input:focus {
  outline: none;
  border-color: var(--tool-accent);
}
.run,
.kill {
  border: none;
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.run {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
}
.run:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.kill {
  background: transparent;
  color: var(--tool-danger);
  border: 1px solid var(--tool-danger);
}
</style>
