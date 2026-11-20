package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFrontPassesEverythingElseOnAndRefusesSignInUntilReady(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	f := NewFront(next, nil, slog.Default())

	w := httptest.NewRecorder()
	f.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/processes", nil))
	if w.Code != http.StatusTeapot {
		t.Fatalf("an engine route: %d", w.Code)
	}

	// A caller that gives up while the identity is being built is answered
	// at once, not after the whole wait.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w = httptest.NewRecorder()
	f.ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/login", nil).WithContext(ctx))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("a sign-in before the identity is built: %d", w.Code)
	}
}
