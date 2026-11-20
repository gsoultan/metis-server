// Package identity is who is calling metis-server: the staff and people who
// sign in, and the other systems an organization gives an integration API key.
//
// metis-server owns sign-in. The engine it runs is a library and trusts the
// Principal this package hands it, through the engine's Identity hook; it no
// longer signs anybody in itself.
package identity

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gsoultan/metis/engine"
)

// Principal is who a request acts as, as the engine is told.
type Principal = engine.Principal

// Identity is what the engine takes from metis-server: it names the caller of
// a request, returning false with a nil error when the request names nobody
// and an error only when it could not tell, so the request is refused rather
// than treated as anonymous; and it keeps passwords and authenticator apps.
type Identity = engine.Identity

// Bearer is one way of proving who a token belongs to.
type Bearer interface {
	// Claims reports whether a token has this kind's shape. It says nothing
	// of whether the token is good.
	Claims(token string) bool
	// Verify returns who a token of this kind belongs to. ErrNotRecognised
	// means it belongs to nobody.
	Verify(ctx context.Context, token string) (Principal, error)
}

// ErrNotRecognised is a token that belongs to nobody: unknown, revoked,
// expired or forged.
var ErrNotRecognised = errors.New("identity: the token belongs to nobody")

// Authenticator reads a request's bearer token and passes it to the first
// kind that claims its shape.
type Authenticator struct {
	kinds []Bearer
}

// NewAuthenticator tries kinds in order.
func NewAuthenticator(kinds ...Bearer) *Authenticator {
	return &Authenticator{kinds: kinds}
}

// Authenticate implements Identity.
func (a *Authenticator) Authenticate(ctx context.Context, r *http.Request) (Principal, bool, error) {
	token, ok := bearerToken(r)
	if !ok {
		return Principal{}, false, nil
	}
	for _, kind := range a.kinds {
		if !kind.Claims(token) {
			continue
		}
		p, err := kind.Verify(ctx, token)
		if errors.Is(err, ErrNotRecognised) {
			return Principal{}, false, nil
		}
		if err != nil {
			return Principal{}, false, err
		}
		return p, true, nil
	}
	return Principal{}, false, nil
}

// bearerToken is the token of an "Authorization: Bearer" header.
func bearerToken(r *http.Request) (string, bool) {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}
