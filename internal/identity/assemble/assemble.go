// Package assemble builds metis-server's identity from what the engine hands
// over once its database is open: its tables brought up to date, then
// sessions, sign-in and integration API keys over them.
//
// The result is what the engine's WithIdentity hook takes. It also carries
// the services the sign-in, two-factor and key routes call.
package assemble

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/apikey"
	"github.com/gsoultan/metis-server/internal/identity/migrate"
	"github.com/gsoultan/metis-server/internal/identity/session"
	"github.com/gsoultan/metis-server/internal/identity/signin"
)

// Identity is metis-server's identity, as the engine calls it.
type Identity struct {
	auth     *identity.Authenticator
	Sessions *session.Service
	SignIn   *signin.Service
	Keys     *apikey.Service
}

// New migrates metis-server's tables and builds its identity. getenv reads
// the two-factor policy; the line it logs says when what was asked for is not
// what applies.
func New(ctx context.Context, env identity.Env, getenv func(string) string, log *slog.Logger) (*Identity, error) {
	if env.DB == nil || env.Accounts == nil || env.Seal == nil || env.Open == nil {
		return nil, fmt.Errorf("identity: the engine handed over an incomplete environment")
	}
	if err := migrate.Up(ctx, env.DB); err != nil {
		return nil, err
	}
	policy, note := signin.ReadPolicy(getenv)
	if note != "" {
		log.Warn(note)
	}
	sessions := session.NewService(session.NewPGStore(env.DB), env.Accounts, policy == signin.Required)
	keys := apikey.NewService(apikey.NewPGStore(env.DB), log)
	return &Identity{
		auth:     identity.NewAuthenticator(keys, sessions),
		Sessions: sessions,
		SignIn:   signin.NewService(signin.NewPGStore(env.DB), env, sessions, policy, log),
		Keys:     keys,
	}, nil
}

var _ identity.Identity = (*Identity)(nil)

// Authenticate names the caller of a request.
func (i *Identity) Authenticate(ctx context.Context, r *http.Request) (identity.Principal, bool, error) {
	return i.auth.Authenticate(ctx, r)
}

// SetPassword is what the engine calls when it makes an account or an
// administrator sets a password.
func (i *Identity) SetPassword(ctx context.Context, userID, plain string) error {
	return i.SignIn.SetPassword(ctx, userID, plain)
}

// RemoveSecondFactor is what the engine calls when an administrator, or
// --reset-two-factor, removes an account's app.
func (i *Identity) RemoveSecondFactor(ctx context.Context, userID string) error {
	return i.SignIn.RemoveSecondFactor(ctx, userID)
}
