# metis-server — Claude Code project instructions

**Read [`AGENTS.md`](AGENTS.md) first, on every task.**

metis-server is the Metis web app (`ui/`) and the Go server that serves it and
forwards its API calls to a metis engine. The engine lives in
[`gsoultan/metis`](https://github.com/gsoultan/metis), which is engine only.

## Standing rules

- **UI and anything a person uses goes here; the engine goes in gsoultan/metis.**
  A change that needs both is two pull requests, the engine's first.
- **Coding standards** for the UI are [`docs/guidelines.md`](docs/guidelines.md).
  The general, low-code and roadmap rules stay in the engine repository's
  `.junie/guidelines.md`, which applies here too.
- **Roadmap priority is fixed**: `P0 Security & Reliability` → `P1 Scalability &
  Performance` → `P2 UX Delight`.
- `go build` works on a fresh clone (ui/dist ships a placeholder), but the
  binary then serves a 503 instead of the app. Run `make ui-deps ui-build` first.
- **`make gate` is the verification gate.** `make e2e` needs an engine checkout
  (`../metis` or `METIS_ENGINE_DIR`) and an empty PostgreSQL database whose name
  contains `e2e`.
- **Never report done on an unrun command.** Paste the output.
- **Never add AI co-authorship trailers** to commits, PRs, tags, or comments.
