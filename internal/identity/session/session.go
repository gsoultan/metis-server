// Package session is a signed-in account's session: an opaque random token
// the browser or a program sends as a bearer token, kept only as its hash so
// a copy of the database opens nothing, and revocable at once.
//
// Every request re-reads the account from the engine, so a role taken away
// or an account disabled takes effect on the next request, not when the
// session ends.
package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/gsoultan/metis-server/internal/identity"
)

// Prefix starts every session token, so one is told from an integration API
// key at sight.
const Prefix = "mss_"

// DefaultLifetime is how long a session lasts from sign-in.
const DefaultLifetime = 12 * time.Hour

// ErrNotFound is a session that is not there, or has been revoked.
var ErrNotFound = errors.New("session: not found")

// Session is a stored session: never the token itself.
type Session struct {
	ID        string
	UserID    string
	CreatedAt time.Time
	ExpiresAt time.Time
	// WithCode is set when the sign-in proved a second factor.
	WithCode bool
}

// Store keeps sessions by the hash of their token.
type Store interface {
	Create(ctx context.Context, s Session, hash string) error
	// GetByHash returns ErrNotFound for no such session, or a revoked one.
	GetByHash(ctx context.Context, hash string) (Session, error)
	Revoke(ctx context.Context, hash string, at time.Time) error
	RevokeAllFor(ctx context.Context, userID string, at time.Time) error
}

// Service issues and checks sessions.
type Service struct {
	store    Store
	accounts identity.Accounts
	lifetime time.Duration
	now      func() time.Time
	// requireCode refuses a session made without a second factor, so one
	// minted before the policy changed stops working.
	requireCode bool
}

// NewService issues sessions kept in store, for accounts the engine holds.
func NewService(store Store, accounts identity.Accounts, requireCode bool) *Service {
	return &Service{store: store, accounts: accounts, lifetime: DefaultLifetime, now: time.Now, requireCode: requireCode}
}

func hash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Issue starts a session for an account and returns its token, which is
// shown this once, and when it ends.
func (s *Service) Issue(ctx context.Context, userID string, withCode bool) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, fmt.Errorf("could not start a session: %w", err)
	}
	token := Prefix + base64.RawURLEncoding.EncodeToString(raw)
	id := uuid.Must(uuid.NewV7()).String()
	now := s.now().UTC()
	sess := Session{ID: id, UserID: userID, CreatedAt: now, ExpiresAt: now.Add(s.lifetime), WithCode: withCode}
	if err := s.store.Create(ctx, sess, hash(token)); err != nil {
		return "", time.Time{}, err
	}
	return token, sess.ExpiresAt, nil
}

// SignOut ends the session a token belongs to.
func (s *Service) SignOut(ctx context.Context, token string) error {
	return s.store.Revoke(ctx, hash(token), s.now().UTC())
}

// SignOutEverywhere ends every session of an account: after a password or
// authenticator change, or when an administrator removes its app.
func (s *Service) SignOutEverywhere(ctx context.Context, userID string) error {
	return s.store.RevokeAllFor(ctx, userID, s.now().UTC())
}

// Claims implements identity.Bearer.
func (s *Service) Claims(token string) bool { return strings.HasPrefix(token, Prefix) }

// Verify implements identity.Bearer.
func (s *Service) Verify(ctx context.Context, token string) (identity.Principal, error) {
	sess, err := s.store.GetByHash(ctx, hash(token))
	if errors.Is(err, ErrNotFound) {
		return identity.Principal{}, identity.ErrNotRecognised
	}
	if err != nil {
		return identity.Principal{}, fmt.Errorf("check a session: %w", err)
	}
	if !s.now().Before(sess.ExpiresAt) || (s.requireCode && !sess.WithCode) {
		return identity.Principal{}, identity.ErrNotRecognised
	}
	account, ok, err := s.accounts.ByID(ctx, sess.UserID)
	if err != nil {
		return identity.Principal{}, fmt.Errorf("check a session's account: %w", err)
	}
	if !ok || account.Disabled {
		return identity.Principal{}, identity.ErrNotRecognised
	}
	roles := make(map[string][]string, len(account.Roles))
	for org, held := range maps.All(account.Roles) {
		roles[org] = slices.Clone(held)
	}
	return identity.Principal{UserID: account.UserID, Roles: roles}, nil
}
