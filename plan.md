# `design` — Project Plan

## Goal

A locally-run CLI, `design <path>`, that serves a Vue SPA where a user drives a code agent (Claude Code first) against a git-controlled design-system repo, then stops and pushes. The shareable artifact is the **repo**; the tool is a disposable dev-server-class driver. Core invariant: the repo stays agent-neutral so anyone can collaborate with any agent/LLM/by hand — the tool is a convenience, never a dependency.

## Architecture in one breath

Three separable concerns. The **substrate** is the repo: neutral conventions (markdown), open-format tokens, neutral rendered output — this carries the "any agent" promise. The **runner** turns *(workspace + prompt)* into *(normalized event stream + git diff)*; Claude Code headless is impl #1 behind a trait. The **server** is localhost-only, serves the committed preview + git state, and brokers prompt→runner. Files-as-truth, session-as-cache: nothing the agent needs to remember lives in session state; it gets written into the repo.

## Decisions to lock before building (Phase 0 gate)

The load-bearing one: **component authoring format** — neutral (web components / HTML+CSS) vs framework-specific. Neutral keeps one preview server universal; framework-specific forces a per-stack build and erodes the promise. Everything downstream (preview, skills, who-can-contribute) ripples from this.

Secondary: token format (lean DTCG as source, compile to CSS custom properties); conventions canonical / skills generated; runner-contract shape even with one impl; distribution as separately-installed CLI, not bundled in the repo.

## Phases

**Phase 0 — Substrate.** Repo layout, conventions tree (`AGENTS.md`-style root + `conventions/`), token format, and a neutral preview target. No agent, no server. *Exit:* a hand-authored example component renders from committed sources; the authoring-format decision is made and written down.

**Phase 1 — CLI + server bootstrap.** `design <path>` binds `127.0.0.1`, random port, per-launch token, validates `Origin`. Serves the *committed* preview (not the live working tree). Owns subprocess lifecycle — process-group reaping on exit so no orphaned agents. No agent invocation yet. *Exit:* `design <path>` serves the Phase-0 preview; Ctrl-C leaves nothing running.

**Phase 2 — Runner, backend-only.** `Runner` trait + Claude Code headless impl: spawn against the workspace, capture stream-json, normalize tool-call/text/result events into a common model, land a commit. Single-active-run lock per workspace. Driven by CLI flag or raw HTTP — no UI. *Exit:* a prompt issued over HTTP produces a normalized event log and a real commit; a second concurrent run is rejected.

**Phase 3 — SPA.** Vue serves preview + git diff view first (read-only, honoring "no prompt↔loop early"), then the prompt box wires to the runner: streaming events (SSE/WS), cancellation, keep-vs-discard on the diff, session resume. Stopping mid-run is surfaced, not hidden. *Exit:* full loop in the browser — prompt, watch, review diff, keep or discard, repeat; stop and `git push` by hand.

**Phase 4 — Harden + distribute + prove neutrality.** Package as an installed CLI; generate skills from the conventions (committed, regenerable, not canonical); attribution via commit trailers (who + agent/model). Optionally a second runner impl (Aider/Cline) or a manual-Cursor walkthrough to demonstrate the repo alone suffices. *Exit:* a fresh clone is drivable by a different agent with zero tool-specific files required.

## Risks carried forward

The server is the only new attack surface — localhost bind + token + origin check neutralize it, and they're in from Phase 1. Concurrency is solved by the single-run lock, not by being clever. The working tree *is* the artifact, so git is the review/undo buffer and the SPA's job is to make git state legible. The one decision that can quietly break the whole premise is authoring format coupling the preview to a stack — hence the Phase-0 gate.

## v1 done when

`design <path>` runs locally, drives Claude Code through prompt→diff→keep/discard in the browser, commits with attribution, and the resulting repo is fully workable by a different agent or by hand — no part of the "any agent" promise depends on `design` itself.

---

I left the authoring-format decision open rather than picking for you, since you flagged that you design from requirements first — but it's the one Phase-0 blocker. Want me to lay out the trade-offs of neutral vs framework-specific authoring as a decision memo, or is that one you've already settled?