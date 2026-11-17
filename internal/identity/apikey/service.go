package apikey

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/gsoultan/metis-server/internal/identity"
)

const (
	// maxLive bounds the live keys one organization holds: one per system it
	// connects, and fifty is past any real count.
	maxLive = 50
	// maxName is the longest name a key takes.
	maxName = 100
	// useGranularity is how stale a key's last-used time may be before a use
	// writes it again, so a busy key is not a write on every request.
	useGranularity = time.Minute
	// adminRole is the role that manages an organization's keys.
	adminRole = "ADMIN"
)

var (
	// ErrInvalid is a request the caller can correct.
	ErrInvalid = errors.New("apikey: invalid")
	// ErrForbidden is a caller who may not manage the organization's keys.
	ErrForbidden = errors.New("apikey: forbidden")
	// ErrNotFound is a key that is not there, or not the organization's.
	ErrNotFound = errors.New("apikey: not found")
)

func invalidf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// Store keeps keys. It never sees a key itself, only its hash.
type Store interface {
	Create(ctx context.Context, key Key, hash string) error
	ListByOrganization(ctx context.Context, organizationID string) ([]Key, error)
	// GetUnrevokedByHash returns ErrNotFound for no such key, or a revoked one.
	GetUnrevokedByHash(ctx context.Context, hash string) (Key, error)
	// Revoke returns ErrNotFound when the organization has no such key.
	Revoke(ctx context.Context, organizationID, id string, at time.Time) error
	MarkUsed(ctx context.Context, id string, at time.Time) error
}

// Service makes, lists, revokes and checks keys.
type Service struct {
	store Store
	now   func() time.Time
	log   *slog.Logger
}

// NewService manages keys kept in store.
func NewService(store Store, log *slog.Logger) *Service {
	return &Service{store: store, now: time.Now, log: log}
}

// Administrator is who is managing keys, for which organization.
type Administrator struct {
	Principal      identity.Principal
	Username       string
	OrganizationID string
}

func (a Administrator) check() error {
	if a.Principal.ViaKey {
		return fmt.Errorf("%w: an integration API key cannot make, list or revoke keys; an administrator signs in to do that", ErrForbidden)
	}
	if a.OrganizationID == "" {
		return invalidf("choose the organization the key is for")
	}
	if !slices.Contains(a.Principal.Roles[a.OrganizationID], adminRole) {
		return fmt.Errorf("%w: only an administrator of the organization manages its integration API keys", ErrForbidden)
	}
	return nil
}

// Create makes a key and returns it with the key itself, which is shown this
// once.
func (s *Service) Create(ctx context.Context, by Administrator, name string, roles []string, expiresAt *time.Time) (Key, string, error) {
	if err := by.check(); err != nil {
		return Key{}, "", err
	}
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > maxName {
		return Key{}, "", invalidf("a key needs a name of 1 to %d characters, saying which system uses it", maxName)
	}
	roles, err := checkRoles(roles)
	if err != nil {
		return Key{}, "", err
	}
	now := s.now().UTC()
	if expiresAt != nil && !expiresAt.After(now) {
		return Key{}, "", invalidf("a key's expiry must be in the future")
	}

	held, err := s.store.ListByOrganization(ctx, by.OrganizationID)
	if err != nil {
		return Key{}, "", err
	}
	live := 0
	for _, k := range held {
		if !k.Live(now) {
			continue
		}
		live++
		if strings.EqualFold(k.Name, name) {
			return Key{}, "", invalidf("the organization already has a key called %q; revoke it or choose another name", name)
		}
	}
	if live >= maxLive {
		return Key{}, "", invalidf("the organization has %d keys, the most it may hold; revoke one first", maxLive)
	}

	token, err := newToken()
	if err != nil {
		return Key{}, "", err
	}
	key := Key{
		ID:             uuid.Must(uuid.NewV7()).String(),
		OrganizationID: by.OrganizationID,
		Name:           name,
		Prefix:         token[:shownPrefixLen],
		Roles:          roles,
		CreatedBy:      by.Username,
		CreatedAt:      now,
	}
	if expiresAt != nil {
		at := expiresAt.UTC()
		key.ExpiresAt = &at
	}
	if err := s.store.Create(ctx, key, Hash(token)); err != nil {
		return Key{}, "", err
	}
	s.trace(by, "An integration API key was made.", key)
	return key, token, nil
}

// List is the organization's keys, revoked ones included.
func (s *Service) List(ctx context.Context, by Administrator) ([]Key, error) {
	if err := by.check(); err != nil {
		return nil, err
	}
	return s.store.ListByOrganization(ctx, by.OrganizationID)
}

// Revoke stops a key from opening anything, at once.
func (s *Service) Revoke(ctx context.Context, by Administrator, id string) error {
	if err := by.check(); err != nil {
		return err
	}
	if err := s.store.Revoke(ctx, by.OrganizationID, id, s.now().UTC()); err != nil {
		return err
	}
	s.trace(by, "An integration API key was revoked.", Key{ID: id, OrganizationID: by.OrganizationID})
	return nil
}

// Claims implements identity.Bearer.
func (s *Service) Claims(token string) bool { return Is(token) }

// Verify implements identity.Bearer: the key acts for its organization alone,
// with its roles there and nowhere else.
func (s *Service) Verify(ctx context.Context, token string) (identity.Principal, error) {
	key, err := s.store.GetUnrevokedByHash(ctx, Hash(token))
	if errors.Is(err, ErrNotFound) {
		return identity.Principal{}, identity.ErrNotRecognised
	}
	if err != nil {
		return identity.Principal{}, fmt.Errorf("check an integration API key: %w", err)
	}
	now := s.now()
	if !key.Live(now) {
		return identity.Principal{}, identity.ErrNotRecognised
	}
	if key.LastUsedAt == nil || now.Sub(*key.LastUsedAt) >= useGranularity {
		if err := s.store.MarkUsed(ctx, key.ID, now.UTC()); err != nil {
			// The request is the organization's either way; the last-used
			// time is only a hint for whoever tidies its keys.
			s.log.Warn("could not record an integration API key's use", "key_id", key.ID, "error", err)
		}
	}
	return identity.Principal{
		UserID: key.ID,
		Roles:  map[string][]string{key.OrganizationID: slices.Clone(key.Roles)},
		ViaKey: true,
	}, nil
}

// trace says in the log who made or revoked a key, by id and name, never the
// key itself.
func (s *Service) trace(by Administrator, what string, key Key) {
	attrs := []any{"actor_id", by.Principal.UserID, "actor", by.Username,
		"organization", key.OrganizationID, "integration_key_id", key.ID}
	if key.Name != "" {
		attrs = append(attrs, "integration_key", key.Name, "roles", key.Roles)
	}
	s.log.Info(what, attrs...)
}
