# Design system — working agreement

This repository is an **agent-neutral design system**. It can be edited by any
person, any LLM, or any coding agent. No tool is required to work here — a text
editor and a browser are enough. The `design` CLI is a convenience driver, never
a dependency.

## What lives where

| Path | Purpose |
|---|---|
| `tokens/` | Design tokens in **DTCG JSON** — the source of truth for all visual values. |
| `dist/tokens.css` | Generated CSS custom properties. **Build artifact — never edit by hand.** |
| `components/` | UI components as **Web Components** (custom elements, no framework). |
| `preview/` | The rendered preview page served as the live view. Open `preview/index.html`. |
| `conventions/` | The canonical rules for authoring tokens and components. Read these first. |

## The one invariant

The substrate stays **stack-neutral**: tokens are open-format JSON, components are
native Web Components, and the preview is plain HTML/CSS/JS. Nothing here may
require a specific framework build to render. This is what keeps the repo workable
by anyone.

## How to make a change

1. Edit `tokens/*.json` and/or add a Web Component in `components/`.
2. Recompile tokens: `design tokens tokens/core.json --out dist/tokens.css`
   (or any DTCG compiler — the format is the contract, not the tool).
3. Open `preview/index.html` (or the live view) to verify.
4. Commit. The repo is the shareable artifact.

See `conventions/` for the detailed authoring rules.
