# metis-server: the Metis web app (ui/) and the Go server that serves it and
# forwards its API calls to a metis engine.

GO ?= go

.PHONY: help
help: ## List the targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

.PHONY: ui-deps
ui-deps: ## Install UI dependencies
	cd ui && bun install

.PHONY: ui-build
ui-build: ## Build the UI into ui/dist, which the Go binary embeds
	cd ui && bun run build

.PHONY: ui-typecheck
ui-typecheck: ## Typecheck the UI (see ui/TYPESCRIPT.md)
	cd ui && bun run typecheck

.PHONY: ui-lint
ui-lint: ## Lint the UI
	cd ui && bun run lint

.PHONY: ui-test
ui-test: ## Run the UI tests
	cd ui && bun test

.PHONY: dev-ui
dev-ui: ## Run the Vite dev server against an engine on :8273 (METIS_BACKEND overrides)
	cd ui && bun run dev

.PHONY: build
build: ## Build bin/metis-server (run ui-build first for a binary with the UI in it)
	$(GO) build -trimpath -o bin/metis-server ./cmd/metis-server

.PHONY: run
run: build ## Run metis-server against METIS_ENGINE_URL (default http://localhost:8273)
	METIS_ENGINE_URL=$${METIS_ENGINE_URL:-http://localhost:8273} ./bin/metis-server

.PHONY: fmt-check
fmt-check: ## Fail on any Go file gofmt would change
	@test -z "$$(gofmt -l $$(git ls-files '*.go'))" || (gofmt -l $$(git ls-files '*.go'); exit 1)

.PHONY: vet
vet: ## go vet
	$(GO) vet ./...

.PHONY: test
test: ## Go tests
	$(GO) test -count=1 ./...

.PHONY: race
race: ## Go tests with the race detector, the UI required in the binary
	METIS_REQUIRE_UI=1 $(GO) test -race -count=1 ./...

.PHONY: e2e
e2e: ## Playwright suite against metis-server and an engine from ../metis (DATABASE_URL = an empty *e2e* database)
	./scripts/e2e.sh

.PHONY: e2e-serve
e2e-serve: ## Start and seed the engine and metis-server, and leave them running
	./scripts/e2e.sh --serve

.PHONY: gate
gate: ui-build fmt-check vet race build ui-typecheck ui-lint ui-test ## The full verification gate

METIS_ENGINE_DIR ?= ../metis

.PHONY: proto
proto: ## Regenerate ui/src/gen from the engine's protos (METIS_ENGINE_DIR, default ../metis)
	buf generate $(METIS_ENGINE_DIR)/api/proto

.PHONY: graph
graph: ## Rebuild the graphify knowledge graph
	rtk graphify update .
