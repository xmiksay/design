# design

A locally-run CLI that serves a small web app for driving a code agent against a
**git-controlled, agent-neutral design-system repo**.

```sh
design ./my-design-system
```

You open the printed `http://127.0.0.1:…` URL, browse the workspace, watch a live
preview, and (soon) prompt an agent to make changes — then review the diff, keep
or discard, and push by hand.

## The idea

The shareable artifact is the **repo**, not the tool. `design` is a disposable,
dev-server-class driver. The core invariant: the repo stays workable by anyone —
any agent, any LLM, or by hand — so the tool is always a convenience, never a
dependency. The substrate is buildless — `npm run tokens` only compiles the DTCG
tokens to CSS; `design` just serves it and brokers prompts to an agent.

## Status

Phase 1 is in place: the CLI, the localhost server, and the driver SPA.

- ✅ `design <folder>` — loopback-only server, random port, per-launch token,
  Host + Origin checks
- ✅ Driver SPA (Vue) embedded into the binary, with three windows:
  **File browser**, **File preview** (syntax highlighted), and **Live preview**
  (an iframe with an editable address)
- ✅ File APIs: workspace tree, file read (path-traversal safe), raw file serving
- ⏳ **Runner** (Phase 2) — the Prompt box is present but inert; wiring it to
  Claude Code headless is the next step
- ⏳ Git diff / keep-discard view (Phase 3)

## Architecture

Three separable concerns:

- **Substrate** — the design-system repo being edited. Open formats only: DTCG
  token JSON, native Web Components, plain HTML/CSS. Buildless — `npm run tokens`
  just compiles the tokens. Carries the "any agent" promise. `example/` is a
  working sample.
- **Server** — localhost-only Axum server. Serves the embedded SPA and the
  workspace files, and (Phase 2) brokers prompt → runner.
- **Runner** — turns *(workspace + prompt)* into *(event stream + git diff +
  commit)*. A `Runner` trait with a Claude Code headless impl. *Not yet built.*

## Repo layout

```
src/
  bin/design.rs   # CLI entry (single positional: the workspace folder)
  lib.rs          # library root
  server.rs       # Axum server: security, file APIs, static serving
  embed.rs        # rust-embed of the built SPA (ui/dist)
ui/               # Vue 3 + Vite driver SPA (embedded into the binary)
example/          # sample substrate: Web Components + DTCG tokens
  dtcg.js         # DTCG → CSS compiler (substrate-owned)
  build.mjs       # zero-dep Node runner for it (`npm run tokens`)
  src/tokens.json # design tokens (source of truth)
```

## Prerequisites

- Rust (stable) + Cargo
- Node + npm

## Build & run

The SPA is embedded into the binary at compile time, so build it **before**
`cargo build`. The sample substrate is buildless (its `preview/` pages are
authored, not generated), but its `src/tokens.css` is compiled from the tokens.

```sh
# 1. Build the driver SPA (produces ui/dist, embedded by rust-embed)
cd ui && npm install && npm run build && cd ..

# 2. Compile the sample substrate's tokens (produces example/src/tokens.css)
cd example && npm run tokens && cd ..

# 3. Build and run the tool
cargo build
./target/debug/design ./example
```

Open the printed URL. Ctrl-C stops the server cleanly.

## Security model

The server is the only new attack surface, so it ships locked down from day one:

- Binds `127.0.0.1` only (never `0.0.0.0`).
- A random per-launch token authorizes the first navigation via `?t=…`, then
  pins to a `Strict`, `HttpOnly` cookie for the session.
- `Host` and `Origin` headers are validated against the loopback authority to
  block DNS-rebinding and cross-site requests.
- File reads are confined to the workspace root (path-traversal rejected).

## License

MIT.
