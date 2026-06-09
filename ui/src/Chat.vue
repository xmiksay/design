<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import hljs from "highlight.js";
import { agentClient } from "./agent.js";
import { renderMarkdown } from "./markdown.js";

const props = defineProps({
  agentId: { type: String, required: true },
});

// The agent drives the live preview by writing a text marker in its reply
// (`<!-- preview: path -->`) instead of calling a tool. We parse it out of the
// assistant text, bubble the path up so App.vue can switch the preview pane, and
// strip the marker so it never renders. HTML comments are invisible anyway, so a
// stray one that slips the strip is harmless.
const emit = defineEmits(["preview"]);
const PREVIEW_MARKER = /<!--\s*preview:\s*([^>]*?)\s*-->/gi;

// Pull every preview marker out of `text`; return the cleaned text plus the last
// requested path (the freshest wins if the agent writes several).
function takePreviewMarkers(text) {
  let path = null;
  const cleaned = text.replace(PREVIEW_MARKER, (_, p) => {
    const trimmed = p.trim();
    if (trimmed) path = trimmed;
    return "";
  });
  return { text: cleaned.trim(), path };
}

// One conversation, rebuilt from the backend's replayed history on (re)attach.
// Each entry is one of: system | user | assistant | thinking | tool | result |
// permission. We render from the *authoritative* full messages (`assistant`,
// `user`, `result`) — not the partial `stream_event`s — so rendering can't drift.
const entries = ref([]);
const busy = ref(false);
const draft = ref("");
const scroller = ref(null);
const composer = ref(null);

let unsub = null;

// Messages the user has sent but the agent hasn't picked up yet. Shown as a
// distinct "queued" bubble below the conversation. They drain FIFO: each time the
// agent echoes a user turn back, we drop the oldest queued one and render the
// real bubble in its place. Cleared on (re)attach (history replay rebuilds all).
const queued = ref([]);

// ---- Chat options ----
// Structured extras the user attaches to a message: tasks, colors (hex + note)
// and inspection strings (e.g. a CSS selector + note). They are appended to the
// free-text draft as labelled markdown sections on send (see buildMessage), then
// cleared. Each is a flat list the user builds up with the option panel.
const tasks = ref([]); // [string]
const colors = ref([]); // [{ color, desc }]
const inspections = ref([]); // [{ value, desc }]
const showOptions = ref(false);

// Pending inputs for the "add" rows in the option panel.
const taskInput = ref("");
const colorValue = ref("#ff0000");
const colorDesc = ref("");
const inspectInput = ref("");
const inspectDesc = ref("");
const inspectDescField = ref(null); // the description <input>, focused on a pick
// A selector captured from the live-preview object-inspect tool, awaiting a
// description. Held aside (never shown in the string input) — the user already
// saw it as a hover label while picking; here they only annotate it.
const pendingInspection = ref("");

const optionCount = computed(
  () => tasks.value.length + colors.value.length + inspections.value.length,
);

// The send buttons activate when there's *anything* to send — free text or any
// attached option.
const hasContent = computed(() => !!draft.value.trim() || optionCount.value > 0);

function addTask() {
  const t = taskInput.value.trim();
  if (!t) return;
  tasks.value.push(t);
  taskInput.value = "";
}
function addColor() {
  const color = colorValue.value.trim();
  if (!color) return;
  colors.value.push({ color, desc: colorDesc.value.trim() });
  colorDesc.value = "";
}
function addInspection() {
  // A pending pick (the captured selector) is the value when present; otherwise
  // the manually typed string is.
  const value = (inspectInput.value.trim() || pendingInspection.value).trim();
  if (!value) return;
  inspections.value.push({ value, desc: inspectDesc.value.trim() });
  inspectInput.value = "";
  inspectDesc.value = "";
  pendingInspection.value = "";
}

function clearOptions() {
  tasks.value = [];
  colors.value = [];
  inspections.value = [];
  pendingInspection.value = "";
}

