# Format — design system

An **agent-neutral, buildless** design system for web designers. Edit it with any
editor, any LLM, or any coding agent. No framework and no bundler are required —
a text editor and a browser are enough. The `design` CLI only serves the preview;
it is never a dependency.

## Identity

This kit **codifies the `design` tool's own UI** (`ui/`, the Vue driver SPA): a
dark slate canvas (`bg` `#15171c`, `panel` `#1c1f26`) with hairline `#2a2e38`
borders, a mint **accent** (`#6ee7b7`) on dark ink, muted slate text for labels,
and **danger** red. Type is **system-ui** for the interface and **JetBrains
Mono** for labels, paths and code. Controls are 7px-radius; pills and status dots
are 999px; the live mint dot glows. `example/` is only the inspiration for *how*
to present a preview — this substrate's look is the tool's.

## What lives where

| Path | Purpose |
| --- | --- |
| `src/tokens.json` | Design tokens in **DTCG JSON** — the source of truth for every visual value. |
| `src/tokens.css` | Generated CSS custom properties. **Build artifact — never edit by hand.** |
| `components/` | UI as **Web Components**, one `ds-<name>.js` per file. `index.js` registers them all. |
| `src/styles.css` | Page chrome only (layout, masthead, section frames). Component visuals live in each component's shadow DOM. |
| `src/main.js` | Page entry — imports the component barrel so custom elements upgrade. |
| `preview/index.html` | The live spec sheet — authored by hand, served directly. |
| `dtcg.js` / `build.mjs` | The DTCG → CSS compiler and a zero-dependency Node runner. |

## The one invariant

The substrate stays **stack-neutral and buildless**: tokens are open-format JSON,
components are native Web Components, and the preview is plain HTML/CSS/JS loaded
straight by the browser. Nothing here needs a bundler or a framework to render.
Components read `var(--token)` — never hard-coded values.

## Token compilation

Tokens are the contract, not the tool. After editing `src/tokens.json`, run
`node build.mjs` (or `npm run tokens`) to regenerate `src/tokens.css`. Any DTCG
compiler can produce the same custom properties.

## How to make a change

1. Edit `src/tokens.json` and/or add a Web Component under `components/` (and
   import it from `components/index.js`).
2. Add a specimen to `preview/index.html` so it shows in the live view.
3. If you touched tokens, run `node build.mjs`.
4. Open `preview/index.html` (the live view) to verify.
5. Commit. The repo is the shareable artifact.
