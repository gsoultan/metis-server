// Package signin is a staff password sign-in, and the authenticator app's code
// that follows it: entering the code, or setting the app up when the account
// has none and codes are required.
//
// A correct password alone gets a session only when codes are optional and the
// account has no app. Otherwise it gets a short-lived challenge naming the
// step left, and the session comes when that step is done.
package signin

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/session"
	"github.com/gsoultan/metis-server/internal/identity/throttle"
	"github.com/gsoultan/metis-server/internal/identity/totp"
)

// Step is what a sign-in has left to do.
type Step string

const (
	// StepDone is a sign-in with its session.
	StepDone Step = ""
	// StepCode asks for the app's code, or a recovery code.
	StepCode Step = "code"
	// StepEnrol sets an app up first.
	StepEnrol Step = "enrol"
)

const (
	// challengeLifetime is how long a challenge waits for its step.
	challengeLifetime = 5 * time.Minute
	// maxCodeAttempts is how many wrong codes a challenge takes before it is
	// spent and the password must be given again.
	maxCodeAttempts = 5
	// issuer names the account in an authenticator app.
	issuer = "Metis"
)

var (
	// ErrBadCredentials is a wrong username or password, never saying which.
	ErrBadCredentials = errors.New("the username or password is wrong")
	// ErrBadCode is a code that is wrong, used already, or too old.
	ErrBadCode = errors.New("that code did not work; enter the current code from the app, or a recovery code")
	// ErrChallengeOver is a challenge that expired or took too many codes.
	ErrChallengeOver = errors.New("this sign-in has expired; sign in with your password again")
)

// ThrottledError is a sign-in refused because the account failed too often.
type ThrottledError struct{ RetryAfter time.Duration }

func (e *ThrottledError) Error() string {
	return fmt.Sprintf("too many failed sign-ins; try again in %s", e.RetryAfter.Round(time.Second))
}

// Result is how a sign-in step ended.
type Result struct {
	// Token and ExpiresAt are the session, when Next is StepDone.
	Token     string
	ExpiresAt time.Time
	// Next, Challenge and ChallengeExpiresAt are the step left otherwise.
	Next               Step
	Challenge          string
	ChallengeExpiresAt time.Time
	// RecoveryCodes are shown once, when an app is set up.
	RecoveryCodes []string
}

// Enrolment is a new app's secret, shown once.
type Enrolment struct {
	Secret string
	URI    string
}

// Service signs staff in.
type Service struct {
	store    Store
	accounts identity.Accounts
	sessions *session.Service
	seal     func(string) (string, error)
	open     func(string) (string, error)
	policy   Policy
	throttle *throttle.Throttle
	log      *slog.Logger
	now      func() time.Time
}

// NewService signs in accounts the engine holds, with passwords and apps kept
// in store and secrets sealed with the engine's key.
func NewService(store Store, env identity.Env, sessions *session.Service, policy Policy, log *slog.Logger) *Service {
	return &Service{
		store: store, accounts: env.Accounts, sessions: sessions,
		seal: env.Seal, open: env.Open, policy: policy,
		throttle: throttle.New(), log: log, now: time.Now,
	}
}

// dummyHash is compared against when there is no account, so a wrong
// username costs what a wrong password does and the two cannot be told apart
// by timing.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not a password anybody has"), bcrypt.DefaultCost)

// SignIn checks a password.
func (s *Service) SignIn(ctx context.Context, username, password string) (Result, error) {
	now := s.now()
	if wait, limited := s.throttle.RetryAfter(username, now); limited {
		return Result{}, &ThrottledError{RetryAfter: wait}
	}
	account, err := s.checkPassword(ctx, username, password)
	if errors.Is(err, ErrBadCredentials) {
		s.throttle.Failed(username, now)
		return Result{}, err
	}
	if err != nil {
		return Result{}, err
	}
	s.throttle.Succeeded(username)

	factor, err := s.store.Factor(ctx, account.UserID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Result{}, err
	}
	next := StepDone
	switch {
	case err == nil && factor.Confirmed:
		next = StepCode
	case s.policy == Required:
		next = StepEnrol
	}
	if next == StepDone {
		return s.session(ctx, account.UserID, false)
	}
	return s.challenge(ctx, account.UserID, next)
}

func (s *Service) checkPassword(ctx context.Context, username, password string) (identity.Account, error) {
	account, ok, err := s.accounts.ByUsername(ctx, strings.TrimSpace(username))
	if err != nil {
		return identity.Account{}, fmt.Errorf("look the account up: %w", err)
	}
	hash := dummyHash
	if ok && !account.Disabled {
		stored, err := s.store.PasswordHash(ctx, account.UserID)
		switch {
		case err == nil:
			hash = []byte(stored)
		case errors.Is(err, ErrNotFound):
			ok = false // an account that signs in through its identity provider
		default:
			return identity.Account{}, err
		}
	}
	match := bcrypt.CompareHashAndPassword(hash, []byte(password)) == nil
	if !ok || account.Disabled || !match {
		return identity.Account{}, ErrBadCredentials
	}
	return account, nil
}

// SignInWithCode finishes a sign-in with the app's code, or one of the
// account's recovery codes, each usable once.
func (s *Service) SignInWithCode(ctx context.Context, challenge, code string) (Result, error) {
	c, hash, err := s.readChallenge(ctx, challenge, StepCode)
	if err != nil {
		return Result{}, err
	}
	ok, byRecovery, err := s.spendCode(ctx, c.UserID, code)
	if err != nil {
		return Result{}, err
	}
	if !ok {
		return Result{}, s.failChallenge(ctx, hash)
	}
	if err := s.store.DeleteChallenge(ctx, hash); err != nil {
		return Result{}, err
	}
	if byRecovery {
		s.log.Info("A recovery code was used to sign in.", "user_id", c.UserID)
	}
	return s.session(ctx, c.UserID, true)
}

