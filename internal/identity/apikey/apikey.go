// Package apikey is an organization's integration API keys: secrets another
// system sends as a bearer token to act for the organization, with the roles
// an administrator gave the key and nothing more.
//
// A key is shown once, when it is made. metis-server keeps only its SHA-256
// hash and the first few characters, to tell keys apart in a list.
package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"slices"
	"strings"
	"time"
)

// Prefix starts every key, so one is told from a sign-in token at sight, by
// metis-server and by a secret scanner.
const Prefix = "mik_"

// shownPrefixLen is how much of a key is kept to tell it apart in a list: the
// marker and eight characters, far too few to guess the rest.
const shownPrefixLen = len(Prefix) + 8

// Roles are the roles a key may be given. Not the administrator's: a key is a
// password nobody types, kept in another system's configuration, with no
// second factor. Whatever it can do, somebody who copies it can do, so it must
// not be able to change who may do what, make more keys, or reconfigure the
// organization.
var Roles = []string{"DESIGNER", "OPERATOR", "QUERY_AUTHOR", "RELEASER", "USER"}

// Key is a key as its administrators see it: never the key itself.
type Key struct {
	ID             string     `json:"id"`
	OrganizationID string     `json:"organization_id"`
	Name           string     `json:"name"`
	Prefix         string     `json:"prefix"`
	Roles          []string   `json:"roles"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      *time.Time `json:"expires_at,omitzero"`
	LastUsedAt     *time.Time `json:"last_used_at,omitzero"`
	RevokedAt      *time.Time `json:"revoked_at,omitzero"`
}

// Live reports whether the key still opens anything at now: not revoked, and
// not past its expiry.
func (k Key) Live(now time.Time) bool {
	if k.RevokedAt != nil {
		return false
	}
	return k.ExpiresAt == nil || now.Before(*k.ExpiresAt)
}

// Is reports whether token has a key's shape. It says nothing of whether the
// key is good.
func Is(token string) bool {
	return strings.HasPrefix(token, Prefix)
}

// Hash is what is stored of a key, and looked up when one is presented.
func Hash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// newToken draws a key: the prefix and 256 random bits.
func newToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("could not make a key: %w", err)
	}
	return Prefix + base64.RawURLEncoding.EncodeToString(raw), nil
}

// checkRoles tidies the roles a key is asked to act with, and refuses any it
// may not have.
func checkRoles(asked []string) ([]string, error) {
	roles := make([]string, 0, len(asked))
	for _, role := range asked {
		role = strings.ToUpper(strings.TrimSpace(role))
		if role == "" || slices.Contains(roles, role) {
			continue
		}
		if !slices.Contains(Roles, role) {
			return nil, invalidf("a key cannot act as %s; it may be given %s", role, strings.Join(Roles, ", "))
		}
		roles = append(roles, role)
	}
	if len(roles) == 0 {
		return nil, invalidf("give the key at least one role: %s", strings.Join(Roles, ", "))
	}
	slices.Sort(roles)
	return roles, nil
}
