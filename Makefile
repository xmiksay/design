# design — build/test/dev targets.
# Node version is pinned in .nvmrc (run `nvm use` first if needed).
# IMPORTANT: the driver SPA is embedded into the binary by rust-embed
# (`#[folder = "ui/dist"]`), so ui/dist must exist before any cargo build —
# `build` and `run` enforce that ordering.

export CARGO_BUILD_JOBS ?= 4
FOLDER ?= ./example

.DEFAULT_GOAL := help
.PHONY: help ui tokens build run dev check fmt lint test test-unit test-integration verify clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n",$$1,$$2}'

ui: ## Build the driver SPA into ui/dist (prereq for any cargo build)
	cd ui && npm ci && npm run build

tokens: ## (sample) compile example tokens → example/src/tokens.css
	cd example && npm run tokens   # zero-dep: build.mjs is a plain node runner, no install needed

build: ui ## Build the tool (SPA first, then the binary that embeds it)
	cargo build

run: ui ## Run the tool on a workspace folder (override: make run FOLDER=./path)
	cargo run -- $(FOLDER)

dev: ## Hot-reload the SPA (vite)
	cd ui && npm run dev

check: ## Fast Rust typecheck
	cargo check

fmt: ## Apply Rust formatting
	cargo fmt

lint: ## Rust format-check + clippy (ui has no linter configured)
	cargo fmt --check
	cargo clippy --all-targets -- -D warnings

test-unit: ## Unit tests (in-module #[cfg(test)]) — none yet
	cargo test --lib --bins

test-integration: ## Integration tests (tests/) — none yet
	@test -d tests && cargo test --test '*' || echo "no integration tests yet (tests/ absent)"

test: test-unit test-integration ## All tests

verify: lint test ## Pre-"done" gate: lint + tests

clean: ## Remove build artifacts + generated files
	cargo clean
	rm -rf ui/dist example/preview example/src/tokens.css
