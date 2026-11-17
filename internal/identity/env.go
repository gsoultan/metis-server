package identity

import (
	"context"
	"database/sql"
)

// Account is an engine account as sign-in needs it. Accounts stay the
// engine's: tasks and assignments point at them. What proves who holds one,
// the password, the authenticator app and the sessions, is metis-server's.
type Account struct {
	UserID   string
	Username string
	// Roles is the roles held in each organization, by organization id.
	Roles    map[string][]string
	Disabled bool
}

// Accounts looks accounts up in the engine.
type Accounts interface {
	ByUsername(ctx context.Context, username string) (Account, bool, error)
	ByID(ctx context.Context, userID string) (Account, bool, error)
}

// Env is what the engine hands metis-server's identity once its database is
// open, mirroring engine.IdentityEnv.
type Env struct {
	// DB is the installation's main database. The engine closes it.
	DB       *sql.DB
	Accounts Accounts
	// Seal and Open encrypt and decrypt a secret with the engine's key, as
	// the engine sealed the authenticator secrets copied from it.
	Seal func(plain string) (string, error)
	Open func(sealed string) (string, error)
}
