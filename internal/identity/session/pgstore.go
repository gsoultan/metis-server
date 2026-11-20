package session

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// PGStore keeps sessions in PostgreSQL, in identity_sessions.
type PGStore struct {
	db *sql.DB
}

// NewPGStore keeps sessions in db, which internal/identity/migrate has
// brought up to date.
func NewPGStore(db *sql.DB) *PGStore {
	return &PGStore{db: db}
}

// Create implements Store.
func (s *PGStore) Create(ctx context.Context, sess Session, hash string) error {
	if _, err := s.db.ExecContext(ctx, `INSERT INTO identity_sessions
    (id, user_id, token_hash, with_code, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		sess.ID, sess.UserID, hash, sess.WithCode, sess.CreatedAt, sess.ExpiresAt); err != nil {
		return fmt.Errorf("save a session: %w", err)
	}
	return nil
}

// GetByHash implements Store.
func (s *PGStore) GetByHash(ctx context.Context, hash string) (Session, error) {
	var sess Session
	err := s.db.QueryRowContext(ctx, `SELECT id, user_id, with_code, created_at, expires_at
    FROM identity_sessions WHERE token_hash = $1 AND revoked_at IS NULL`, hash).
		Scan(&sess.ID, &sess.UserID, &sess.WithCode, &sess.CreatedAt, &sess.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("read a session: %w", err)
	}
	return sess, nil
}

// Revoke implements Store. Revoking a session that is gone does nothing.
func (s *PGStore) Revoke(ctx context.Context, hash string, at time.Time) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE identity_sessions SET revoked_at = $2
    WHERE token_hash = $1 AND revoked_at IS NULL`, hash, at); err != nil {
		return fmt.Errorf("end a session: %w", err)
	}
	return nil
}

// RevokeAllFor implements Store.
func (s *PGStore) RevokeAllFor(ctx context.Context, userID string, at time.Time) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE identity_sessions SET revoked_at = $2
    WHERE user_id = $1 AND revoked_at IS NULL`, userID, at); err != nil {
		return fmt.Errorf("end an account's sessions: %w", err)
	}
	return nil
}
