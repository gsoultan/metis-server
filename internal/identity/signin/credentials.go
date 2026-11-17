package signin

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
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
