// Command metis-server serves the Metis web app and the metis engine's API.
//
// By default it runs the engine in its own process, from the
// github.com/gsoultan/metis/engine library: one program to install, one
// database to point it at. With METIS_ENGINE_URL set it forwards the API to an
// engine running elsewhere instead.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gsoultan/metis-server/internal/config"
	"github.com/gsoultan/metis-server/internal/web"
	"github.com/gsoultan/metis-server/ui"
	"github.com/gsoultan/metis/engine"
)

// version is stamped at build time with -ldflags "-X main.version=...".
var version = "dev"

// shutdownTimeout is how long requests in flight get to finish on SIGTERM.
const shutdownTimeout = 20 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("metis-server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// The engine's maintenance commands, such as --reset-password and
	// `upgrade`, run against this installation's database and exit without
	// serving anything.
	if args := os.Args[1:]; len(args) > 0 {
		return engine.New().Run(ctx, args)
	}

	cfg, err := config.FromEnv()
	if err != nil {
		return err
	}
	var handler http.Handler
	if cfg.Role.ServesPeople() {
		if handler, err = web.NewHandler(ui.Dist(), cfg.EngineURL); err != nil {
			return err
		}
	} else {
		handler = web.NewWorkerHandler(cfg.EngineURL)
	}

	// The engine stops when this does, and this stops when the engine does: a
	// web app in front of an engine that has gone is only an error page.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	engineDone := make(chan error, 1)
	if cfg.Embedded {
		// The engine reads its listen address from the environment; keep it
		// on loopback unless told otherwise, so the API is reached through
		// metis-server alone.
		if err := os.Setenv("METIS_HTTP_ADDRESS", cfg.EngineAddress); err != nil {
			return err
		}
		go func() {
			engineDone <- engine.New().Run(ctx, nil)
		}()
	}

	srv := &http.Server{
		Addr:              cfg.Address,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		// No WriteTimeout: /api/v1/events is a stream that stays open. The
		// engine bounds its own requests.
	}
	serveDone := make(chan error, 1)
	go func() {
		slog.Info("metis-server listening", "address", cfg.Address, "role", string(cfg.Role), "engine", engineDescription(cfg), "version", version, "engine_version", engine.Version())
		serveDone <- srv.ListenAndServe()
	}()

	var result error
	select {
	case err := <-serveDone:
		if !errors.Is(err, http.ErrServerClosed) {
			result = err
		}
	case err := <-engineDone:
		result = err
		if result == nil && ctx.Err() == nil {
			result = errors.New("the engine stopped")
		}
		engineDone = nil
	case <-ctx.Done():
	}
	cancel()

	slog.Info("metis-server shutting down")
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil && result == nil {
		result = err
	}
	// The engine drains its own work on the way out, within its own budget.
	if cfg.Embedded && engineDone != nil {
		if err := <-engineDone; err != nil && result == nil {
			result = fmt.Errorf("the engine: %w", err)
		}
	}
	return result
}

func engineDescription(cfg config.Config) string {
	if cfg.Embedded {
		return "in this process, API on " + cfg.EngineURL.String()
	}
	return cfg.EngineURL.String()
}
