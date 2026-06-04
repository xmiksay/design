<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { agentClient } from "./agent.js";

const props = defineProps({
  agentId: { type: String, required: true },
});

// One conversation, rebuilt from the backend's replayed history on (re)attach.
// Each entry is one of: system | user | assistant | thinking | tool | result |
// permission. We render from the *authoritative* full messages (`assistant`,
// `user`, `result`) — not the partial `stream_event`s — so rendering can't drift.
const entries = ref([]);
const busy = ref(false);
const draft = ref("");
const scroller = ref(null);

let unsub = null;

function reset() {
  entries.value = [];
  busy.value = false;
}

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

// ---- stream-json parsing (the SPA owns this; the backend stays opaque) ----

function handleFrame(frame) {
  if (frame.op === "stderr") {
    push({ kind: "stderr", text: frame.line });
    return;
  }
  if (frame.op === "exit") {
    busy.value = false;
    push({ kind: "system", text: `agent exited${frame.code != null ? ` (code ${frame.code})` : ""}` });
    return;
  }
  if (frame.op !== "output") return;

  let msg;
  try {
    msg = JSON.parse(frame.line);
  } catch {
    return;
  }
  parseStreamJson(msg);
}

function parseStreamJson(msg) {
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        const model = msg.model ?? "";
        push({ kind: "system", text: `session started · ${model} · ${msg.permissionMode ?? "default"}` });
      }
      break;

    case "assistant": {
      const blocks = msg.message?.content ?? [];
      for (const b of blocks) {
        if (b.type === "text" && b.text) push({ kind: "assistant", text: b.text });
        else if (b.type === "thinking" && b.thinking) push({ kind: "thinking", text: b.thinking });
        else if (b.type === "tool_use") {
          push({ kind: "tool", id: b.id, name: b.name, input: b.input ?? {}, open: false });
        }
      }
      break;
    }

    case "user": {
      // Either the agent's replayed user text, or a tool_result.
      const blocks = msg.message?.content;
      if (typeof blocks === "string") {
        push({ kind: "user", text: blocks });
        break;
      }
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b.type === "tool_result") {
            push({
              kind: "toolResult",
              forId: b.tool_use_id,
              text: contentToText(b.content),
              isError: !!b.is_error,
              open: false,
            });
          } else if (b.type === "text" && b.text) {
            push({ kind: "user", text: b.text });
          }
        }
      }
      break;
    }

    case "control_request":
      if (msg.request?.subtype === "can_use_tool") {
        push({
          kind: "permission",
          requestId: msg.request_id,
          tool: msg.request.tool_name,
          display: msg.request.display_name ?? msg.request.tool_name,
          description: msg.request.description ?? "",
          input: msg.request.input ?? {},
          answered: false,
        });
      }
      break;

    case "result":
      busy.value = false;
      break;

    default:
      break; // rate_limit_event, stream_event (partials), system/status: ignored
  }
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c?.text ?? JSON.stringify(c)))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

// ---- sending ----

function sendDraft() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  agentClient.input(props.agentId, {
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] },
  });
  draft.value = "";
  busy.value = true;
}

function answer(entry, allow) {
  const response = allow
    ? { behavior: "allow", updatedInput: entry.input }
    : { behavior: "deny", message: "Denied by user" };
  agentClient.input(props.agentId, {
    type: "control_response",
    response: { subtype: "success", request_id: entry.requestId, response },
  });
  entry.answered = true;
  entry.allowed = allow;
}

