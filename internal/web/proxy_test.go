package web

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func newTestHandler(t *testing.T, engine http.Handler) http.Handler {
	t.Helper()
	srv := httptest.NewServer(engine)
	t.Cleanup(srv.Close)
	u, err := ParseEngineURL(srv.URL)
	if err != nil {
		t.Fatalf("parse engine URL: %v", err)
	}
	h, err := NewHandler(testDist(), u)
	if err != nil {
		t.Fatalf("build handler: %v", err)
	}
	return h
}

func TestAPICallsReachTheEngineUnchanged(t *testing.T) {
	var seen *http.Request
	var body string
	h := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		w.Header().Set("X-Engine", "yes")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id":"1"}`)
	}))

	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/processes?project=p1", strings.NewReader(`{"key":"k"}`))
	req.Header.Set("Authorization", "Bearer token-1")
	req.Header.Set("X-Organization-ID", "org-1")
	req.RemoteAddr = "203.0.113.7:5555"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated || rec.Body.String() != `{"id":"1"}` || rec.Header().Get("X-Engine") != "yes" {
		t.Fatalf("got %d %q %v, want the engine's answer", rec.Code, rec.Body.String(), rec.Header())
	}
	if seen.URL.Path != "/api/v1/processes" || seen.URL.RawQuery != "project=p1" {
		t.Fatalf("engine saw %s?%s", seen.URL.Path, seen.URL.RawQuery)
	}
	if body != `{"key":"k"}` {
		t.Fatalf("engine saw body %q", body)
	}
	if got := seen.Header.Get("Authorization"); got != "Bearer token-1" {
		t.Fatalf("engine saw Authorization %q", got)
	}
	if got := seen.Header.Get("X-Organization-ID"); got != "org-1" {
		t.Fatalf("engine saw X-Organization-ID %q", got)
	}
	if got := seen.Header.Get("X-Forwarded-For"); got != "203.0.113.7" {
		t.Fatalf("engine saw X-Forwarded-For %q, want the browser's address", got)
	}
}

func TestHealthAndReadinessAreTheEngines(t *testing.T) {
	h := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "engine "+r.URL.Path)
	}))
	for _, p := range []string{"/healthz", "/readyz"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, p, nil))
		if rec.Body.String() != "engine "+p {
			t.Fatalf("%s answered %q, want the engine's", p, rec.Body.String())
		}
	}
}

func TestPagesAreServedFromTheUIAndNeverReachTheEngine(t *testing.T) {
	h := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("the engine was asked for %s", r.URL.Path)
	}))
	for _, p := range []string{"/", "/inbox", "/designer/abc", "/apiary"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, p, nil))
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<title>Metis</title>") {
			t.Fatalf("%s answered %d %q, want the app shell", p, rec.Code, rec.Body.String())
		}
		if rec.Header().Get("Content-Security-Policy") == "" {
			t.Fatalf("%s has no Content-Security-Policy", p)
		}
	}
}

func TestAnUnreachableEngineIsABadGatewayInTheEnginesShape(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	u, _ := ParseEngineURL(srv.URL)
	srv.Close() // nothing listens there now
	h, err := NewHandler(testDist(), u)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/tasks", nil))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"err":`) {
		t.Fatalf("body %q, want the engine's error shape", rec.Body.String())
	}
}

// The live updates are server-sent events: each event must reach the browser
// when the engine writes it, not when the stream ends.
func TestServerSentEventsAreNotBuffered(t *testing.T) {
	release := make(chan struct{})
	engine := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: first\n\n")
		w.(http.Flusher).Flush()
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})
	front := newTestHandler(t, engine)
	srv := httptest.NewServer(front)
	defer srv.Close()
	defer close(release)

	req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+"/api/v1/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	line := make(chan string, 1)
	go func() {
		s, _ := bufio.NewReader(resp.Body).ReadString('\n')
		line <- s
	}()
	select {
	case got := <-line:
		if got != "data: first\n" {
			t.Fatalf("first line %q", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the first event did not arrive while the stream was open")
	}
}

func TestServerLivenessDoesNotDependOnTheEngine(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:1")
	h, err := NewHandler(fstest.MapFS{"index.html": {Data: []byte("x")}}, u)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/server/healthz", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rec.Code)
	}
}

func TestABinaryWithoutTheUISaysSo(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:1")
	h, err := NewHandler(fstest.MapFS{".gitkeep": {Data: nil}}, u)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil))
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "make ui-build") {
		t.Fatalf("got %d %q, want a 503 naming make ui-build", rec.Code, rec.Body.String())
	}
}

func TestParseEngineURL(t *testing.T) {
	good := map[string]string{
		"http://localhost:8273":    "http://localhost:8273",
		"https://engine.internal/": "https://engine.internal",
		" http://10.0.0.5:8273 ":   "http://10.0.0.5:8273",
	}
	for in, want := range good {
		u, err := ParseEngineURL(in)
		if err != nil || u.String() != want {
			t.Errorf("ParseEngineURL(%q) = %v, %v; want %s", in, u, err, want)
		}
	}
	for _, bad := range []string{"", "localhost:8273", "ftp://x", "http://", "http://u:p@x", "http://x/api", "http://x?a=1"} {
		if _, err := ParseEngineURL(bad); err == nil {
			t.Errorf("ParseEngineURL(%q) accepted it", bad)
		}
	}
}
