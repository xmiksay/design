---
name: check
description: Run the build + test verification for the `design` tool before declaring a change done. Use when asked to verify, check, or confirm the repo is green — lint (Rust fmt + clippy) and tests, in the order rust-embed requires. Wraps `make verify`.
---

# /check — verify the `design` tool

Verify the repo is green before any change is called done. Always drive this through the **Makefile** — do not retype raw cargo/npm commands.

## Steps

1. **Node version.** If `nvm` is available, run `nvm use` first (pinned in `.nvmrc`).
2. **Run the gate:**
   ```bash
   make verify
   ```
   `verify` = `lint` (`cargo fmt --check`, `cargo clippy --all-targets -D warnings`) + `test` (`test-unit` + `test-integration`).
3. **If a build or local run is also requested**, use `make build` / `make run` — never `cargo build`/`cargo run` directly. The driver SPA is embedded by **rust-embed** (`#[folder = "ui/dist"]`), so `ui/dist` must exist first; the `build`/`run` targets produce it before invoking cargo. A bare `cargo build` embeds a stale or missing SPA.

## Notes

- **No tests exist yet.** `make test-unit` runs clean (nothing to run); `make test-integration` is guarded to no-op until a `tests/` dir exists. When you add logic, add tests with it — unit (`#[cfg(test)]` in the module) and integration (`tests/`).
- `ui/` has no linter/typecheck configured, so `make lint` covers Rust only. If you touch the SPA, sanity-check with `make dev` (vite) or `make ui`.
- Report pass/fail per stage with real output. Never claim green on red. Fix clippy warnings (they're `-D warnings`) and re-run.
