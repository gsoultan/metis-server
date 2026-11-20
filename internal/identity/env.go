package identity

import "github.com/gsoultan/metis/engine"

// Account is an engine account as sign-in needs it. Accounts stay the
// engine's: tasks and assignments point at them. What proves who holds one,
// the password, the authenticator app and the sessions, is metis-server's.
type Account = engine.Account

// Accounts looks accounts up in the engine.
type Accounts = engine.Accounts

// Env is what the engine hands metis-server's identity once its database is
// open: the installation's main database, which the engine closes, the account
// lookup, and Seal and Open, which encrypt and decrypt a secret with the
// engine's key, as the engine sealed the authenticator secrets copied from it.
type Env = engine.IdentityEnv
