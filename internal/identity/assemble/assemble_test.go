package assemble

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/apikey"
	"github.com/gsoultan/metis-server/internal/identity/pgtest"
	"github.com/gsoultan/metis-server/internal/identity/signin"
)

const (
	userID = "0193a000-0000-7000-8000-0000000000a1"
	org    = "0193a000-0000-7000-8000-000000000001"
)

type accounts struct{ a identity.Account }

func (f accounts) ByUsername(_ context.Context, n string) (identity.Account, bool, error) {
	return f.a, n == f.a.Username, nil
}

func (f accounts) ByID(_ context.Context, id string) (identity.Account, bool, error) {
	return f.a, id == f.a.UserID, nil
}

func TestOneIdentityAnswersForSessionsAndKeys(t *testing.T) {
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
	id, err := New(ctx, env, getenv, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}

	if err := id.SetPassword(ctx, userID, "a long enough password"); err != nil {
		t.Fatal(err)
	}
	res, err := id.SignIn.SignIn(ctx, "ada", "a long enough password")
	if err != nil || res.Token == "" {
		t.Fatalf("sign in: %+v, %v", res, err)
	}
	ask := func(token string) (identity.Principal, bool, error) {
		r := httptest.NewRequest("GET", "/api/v1/processes", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		return id.Authenticate(ctx, r)
	}
	if p, ok, err := ask(res.Token); err != nil || !ok || p.UserID != userID || p.ViaKey {
		t.Fatalf("session: %+v %v %v", p, ok, err)
	}

	admin := apikey.Administrator{Principal: identity.Principal{UserID: userID, Roles: map[string][]string{org: {"ADMIN"}}}, Username: "ada", OrganizationID: org}
	_, key, err := id.Keys.Create(ctx, admin, "Billing", []string{"USER"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if p, ok, err := ask(key); err != nil || !ok || !p.ViaKey {
		t.Fatalf("key: %+v %v %v", p, ok, err)
	}
	if _, ok, err := ask("something else"); ok || err != nil {
		t.Fatalf("an unknown token: %v %v", ok, err)
	}
}

func TestAnIncompleteEnvironmentIsRefused(t *testing.T) {
	if _, err := New(context.Background(), identity.Env{}, func(string) string { return "" }, slog.Default()); err == nil {
		t.Fatal("want an error")
	}
}
