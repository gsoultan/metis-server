package apikey

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// PGStore keeps keys in PostgreSQL, in identity_integration_api_keys.
type PGStore struct {
	db *sql.DB
}

// NewPGStore keeps keys in db, which internal/identity/migrate has brought up
// to date.
func NewPGStore(db *sql.DB) *PGStore {
	return &PGStore{db: db}
}

const keyColumns = `id, organization_id, name, prefix, roles, created_by, created_at, expires_at, last_used_at, revoked_at`

// Create implements Store.
func (s *PGStore) Create(ctx context.Context, key Key, hash string) error {
	roles, err := json.Marshal(key.Roles)
	if err != nil {
		return fmt.Errorf("save an integration API key: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO identity_integration_api_keys
    (id, organization_id, name, prefix, token_hash, roles, created_by, created_at, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		key.ID, key.OrganizationID, key.Name, key.Prefix, hash, roles, key.CreatedBy, key.CreatedAt, key.ExpiresAt)
	if err != nil {
		return fmt.Errorf("save an integration API key: %w", err)
	}
	return nil
}

// ListByOrganization implements Store, newest first.
func (s *PGStore) ListByOrganization(ctx context.Context, organizationID string) ([]Key, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+keyColumns+` FROM identity_integration_api_keys
    WHERE organization_id = $1 ORDER BY created_at DESC, id`, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list integration API keys: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var keys []Key
	for rows.Next() {
		k, err := scanKey(rows)
		if err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list integration API keys: %w", err)
	}
	return keys, nil
}

// GetUnrevokedByHash implements Store.
func (s *PGStore) GetUnrevokedByHash(ctx context.Context, hash string) (Key, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+keyColumns+` FROM identity_integration_api_keys
    WHERE token_hash = $1 AND revoked_at IS NULL`, hash)
	k, err := scanKey(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Key{}, ErrNotFound
	}
	return k, err
}

// Revoke implements Store. Revoking a key twice keeps the first time.
func (s *PGStore) Revoke(ctx context.Context, organizationID, id string, at time.Time) error {
	res, err := s.db.ExecContext(ctx, `UPDATE identity_integration_api_keys
    SET revoked_at = COALESCE(revoked_at, $3)
    WHERE organization_id = $1 AND id = $2`, organizationID, id, at)
	if err != nil {
		return fmt.Errorf("revoke an integration API key: %w", err)
	}
	if n, err := res.RowsAffected(); err != nil {
		return fmt.Errorf("revoke an integration API key: %w", err)
	} else if n == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkUsed implements Store.
func (s *PGStore) MarkUsed(ctx context.Context, id string, at time.Time) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE identity_integration_api_keys SET last_used_at = $2 WHERE id = $1`, id, at); err != nil {
		return fmt.Errorf("record an integration API key's use: %w", err)
	}
	return nil
}

type scanner interface{ Scan(dest ...any) error }

func scanKey(row scanner) (Key, error) {
	var (
		k     Key
		roles []byte
	)
	err := row.Scan(&k.ID, &k.OrganizationID, &k.Name, &k.Prefix, &roles, &k.CreatedBy, &k.CreatedAt,
		&k.ExpiresAt, &k.LastUsedAt, &k.RevokedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Key{}, err
		}
		return Key{}, fmt.Errorf("read an integration API key: %w", err)
	}
	// A key whose roles cannot be read acts as nothing rather than as
	// whatever the zero value would allow.
	if err := json.Unmarshal(roles, &k.Roles); err != nil {
		return Key{}, fmt.Errorf("read integration API key %s's roles: %w", k.ID, err)
	}
	return k, nil
}