// Compose the outgoing message: the free text first, then one labelled section
// per non-empty option group, formatted as markdown bullet lists. Empty sections
// are skipped entirely.
function buildMessage() {
  const parts = [];
  const text = draft.value.trim();
  if (text) parts.push(text);
  if (tasks.value.length) {
    parts.push("tasks:\n" + tasks.value.map((t) => `- ${t}`).join("\n"));
  }
  if (colors.value.length) {
    parts.push(
      "colors:\n" +
        colors.value.map((c) => `- \`${c.color}\`${c.desc ? ` ${c.desc}` : ""}`).join("\n"),
    );
  }
  if (inspections.value.length) {
    parts.push(
      "inspections:\n" +
        inspections.value
          .map((i) => `- \`${i.value}\`${i.desc ? ` ${i.desc}` : ""}`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

function reset() {
  entries.value = [];
  busy.value = false;
  queued.value = [];
  clearOptions();
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
        if (b.type === "text" && b.text) {
          const { text, path } = takePreviewMarkers(b.text);
          if (path) emit("preview", path);
          if (text) push({ kind: "assistant", text });
        } else if (b.type === "thinking" && b.thinking) push({ kind: "thinking", text: b.thinking });
        else if (b.type === "tool_use") {
          // AskUserQuestion renders as an interactive card from its paired
          // control_request (which carries the request_id we answer on); skip
          // the generic tool entry so we don't show it twice.
          if (b.name === "AskUserQuestion") continue;
          push({ kind: "tool", id: b.id, name: b.name, input: b.input ?? {}, open: false });
        }
      }
      break;
    }

    case "user": {
      // Either the agent's replayed user text, or a tool_result.
      const blocks = msg.message?.content;
      if (typeof blocks === "string") {
        pushUserText(blocks);
        break;
      }
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b.type === "tool_result") {
            // A tool_result for an outstanding question/permission means it was
            // already answered (e.g. on history replay after reattach) — settle
            // the card instead of re-prompting. Question cards swallow their own
            // result (the card shows the answer); other results render normally.
            const target = findByToolUseId(b.tool_use_id);
            if (target?.kind === "question") {
              if (!target.answered) settleQuestion(target, contentToText(b.content));
              continue;
            }
            if (target?.kind === "permission" && !target.answered) {
              target.answered = true;
              target.allowed = !b.is_error;
            }
            push({
              kind: "toolResult",
              forId: b.tool_use_id,
              text: contentToText(b.content),
              isError: !!b.is_error,
              open: false,
            });
          } else if (b.type === "text" && b.text) {
            pushUserText(b.text);
          }
        }
      }
      break;
    }

    case "control_request":
      if (msg.request?.subtype === "can_use_tool") {
        if (msg.request.tool_name === "AskUserQuestion") {
          const input = msg.request.input ?? {};
          push({
            kind: "question",
            requestId: msg.request_id,
            toolUseId: msg.request.tool_use_id,
            questions: (input.questions ?? []).map((q) => ({
              question: q.question,
              header: q.header ?? "",
              multiSelect: !!q.multiSelect,
              options: q.options ?? [],
              selected: [], // labels the user has picked
              custom: "", // free-text "Other" answer (always available)
            })),
            answered: false,
            summary: "",
          });
        } else {
          push({
            kind: "permission",
            requestId: msg.request_id,
            toolUseId: msg.request.tool_use_id,
            tool: msg.request.tool_name,
            display: msg.request.display_name ?? msg.request.tool_name,
            description: msg.request.description ?? "",
            input: msg.request.input ?? {},
            answered: false,
          });
        }
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

// Two ways to deliver a message, both over the same `/ws` input op:
//
//  • sendDraft (queue) — a bare user message. The agent runs in bidirectional
//    stream-json mode, so writing it mid-turn does NOT interrupt; it queues on
//    stdin and is picked up on the NEXT turn.
//  • steerDraft (change goal) — interrupt the running turn first (work so far is
//    kept), THEN send the user message so it redirects the CURRENT flow.
// Send a user message and show it immediately as a queued bubble. It promotes to
// a real bubble once the agent echoes the turn back (see pushUserText).
function postMessage(text) {
  agentClient.input(props.agentId, {
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] },
  });
  queued.value.push(text);
  scrollDown();
}

