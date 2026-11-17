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
	{2, "sessions", sessionsDDL},
	{3, "passwords and authenticator apps", credentialsDDL},
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

// sessionsDDL is signed-in sessions, by the hash of their token. Deleting an
// account deletes its sessions.
const sessionsDDL = `
SET LOCAL lock_timeout = '2s';
CREATE TABLE identity_sessions (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  char(64) NOT NULL,
    with_code   boolean NOT NULL,
    created_at  timestamptz NOT NULL,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz
);
CREATE UNIQUE INDEX ux_identity_sessions_token_hash ON identity_sessions (token_hash);
CREATE INDEX ix_identity_sessions_user_id ON identity_sessions (user_id) WHERE revoked_at IS NULL;
`

// credentialsDDL is staff passwords, authenticator apps and the challenges
// between a password and its code, all in metis-server's own tables.
//
// The passwords and apps already in the engine are copied once, as this step
// runs. The engine's columns are left as they are, so a rollback to an engine
// that signs people in itself still finds them. A secret is copied sealed as
// the engine sealed it, and opened with the engine's key.
const credentialsDDL = `
SET LOCAL lock_timeout = '2s';
CREATE TABLE identity_credentials (
    user_id       uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity_second_factors (
    user_id        uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret         varchar(512) NOT NULL,
    confirmed_at   timestamptz,
    last_step      bigint NOT NULL DEFAULT 0,
    recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity_challenges (
    token_hash  char(64) PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    step        varchar(16) NOT NULL,
    failures    integer NOT NULL DEFAULT 0,
    expires_at  timestamptz NOT NULL
);
CREATE INDEX ix_identity_challenges_expires_at ON identity_challenges (expires_at);

INSERT INTO identity_credentials (user_id, password_hash)
SELECT id, password_hash FROM users
WHERE COALESCE(password_hash, '') <> '' AND password_hash NOT LIKE '!%';

DO $$ BEGIN
IF to_regclass('user_second_factors') IS NOT NULL THEN
    INSERT INTO identity_second_factors (user_id, secret, confirmed_at, last_step, recovery_codes)
    SELECT user_id, secret, confirmed_at, last_step, recovery_codes FROM user_second_factors;
END IF;
END $$;
`
