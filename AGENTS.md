# metis-server — Agent Operating Manual

The always-on contract for any agent (or human) working in this repository. The
engine's manual, [`gsoultan/metis` AGENTS.md](https://github.com/gsoultan/metis/blob/main/AGENTS.md),
holds the engine's profile roster (`pm`, `po`, `bpm`, `dmn`, `arch`, `go`, `sec`,
`perf`, `test`, `patterns`, `lead`). The two web-app profiles, `fe` and `ux`, are
in §2.1 below; this file says how all of them apply here.

## 0. What this repository is

The web app people use to design, run and work on processes, and a small Go
server that serves it and forwards its API calls to a metis engine.

- **The engine decides; metis-server forwards.** Authentication,
  authorization, tenancy and every business rule live in the engine. Nothing
  here may make a decision the engine does not also enforce, because programs
  reach the engine without going through metis-server.
- **The browser holds a bearer token.** The Content-Security-Policy in
  `internal/web/static.go` is what keeps an injected script from sending it
  elsewhere. Loosening it needs a `sec` sign-off in writing.
- **metis-server must not turn an engine fault into a worse one.** An
  unreachable engine is a 502 in the engine's error shape, never a hang, and
  `/server/healthz` does not follow the engine's health.

## 1. The loop

Discover → Work → Verify → Persist, as in the engine's manual.

- **Discover:** `rtk graphify query "<term>"` once `graphify-out/graph.json`
  exists here (`make graph` builds it).
- **Verify:** `make gate`. For a change to a page, also `make e2e`.
- **Persist:** `rtk graphify update .`; README and these files follow the change.

## 2. Profiles and driver routing

### 2.1 The web-app profiles

Moved here from the engine's manual with the web app. Each has `Owns · Vetoes ·
Proof`, as the engine's profiles do.

#### `fe` — Frontend UI Engineer
- **Owns:** React/TS correctness, routing, state, bundle size, build health.
- **Vetoes:**
  - `bun run build`, `tsc -b`, or `eslint .` failing or regressing.
  - `any` added to a service/API boundary type.
  - State derived into `useState` + `useEffect` where it could be derived during render.
  - An unvirtualized list that can grow unbounded (task inbox, instance list, audit log).
  - A component over ~300 lines carrying fetching, mapping and rendering at once.
- **Proof:** Build + typecheck + lint output. Bundle delta for anything touching vendor chunks.

#### `ux` — UI/UX & Low-Code Expert
- **Owns:** The experience of a **non-technical business user** — the primary persona for the
  inbox, designer and troubleshooter.
- **Vetoes:**
  - Technical vocabulary surfaced to end users (`Task_Approved`, node IDs, stack traces,
    raw JSON) where a business narrative belongs.
  - An error with no plain-English cause and no suggested fix.
  - Advanced/expert settings shown by default instead of behind progressive disclosure.
  - **Interactive UI with no accessible name** — every control needs a label; keyboard paths
    must work. This is a procurement blocker for enterprise buyers, not a nicety.
  - Hardcoded user-facing English where the product claims multi-region readiness.
- **Proof:** A described click-path for a non-expert user. Keyboard + screen-reader check on
  new interactive components.

### 2.2 Driver routing

| You are changing… | Driver | Mandatory Challenger(s) |
| :-- | :-- | :-- |
| `ui/src/pages/**`, `components/**`, `hooks/**` | `fe` | `ux`, `perf` |
| Designer, Task Inbox, Troubleshooter, forms | `ux` | `fe`, `bpm` |
| `internal/web/**` (proxy, static files, headers) | `sec` | `arch`, `perf` |
| `cmd/**`, `internal/config/**`, Dockerfile, compose, `deploy/**`, `.goreleaser.yaml` | `arch` | `sec` |
| `e2e/**`, CI workflows, tooling | `test` | `lead` |
| README, this file, `docs/**` | `pm` | `lead` |

## 3. Repository map

| Path | Contents |
| :-- | :-- |
| `cmd/metis-server/` | Entry point: reads settings, serves, shuts down on SIGTERM |
| `internal/config/` | `METIS_ENGINE_URL`, `METIS_SERVER_ADDRESS` |
| `internal/web/` | The handler: static files, security headers, the engine proxy |
| `ui/` | The React app (Vite, Mantine, TanStack Router); `ui/embed.go` embeds `ui/dist` |
| `e2e/` | Playwright suite, run against metis-server in front of a real engine |
| `scripts/dev.sh` | Development: the engine through its checkout's `scripts/dev.sh backend` (admin / admin, development database only), and this UI's Vite server |
| `scripts/e2e.sh` | Builds and starts both, seeds the engine, runs the suite |
| `deploy/linux/`, `.goreleaser.yaml` | Linux packages: systemd/OpenRC service, env file, maintainer scripts; built on a tag by `.github/workflows/release.yml` |
| `docs/` | UI coding guidelines (`guidelines.md`) and the UI/UX audits moved from the engine |

## 4. Verification gate

```
make gate     # ui-build, gofmt, vet, go test -race (UI required), build, ui typecheck, lint, test
make e2e      # with DATABASE_URL and an engine checkout
```

## 5. Task summary format

```
Driver: <profile> · Challenger: <profile>
Change:    <one line>
Vetoes raised & answered:
  - [sec] <veto> → <how it was resolved>
Verification:
  make gate → <result>
Persisted: graphify updated · <memory written, if any>
```

## 6. Commit attribution

**Never add AI co-authorship trailers.** No `Co-Authored-By: Claude ...`, no
`Generated with Claude Code`, no AI attribution in commit messages, PR bodies,
tags, or code comments. The commit author is the human who shipped the work.
