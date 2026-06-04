# CLAUDE.md — `design`

A locally-run CLI (`design <folder>`) that serves a Vue driver SPA over localhost
to work an **agent-neutral design-system repo**. Single Rust crate (Axum server +
embedded Vue SPA); the substrate it edits is a separate, self-building repo.

Read [README.md](README.md) for the project rationale and status.

## Build & run

The Vue SPA is embedded via rust-embed (`#[folder = "ui/dist"]`), so **`ui/dist`
must exist before `cargo build`**. The substrate must be built so a `preview/`
exists to serve.

```sh
cd ui && npm run build && cd ..          # produces ui/dist (embedded)
cd example && npm run build && cd ..     # produces example/preview + tokens.css
cargo build
./target/debug/design ./example          # the only arg is the workspace folder
```

- Run `cargo build` after Rust changes; `npm run build` in `ui/` after SPA
  changes (then rebuild the binary so the new SPA is embedded).
- `nvm use` before npm if the project ever pins a Node version.

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
- **`example/` (the substrate)** — the agent-neutral design system. **JSX**
  (React) page components, themed by **DTCG** token JSON. `dtcg.js` compiles
  `src/tokens.json` → `src/tokens.css` as a Vite plugin — the substrate owns
  token compilation; the tool does not touch tokens.

## Conventions & invariants

- **The substrate must build with plain `npm run build` — no tool dependency.**
  Never move substrate concerns (token compilation, component builds) into the
  Rust tool. That coupling breaks the "any agent / by hand" promise.
- Tool UI = Vue; substrate components = JSX. Keep them separate.
- The tool serves the *built* `preview/`; token/source edits show up after the
  substrate is rebuilt (a runner-driven rebuild is a Phase-2 concern).
- Security stays on from Phase 1: loopback + token + Host/Origin. Don't add
  routes that bypass the middleware.

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

- **Do not add a `Co-Authored-By` footer** (user preference).
- Commit only when asked.

## Known TODO

- `example/AGENTS.md` and `example/conventions/components.md` still describe the
  old **Web Components** authoring format; the substrate is now **JSX**. Update
  when touching the substrate's conventions.
- Phase 2: wire the Prompt box to a `Runner` trait + Claude Code headless impl.
