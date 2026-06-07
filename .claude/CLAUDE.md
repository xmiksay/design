# CLAUDE.md — `design`

A locally-run CLI (`design <folder>`) that serves a Vue driver SPA over localhost
to work an **agent-neutral design-system repo**. Single Rust crate (Axum server +
embedded Vue SPA). **The tool is folder-agnostic — it runs on any directory and
imposes no substrate format or build.** `example/` is just a sample design system
(currently DTCG tokens + native Web Components); treat it as a suggestion, not a
contract.

Read [README.md](../README.md) for the project rationale and status.

## Build & run

All build/run flows go through the **`Makefile`**. The Vue SPA is embedded via
rust-embed (`#[folder = "ui/dist"]`), so **`ui/dist` must exist before `cargo
build`** — the targets enforce that ordering. The tool runs on any folder; the
`example/` sample needs `make tokens` to generate its `src/tokens.css`.

```sh
make run                 # build ui/dist + run the tool on ./example
make run FOLDER=./path   # …or on any workspace folder
make build               # build SPA + cargo build
make dev                 # hot-reload SPA (vite)
make verify              # pre-"done" gate: lint + tests
make tokens              # (sample) regenerate example/src/tokens.css
```

- `nvm use` before npm (Node pinned in `.nvmrc`). `/check` is the skill wrapper
  around `make verify`.
- No Rust tests yet — `make test-unit` / `test-integration` are wired but empty.

## Architecture

- **`src/` (the tool)** — single crate, logic in the library, thin binary under
  `src/bin/design.rs`. No sub-crates; modules only.
  - `server.rs` — Axum: loopback bind, per-launch token (query → `Strict`
    cookie), Host/Origin checks, `/api/tree`, `/api/file` (traversal-safe),
    `/raw/*` (workspace files for the iframe), and the embedded SPA fallback.
  - `embed.rs` — rust-embed of `ui/dist`.
- **`ui/` (the driver SPA)** — Vue 3 + Vite. Disposable tool UI (Vue is fine
  here; do not confuse it with the substrate). Right pane is three tabbed
  windows: File browser · File preview (highlight.js) · Live preview (iframe
  with an editable `/raw/` address).
- **`example/` (a sample substrate)** — one possible design system, not a
  contract. Currently native **Web Components** themed by **DTCG** token JSON;
  `dtcg.js` + `build.mjs` compile `src/tokens.json` → `src/tokens.css` via
  `npm run tokens`. The substrate owns its own build; the tool never touches it.

## Conventions & invariants

- **The tool imposes no substrate format or build — it runs on any folder.**
  Never move substrate concerns (token compilation, component builds) into the
  Rust tool. That coupling breaks the "any agent / by hand" promise.
- Tool UI = Vue; the substrate is whatever the user's folder is. Keep them
  separate — don't bake substrate assumptions into the tool.
- The live view serves `/raw/` from the workspace; it defaults to
  `preview/index.html` but the address is editable, so any folder works.
- Security stays on from Phase 1: loopback + token + Host/Origin. The `/ws` and
  `/api/agents` routes sit behind the same middleware — don't add routes that
  bypass it.

## Gotchas

- **rust-embed reads from disk in debug, embeds in release** — either way
  `ui/dist` must exist at build time. If the SPA looks stale, rebuild `ui/`.
- **Generated, git-ignored:** `ui/dist/`, `example/preview/`, and
  `example/src/tokens.css` (Vite regenerates the latter from `tokens.json`).
  Also `/target` and `node_modules/`.
- **Verifying the UI:** drive headless Chromium and screenshot. ES modules are
  blocked over `file://` (null-origin CORS) — always serve over HTTP. For
  tabbed/interactive states, drive clicks via the Chrome DevTools Protocol.
- Occasionally `cargo build` reports "Finished" without recompiling after an
  edit; `touch` the changed file and rebuild if a change seems ignored.

## Commits

- **Do not add a `Co-Authored-By` footer** (user preference; see workspace
  `CLAUDE.md` → *Git Workflow*).
- Commit only when asked.

## Agent connection (built)

- `src/agent.rs` is a **session manager**: it owns long-lived agent processes
  keyed by UUID, decoupled from any socket. Closing the browser detaches (the
  agent keeps running, output buffered in a history ring); only an explicit
  `close` op kills the process group. `/ws` multiplexes attach/detach/input/close
  by agent UUID; the backend is a **pure byte relay** (never parses stream-json).
- The Vue SPA owns the protocol: `ui/src/agent.js` (WS client) +
  `ui/src/Chat.vue` (parses stream-json, renders the chat, answers
  `control_request` permission prompts with `control_response`).
- **Live-preview switching is a text marker, not a tool.** The agent writes
  `<!-- preview: <path> -->` in its reply; `Chat.vue` parses it out of the
  assistant text, strips it, and emits `preview` up to `App.vue` (`showPreview`).
  No MCP server, no backend round-trip — keep it that way (the marker syntax is
  defined in `src/prompts/design_system_prompt.md`).
- Agents spawn with `--permission-prompt-tool stdio --permission-mode default
  --allowedTools <rules>`; the pre-approved set is the `--allow` CLI flag (repeatable),
  defaulting to read/edit/`Bash(npm run *)`/git-status. Anything else prompts.
- **Console** (`src/console.rs` + `ui/src/Console.vue`): runs `bash -lc <command>`
  in the workspace and streams output over the same `/ws` (`console.run/kill`,
  `console.output/exit`). Tied to the socket — a reload kills the running command.
- The SPA is top-tabbed: Chat · Console · File browser · File preview · Live preview.

## Known TODO

- Git diff / keep-discard review of agent changes (the "Changes" view).