function prettyInput(input) {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

// ---- lifecycle: subscribe BEFORE attach so we catch the history replay ----

function bind(id) {
  if (unsub) unsub();
  reset();
  unsub = agentClient.onOutput(id, handleFrame);
  agentClient.attach(id);
}

onMounted(() => bind(props.agentId));
watch(
  () => props.agentId,
  (id) => bind(id),
);
onBeforeUnmount(() => {
  if (unsub) unsub();
});
</script>

<template>
  <div class="chat">
    <div ref="scroller" class="messages">
      <div v-for="(e, i) in entries" :key="i" class="msg" :class="e.kind">
        <template v-if="e.kind === 'user'">
          <div class="bubble user">{{ e.text }}</div>
        </template>

        <template v-else-if="e.kind === 'assistant'">
          <div class="bubble assistant">{{ e.text }}</div>
        </template>

        <template v-else-if="e.kind === 'thinking'">
          <details class="thinking">
            <summary>💭 thinking</summary>
            <pre>{{ e.text }}</pre>
          </details>
        </template>

        <template v-else-if="e.kind === 'tool'">
          <details class="tool">
            <summary><span class="tool-name">🔧 {{ e.name }}</span></summary>
            <pre>{{ prettyInput(e.input) }}</pre>
          </details>
        </template>

        <template v-else-if="e.kind === 'toolResult'">
          <details class="tool-result" :class="{ err: e.isError }">
            <summary>{{ e.isError ? "⚠ result" : "↳ result" }}</summary>
            <pre>{{ e.text }}</pre>
          </details>
        </template>

        <template v-else-if="e.kind === 'permission'">
          <div class="permission" :class="{ done: e.answered }">
            <div class="perm-head">
              Permission: <strong>{{ e.display }}</strong>
              <span v-if="e.description" class="perm-desc">· {{ e.description }}</span>
            </div>
            <pre class="perm-input">{{ prettyInput(e.input) }}</pre>
            <div v-if="!e.answered" class="perm-actions">
              <button class="allow" @click="answer(e, true)">Allow</button>
              <button class="deny" @click="answer(e, false)">Deny</button>
            </div>
            <div v-else class="perm-verdict" :class="e.allowed ? 'ok' : 'no'">
              {{ e.allowed ? "✓ allowed" : "✗ denied" }}
            </div>
          </div>
        </template>

        <template v-else-if="e.kind === 'system'">
          <div class="system">{{ e.text }}</div>
        </template>

        <template v-else-if="e.kind === 'stderr'">
          <div class="stderr">{{ e.text }}</div>
        </template>
      </div>

      <div v-if="busy" class="working">working…</div>
    </div>

    <form class="composer" @submit.prevent="sendDraft">
      <textarea
        v-model="draft"
        class="composer-input"
        rows="3"
        placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
        @keydown.enter.exact.prevent="sendDraft"
      />
      <button class="send" type="submit" :disabled="!draft.trim() || busy">Send ▸</button>
    </form>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.msg {
  display: flex;
  flex-direction: column;
}
.bubble {
  max-width: 95%;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  font-size: 0.86rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble.user {
  align-self: flex-end;
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border-bottom-right-radius: 3px;
}
.bubble.assistant {
  align-self: flex-start;
  background: var(--tool-panel);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-bottom-left-radius: 3px;
}
.thinking,
.tool,
.tool-result {
  font-size: 0.78rem;
  color: var(--tool-muted);
}
.thinking summary,
.tool summary,
.tool-result summary {
  cursor: pointer;
  list-style: none;
  padding: 0.15rem 0;
}
.tool-name {
  font-family: var(--tool-mono);
  color: var(--tool-text);
}
.tool-result.err summary {
  color: var(--tool-danger);
}
.thinking pre,
.tool pre,
.tool-result pre {
  margin: 0.25rem 0 0;
  padding: 0.5rem;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 16rem;
  overflow: auto;
}
.permission {
  align-self: stretch;
  border: 1px solid var(--tool-accent);
  border-radius: 10px;
  padding: 0.6rem 0.7rem;
  background: color-mix(in srgb, var(--tool-accent) 7%, var(--tool-panel));
}
.permission.done {
  border-color: var(--tool-border);
  background: var(--tool-panel);
}
.perm-head {
  font-size: 0.82rem;
  color: var(--tool-text);
}
.perm-desc {
  color: var(--tool-muted);
}
.perm-input {
  margin: 0.4rem 0;
  padding: 0.4rem;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  font-family: var(--tool-mono);
  font-size: 0.72rem;
  max-height: 12rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.perm-actions {
  display: flex;
  gap: 0.5rem;
}
.perm-actions button {
  flex: 1;
  border: none;
  border-radius: 7px;
  padding: 0.4rem;
  font-weight: 700;
  cursor: pointer;
}
.perm-actions .allow {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
}
.perm-actions .deny {
  background: transparent;
  color: var(--tool-danger);
  border: 1px solid var(--tool-danger);
}
.perm-verdict {
  font-size: 0.8rem;
  font-weight: 700;
}
.perm-verdict.ok {
  color: var(--tool-accent);
}
.perm-verdict.no {
  color: var(--tool-danger);
}
.system {
  align-self: center;
  font-size: 0.72rem;
  color: var(--tool-muted);
  font-family: var(--tool-mono);
}
.stderr {
  font-family: var(--tool-mono);
  font-size: 0.72rem;
  color: var(--tool-danger);
  opacity: 0.85;
  white-space: pre-wrap;
  word-break: break-word;
}
.working {
  align-self: flex-start;
  font-size: 0.78rem;
  color: var(--tool-muted);
  font-style: italic;
}
.composer {
  border-top: 1px solid var(--tool-border);
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.composer-input {
  width: 100%;
  resize: none;
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  font-family: var(--tool-sans);
  font-size: 0.86rem;
  line-height: 1.4;
}
.composer-input:focus {
  outline: none;
  border-color: var(--tool-accent);
}
.send {
  align-self: flex-end;
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 8px;
  padding: 0.45rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
