package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/assemble"
	"github.com/gsoultan/metis-server/internal/identity/pgtest"
	"github.com/gsoultan/metis-server/internal/identity/signin"
)

const (
	userID = "0193a000-0000-7000-8000-0000000000a1"
	org    = "0193a000-0000-7000-8000-000000000001"
	pass   = "a long enough password"
)

type accounts struct{ a identity.Account }

func (f accounts) ByUsername(_ context.Context, n string) (identity.Account, bool, error) {
	return f.a, n == f.a.Username, nil
}

func (f accounts) ByID(_ context.Context, id string) (identity.Account, bool, error) {
	return f.a, id == f.a.UserID, nil
}

func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	db := pgtest.Open(t)
	ctx := context.Background()
	for _, q := range []string{`INSERT INTO users (id) VALUES ('` + userID + `')`, `INSERT INTO organizations (id) VALUES ('` + org + `')`} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	env := identity.Env{
		DB:       db,
		Accounts: accounts{identity.Account{UserID: userID, Username: "ada", Roles: map[string][]string{org: {"ADMIN"}}}},
		Seal:     func(s string) (string, error) { return "sealed:" + s, nil },
		Open: func(s string) (string, error) {
			p, ok := strings.CutPrefix(s, "sealed:")
			if !ok {
				return "", errors.New("not sealed")
			}
			return p, nil
		},
	}
	getenv := func(k string) string {
		return map[string]string{signin.EnvTwoFactor: "optional", signin.EnvDevMode: "true"}[k]
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	id, err := assemble.New(ctx, env, getenv, log)
	if err != nil {
		t.Fatal(err)
	}
	if err := id.SetPassword(ctx, userID, pass); err != nil {
		t.Fatal(err)
	}
	me := func(context.Context, string) (json.RawMessage, error) {
		return json.RawMessage(`{"id":"` + userID + `","username":"ada"}`), nil
	}
	srv := httptest.NewServer(New(id, me, log))
	t.Cleanup(srv.Close)
	return srv
}

func call(t *testing.T, srv *httptest.Server, method, path, token string, body any) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, srv.URL+path, &buf)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set(OrganizationHeader, org)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	out := map[string]any{}
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func TestTheEnginesSignInAndKeyRoutesAnswerTheSameShapes(t *testing.T) {
	srv := newServer(t)

	status, out := call(t, srv, "POST", "/api/v1/login", "", map[string]string{"username": "ada", "password": "wrong"})
	if status != http.StatusUnauthorized || out["error"] == nil {
		t.Fatalf("wrong password: %d %v", status, out)
	}

	status, out = call(t, srv, "POST", "/api/v1/login", "", map[string]string{"username": "ada", "password": pass})
	token, _ := out["token"].(string)
	user, _ := out["user"].(map[string]any)
	if status != http.StatusOK || token == "" || user["username"] != "ada" {
		t.Fatalf("sign in: %d %v", status, out)
	}

	status, out = call(t, srv, "GET", "/api/v1/users/me/two-factor", token, nil)
	if status != http.StatusOK || out["enrolled"] != false || out["required"] != false {
		t.Fatalf("two-factor status: %d %v", status, out)
	}

	status, out = call(t, srv, "POST", "/api/v1/integration-keys", token, map[string]any{"name": "Billing", "roles": []string{"USER"}})
	key, _ := out["token"].(string)
	id, _ := out["id"].(string)
	if status != http.StatusCreated || !strings.HasPrefix(key, "mik_") || id == "" {
		t.Fatalf("create key: %d %v", status, out)
	}

	// A key cannot manage keys, nor a person's own account.
	if status, _ = call(t, srv, "GET", "/api/v1/integration-keys", key, nil); status != http.StatusForbidden {
		t.Fatalf("a key listing keys: %d", status)
	}
	if status, _ = call(t, srv, "GET", "/api/v1/users/me/two-factor", key, nil); status != http.StatusForbidden {
		t.Fatalf("a key reading two-factor status: %d", status)
	}

	status, out = call(t, srv, "GET", "/api/v1/integration-keys", token, nil)
	if keys, _ := out["keys"].([]any); status != http.StatusOK || len(keys) != 1 {
		t.Fatalf("list keys: %d %v", status, out)
	}
	if status, _ = call(t, srv, "DELETE", "/api/v1/integration-keys/"+id, token, nil); status != http.StatusNoContent {
		t.Fatalf("revoke key: %d", status)
	}

	if status, _ = call(t, srv, "POST", "/api/v1/users/me/password", token, map[string]string{"current_password": pass, "new_password": "another long password"}); status != http.StatusOK {
		t.Fatalf("change password: %d", status)
	}
	// Changing the password ended every session, this one included.
	if status, _ = call(t, srv, "POST", "/api/v1/logout", token, nil); status != http.StatusOK {
		t.Fatalf("logout: %d", status)
	}
	if status, _ = call(t, srv, "GET", "/api/v1/users/me/two-factor", token, nil); status != http.StatusUnauthorized {
		t.Fatalf("after the password changed: %d", status)
	}
}

func TestOnlyTheIdentityRoutesAreClaimed(t *testing.T) {
	h := New(nil, nil, slog.Default())
	for path, want := range map[string]bool{
		"POST /api/v1/login":                  true,
		"DELETE /api/v1/integration-keys/abc": true,
		"GET /api/v1/users/me":                false,
		"GET /api/v1/processes":               false,
		"DELETE /api/v1/users/x/two-factor":   false,
		"GET /api/v1/login":                   false,
	} {
		method, p, _ := strings.Cut(path, " ")
		if got := h.Owns(httptest.NewRequest(method, p, nil)); got != want {
			t.Errorf("Owns(%s) = %v, want %v", path, got, want)
		}
	}
}
