# metis-server — the Metis web app, in front of a metis engine.
#
# Two build stages: the UI first, because ui/embed.go embeds ui/dist, then the
# Go binary. The engine is a separate image (gsoultan/metis); this one holds
# no engine and no database driver.

# ---- stage 1: the UI ----------------------------------------------------
# The output is JavaScript, identical whatever it was bundled on, so it is
# built on the build platform rather than emulated.
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS ui

WORKDIR /src/ui
COPY ui/package.json ui/bun.lock* ./
# package.json's postinstall runs a script from ui/scripts.
COPY ui/scripts ./scripts
RUN bun install --frozen-lockfile

COPY ui/ ./
# `bun run build` ends in the bundle budget check, so an image cannot be built
# from a tree that has blown it.
RUN bun run build

# ---- stage 2: the server ------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.27.4-alpine AS build

WORKDIR /src
COPY . .
COPY --from=ui /src/ui/dist ./ui/dist

ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0
ENV GOOS=${TARGETOS} GOARCH=${TARGETARCH}
RUN go build -trimpath \
      -ldflags "-s -w -X main.version=${VERSION}" \
      -o /out/metis-server ./cmd/metis-server

# ---- stage 3: what ships ------------------------------------------------
# distroless static: no shell, nothing to exec. One file.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/metis-server /usr/local/bin/metis-server
USER nonroot:nonroot

# 8080: the web app, and the engine's API forwarded to METIS_ENGINE_URL.
EXPOSE 8080

# Probe /server/healthz for metis-server itself; /healthz and /readyz are the
# engine's, forwarded.
ENTRYPOINT ["/usr/local/bin/metis-server"]