// The agent echoed a user turn back — it has picked the message up. Drop the
// oldest queued bubble (FIFO) and render this one for real.
function pushUserText(text) {
  if (queued.value.length) queued.value.shift();
  push({ kind: "user", text });
}

function sendDraft() {
  if (!hasContent.value) return;
  const text = buildMessage();
  postMessage(text);
  draft.value = "";
  clearOptions();
  busy.value = true;
}

function steerDraft() {
  if (!hasContent.value || !busy.value) return;
  const text = buildMessage();
  sendInterrupt();
  postMessage(text);
  draft.value = "";
  clearOptions();
  // Still busy: the interrupt's `result` plus the new turn keep the agent working.
  busy.value = true;
}

// Interrupt a running turn. The agent runs in bidirectional stream-json mode, so
// an interrupt is a control_request on its stdin; the agent answers with a
// `result`, which flips `busy` back off via parseStreamJson.
let interruptSeq = 0;
function sendInterrupt() {
  agentClient.input(props.agentId, {
    type: "control_request",
    request_id: `interrupt-${++interruptSeq}`,
    request: { subtype: "interrupt" },
  });
}
function stop() {
  if (!busy.value) return;
  sendInterrupt();
}

// The parent's object-inspect mode (live preview) hands us a picked element's
// selector. Surface it as a pending inspection: open the options panel, prefill
// the inspection-string input, and focus it with the cursor at the end so the
// user can review/annotate and add it to the message.
function addInspectionDraft(value) {
  showOptions.value = true;
  pendingInspection.value = value; // captured, not shown in the string input
  inspectInput.value = "";
  nextTick(() => inspectDescField.value?.focus());
}
defineExpose({ addInspectionDraft });

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

// ---- AskUserQuestion (interactive question cards) ----

function findByToolUseId(id) {
  if (!id) return null;
  for (let i = entries.value.length - 1; i >= 0; i--) {
    const e = entries.value[i];
    if ((e.kind === "question" || e.kind === "permission") && e.toolUseId === id) {
      return e;
    }
  }
  return null;
}

// Toggle an option. Single-select behaves like a radio; multiSelect accumulates.
function toggleOption(q, label) {
  if (q.multiSelect) {
    const i = q.selected.indexOf(label);
    if (i >= 0) q.selected.splice(i, 1);
    else q.selected.push(label);
  } else {
    q.selected = q.selected[0] === label ? [] : [label];
  }
}

// The chosen value(s) for one question: picked option labels plus any free text.
function questionValues(q) {
  const vals = [...q.selected];
  const custom = q.custom.trim();
  if (custom) vals.push(custom);
  return vals;
}

// Submittable once every question has at least one option or some free text.
function canSubmit(entry) {
  return entry.questions.every((q) => questionValues(q).length > 0);
}

// Answer the whole card: one control_response carrying an `answers` map keyed by
// question text (comma-joined for multi-select), which is how Claude Code's
// AskUserQuestion tool reads the selection back.
function submitQuestion(entry) {
  if (entry.answered || !canSubmit(entry)) return;
  const answers = {};
  for (const q of entry.questions) answers[q.question] = questionValues(q).join(", ");
  const updatedInput = {
    questions: entry.questions.map((q) => ({
      question: q.question,
      header: q.header,
      options: q.options,
      multiSelect: q.multiSelect,
    })),
    answers,
  };
  agentClient.input(props.agentId, {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: entry.requestId,
      response: { behavior: "allow", updatedInput },
    },
  });
  settleQuestion(entry, Object.values(answers).join(" · "));
}

// Mark a question card done and record a short summary line (used both for our
// own submit and for replayed/already-answered cards on reattach).
function settleQuestion(entry, summary) {
  entry.answered = true;
  entry.summary = summary;
}

