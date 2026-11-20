package apikey

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gsoultan/metis-server/internal/identity"
)

const org = "0193a000-0000-7000-8000-000000000001"

func admin() Administrator {
	return Administrator{
		Principal:      identity.Principal{UserID: "u1", Roles: map[string][]string{org: {"ADMIN"}}},
		Username:       "ada",
		OrganizationID: org,
	}
}

func newTestService() (*Service, *memStore) {
	store := newMemStore()
	return NewService(store, slog.New(slog.NewTextHandler(io.Discard, nil))), store
}

func TestAKeyActsForItsOrganizationWithItsRolesOnly(t *testing.T) {
	svc, _ := newTestService()
	key, token, err := svc.Create(context.Background(), admin(), "Billing", []string{"operator", "user", "USER"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(token, Prefix) || !strings.HasPrefix(token, key.Prefix) || len(key.Prefix) != shownPrefixLen {
		t.Fatalf("token %q and prefix %q do not match", token, key.Prefix)
	}

	r := httptest.NewRequest("GET", "/api/v1/processes", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	p, ok, err := identity.NewAuthenticator(svc).Authenticate(context.Background(), r)
	if err != nil || !ok {
		t.Fatalf("a good key was refused: ok=%v err=%v", ok, err)
	}
	if !p.ViaKey || p.UserID != key.ID || len(p.Roles) != 1 || strings.Join(p.Roles[org], ",") != "OPERATOR,USER" {
		t.Fatalf("principal = %+v", p)
	}
}

func TestARevokedOrExpiredKeyBelongsToNobody(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	key, token, err := svc.Create(ctx, admin(), "Billing", []string{"USER"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Revoke(ctx, admin(), key.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("revoked key: err = %v", err)
	}

	soon := time.Now().Add(time.Hour)
	_, token, err = svc.Create(ctx, admin(), "Payroll", []string{"USER"}, &soon)
	if err != nil {
		t.Fatal(err)
	}
	svc.now = func() time.Time { return soon.Add(time.Second) }
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("expired key: err = %v", err)
	}
	if _, err := svc.Verify(ctx, Prefix+"made-up"); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("unknown key: err = %v", err)
	}
}

func TestAKeyStoreThatFailsRefusesRatherThanLettingThrough(t *testing.T) {
	svc, store := newTestService()
	store.fail = errors.New("database is down")
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Authorization", "Bearer "+Prefix+"anything")
	_, ok, err := identity.NewAuthenticator(svc).Authenticate(context.Background(), r)
	if ok || err == nil {
		t.Fatalf("ok=%v err=%v; want an error", ok, err)
	}
}

func TestOnlyAnOrganizationsAdministratorManagesItsKeys(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	operator := admin()
	operator.Principal.Roles = map[string][]string{org: {"OPERATOR"}}
	if _, _, err := svc.Create(ctx, operator, "x", []string{"USER"}, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("operator: err = %v", err)
	}

	elsewhere := admin()
	elsewhere.OrganizationID = "another"
	if _, err := svc.List(ctx, elsewhere); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin of another organization: err = %v", err)
	}

	byKey := admin()
	byKey.Principal.ViaKey = true
	if _, err := svc.List(ctx, byKey); !errors.Is(err, ErrForbidden) {
		t.Fatalf("a key: err = %v", err)
	}
}

func TestAKeyIsRefusedTheAdministratorsRoleAndBadNames(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	for _, tc := range []struct {
		name  string
		roles []string
	}{
		{"Billing", []string{"ADMIN"}},
		{"Billing", nil},
		{"  ", []string{"USER"}},
		{strings.Repeat("x", maxName+1), []string{"USER"}},
	} {
		if _, _, err := svc.Create(ctx, admin(), tc.name, tc.roles, nil); !errors.Is(err, ErrInvalid) {
			t.Errorf("Create(%q, %v): err = %v, want ErrInvalid", tc.name, tc.roles, err)
		}
	}
	past := time.Now().Add(-time.Hour)
	if _, _, err := svc.Create(ctx, admin(), "Billing", []string{"USER"}, &past); !errors.Is(err, ErrInvalid) {
		t.Errorf("past expiry: err = %v", err)
	}
	if _, _, err := svc.Create(ctx, admin(), "Billing", []string{"USER"}, nil); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Create(ctx, admin(), "billing", []string{"USER"}, nil); !errors.Is(err, ErrInvalid) {
		t.Errorf("duplicate name: err = %v", err)
	}
}

func TestARequestWithoutABearerTokenNamesNobody(t *testing.T) {
	svc, _ := newTestService()
	for _, header := range []string{"", "Basic abc", "Bearer ", "Bearer eyJ.not.a.key"} {
		r := httptest.NewRequest("GET", "/", nil)
		if header != "" {
			r.Header.Set("Authorization", header)
		}
		_, ok, err := identity.NewAuthenticator(svc).Authenticate(context.Background(), r)
		if ok || err != nil {
			t.Errorf("%q: ok=%v err=%v", header, ok, err)
		}
	}
}
