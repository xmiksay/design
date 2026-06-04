# Design system — working agreement

This repository is an **agent-neutral design system**. It can be edited by any
person, any LLM, or any coding agent. No tool and **no build step** are required
to work here — a text editor and a browser are enough. The `design` CLI is a
convenience driver (it serves the preview); it is never a dependency.

## What lives where

| Path | Purpose |
| --- | --- |
| `src/tokens.json` | Design tokens in **DTCG JSON** — the source of truth for all visual values. |
| `src/tokens.css` | Generated CSS custom properties. **Build artifact — never edit by hand.** |
| `components/` | UI components as **Web Components** (custom elements, no framework), one `ds-<name>.js` per file. `index.js` is a barrel that registers them all. |
| `src/mock.js` | Dummy/fixture data the preview pages feed into the components. |
| `src/main.js`, `src/gallery.js`, `src/layout.js` | Per-page entry modules: register components and feed them mock data. |
| `src/styles.css` | Page chrome only (layout, headings, the gallery frame). Component visuals live in each component's shadow DOM. |
| `preview/` | The preview pages, **served directly** as the live view — `index.html` (overview), `components.html` (gallery), `layout.html` (composed page). These are authored by hand, not generated. |
| `dtcg.js` / `build.mjs` | The DTCG → CSS compiler and a zero-dependency Node runner for it. |
| `conventions/` | The canonical rules for authoring tokens and components. Read these first. |

## The one invariant

The substrate stays **stack-neutral and buildless**: tokens are open-format JSON,
components are native Web Components, and the preview is plain HTML/CSS/JS loaded
straight by the browser (`<script type="module">` + `<link>`). Nothing here
requires a bundler or a framework to render. This is what keeps the repo workable
by anyone.

## Token compilation

The substrate owns token compilation — the `design` tool only serves. `dtcg.js`
is a self-contained DTCG → CSS compiler; run it with `node build.mjs` (or
`npm run tokens`) to regenerate `src/tokens.css` after editing `src/tokens.json`.
The DTCG **format is the contract, not the tool** — any DTCG compiler can produce
the same CSS custom properties.

## Needing a third-party library

Buildless does not block dependencies. Pull a library as native ESM from a CDN
(`import { x } from "https://esm.sh/lib"`), optionally tidied with an
`<script type="importmap">` so component files keep bare names, or vendor its ESM
file into a `vendor/` folder and import it relatively. Reach for a bundler only if
you genuinely need an npm-scale dependency tree.

## How to make a change

1. Edit `src/tokens.json` and/or add a Web Component in `components/` (and import
   it from `components/index.js`).
2. Give it sample values in `src/mock.js` and add a specimen in `src/gallery.js`
   (place it on `preview/layout.html` too if it belongs in the composed view).
3. If you touched tokens, run `node build.mjs` to regenerate `src/tokens.css`.
4. Open `preview/index.html` (or the live view) to verify. Switch the live-view
   address to `preview/components.html` or `preview/layout.html` for the other
   outputs.
5. Commit. The repo is the shareable artifact.

See `conventions/` for the detailed authoring rules.
