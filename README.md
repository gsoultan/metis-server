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

### Signing in with an authenticator app

A Metis engine asks staff for a second factor after their password. The web
app carries the screens for it; the engine decides and enforces it, so a
program that calls the engine directly cannot skip it.

- **At sign-in**, after a correct password, the app asks for the six-digit
  code from the account's authenticator app, or one of its recovery codes.
- **The first time**, an account without an app sets one up there: a QR code
  to scan (drawn in the page; the secret never leaves it), the first code to
  confirm, and ten one-use recovery codes, shown once.
- **Profile** shows whether the app is on and how many recovery codes are
  left, and makes new ones with a current code from the app.
- **Platform access** lets an administrator remove somebody else's app, for a
  lost phone: their sessions end and they set up a new one at their next
  sign-in. Nobody removes their own.

Engines older than two-factor sign-in answer a password with a session, and
the app signs in as before.

### Programs and the Go SDK

Programs use [`gsoultan/metis-sdk`](https://github.com/gsoultan/metis-sdk).
Every call it makes is under `/api/v1`, so it works pointed at metis-server or
at the engine directly, with the same token:

```go
client := metis.NewClient("https://metis.example.com", metis.WithAPIKey(key)) // no /api/v1: the client adds it
```

A program does not sign in with a person's password, which needs a code from
an authenticator app. It uses its organization's integration API key
(`mik_…`), made by an administrator of the organization, which acts there with
the roles it was given and is never asked for a code.

Through metis-server, the engine's `METIS_TRUSTED_PROXIES` matters for
programs too: without it a busy program shares one rate limit with every
person using the web app. When the engine cannot be reached, metis-server
answers 502 with the engine's error shape (`{"error": "…"}`), which the SDK
reads as a server error worth retrying. Webhook deliveries come from the
engine, and gRPC is served by the engine only.

The web app's SDK page (`/sdk`) prints its Go snippets against metis-sdk; a
test reads the SDK's source so that a snippet naming a call or field the SDK
does not have fails the build.

### Installing on Linux

Each release (`v*` tag) publishes deb, rpm, apk and Arch packages for amd64
and arm64, and plain archives, on the
[releases page](https://github.com/gsoultan/metis-server/releases), with a
signed `checksums.txt` (the release notes show the `cosign verify-blob`
command). A package installs `/usr/bin/metis-server`, a hardened systemd unit
(OpenRC on Alpine), a `metis-server` system account, and
`/etc/metis-server/metis-server.env`, which the package manager keeps across
upgrades. It does not start the service:

```bash
sudo apt-get install ./metis-server_<version>_amd64.deb
sudoedit /etc/metis-server/metis-server.env   # METIS_ENGINE_URL
sudo systemctl enable --now metis-server
```

With the engine's own package on the same host, both default to `:8080`; the
env file says how to move the engine to `127.0.0.1:8273`. The packages are
built by `.goreleaser.yaml`, which builds the UI first, and CI installs them on
Debian, Rocky, Alpine and Arch and boots the deb under systemd on every pull
request.

## Developing the UI

With a checkout of `gsoultan/metis` next to this one (`../metis`, or
`METIS_ENGINE_DIR`):

```bash
make dev               # PostgreSQL, the engine and this UI; open http://localhost:5273
make dev-reset         # the same, with an empty development database
./scripts/dev.sh --sample   # set up and fill it with worked examples
```

Sign in as **`admin` / `admin`**. That account exists only in the development
database the engine's `scripts/dev.sh` sets up: it runs the setup wizard with a
long random password, then writes the hash of `admin` into that database. The
engine refuses a password under eight characters everywhere else, and nothing
here gives metis-server, its image or `docker compose` a default account; they
start at the setup wizard. `--wizard` does the same in development. A database
that is already set up keeps its own password: `make dev-reset` starts again.

`scripts/dev.sh` starts the engine and its database through the engine
checkout's own `scripts/dev.sh backend` (so `--reset`, `--sample`, `--wizard`,
`API_PORT`, `GRPC_PORT` and `DATABASE_URL` apply), and the Vite dev server from
this repository on `UI_PORT`. `./scripts/dev.sh --help` lists them.

Against an engine that is already running:

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

Some UI tests read the other repositories' source, so `make gate` needs
checkouts next to this one: `gsoultan/metis` (`../metis`, or
`METIS_ENGINE_DIR`) and `gsoultan/metis-sdk` (`../metis-sdk`, or
`METIS_SDK_DIR`). `make e2e` needs the engine checkout too. See [`e2e/README.md`](e2e/README.md).
The suite signs in with a password alone, so `scripts/e2e.sh` starts the
engine with `METIS_DEV_MODE=true METIS_TWO_FACTOR=optional`.

## History

`ui/` and `e2e/` moved here from `gsoultan/metis` with their history, so
`git log` and `git blame` reach back past the move.

## License

MIT. See [LICENSE](LICENSE).
