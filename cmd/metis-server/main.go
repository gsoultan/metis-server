// Command metis-server serves the Metis web app and forwards its API calls to
// a metis engine.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gsoultan/metis-server/internal/config"
	"github.com/gsoultan/metis-server/internal/web"
	"github.com/gsoultan/metis-server/ui"
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
	cfg, err := config.FromEnv()
	if err != nil {
		return err
	}
	handler, err := web.NewHandler(ui.Dist(), cfg.EngineURL)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.Address,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		// No WriteTimeout: /api/v1/events is a stream that stays open. The
		// engine bounds its own requests.
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errs := make(chan error, 1)
	go func() {
		slog.Info("metis-server listening", "address", cfg.Address, "engine", cfg.EngineURL.String(), "version", version)
		errs <- srv.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
	}

	slog.Info("metis-server shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	return nil
}
