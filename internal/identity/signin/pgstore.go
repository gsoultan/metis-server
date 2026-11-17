package signin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// PGStore keeps passwords, apps and challenges in PostgreSQL.
type PGStore struct {
	db *sql.DB
}

// NewPGStore keeps them in db, which internal/identity/migrate has brought up
// to date.
func NewPGStore(db *sql.DB) *PGStore {
	return &PGStore{db: db}
}

// PasswordHash implements Store.
func (s *PGStore) PasswordHash(ctx context.Context, userID string) (string, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM identity_credentials WHERE user_id = $1`, userID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("read a password: %w", err)
	}
	return hash, nil
}

// SetPasswordHash implements Store.
func (s *PGStore) SetPasswordHash(ctx context.Context, userID, hash string) error {
	if _, err := s.db.ExecContext(ctx, `INSERT INTO identity_credentials (user_id, password_hash) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`, userID, hash); err != nil {
		return fmt.Errorf("save a password: %w", err)
	}
	return nil
}

// Factor implements Store.
func (s *PGStore) Factor(ctx context.Context, userID string) (Factor, error) {
	var (
		f         Factor
		confirmed sql.NullTime
		codes     []byte
	)
	err := s.db.QueryRowContext(ctx, `SELECT secret, confirmed_at, last_step, recovery_codes
    FROM identity_second_factors WHERE user_id = $1`, userID).Scan(&f.Secret, &confirmed, &f.LastStep, &codes)
	if errors.Is(err, sql.ErrNoRows) {
		return Factor{}, ErrNotFound
	}
	if err != nil {
		return Factor{}, fmt.Errorf("read an authenticator app: %w", err)
	}
	if err := json.Unmarshal(codes, &f.RecoveryHashes); err != nil {
		return Factor{}, fmt.Errorf("read an authenticator app's recovery codes: %w", err)
	}
	f.Confirmed = confirmed.Valid
	return f, nil
}

// BeginFactor implements Store.
func (s *PGStore) BeginFactor(ctx context.Context, userID, sealedSecret string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO identity_second_factors (user_id, secret) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, last_step = 0, updated_at = now()
    WHERE identity_second_factors.confirmed_at IS NULL`, userID, sealedSecret)
	if err != nil {
		return false, fmt.Errorf("begin setting up an authenticator app: %w", err)
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// ConfirmFactor implements Store.
func (s *PGStore) ConfirmFactor(ctx context.Context, userID string, step int64, recoveryHashes []string) error {
	codes, err := json.Marshal(recoveryHashes)
	if err != nil {
		return fmt.Errorf("could not encode the recovery codes: %w", err)
	}
	res, err := s.db.ExecContext(ctx, `UPDATE identity_second_factors
    SET confirmed_at = now(), last_step = $2, recovery_codes = $3, updated_at = now()
    WHERE user_id = $1 AND confirmed_at IS NULL AND last_step < $2`, userID, step, codes)
	if err != nil {
		return fmt.Errorf("confirm an authenticator app: %w", err)
	}
	if n, err := res.RowsAffected(); err != nil || n != 1 {
		return ErrChallengeOver
	}
	return nil
}

// TakeStep implements Store. One UPDATE, so two requests with one code
// cannot both take it.
func (s *PGStore) TakeStep(ctx context.Context, userID string, step int64) (bool, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE identity_second_factors SET last_step = $2, updated_at = now()
    WHERE user_id = $1 AND confirmed_at IS NOT NULL AND last_step < $2`, userID, step)
	if err != nil {
		return false, fmt.Errorf("take a code: %w", err)
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// UseRecoveryCode implements Store, in one UPDATE for the same reason.
func (s *PGStore) UseRecoveryCode(ctx context.Context, userID, hash string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE identity_second_factors
    SET recovery_codes = recovery_codes - $2::text, updated_at = now()
    WHERE user_id = $1 AND confirmed_at IS NOT NULL AND recovery_codes ? $2::text`, userID, hash)
	if err != nil {
		return false, fmt.Errorf("take a recovery code: %w", err)
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// RemoveFactor implements Store.
func (s *PGStore) RemoveFactor(ctx context.Context, userID string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM identity_second_factors WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("remove an authenticator app: %w", err)
	}
	return nil
}

// PutChallenge implements Store. Expired challenges are cleared as new ones
// are made, so the table holds minutes of sign-ins, not years.
func (s *PGStore) PutChallenge(ctx context.Context, hash string, c Challenge) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM identity_challenges WHERE expires_at < now()`); err != nil {
		return fmt.Errorf("clear old challenges: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO identity_challenges (token_hash, user_id, step, expires_at)
    VALUES ($1, $2, $3, $4)`, hash, c.UserID, string(c.Step), c.ExpiresAt); err != nil {
		return fmt.Errorf("save a challenge: %w", err)
	}
	return nil
}

// GetChallenge implements Store.
func (s *PGStore) GetChallenge(ctx context.Context, hash string) (Challenge, error) {
	var (
		c    Challenge
		step string
	)
	err := s.db.QueryRowContext(ctx, `SELECT user_id, step, expires_at FROM identity_challenges WHERE token_hash = $1`, hash).
		Scan(&c.UserID, &step, &c.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Challenge{}, ErrNotFound
	}
	if err != nil {
		return Challenge{}, fmt.Errorf("read a challenge: %w", err)
	}
	c.Step = Step(step)
	return c, nil
}

// FailChallenge implements Store.
func (s *PGStore) FailChallenge(ctx context.Context, hash string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `UPDATE identity_challenges SET failures = failures + 1
    WHERE token_hash = $1 RETURNING failures`, hash).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return maxCodeAttempts, nil
	}
	if err != nil {
		return 0, fmt.Errorf("count a wrong code: %w", err)
	}
	return n, nil
}

// DeleteChallenge implements Store.
func (s *PGStore) DeleteChallenge(ctx context.Context, hash string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM identity_challenges WHERE token_hash = $1`, hash); err != nil {
		return fmt.Errorf("spend a challenge: %w", err)
	}
	return nil
}
