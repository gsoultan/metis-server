package web

import (
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
)

// enginePaths are the paths the UI reaches the engine on. Everything else is
// the web app itself.
//
// /api/ is the whole API, including the live updates at /api/v1/events.
// /healthz and /readyz report the engine's version and readiness, which the
// sidebar and the upgrade pages read.
var enginePaths = []string{"/api/", "/healthz", "/readyz"}

// NewHandler serves the web app from dist and forwards the engine's paths to
// the engine at engineURL.
func NewHandler(dist fs.FS, engineURL *url.URL) (http.Handler, error) {
	static, err := newStaticHandler(dist)
	if err != nil {
		return nil, fmt.Errorf("could not prepare the embedded UI for serving: %w", err)
	}
	engine := NewEngineProxy(engineURL)

	mux := http.NewServeMux()
	for _, p := range enginePaths {
		mux.Handle(p, engine)
	}
	// metis-server's own liveness, apart from the engine's: an orchestrator
	// restarting metis-server because the engine is down would only add an
	// outage of the UI to an outage of the engine.
	mux.HandleFunc("GET /server/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
	})
	mux.Handle("/", securityHeaders(static))
	return mux, nil
}

// NewWorkerHandler is what a worker machine serves: the engine's health
// checks and its own, for a load balancer or an orchestrator, and nothing a
// person uses. People reach the installation through the web machines, and a
// worker that answered them too would be one more way in to keep patched and
// watched.
func NewWorkerHandler(engineURL *url.URL) http.Handler {
	engine := NewEngineProxy(engineURL)
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", engine)
	mux.Handle("GET /readyz", engine)
	mux.HandleFunc("GET /server/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "This machine runs the engine's work only. Open Metis through a web machine.", http.StatusNotFound)
	})
	return mux
}