function prettyInput(input) {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

// Tool/permission inputs are far more readable when a shell command is shown as
// real, syntax-highlighted shell (multi-line, with its `&&`/`\` continuations
// intact) rather than a JSON blob full of escaped "\n". `cmdOf` pulls the
// command out; `restOf` is whatever's left to show as JSON; `highlightCmd`
// applies the bash grammar (the github-dark theme is loaded globally in App.vue).
function cmdOf(input) {
  return input && typeof input.command === "string" ? input.command : null;
}
function restOf(input, omit) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const k of Object.keys(input)) if (!omit.includes(k)) out[k] = input[k];
  return Object.keys(out).length ? out : null;
}
function highlightCmd(cmd) {
  try {
    return hljs.highlight(cmd, { language: "bash" }).value;
  } catch {
    return cmd;
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
          <div class="bubble user markdown" v-html="renderMarkdown(e.text)" />
        </template>

        <template v-else-if="e.kind === 'assistant'">
          <div class="bubble assistant markdown" v-html="renderMarkdown(e.text)" />
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
            <div v-if="e.input.description" class="tool-desc">{{ e.input.description }}</div>
            <template v-if="cmdOf(e.input)">
              <pre class="cmd"><code class="hljs language-bash" v-html="highlightCmd(cmdOf(e.input))" /></pre>
              <pre v-if="restOf(e.input, ['command', 'description'])">{{ prettyInput(restOf(e.input, ['command', 'description'])) }}</pre>
            </template>
            <pre v-else>{{ prettyInput(e.input) }}</pre>
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
            <template v-if="cmdOf(e.input)">
              <pre class="perm-input cmd"><code class="hljs language-bash" v-html="highlightCmd(cmdOf(e.input))" /></pre>
              <pre v-if="restOf(e.input, ['command', 'description'])" class="perm-input">{{ prettyInput(restOf(e.input, ['command', 'description'])) }}</pre>
            </template>
            <pre v-else class="perm-input">{{ prettyInput(e.input) }}</pre>
            <div v-if="!e.answered" class="perm-actions">
              <button class="allow" @click="answer(e, true)">Allow</button>
              <button class="deny" @click="answer(e, false)">Deny</button>
            </div>
            <div v-else class="perm-verdict" :class="e.allowed ? 'ok' : 'no'">
              {{ e.allowed ? "✓ allowed" : "✗ denied" }}
            </div>
          </div>
        </template>

        <template v-else-if="e.kind === 'question'">
          <div class="question" :class="{ done: e.answered }">
            <div v-for="(q, qi) in e.questions" :key="qi" class="q-block">
              <div class="q-head">
                <span v-if="q.header" class="q-chip">{{ q.header }}</span>
                <span class="q-text">{{ q.question }}</span>
                <span v-if="q.multiSelect && !e.answered" class="q-multi">choose any</span>
              </div>
              <div v-if="!e.answered" class="q-options">
                <button
                  v-for="(opt, oi) in q.options"
                  :key="oi"
                  type="button"
                  class="q-option"
                  :class="{ picked: q.selected.includes(opt.label) }"
                  @click="toggleOption(q, opt.label)"
                >
                  <span class="q-option-label">{{ opt.label }}</span>
                  <span v-if="opt.description" class="q-option-desc">{{ opt.description }}</span>
                </button>
              </div>
              <input
                v-if="!e.answered"
                v-model="q.custom"
                class="q-custom"
                type="text"
                placeholder="Other — type your own answer…"
                @keydown.enter.prevent="submitQuestion(e)"
              />
            </div>
            <div v-if="!e.answered" class="q-actions">
              <button class="q-submit" type="button" :disabled="!canSubmit(e)" @click="submitQuestion(e)">
                Send answer ▸
              </button>
            </div>
            <div v-else class="q-answered">✓ answered: {{ e.summary }}</div>
          </div>
        </template>

        <template v-else-if="e.kind === 'system'">
          <div class="system">{{ e.text }}</div>
        </template>

        <template v-else-if="e.kind === 'stderr'">
          <div class="stderr">{{ e.text }}</div>
        </template>
      </div>

      <div v-for="(q, i) in queued" :key="`q${i}`" class="msg queued">
        <div class="bubble queued-bubble markdown" v-html="renderMarkdown(q)" />
        <div class="queued-tag">queued · waiting for agent</div>
      </div>

      <div v-if="busy" class="working">working…</div>
    </div>

    <form class="composer" @submit.prevent="sendDraft">
      <div class="options">
        <button
          type="button"
          class="options-toggle"
          :class="{ open: showOptions }"
          @click="showOptions = !showOptions"
        >
          {{ showOptions ? "▾" : "▸" }} Options
          <span v-if="optionCount" class="options-count">{{ optionCount }}</span>
        </button>

        <div v-if="showOptions" class="options-body">
          <!-- Tasks -->
          <div class="opt-group">
            <div class="opt-label">Tasks</div>
            <ul v-if="tasks.length" class="opt-list">
              <li v-for="(t, i) in tasks" :key="i" class="opt-item">
                <span class="opt-text">{{ t }}</span>
                <button type="button" class="opt-remove" title="Remove" @click="tasks.splice(i, 1)">×</button>
              </li>
            </ul>
            <div class="opt-add">
              <input
                v-model="taskInput"
                class="opt-input"
                type="text"
                placeholder="Add a task…"
                @keydown.enter.prevent="addTask"
              />
              <button type="button" class="opt-add-btn" :disabled="!taskInput.trim()" @click="addTask">+</button>
            </div>
          </div>

          <!-- Colors -->
          <div class="opt-group">
            <div class="opt-label">Colors</div>
            <ul v-if="colors.length" class="opt-list">
              <li v-for="(c, i) in colors" :key="i" class="opt-item">
                <span class="opt-swatch" :style="{ background: c.color }" />
                <code class="opt-code">{{ c.color }}</code>
                <span v-if="c.desc" class="opt-text">{{ c.desc }}</span>
                <button type="button" class="opt-remove" title="Remove" @click="colors.splice(i, 1)">×</button>
              </li>
            </ul>
            <div class="opt-add">
              <input v-model="colorValue" class="opt-color" type="color" title="Pick a color" />
              <input
                v-model="colorDesc"
                class="opt-input"
                type="text"
                placeholder="Description…"
                @keydown.enter.prevent="addColor"
              />
              <button type="button" class="opt-add-btn" @click="addColor">+</button>
            </div>
          </div>

          <!-- Inspections -->
          <div class="opt-group">
            <div class="opt-label">Inspections</div>
            <ul v-if="inspections.length" class="opt-list">
              <li v-for="(s, i) in inspections" :key="i" class="opt-item">
                <code class="opt-code">{{ s.value }}</code>
                <span v-if="s.desc" class="opt-text">{{ s.desc }}</span>
                <button type="button" class="opt-remove" title="Remove" @click="inspections.splice(i, 1)">×</button>
              </li>
            </ul>
            <div class="opt-add">
              <span v-if="pendingInspection" class="opt-pending" title="Element captured from the live preview">◎ element</span>
              <input
                v-else
                v-model="inspectInput"
                class="opt-input"
                type="text"
                placeholder="Inspection string…"
                @keydown.enter.prevent="addInspection"
              />
              <input
                ref="inspectDescField"
                v-model="inspectDesc"
                class="opt-input"
                type="text"
                :placeholder="pendingInspection ? 'Describe the element…' : 'Description…'"
                @keydown.enter.prevent="addInspection"
              />
              <button
                type="button"
                class="opt-add-btn"
                :disabled="!inspectInput.trim() && !pendingInspection"
                @click="addInspection"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <textarea
        ref="composer"
        v-model="draft"
        class="composer-input"
        rows="3"
        placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
        @keydown.enter.exact.prevent="sendDraft"
      />
      <div class="composer-actions">
        <button v-if="busy" class="stop" type="button" @click="stop">■ Stop</button>
        <button
          v-if="busy"
          class="steer"
          type="button"
          :disabled="!hasContent"
          title="Interrupt the current turn and redirect with this message"
          @click="steerDraft"
        >
          Steer ▸
        </button>
        <button class="send" type="submit" :disabled="!hasContent">Send ▸</button>
      </div>
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
/* Sent but not yet picked up by the agent: muted + dashed so it reads as
   provisional, distinct from a confirmed user message. */
.msg.queued {
  align-items: flex-end;
}
.bubble.queued-bubble {
  background: color-mix(in srgb, var(--tool-accent) 22%, var(--tool-panel));
  color: var(--tool-text);
  border: 1px dashed var(--tool-accent);
  opacity: 0.85;
}
.queued-tag {
  margin-top: 0.15rem;
  font-size: 0.66rem;
  font-style: italic;
  color: var(--tool-muted);
}
.bubble.assistant {
  align-self: flex-start;
  background: var(--tool-panel);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-bottom-left-radius: 3px;
}
/* Rendered markdown (v-html) — scoped styles need :deep to reach it. The bubble's
   pre-wrap is dropped here so block elements lay out normally. */
.bubble.markdown {
  white-space: normal;
}
.bubble.markdown :deep(> *:first-child) {
  margin-top: 0;
}
.bubble.markdown :deep(> *:last-child) {
  margin-bottom: 0;
}
.bubble.markdown :deep(p) {
  margin: 0.5em 0;
}
.bubble.markdown :deep(ul),
.bubble.markdown :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}
.bubble.markdown :deep(li) {
  margin: 0.15em 0;
}
.bubble.markdown :deep(h1),
.bubble.markdown :deep(h2),
.bubble.markdown :deep(h3),
.bubble.markdown :deep(h4) {
  margin: 0.7em 0 0.35em;
  line-height: 1.3;
  font-weight: 700;
}
.bubble.markdown :deep(h1) { font-size: 1.15em; }
.bubble.markdown :deep(h2) { font-size: 1.08em; }
.bubble.markdown :deep(h3) { font-size: 1em; }
.bubble.markdown :deep(a) {
  color: var(--tool-accent);
  text-decoration: underline;
}
.bubble.markdown :deep(code) {
  font-family: var(--tool-mono);
  font-size: 0.82em;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 4px;
  padding: 0.05em 0.3em;
}
.bubble.markdown :deep(pre) {
  margin: 0.5em 0;
  padding: 0.6rem;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  overflow: auto;
}
.bubble.markdown :deep(pre code) {
  display: block;
  padding: 0;
  background: transparent;
  border: none;
  font-size: 0.78em;
  line-height: 1.5;
}
.bubble.markdown :deep(blockquote) {
  margin: 0.5em 0;
  padding-left: 0.8em;
  border-left: 3px solid var(--tool-border);
  color: var(--tool-muted);
}
.bubble.markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.92em;
}
.bubble.markdown :deep(th),
.bubble.markdown :deep(td) {
  border: 1px solid var(--tool-border);
  padding: 0.25em 0.5em;
  text-align: left;
}
.bubble.markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--tool-border);
  margin: 0.7em 0;
}
.bubble.markdown :deep(img) {
  max-width: 100%;
}
/* On the accent-filled user bubble, code/links/quotes must read against the ink
   color rather than the panel palette used by assistant bubbles. */
