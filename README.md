# metis-server

The Metis web app and the server in front of the engine.

Metis is split in two repositories:

| Repository | What it is |
| :-- | :-- |
| [`gsoultan/metis`](https://github.com/gsoultan/metis) | **The engine.** BPMN 2.0 orchestration, the DMN decision engine, the API, its database. Headless: it serves no pages. |
| `gsoultan/metis-server` (this one) | **Everything a person uses.** The web app (designer, inbox, admin pages) and the Go server that serves it and forwards its API calls to an engine. |
| [`gsoultan/metis-sdk`](https://github.com/gsoultan/metis-sdk) | The Go client for programs. It talks to the engine's API, directly or through metis-server. |

## Running it

metis-server needs a running engine. Point `METIS_ENGINE_URL` at it:

```bash
make ui-deps ui-build                       # once, and after any UI change
METIS_ENGINE_URL=http://localhost:8273 make run
# open http://localhost:8080
```

Or the whole stack (PostgreSQL, an engine built from `../metis`, and metis-server):

```bash
docker compose up --build
```

### Settings

| Variable | Default | What it does |
| :-- | :-- | :-- |
| `METIS_ENGINE_URL` | (required) | The engine's base address, such as `http://localhost:8273`. http or https, no path. |
| `METIS_SERVER_ADDRESS` | `:8080` | Where metis-server listens. |

On the **engine**, set `METIS_TRUSTED_PROXIES` to include metis-server's
address. metis-server sends the browser's address in `X-Forwarded-For`, and the
engine believes it only from a trusted proxy. Without it every user shares one
address in the engine's rate limiter and audit log.

### What it serves

| Path | Goes to |
| :-- | :-- |
| `/api/…` (including the live updates at `/api/v1/events`) | The engine, unchanged |
| `/healthz`, `/readyz` | The engine's version and readiness |
| `/server/healthz` | metis-server itself (204 while it runs, whatever the engine is doing) |
| everything else | The web app |

The engine does all authentication and authorization. metis-server only serves
files and forwards requests; it holds no secrets and no database.

## Developing the UI

```bash
make dev-ui            # Vite on :5273, proxying /api to an engine on :8273
```

`METIS_BACKEND` points the dev server at another engine. See
[`ui/README.md`](ui/README.md) and [`ui/TYPESCRIPT.md`](ui/TYPESCRIPT.md).

The web app is React (19+), Vite, Mantine UI, React Flow, Zustand, TanStack
Query and TanStack Router. Its coding rules are in
[`docs/guidelines.md`](docs/guidelines.md); the UI/UX audits that shaped it are
in [`docs/`](docs/).

## Verification

```bash
make gate              # UI build, gofmt, vet, Go tests with -race, UI typecheck, lint and tests
DATABASE_URL=postgres://metis:metis@127.0.0.1:5432/metis_e2e?sslmode=disable make e2e
```

`make e2e` needs a checkout of `gsoultan/metis` next to this one, or
`METIS_ENGINE_DIR` pointing at one. See [`e2e/README.md`](e2e/README.md).

## History

`ui/` and `e2e/` moved here from `gsoultan/metis` with their history, so
`git log` and `git blame` reach back past the move.

## License

MIT. See [LICENSE](LICENSE).
