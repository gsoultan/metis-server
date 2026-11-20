package signin

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

const (
	// recoveryCodeCount is how many recovery codes an account is given.
	recoveryCodeCount = 10
	// recoveryCodeHalf is the length of each half of "xxxxx-xxxxx".
	recoveryCodeHalf = 5
	// recoveryAlphabet leaves out 0, 1, l and o, which are read as each
	// other. 32 symbols: ten of them are fifty bits.
	recoveryAlphabet = "23456789abcdefghijkmnpqrstuvwxyz"
)

// newRecoveryCodes draws an account's recovery codes, shown once, and the
// hashes kept of them. The engine made them the same way, so codes copied
// from it keep working.
func newRecoveryCodes() (codes, hashes []string, err error) {
	codes = make([]string, 0, recoveryCodeCount)
	hashes = make([]string, 0, recoveryCodeCount)
	for range recoveryCodeCount {
		raw := make([]byte, 2*recoveryCodeHalf)
		if _, err := rand.Read(raw); err != nil {
			return nil, nil, fmt.Errorf("could not draw a recovery code: %w", err)
		}
		var b strings.Builder
		for i, v := range raw {
			if i == recoveryCodeHalf {
				b.WriteByte('-')
			}
			// 256 is a multiple of 32, so every symbol is equally likely.
			b.WriteByte(recoveryAlphabet[int(v)%len(recoveryAlphabet)])
		}
		codes = append(codes, b.String())
		hashes = append(hashes, hashRecoveryCode(b.String()))
	}
	return codes, hashes, nil
}

func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(normaliseRecoveryCode(code)))
	return hex.EncodeToString(sum[:])
}

// normaliseRecoveryCode drops the dash and spaces and lowers the case, so a
// code read aloud or retyped still matches.
func normaliseRecoveryCode(code string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r == '-' || r == ' ':
			return -1
		case r >= 'A' && r <= 'Z':
			return r + ('a' - 'A')
		}
		return r
	}, code)
}

func looksLikeRecoveryCode(code string) bool {
	return len(normaliseRecoveryCode(code)) == 2*recoveryCodeHalf
}
