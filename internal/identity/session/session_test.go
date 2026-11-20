package session

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/migrate"
	"github.com/gsoultan/metis-server/internal/identity/pgtest"
)

const (
	userID = "0193a000-0000-7000-8000-0000000000a1"
	org    = "0193a000-0000-7000-8000-000000000001"
)

// fakeAccounts stands in for the engine's accounts.
type fakeAccounts struct {
	account identity.Account
	ok      bool
	err     error
}

func (f *fakeAccounts) ByUsername(context.Context, string) (identity.Account, bool, error) {
	return f.account, f.ok, f.err
}

func (f *fakeAccounts) ByID(context.Context, string) (identity.Account, bool, error) {
	return f.account, f.ok, f.err
}

func setup(t *testing.T, requireCode bool) (*Service, *fakeAccounts) {
	t.Helper()
	db := pgtest.Open(t)
	ctx := context.Background()
	if err := migrate.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users (id) VALUES ($1)`, userID); err != nil {
		t.Fatal(err)
	}
	accounts := &fakeAccounts{ok: true, account: identity.Account{
		UserID: userID, Username: "ada", Roles: map[string][]string{org: {"ADMIN"}},
	}}
	return NewService(NewPGStore(db), accounts, requireCode), accounts
}

func TestASessionActsAsItsAccountWithTheAccountsCurrentRoles(t *testing.T) {
	svc, accounts := setup(t, true)
	ctx := context.Background()
	token, _, err := svc.Issue(ctx, userID, true)
	if err != nil {
		t.Fatal(err)
	}

	r := httptest.NewRequest("GET", "/api/v1/processes", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	p, ok, err := identity.NewAuthenticator(svc).Authenticate(ctx, r)
	if err != nil || !ok || p.UserID != userID || p.ViaKey || p.Roles[org][0] != "ADMIN" {
		t.Fatalf("p=%+v ok=%v err=%v", p, ok, err)
	}

	// A role taken away takes effect on the next request.
	accounts.account.Roles = map[string][]string{org: {"USER"}}
	p, err = svc.Verify(ctx, token)
	if err != nil || p.Roles[org][0] != "USER" {
		t.Fatalf("after the role change: p=%+v err=%v", p, err)
	}

	accounts.account.Disabled = true
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("disabled account: err = %v", err)
	}
}

func TestASessionEndsWhenSignedOutOrExpired(t *testing.T) {
	svc, _ := setup(t, true)
	ctx := context.Background()

	token, _, err := svc.Issue(ctx, userID, true)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SignOut(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("signed out: err = %v", err)
	}

	a, _, _ := svc.Issue(ctx, userID, true)
	b, _, _ := svc.Issue(ctx, userID, true)
	if err := svc.SignOutEverywhere(ctx, userID); err != nil {
		t.Fatal(err)
	}
	for _, tok := range []string{a, b} {
		if _, err := svc.Verify(ctx, tok); !errors.Is(err, identity.ErrNotRecognised) {
			t.Fatalf("signed out everywhere: err = %v", err)
		}
	}

	token, ends, err := svc.Issue(ctx, userID, true)
	if err != nil {
		t.Fatal(err)
	}
	svc.now = func() time.Time { return ends }
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("expired: err = %v", err)
	}
}

func TestASessionWithoutACodeIsRefusedWhenCodesAreRequired(t *testing.T) {
	svc, _ := setup(t, true)
	ctx := context.Background()
	token, _, err := svc.Issue(ctx, userID, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("err = %v", err)
	}
	svc.requireCode = false
	if _, err := svc.Verify(ctx, token); err != nil {
		t.Fatalf("codes optional: err = %v", err)
	}
}

func TestAnAccountLookupThatFailsRefusesRatherThanLettingThrough(t *testing.T) {
	svc, accounts := setup(t, true)
	ctx := context.Background()
	token, _, err := svc.Issue(ctx, userID, true)
	if err != nil {
		t.Fatal(err)
	}
	accounts.err = errors.New("engine unavailable")
	if _, err := svc.Verify(ctx, token); err == nil || errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("err = %v; want a failure, not 'nobody'", err)
	}
	if _, err := svc.Verify(ctx, Prefix+"forged"); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("forged: err = %v", err)
	}
}
