package signin

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/migrate"
	"github.com/gsoultan/metis-server/internal/identity/pgtest"
	"github.com/gsoultan/metis-server/internal/identity/session"
	"github.com/gsoultan/metis-server/internal/identity/totp"
)

const (
	userID   = "0193a000-0000-7000-8000-0000000000a1"
	password = "correct horse battery staple"
)

type fakeAccounts struct{ account identity.Account }

func (f *fakeAccounts) ByUsername(_ context.Context, name string) (identity.Account, bool, error) {
	return f.account, name == f.account.Username, nil
}

func (f *fakeAccounts) ByID(_ context.Context, id string) (identity.Account, bool, error) {
	return f.account, id == f.account.UserID, nil
}

// seal stands in for the engine's key: what matters here is that the stored
// secret is not the secret.
func seal(plain string) (string, error) { return "sealed:" + plain, nil }

func open(sealed string) (string, error) {
	plain, ok := strings.CutPrefix(sealed, "sealed:")
	if !ok {
		return "", errors.New("not sealed")
	}
	return plain, nil
}

type rig struct {
	db       *sql.DB
	svc      *Service
	sessions *session.Service
	now      time.Time
}

// newRig opens a database with one account whose password the engine held,
// and migrates it, so the password is the one copied from the engine.
func newRig(t *testing.T, policy Policy) *rig {
	t.Helper()
	db := pgtest.Open(t)
	ctx := context.Background()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users (id, password_hash) VALUES ($1, $2)`, userID, string(hash)); err != nil {
		t.Fatal(err)
	}
	if err := migrate.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	accounts := &fakeAccounts{account: identity.Account{UserID: userID, Username: "ada"}}
	env := identity.Env{DB: db, Accounts: accounts, Seal: seal, Open: open}
	sessions := session.NewService(session.NewPGStore(db), accounts, policy == Required)
	r := &rig{db: db, sessions: sessions, now: time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)}
	r.svc = NewService(NewPGStore(db), env, sessions, policy, slog.New(slog.NewTextHandler(io.Discard, nil)))
	r.svc.now = func() time.Time { return r.now }
	return r
}

func (r *rig) codeAt(t *testing.T, secret string) string {
	t.Helper()
	code, err := totp.CodeAt(secret, totp.StepAt(r.now))
	if err != nil {
		t.Fatal(err)
	}
	return code
}

// enrol signs in with a password, sets an app up and returns its secret and
// recovery codes.
func (r *rig) enrol(t *testing.T) (string, []string) {
	t.Helper()
	ctx := context.Background()
	res, err := r.svc.SignIn(ctx, "ada", password)
	if err != nil || res.Next != StepEnrol || res.Token != "" {
		t.Fatalf("SignIn: %+v, %v; want the enrol step and no session", res, err)
	}
	enrolment, err := r.svc.BeginEnrolment(ctx, res.Challenge)
	if err != nil || !strings.HasPrefix(enrolment.URI, "otpauth://totp/Metis:ada?") {
		t.Fatalf("BeginEnrolment: %+v, %v", enrolment, err)
	}
	done, err := r.svc.ConfirmEnrolment(ctx, res.Challenge, r.codeAt(t, enrolment.Secret))
	if err != nil || done.Token == "" || len(done.RecoveryCodes) != recoveryCodeCount {
		t.Fatalf("ConfirmEnrolment: %+v, %v", done, err)
	}
	if _, err := r.sessions.Verify(ctx, done.Token); err != nil {
		t.Fatalf("the session from enrolment does not work: %v", err)
	}
	return enrolment.Secret, done.RecoveryCodes
}

func TestStaffWithoutAnAppSetOneUpBeforeTheyGetASession(t *testing.T) {
	r := newRig(t, Required)
	ctx := context.Background()
	secret, _ := r.enrol(t)

	var stored string
	if err := r.db.QueryRowContext(ctx, `SELECT secret FROM identity_second_factors WHERE user_id = $1`, userID).Scan(&stored); err != nil || stored == secret {
		t.Fatalf("the secret is stored as %q, err %v; want it sealed", stored, err)
	}

	// Next sign-in asks for the code; the code just used is not taken twice.
	res, err := r.svc.SignIn(ctx, "ada", password)
	if err != nil || res.Next != StepCode {
		t.Fatalf("second SignIn: %+v, %v", res, err)
	}
	if _, err := r.svc.SignInWithCode(ctx, res.Challenge, r.codeAt(t, secret)); !errors.Is(err, ErrBadCode) {
		t.Fatalf("a replayed code: err = %v", err)
	}
	r.now = r.now.Add(totp.StepSeconds * time.Second)
	done, err := r.svc.SignInWithCode(ctx, res.Challenge, r.codeAt(t, secret))
	if err != nil || done.Token == "" {
		t.Fatalf("the next code: %+v, %v", done, err)
	}
	if _, err := r.svc.SignInWithCode(ctx, res.Challenge, r.codeAt(t, secret)); !errors.Is(err, ErrChallengeOver) {
		t.Fatalf("a challenge used twice: err = %v", err)
	}
}

func TestARecoveryCodeWorksOnce(t *testing.T) {
	r := newRig(t, Required)
	ctx := context.Background()
	_, codes := r.enrol(t)

	res, _ := r.svc.SignIn(ctx, "ada", password)
	if _, err := r.svc.SignInWithCode(ctx, res.Challenge, strings.ToUpper(codes[3])); err != nil {
		t.Fatalf("a recovery code, typed in capitals: %v", err)
	}
	res, _ = r.svc.SignIn(ctx, "ada", password)
	if _, err := r.svc.SignInWithCode(ctx, res.Challenge, codes[3]); !errors.Is(err, ErrBadCode) {
		t.Fatalf("a recovery code used twice: err = %v", err)
	}
}

func TestWrongCodesSpendTheChallenge(t *testing.T) {
	r := newRig(t, Required)
	ctx := context.Background()
	r.enrol(t)
	res, _ := r.svc.SignIn(ctx, "ada", password)
	var err error
	for range maxCodeAttempts {
		_, err = r.svc.SignInWithCode(ctx, res.Challenge, "000000")
	}
	if !errors.Is(err, ErrChallengeOver) {
		t.Fatalf("after %d wrong codes: err = %v", maxCodeAttempts, err)
	}
}

func TestAWrongPasswordAndAnUnknownUserLookTheSameAndAreSlowedDown(t *testing.T) {
	r := newRig(t, Required)
	ctx := context.Background()
	if _, err := r.svc.SignIn(ctx, "nobody", password); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("unknown user: err = %v", err)
	}
	var err error
	for range 5 {
		_, err = r.svc.SignIn(ctx, "ada", "wrong")
	}
	var throttled *ThrottledError
	if !errors.As(err, &throttled) {
		t.Fatalf("after five wrong passwords: err = %v; want a wait", err)
	}
	if _, err := r.svc.SignIn(ctx, "ada", password); !errors.As(err, &throttled) {
		t.Fatalf("the right password while slowed: err = %v; want a wait", err)
	}
}

func TestOptionalCodesLetAnAccountWithoutAnAppInWithItsPassword(t *testing.T) {
	r := newRig(t, Optional)
	res, err := r.svc.SignIn(context.Background(), "ada", password)
	if err != nil || res.Token == "" || res.Next != StepDone {
		t.Fatalf("%+v, %v", res, err)
	}
}

func TestAnAppSetUpInTheEngineKeepsWorking(t *testing.T) {
	db := pgtest.Open(t)
	ctx := context.Background()
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	secret, _ := totp.NewSecret()
	sealed, _ := seal(secret)
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users (id, password_hash) VALUES ($1, $2)`, []any{userID, string(hash)}},
		{`CREATE TABLE user_second_factors (user_id uuid, secret varchar(512), confirmed_at timestamptz, last_step bigint, recovery_codes jsonb)`, nil},
		{`INSERT INTO user_second_factors VALUES ($1, $2, now(), 0, $3)`, []any{userID, sealed, `["` + hashRecoveryCode("abcde-fghij") + `"]`}},
	} {
		if _, err := db.ExecContext(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	if err := migrate.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	accounts := &fakeAccounts{account: identity.Account{UserID: userID, Username: "ada"}}
	sessions := session.NewService(session.NewPGStore(db), accounts, true)
	svc := NewService(NewPGStore(db), identity.Env{DB: db, Accounts: accounts, Seal: seal, Open: open}, sessions, Required, slog.New(slog.NewTextHandler(io.Discard, nil)))

	res, err := svc.SignIn(ctx, "ada", password)
	if err != nil || res.Next != StepCode {
		t.Fatalf("the engine's password and app: %+v, %v", res, err)
	}
	code, _ := totp.CodeAt(secret, totp.StepAt(time.Now()))
	if _, err := svc.SignInWithCode(ctx, res.Challenge, code); err != nil {
		t.Fatalf("the engine's app's code: %v", err)
	}
	res, _ = svc.SignIn(ctx, "ada", password)
	if _, err := svc.SignInWithCode(ctx, res.Challenge, "ABCDE-FGHIJ"); err != nil {
		t.Fatalf("the engine's recovery code: %v", err)
	}
}

func TestSettingAPasswordEndsTheOldOnesSessions(t *testing.T) {
	r := newRig(t, Optional)
	ctx := context.Background()
	res, err := r.svc.SignIn(ctx, "ada", password)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.svc.SetPassword(ctx, userID, "short"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a short password: err = %v", err)
	}
	if err := r.svc.SetPassword(ctx, userID, "a new password entirely"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.sessions.Verify(ctx, res.Token); !errors.Is(err, identity.ErrNotRecognised) {
		t.Fatalf("the old session: err = %v", err)
	}
	if _, err := r.svc.SignIn(ctx, "ada", password); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("the old password: err = %v", err)
	}
	if _, err := r.svc.SignIn(ctx, "ada", "a new password entirely"); err != nil {
		t.Fatalf("the new password: %v", err)
	}
}

func TestChangingYourOwnPasswordNeedsTheCurrentOne(t *testing.T) {
	r := newRig(t, Optional)
	ctx := context.Background()
	if err := r.svc.ChangeOwnPassword(ctx, userID, "a guess", "a new password entirely"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("wrong current password: err = %v", err)
	}
	if err := r.svc.ChangeOwnPassword(ctx, userID, password, password); !errors.Is(err, ErrInvalid) {
		t.Fatalf("the same password: err = %v", err)
	}
	if err := r.svc.ChangeOwnPassword(ctx, userID, password, "a new password entirely"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.svc.SignIn(ctx, "ada", "a new password entirely"); err != nil {
		t.Fatalf("the new password: %v", err)
	}
}

func TestRemovingAnAppMeansSettingOneUpAgain(t *testing.T) {
	r := newRig(t, Required)
	ctx := context.Background()
	r.enrol(t)
	if err := r.svc.RemoveSecondFactor(ctx, userID); err != nil {
		t.Fatal(err)
	}
	res, err := r.svc.SignIn(ctx, "ada", password)
	if err != nil || res.Next != StepEnrol {
		t.Fatalf("%+v, %v; want the enrol step", res, err)
	}
}

func TestNewRecoveryCodesNeedTheAppsCodeAndReplaceTheOld(t *testing.T) {
	r := newRig(t, Required)
	ctx := context.Background()
	if _, err := r.svc.RegenerateRecoveryCodes(ctx, userID, "123456"); !errors.Is(err, ErrNoApp) {
		t.Fatalf("without an app: err = %v", err)
	}
	secret, old := r.enrol(t)
	if _, err := r.svc.RegenerateRecoveryCodes(ctx, userID, old[0]); !errors.Is(err, ErrBadCode) {
		t.Fatalf("a recovery code: err = %v", err)
	}
	r.now = r.now.Add(totp.StepSeconds * time.Second)
	codes, err := r.svc.RegenerateRecoveryCodes(ctx, userID, r.codeAt(t, secret))
	if err != nil || len(codes) != recoveryCodeCount {
		t.Fatalf("%v, %v", codes, err)
	}
	status, err := r.svc.SecondFactorStatus(ctx, userID)
	if err != nil || !status.Enrolled || !status.Required || status.RecoveryCodesLeft != recoveryCodeCount {
		t.Fatalf("status = %+v, %v", status, err)
	}
	res, _ := r.svc.SignIn(ctx, "ada", password)
	if _, err := r.svc.SignInWithCode(ctx, res.Challenge, old[1]); !errors.Is(err, ErrBadCode) {
		t.Fatalf("an old recovery code: err = %v", err)
	}
}