.bubble.user.markdown :deep(a) {
  color: var(--tool-accent-ink);
}
.bubble.user.markdown :deep(code) {
  background: color-mix(in srgb, var(--tool-accent-ink) 16%, transparent);
  border-color: color-mix(in srgb, var(--tool-accent-ink) 30%, transparent);
}
.bubble.user.markdown :deep(pre),
.bubble.user.markdown :deep(pre code) {
  background: color-mix(in srgb, var(--tool-accent-ink) 12%, transparent);
  border-color: color-mix(in srgb, var(--tool-accent-ink) 25%, transparent);
}
.bubble.user.markdown :deep(blockquote) {
  border-left-color: color-mix(in srgb, var(--tool-accent-ink) 40%, transparent);
  color: inherit;
}
.bubble.user.markdown :deep(th),
.bubble.user.markdown :deep(td),
.bubble.user.markdown :deep(hr) {
  border-color: color-mix(in srgb, var(--tool-accent-ink) 30%, transparent);
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
.tool-desc {
  margin: 0.3rem 0 0.1rem;
  font-size: 0.78rem;
  color: var(--tool-text);
}
/* A shell command rendered as real, highlighted multi-line shell. The hljs
   tokens are themed globally; here we just shape the block to match. */
.cmd {
  white-space: pre-wrap;
  word-break: break-word;
}
.cmd code.hljs {
  display: block;
  padding: 0;
  background: transparent;
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  line-height: 1.45;
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
.question {
  align-self: stretch;
  border: 1px solid var(--tool-accent);
  border-radius: 10px;
  padding: 0.7rem 0.75rem;
  background: color-mix(in srgb, var(--tool-accent) 7%, var(--tool-panel));
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.question.done {
  border-color: var(--tool-border);
  background: var(--tool-panel);
}
.q-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.q-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.q-chip {
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--tool-accent);
  border: 1px solid var(--tool-accent);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
}
.q-text {
  font-size: 0.86rem;
  color: var(--tool-text);
  font-weight: 600;
}
.q-multi {
  font-size: 0.68rem;
  color: var(--tool-muted);
  font-style: italic;
}
.q-options {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.q-option {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  text-align: left;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  color: var(--tool-text);
}
.q-option:hover {
  border-color: var(--tool-accent);
}
.q-option.picked {
  border-color: var(--tool-accent);
  background: color-mix(in srgb, var(--tool-accent) 16%, var(--tool-bg));
}
.q-option-label {
  font-size: 0.82rem;
  font-weight: 700;
}
.q-option-desc {
  font-size: 0.74rem;
  color: var(--tool-muted);
  line-height: 1.35;
}
.q-custom {
  background: var(--tool-bg);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font-family: var(--tool-sans);
  font-size: 0.82rem;
}
.q-custom:focus {
  outline: none;
  border-color: var(--tool-accent);
}
.q-actions {
  display: flex;
  justify-content: flex-end;
}
.q-submit {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 8px;
  padding: 0.45rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
.q-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.q-answered {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--tool-accent);
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

/* ── Chat options ──────────────────────────────────────────── */
.options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.options-toggle {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--tool-muted);
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  cursor: pointer;
  padding: 0.1rem 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.options-toggle:hover,
.options-toggle.open {
  color: var(--tool-text);
}
.options-count {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border-radius: 999px;
  padding: 0 0.4rem;
  font-size: 0.66rem;
  font-weight: 700;
}
.options-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.55rem;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  border-radius: 8px;
}
.opt-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.opt-label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--tool-muted);
}
.opt-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.opt-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--tool-panel);
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  padding: 0.25rem 0.4rem;
  font-size: 0.78rem;
}
.opt-swatch {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--tool-border);
}
.opt-code {
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  color: var(--tool-text);
}
.opt-text {
  flex: 1;
  min-width: 0;
  color: var(--tool-text);
  word-break: break-word;
}
.opt-remove {
  flex: none;
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--tool-muted);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 0.15rem;
}
.opt-remove:hover {
  color: var(--tool-danger);
}
.opt-add {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.opt-input {
  flex: 1;
  min-width: 0;
  background: var(--tool-panel);
  color: var(--tool-text);
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  font-family: var(--tool-sans);
  font-size: 0.78rem;
}
.opt-input:focus {
  outline: none;
  border-color: var(--tool-accent);
}
.opt-pending {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: color-mix(in srgb, var(--tool-accent) 16%, var(--tool-bg));
  border: 1px solid var(--tool-accent);
  color: var(--tool-accent);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.74rem;
  font-weight: 600;
  white-space: nowrap;
}
.opt-color {
  flex: none;
  width: 30px;
  height: 28px;
  padding: 0;
  background: var(--tool-panel);
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  cursor: pointer;
}
.opt-add-btn {
  flex: none;
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}
.opt-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.send {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
  border: none;
  border-radius: 8px;
  padding: 0.45rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
.send:disabled,
.steer:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.steer {
  background: transparent;
  color: var(--tool-accent);
  border: 1px solid var(--tool-accent);
  border-radius: 8px;
  padding: 0.45rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
.steer:not(:disabled):hover {
  background: var(--tool-accent);
  color: var(--tool-accent-ink);
}
.stop {
  background: transparent;
  color: var(--tool-danger);
  border: 1px solid var(--tool-danger);
  border-radius: 8px;
  padding: 0.45rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
.stop:hover {
  background: var(--tool-danger);
  color: var(--tool-accent-ink);
}
</style>
