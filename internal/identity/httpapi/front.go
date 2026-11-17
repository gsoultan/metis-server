package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gsoultan/metis-server/internal/identity/assemble"
)

// Front sends the identity routes to metis-server's identity and everything
// else on to next. The identity is built when the engine has opened its
// database, a moment after the server starts listening, or after the setup
// wizard has chosen one. A sign-in arriving in that moment waits for it, up to
// readyWait, and then answers 503, as the engine's would while it starts.
type Front struct {
	next    http.Handler
	routes  *Handler // only for Owns
	handler atomic.Pointer[Handler]
	ready   chan struct{}
	once    sync.Once
	me      Me
	log     *slog.Logger
}

// readyWait is how long a sign-in waits for the identity to be built.
const readyWait = 15 * time.Second

// NewFront serves the identity routes once Ready is called, and next the rest.
func NewFront(next http.Handler, me Me, log *slog.Logger) *Front {
	return &Front{next: next, routes: New(nil, nil, log), ready: make(chan struct{}), me: me, log: log}
}

// Ready starts serving the identity routes from id.
func (f *Front) Ready(id *assemble.Identity) {
	f.handler.Store(New(id, f.me, f.log))
	f.once.Do(func() { close(f.ready) })
}

func (f *Front) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !f.routes.Owns(r) {
		f.next.ServeHTTP(w, r)
		return
	}
	h := f.handler.Load()
	if h == nil {
		timer := time.NewTimer(readyWait)
		select {
		case <-f.ready:
			h = f.handler.Load()
		case <-timer.C:
		case <-r.Context().Done():
		}
		timer.Stop()
	}
	if h == nil {
		w.Header().Set("Retry-After", "2")
		writeError(w, http.StatusServiceUnavailable, "the server is starting; try again in a moment")
		return
	}
	h.ServeHTTP(w, r)
}

// EngineMe reads the signed-in account from the engine at base, as the
// engine's GET /api/v1/users/me shows it.
func EngineMe(base *url.URL) Me {
	client := &http.Client{Timeout: 10 * time.Second}
	target := base.JoinPath("/api/v1/users/me").String()
	return func(ctx context.Context, token string) (json.RawMessage, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer func() { _ = res.Body.Close() }()
		body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		if err != nil {
			return nil, err
		}
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("the engine answered %d", res.StatusCode)
		}
		// The engine answers {"user": {...}}; its sign-in answered the
		// account itself, so that is what goes in a sign-in's "user".
		var wrapped struct {
			User json.RawMessage `json:"user"`
		}
		if err := json.Unmarshal(body, &wrapped); err != nil || len(wrapped.User) == 0 {
			return nil, fmt.Errorf("the engine's answer has no user")
		}
		return wrapped.User, nil
	}
}
