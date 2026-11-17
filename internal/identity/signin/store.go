package signin

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound is a row that is not there.
var ErrNotFound = errors.New("signin: not found")

// Factor is an account's authenticator app.
type Factor struct {
	// Secret is sealed with the engine's key.
	Secret string
	// Confirmed is set once a first code proved the app holds the secret.
	Confirmed bool
	// LastStep is the last step a code was taken from, so none is taken twice.
	LastStep int64
	// RecoveryHashes are the hashes of the recovery codes not yet used.
	RecoveryHashes []string
}

// Challenge is a sign-in that proved its password and has a step left.
type Challenge struct {
	UserID    string
	Step      Step
	ExpiresAt time.Time
}

// Store keeps passwords, authenticator apps and challenges.
type Store interface {
	// PasswordHash returns the account's bcrypt hash, or ErrNotFound.
	PasswordHash(ctx context.Context, userID string) (string, error)
	// Factor returns the account's app, or ErrNotFound.
	Factor(ctx context.Context, userID string) (Factor, error)
	// BeginFactor keeps a new secret not yet confirmed, replacing one not yet
	// confirmed. It returns false when the account has a confirmed app, which
	// only an administrator's reset removes.
	BeginFactor(ctx context.Context, userID, sealedSecret string) (bool, error)
	// ConfirmFactor confirms the app with the step of its first code and
	// keeps the recovery codes' hashes.
	ConfirmFactor(ctx context.Context, userID string, step int64, recoveryHashes []string) error
	// TakeStep records a code's step. It returns false when that step or a
	// later one was already taken, which two requests racing with one code
	// must not both get past.
	TakeStep(ctx context.Context, userID string, step int64) (bool, error)
	// UseRecoveryCode removes a recovery code's hash. It returns false when
	// the account has no such code left.
	UseRecoveryCode(ctx context.Context, userID, hash string) (bool, error)
	// RemoveFactor removes the account's app and recovery codes.
	RemoveFactor(ctx context.Context, userID string) error

	PutChallenge(ctx context.Context, hash string, c Challenge) error
	// GetChallenge returns ErrNotFound for no such challenge.
	GetChallenge(ctx context.Context, hash string) (Challenge, error)
	// FailChallenge counts a wrong code, and returns how many the challenge
	// has had.
	FailChallenge(ctx context.Context, hash string) (int, error)
	DeleteChallenge(ctx context.Context, hash string) error
}
