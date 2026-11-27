# metis-server

The Metis web app and the server in front of the engine.

Metis is split in two repositories:

| Repository | What it is |
| :-- | :-- |
| [`gsoultan/metis`](https://github.com/gsoultan/metis) | **The engine.** BPMN 2.0 orchestration, the DMN decision engine, the API, its database. Headless: it serves no pages. |
| `gsoultan/metis-server` (this one) | **Everything a person uses.** The web app (designer, inbox, admin pages) and the Go server that serves it. It runs the engine in its own process, from the metis library, or forwards to one elsewhere. With the engine in its process, it also signs people in: passwords, sessions, authenticator apps and integration API keys. |
| [`gsoultan/metis-sdk`](https://github.com/gsoultan/metis-sdk) | The Go client for programs. It talks to the engine's API, directly or through metis-server. |

## Running it

metis-server runs the engine in its own process, from the
[`engine`](https://github.com/gsoultan/metis/tree/main/engine) package, so one
program and one PostgreSQL database are all an installation needs. The engine
reads its own settings (`DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET` and the
rest; see the engine's README) from the same environment:

```bash
make ui-deps ui-build                       # once, and after any UI change
DATABASE_URL=postgres://… ENCRYPTION_KEY=… JWT_SECRET=… make run
# open http://localhost:8080
```

The engine's maintenance commands run through the same binary, for example
`metis-server --reset-password alice` or `metis-server --help`.

To use an engine running elsewhere instead, set `METIS_ENGINE_URL`, and
metis-server forwards the API to it. Or the whole stack (PostgreSQL, an engine
built from `../metis`, and metis-server):

```bash
docker compose up --build
```

### Learning from examples

**Processes → Add examples** adds two worked examples to the current project,
each with the decision table it asks:

- **Purchase approval by role.** A table decides the first approver from the
  submitter's role: a Supervisor's request goes to an Operating Manager and
  then the Unit Head, an Operating Manager's straight to the Unit Head. A
  request sent back for revision goes to whoever submitted it.
- **Equipment order.** A table decides whether an order needs approval; if it
  does, the order runs the purchase approval as a process of its own. Then it
  calls a public web service, posts in Slack through a connector and waits for
  the delivery, the last two at once.

It can also create the `operating-managers` and `unit-heads` groups, put the
person in both and add them to the project's People, so one person can act
as every approver. An example already in the project is left as it is. The
examples are in `ui/src/domain/examples/`.

### More than one machine

Point every machine at the same database and give each a role. Put the `web`
machines behind your load balancer and keep `worker` machines off it: they
answer only their health checks. Work is claimed with leases, so any number of
workers share it without doing anything twice.

```bash
METIS_ROLE=web    metis-server   # behind the load balancer, as many as you need
METIS_ROLE=worker metis-server   # doing the jobs, as many as you need
```

### Settings

| Variable | Default | What it does |
| :-- | :-- | :-- |
| `METIS_ENGINE_URL` | (unset) | Unset: run the engine in this process. Set: the base address of an engine elsewhere, such as `http://localhost:8273` (http or https, no path), which the API is forwarded to. |
| `METIS_HTTP_ADDRESS` | `127.0.0.1:8273` | Where the engine in this process serves its API. Loopback, so it is reached through metis-server. |
| `METIS_SERVER_ADDRESS` | `:8080` | Where metis-server listens. |
| `METIS_ROLE` | `all` | `all`: serve people and run the engine's jobs, timers and deliveries. `web`: serve people, run none of the work. `worker`: run the work and serve only `/healthz`, `/readyz` and `/server/healthz`. Every machine points at the same database; run at least one `all` or `worker` beside any `web` machines. Also read from `server.role` in `config.yaml`, where joining a machine writes it; the environment wins. With `METIS_ENGINE_URL` set the machine is always `web`. |

With the engine in this process, metis-server forwards each request to it on
loopback, with the browser's address in `X-Forwarded-For`. The engine trusts
loopback by default; if you set `METIS_TRUSTED_PROXIES`, include `127.0.0.1/32`.

With an engine elsewhere, set on the **engine** `METIS_TRUSTED_PROXIES` to include metis-server's
address. metis-server sends the browser's address in `X-Forwarded-For`, and the
engine believes it only from a trusted proxy. Without it every user shares one
address in the engine's rate limiter and audit log.

### What it serves

| Path | Goes to |
| :-- | :-- |
| Sign-in and keys: `/api/v1/login…`, `/api/v1/logout`, `/api/v1/users/me/password`, `/api/v1/users/me/two-factor…`, `/api/v1/integration-keys…` | metis-server's own identity, with the engine in this process; the engine, with one elsewhere |
| the rest of `/api/…` (including the live updates at `/api/v1/events`) | The engine, told who the caller is |
| `/healthz`, `/readyz` | The engine's version and readiness |
| `/server/healthz` | metis-server itself (204 while it runs, whatever the engine is doing) |
| everything else | The web app |

### Who signs people in

With the engine in this process, **metis-server signs people in**, and the
engine is a library that trusts the caller metis-server names for it (through
the engine's `WithIdentity` hook). metis-server keeps, in the engine's
PostgreSQL database, tables of its own named `identity_*`:

- **Passwords**, as bcrypt hashes. The engine's password column only says the
  account signs in elsewhere.
- **Sessions**: opaque `mss_…` tokens, stored hashed, ended at sign-out, on a
  password change or when an administrator removes the account's app, and
  checked against the account on every request, so a removed account is out
  at once. They last 12 hours.
- **Authenticator apps** and their recovery codes, sealed with the engine's
  `ENCRYPTION_KEY`, and the five-minute step between a password and its code.
- **Integration API keys** (`mik_…`), stored hashed.

The first start copies the passwords and apps the engine already had, so
nobody sets anything up again. The engine's columns are left as they were, so
going back to an engine that signs people in itself still finds them.

The engine still decides what each caller may do: roles, organizations and
everything else. With an engine elsewhere (`METIS_ENGINE_URL`), that engine
signs its own callers in, and metis-server only serves files and forwards
requests.

### Signing in with an authenticator app

Staff are asked for a second factor after their password. metis-server
decides and enforces it, and the engine refuses any request it has not been
told the caller of, so a program cannot skip it by calling the engine's
address. `METIS_TWO_FACTOR` and `METIS_DEV_MODE` work as the engine's README
describes: required unless both say otherwise. People on the task inbox sign
in through the engine's People sign-in and are not asked for an app.

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

An engine elsewhere older than two-factor sign-in answers a password with a
session, and the app signs in as before.

`metis-server --reset-password alice` and `metis-server --reset-two-factor
alice` change metis-server's own records, and end the account's sessions.

### Programs and the Go SDK

Programs use [`gsoultan/metis-sdk`](https://github.com/gsoultan/metis-sdk).
Point it at metis-server: with the engine in metis-server's process, that is
the only address that knows the keys and sessions.

```go
client := metis.NewClient("https://metis.example.com", metis.WithToken(key)) // no /api/v1: the client adds it
```

A program does not sign in with a person's password, which needs a code from
an authenticator app. It uses its organization's integration API key
(`mik_…`), which acts there with the roles it was given and is never asked for
a code. An administrator of the organization makes one with
`POST /api/v1/integration-keys`, naming the organization in
`X-Organization-ID`; the key is shown once, and only its hash is kept. A key
never carries the administrator role, and cannot reach the organization's
users, settings or keys.

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
command). Linux only: nothing is built for macOS or Windows.

A package installs all of Metis on the machine: `/usr/bin/metis-server` with
the engine in its process, a hardened systemd unit (OpenRC on Alpine), a
`metis-server` system account, `/var/lib/metis-server` for its state (the
setup wizard's `config.yaml` lands there), and
`/etc/metis-server/metis-server.env` for its settings and secrets, which the
package manager keeps across upgrades. It needs a PostgreSQL, on this host or
another. A fresh install enables the service at boot and starts it
(`systemctl disable --now metis-server` turns that off):

```bash
sudo apt-get install ./metis-server_<version>_amd64.deb
# open http://<server>:8080/setup and choose the database there;
# the setup token is in: journalctl -u metis-server | grep "setup token"
```

Or set `DATABASE_URL`, `JWT_SECRET` and `ENCRYPTION_KEY` in the env file and
restart it, and `METIS_ROLE` for a `web` or `worker` machine. After an
upgrade, take a backup, then `systemctl restart metis-server`; an upgrade
never restarts it, and never re-enables a service you disabled.

The Upgrades page reports the release tag the binary was built from and
compares it with this repository's releases. On a systemd host the package
also installs `metis-server-upgrade.path`, enabled once on the first install
that ships it, so the page's Upgrade button can install a newer release: it
verifies the release's signature (this repository's release workflow) and
checksums, takes a backup, installs the package and restarts the service.
From a shell the same is `sudo metis-server upgrade --to vX.Y.Z`;
`systemctl disable --now metis-server-upgrade.path` keeps upgrades to the
shell. The packages are built by
`.goreleaser.yaml`, which builds the UI first, and CI installs them on Debian, Rocky, Alpine and Arch and boots
the deb under systemd against PostgreSQL on every pull request.

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