// BeginEnrolment makes a new secret for the account a challenge is for, and
// shows it once. Beginning again replaces a secret not yet confirmed.
func (s *Service) BeginEnrolment(ctx context.Context, challenge string) (Enrolment, error) {
	c, _, err := s.readChallenge(ctx, challenge, StepEnrol)
	if err != nil {
		return Enrolment{}, err
	}
	account, ok, err := s.accounts.ByID(ctx, c.UserID)
	if err != nil {
		return Enrolment{}, err
	}
	if !ok || account.Disabled {
		return Enrolment{}, ErrChallengeOver
	}
	secret, err := totp.NewSecret()
	if err != nil {
		return Enrolment{}, err
	}
	sealed, err := s.seal(secret)
	if err != nil {
		return Enrolment{}, fmt.Errorf("could not seal the secret: %w", err)
	}
	began, err := s.store.BeginFactor(ctx, c.UserID, sealed)
	if err != nil {
		return Enrolment{}, err
	}
	if !began {
		return Enrolment{}, ErrChallengeOver
	}
	return Enrolment{Secret: secret, URI: totp.URI(issuer, account.Username, secret)}, nil
}

// ConfirmEnrolment takes the app's first code, confirms the app, and finishes
// the sign-in with recovery codes shown once.
func (s *Service) ConfirmEnrolment(ctx context.Context, challenge, code string) (Result, error) {
	c, hash, err := s.readChallenge(ctx, challenge, StepEnrol)
	if err != nil {
		return Result{}, err
	}
	factor, err := s.store.Factor(ctx, c.UserID)
	if errors.Is(err, ErrNotFound) || (err == nil && factor.Confirmed) {
		return Result{}, ErrChallengeOver
	}
	if err != nil {
		return Result{}, err
	}
	secret, err := s.open(factor.Secret)
	if err != nil {
		return Result{}, fmt.Errorf("could not open the authenticator's secret: %w", err)
	}
	step, ok := totp.Match(secret, code, s.now(), factor.LastStep)
	if !ok {
		return Result{}, s.failChallenge(ctx, hash)
	}
	codes, hashes, err := newRecoveryCodes()
	if err != nil {
		return Result{}, err
	}
	if err := s.store.ConfirmFactor(ctx, c.UserID, step, hashes); err != nil {
		return Result{}, err
	}
	if err := s.store.DeleteChallenge(ctx, hash); err != nil {
		return Result{}, err
	}
	s.log.Info("An authenticator app was set up.", "user_id", c.UserID)
	result, err := s.session(ctx, c.UserID, true)
	result.RecoveryCodes = codes
	return result, err
}

// spendCode takes an app code or a recovery code from an account with a
// confirmed app.
func (s *Service) spendCode(ctx context.Context, userID, code string) (ok, byRecovery bool, err error) {
	if looksLikeRecoveryCode(code) {
		ok, err := s.store.UseRecoveryCode(ctx, userID, hashRecoveryCode(code))
		return ok, ok, err
	}
	factor, err := s.store.Factor(ctx, userID)
	if errors.Is(err, ErrNotFound) || (err == nil && !factor.Confirmed) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	secret, err := s.open(factor.Secret)
	if err != nil {
		return false, false, fmt.Errorf("could not open the authenticator's secret: %w", err)
	}
	step, matched := totp.Match(secret, code, s.now(), factor.LastStep)
	if !matched {
		return false, false, nil
	}
	taken, err := s.store.TakeStep(ctx, userID, step)
	return taken, false, err
}

func (s *Service) session(ctx context.Context, userID string, withCode bool) (Result, error) {
	token, expires, err := s.sessions.Issue(ctx, userID, withCode)
	if err != nil {
		return Result{}, err
	}
	return Result{Token: token, ExpiresAt: expires}, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Service) challenge(ctx context.Context, userID string, step Step) (Result, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return Result{}, fmt.Errorf("could not start the second step: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	expires := s.now().UTC().Add(challengeLifetime)
	if err := s.store.PutChallenge(ctx, hashToken(token), Challenge{UserID: userID, Step: step, ExpiresAt: expires}); err != nil {
		return Result{}, err
	}
	return Result{Next: step, Challenge: token, ChallengeExpiresAt: expires}, nil
}

func (s *Service) readChallenge(ctx context.Context, token string, step Step) (Challenge, string, error) {
	hash := hashToken(strings.TrimSpace(token))
	c, err := s.store.GetChallenge(ctx, hash)
	if errors.Is(err, ErrNotFound) {
		return Challenge{}, "", ErrChallengeOver
	}
	if err != nil {
		return Challenge{}, "", err
	}
	if c.Step != step || !s.now().Before(c.ExpiresAt) {
		return Challenge{}, "", ErrChallengeOver
	}
	return c, hash, nil
}

// failChallenge counts a wrong code, and spends the challenge after too many,
// so six digits cannot be walked through on one password.
func (s *Service) failChallenge(ctx context.Context, hash string) error {
	n, err := s.store.FailChallenge(ctx, hash)
	if err != nil {
		return err
	}
	if n >= maxCodeAttempts {
		if err := s.store.DeleteChallenge(ctx, hash); err != nil {
			return err
		}
		return ErrChallengeOver
	}
	return ErrBadCode
}
