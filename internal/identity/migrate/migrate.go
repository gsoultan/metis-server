// Package migrate brings metis-server's own tables up to date, in the database
// the engine uses. They are named identity_* so they never meet the engine's,
// and their versions are kept in identity_schema_versions, apart from the
// engine's own.
package migrate

import (
	"context"
	"database/sql"
	"fmt"
)

// step is one change to the schema. Steps are never edited or reordered once
// released; a later change is a new step.
type step struct {
	version int
	name    string
	sql     string
}

// steps are applied in order, each in its own transaction.
var steps = []step{
	{1, "integration API keys", integrationKeysDDL},
}

// integrationKeysDDL is an organization's integration API keys. Deleting an
// organization deletes its keys, so a key never outlives what it acts for.
// The lock on organizations, which most requests read, is bounded: a long
// transaction holding it fails the upgrade clearly instead of queueing
// requests behind it.
const integrationKeysDDL = `
SET LOCAL lock_timeout = '2s';
CREATE TABLE identity_integration_api_keys (
    id              uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name            varchar(100) NOT NULL,
    prefix          varchar(16) NOT NULL,
    token_hash      char(64) NOT NULL,
    roles           jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_by      varchar(255) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz,
    last_used_at    timestamptz,
    revoked_at      timestamptz
);
CREATE UNIQUE INDEX ux_identity_integration_api_keys_token_hash ON identity_integration_api_keys (token_hash);
CREATE INDEX ix_identity_integration_api_keys_organization_id ON identity_integration_api_keys (organization_id);
`

// lockKey is the advisory lock that keeps two metis-servers starting at once
// from applying the same step twice.
const lockKey = 0x6d6973_6964 // "mis" "id"

// Up applies every step the database has not had yet.
func Up(ctx context.Context, db *sql.DB) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("migrate identity tables: %w", err)
	}
	defer func() { _ = conn.Close() }()

	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock($1)`, lockKey); err != nil {
		return fmt.Errorf("migrate identity tables: take the lock: %w", err)
	}
	defer func() { _, _ = conn.ExecContext(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, lockKey) }()

	if _, err := conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS identity_schema_versions (
    version    integer PRIMARY KEY,
    name       text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)`); err != nil {
		return fmt.Errorf("migrate identity tables: %w", err)
	}

	var current int
	if err := conn.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0) FROM identity_schema_versions`).Scan(&current); err != nil {
		return fmt.Errorf("migrate identity tables: read the version: %w", err)
	}
	if latest := steps[len(steps)-1].version; current > latest {
		return fmt.Errorf("migrate identity tables: the database is at version %d, newer than this metis-server knows (%d); run the newer release", current, latest)
	}
	for _, s := range steps {
		if s.version <= current {
			continue
		}
		if err := apply(ctx, conn, s); err != nil {
			return err
		}
	}
	return nil
}

func apply(ctx context.Context, conn *sql.Conn, s step) (err error) {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("migrate identity tables to %d (%s): %w", s.version, s.name, err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if _, err = tx.ExecContext(ctx, s.sql); err != nil {
		return fmt.Errorf("migrate identity tables to %d (%s): %w", s.version, s.name, err)
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO identity_schema_versions (version, name) VALUES ($1, $2)`, s.version, s.name); err != nil {
		return fmt.Errorf("migrate identity tables to %d (%s): %w", s.version, s.name, err)
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("migrate identity tables to %d (%s): %w", s.version, s.name, err)
	}
	return nil
}
