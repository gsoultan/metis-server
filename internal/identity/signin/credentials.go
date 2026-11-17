package signin

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/gsoultan/metis-server/internal/identity"
)

// MinPasswordLength is the shortest password kept. The engine asks more of a
// platform administrator's before it calls SetPassword.
const MinPasswordLength = 8

// ErrInvalid is a request the caller can correct.
var ErrInvalid = errors.New("signin: invalid")

func invalidf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// SetPassword keeps an account's password and ends its sessions. The engine
// calls it when it makes an account or an administrator sets one; nobody's
// current password is asked for, so it is never reached from a person's own
// request.
func (s *Service) SetPassword(ctx context.Context, userID, plain string) error {
	if len(strings.TrimSpace(plain)) < MinPasswordLength {
		return invalidf("password must be at least %d characters", MinPasswordLength)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if errors.Is(err, bcrypt.ErrPasswordTooLong) {
		return invalidf("password must be at most 72 bytes")
	}
	if err != nil {
		return fmt.Errorf("could not hash the password: %w", err)
	}
	if err := s.store.SetPasswordHash(ctx, userID, string(hash)); err != nil {
		return err
	}
	// Whoever held the old password, or a session made with it, is out.
	return s.sessions.SignOutEverywhere(ctx, userID)
}

// ChangeOwnPassword rotates a signed-in person's password after checking the
// current one. The account comes from the session, never from the request,
// so nobody changes somebody else's by naming them; and the check means a
// stolen session costs its holder access until it ends, not the account.
func (s *Service) ChangeOwnPassword(ctx context.Context, userID, current, next string) error {
	if current == next {
		return invalidf("the new password must be different from the current one")
	}
	account, ok, err := s.accounts.ByID(ctx, userID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrBadCredentials
	}
	now := s.now()
	if wait, limited := s.throttle.RetryAfter(account.Username, now); limited {
		return &ThrottledError{RetryAfter: wait}
	}
	if _, err := s.checkPassword(ctx, account.Username, current); err != nil {
		if errors.Is(err, ErrBadCredentials) {
			s.throttle.Failed(account.Username, now)
		}
		return err
	}
	return s.SetPassword(ctx, userID, next)
}

// RemoveSecondFactor takes an account's app and recovery codes away and ends
// its sessions, so its next sign-in sets an app up again. The engine calls it
// for an administrator's reset and for --reset-two-factor.
func (s *Service) RemoveSecondFactor(ctx context.Context, userID string) error {
	if err := s.store.RemoveFactor(ctx, userID); err != nil {
		return err
	}
	s.log.Info("An authenticator app was removed.", "user_id", userID)
	return s.sessions.SignOutEverywhere(ctx, userID)
}

// Status is whether an account signs in with an app, as its owner sees it.
type Status struct {
	Enrolled          bool `json:"enrolled"`
	RecoveryCodesLeft int  `json:"recovery_codes_left"`
	Required          bool `json:"required"`
}

// ErrNoApp is an account without a confirmed app asking for app-only things.
var ErrNoApp = errors.New("this account has no authenticator app")

// SecondFactorStatus is the signed-in account's app, as it sees it.
func (s *Service) SecondFactorStatus(ctx context.Context, userID string) (Status, error) {
	status := Status{Required: s.policy == Required}
	factor, err := s.store.Factor(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return status, nil
	}
	if err != nil {
		return Status{}, err
	}
	status.Enrolled = factor.Confirmed
	if factor.Confirmed {
		status.RecoveryCodesLeft = len(factor.RecoveryHashes)
	}
	return status, nil
}

// RegenerateRecoveryCodes replaces the signed-in account's recovery codes,
// given a code from its app. Not a recovery code: somebody holding a stolen
// session and one stolen recovery code must not be able to mint more.
func (s *Service) RegenerateRecoveryCodes(ctx context.Context, userID, code string) ([]string, error) {
	if looksLikeRecoveryCode(code) {
		return nil, ErrBadCode
	}
	factor, err := s.store.Factor(ctx, userID)
	if errors.Is(err, ErrNotFound) || (err == nil && !factor.Confirmed) {
		return nil, ErrNoApp
	}
	if err != nil {
		return nil, err
	}
	ok, _, err := s.spendCode(ctx, userID, code)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrBadCode
	}
	codes, hashes, err := newRecoveryCodes()
	if err != nil {
		return nil, err
	}
	if err := s.store.ReplaceRecoveryCodes(ctx, userID, hashes); err != nil {
		return nil, err
	}
	s.log.Info("Recovery codes were replaced.", "user_id", userID)
	return codes, nil
}

// Account is an engine account by id.
func (s *Service) Account(ctx context.Context, userID string) (identity.Account, bool, error) {
	return s.accounts.ByID(ctx, userID)
}
