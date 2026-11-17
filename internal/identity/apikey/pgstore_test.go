package apikey

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/migrate"
	"github.com/gsoultan/metis-server/internal/identity/pgtest"
)

func TestKeysKeptInPostgresBehaveAsInMemory(t *testing.T) {
	db := pgtest.Open(t)
	ctx := context.Background()
	if err := migrate.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := migrate.Up(ctx, db); err != nil {
		t.Fatalf("a second run should do nothing: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO organizations (id) VALUES ($1)`, org); err != nil {
		t.Fatal(err)
	}

	svc := NewService(NewPGStore(db), slog.New(slog.NewTextHandler(io.Discard, nil)))
	key, token, err := svc.Create(ctx, admin(), "Billing", []string{"USER", "OPERATOR"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.Verify(ctx, token)
	if err != nil || !p.ViaKey || p.UserID != key.ID || len(p.Roles[org]) != 2 {
		t.Fatalf("principal = %+v, err = %v", p, err)
	}

	listed, err := svc.List(ctx, admin())
	if err != nil || len(listed) != 1 || listed[0].LastUsedAt == nil || listed[0].Prefix != key.Prefix {
		t.Fatalf("listed = %+v, err = %v", listed, err)
	}

	if err := svc.Revoke(ctx, admin(), key.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Verify(ctx, token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("revoked: err = %v", err)
	}
	if err := svc.Revoke(ctx, admin(), "0193a000-0000-7000-8000-0000000000ff"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown key: err = %v", err)
	}

	// Deleting the organization deletes its keys.
	if _, err := db.ExecContext(ctx, `DELETE FROM organizations WHERE id = $1`, org); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM identity_integration_api_keys`).Scan(&left); err != nil || left != 0 {
		t.Fatalf("keys left after the organization went: %d, err = %v", left, err)
	}
}
