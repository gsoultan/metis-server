// Package pgtest opens a PostgreSQL database for a test, in a schema of its
// own that is dropped when the test ends, with the engine's organizations
// table standing in for the engine's.
//
// It needs METIS_TEST_POSTGRES_DSN, and skips the test without it.
package pgtest

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// DSNEnv names the database tests run against.
const DSNEnv = "METIS_TEST_POSTGRES_DSN"

// Open returns a handle whose every connection works in a fresh schema.
func Open(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv(DSNEnv)
	if dsn == "" {
		t.Skipf("%s is not set", DSNEnv)
	}
	raw := make([]byte, 6)
	if _, err := rand.Read(raw); err != nil {
		t.Fatal(err)
	}
	schema := "identity_test_" + hex.EncodeToString(raw)

	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	admin := stdlib.OpenDB(*cfg)
	ctx := context.Background()
	if _, err := admin.ExecContext(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), `DROP SCHEMA `+schema+` CASCADE`)
		_ = admin.Close()
	})

	cfg.RuntimeParams["search_path"] = schema
	db := stdlib.OpenDB(*cfg)
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.ExecContext(ctx, `CREATE TABLE organizations (id uuid PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	return db
}
