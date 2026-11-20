// Package httpapi is the part of /api/v1 metis-server answers itself rather
// than the engine: signing in, the authenticator app's steps, a person's own
// password, signing out, and an organization's integration API keys.
//
// The paths and bodies are the ones the engine served, so the web app, the SDK
// and anything else already calling them keep working.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gsoultan/metis-server/internal/identity"
	"github.com/gsoultan/metis-server/internal/identity/apikey"
	"github.com/gsoultan/metis-server/internal/identity/assemble"
	"github.com/gsoultan/metis-server/internal/identity/signin"
)

// OrganizationHeader names the organization a request acts in, as the engine
// reads it.
const OrganizationHeader = "X-Organization-ID"

// maxBody bounds a request body: these are a few short strings.
const maxBody = 16 << 10

// Me fetches the signed-in account as the engine shows it, for the "user" in
// a sign-in's answer.
type Me func(ctx context.Context, token string) (json.RawMessage, error)

// Handler serves the identity routes.
type Handler struct {
	id  *assemble.Identity
	me  Me
	log *slog.Logger
	mux *http.ServeMux
}

// New serves id's routes.
func New(id *assemble.Identity, me Me, log *slog.Logger) *Handler {
	h := &Handler{id: id, me: me, log: log, mux: http.NewServeMux()}
	h.mux.HandleFunc("POST /api/v1/login", h.login)
	h.mux.HandleFunc("POST /api/v1/login/code", h.loginCode)
	h.mux.HandleFunc("POST /api/v1/login/enrol", h.beginEnrolment)
	h.mux.HandleFunc("POST /api/v1/login/enrol/confirm", h.confirmEnrolment)
	h.mux.HandleFunc("POST /api/v1/logout", h.logout)
	h.mux.HandleFunc("POST /api/v1/users/me/password", h.changePassword)
	h.mux.HandleFunc("GET /api/v1/users/me/two-factor", h.twoFactorStatus)
	h.mux.HandleFunc("POST /api/v1/users/me/two-factor/recovery-codes", h.regenerateRecoveryCodes)
	h.mux.HandleFunc("POST /api/v1/integration-keys", h.createKey)
	h.mux.HandleFunc("GET /api/v1/integration-keys", h.listKeys)
	h.mux.HandleFunc("DELETE /api/v1/integration-keys/{id}", h.revokeKey)
	return h
}

// Owns reports whether a request is one of these routes, so the server sends
// it here rather than to the engine.
func (h *Handler) Owns(r *http.Request) bool {
	_, pattern := h.mux.Handler(r)
	return pattern != ""
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

type loginAnswer struct {
	User               json.RawMessage `json:"user,omitempty"`
	Token              string          `json:"token,omitempty"`
	ExpiresAt          time.Time       `json:"expires_at,omitzero"`
	SecondFactor       string          `json:"second_factor,omitempty"`
	Challenge          string          `json:"challenge,omitempty"`
	ChallengeExpiresAt time.Time       `json:"challenge_expires_at,omitzero"`
	RecoveryCodes      []string        `json:"recovery_codes,omitempty"`
}

func (h *Handler) answerSignIn(w http.ResponseWriter, r *http.Request, res signin.Result) {
	out := loginAnswer{
		Token: res.Token, ExpiresAt: res.ExpiresAt,
		SecondFactor: string(res.Next), Challenge: res.Challenge, ChallengeExpiresAt: res.ChallengeExpiresAt,
		RecoveryCodes: res.RecoveryCodes,
	}
	if res.Token != "" && h.me != nil {
		user, err := h.me(r.Context(), res.Token)
		if err != nil {
			// The session is good; the page reads the account itself next.
			h.log.Warn("could not read the signed-in account for the sign-in answer", "error", err)
		}
		out.User = user
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	res, err := h.id.SignIn.SignIn(r.Context(), in.Username, in.Password)
	if err != nil {
		h.fail(w, err)
		return
	}
	h.answerSignIn(w, r, res)
}

type codeRequest struct {
	Challenge string `json:"challenge"`
	Code      string `json:"code"`
}

func (h *Handler) loginCode(w http.ResponseWriter, r *http.Request) {
	var in codeRequest
	if !readJSON(w, r, &in) {
		return
	}
	res, err := h.id.SignIn.SignInWithCode(r.Context(), in.Challenge, in.Code)
	if err != nil {
		h.fail(w, err)
		return
	}
	h.answerSignIn(w, r, res)
}

func (h *Handler) beginEnrolment(w http.ResponseWriter, r *http.Request) {
	var in codeRequest
	if !readJSON(w, r, &in) {
		return
	}
	enrolment, err := h.id.SignIn.BeginEnrolment(r.Context(), in.Challenge)
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"secret": enrolment.Secret, "otpauth_uri": enrolment.URI})
}

func (h *Handler) confirmEnrolment(w http.ResponseWriter, r *http.Request) {
	var in codeRequest
	if !readJSON(w, r, &in) {
		return
	}
	res, err := h.id.SignIn.ConfirmEnrolment(r.Context(), in.Challenge, in.Code)
	if err != nil {
		h.fail(w, err)
		return
	}
	h.answerSignIn(w, r, res)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	token, ok := bearer(r)
	if !ok || !h.id.Sessions.Claims(token) {
		h.fail(w, errUnauthorized)
		return
	}
	if err := h.id.Sessions.SignOut(r.Context(), token); err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct{}{})
}

// signedIn is the person a request's session belongs to. Integration API keys
// are refused: these routes are a person's own.
func (h *Handler) signedIn(w http.ResponseWriter, r *http.Request) (identity.Principal, bool) {
	p, ok, err := h.id.Authenticate(r.Context(), r)
	if err != nil {
		h.fail(w, err)
		return identity.Principal{}, false
	}
	if !ok {
		h.fail(w, errUnauthorized)
		return identity.Principal{}, false
	}
	if p.ViaKey {
		h.fail(w, errKeyNotHere)
		return identity.Principal{}, false
	}
	return p, true
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) {
	p, ok := h.signedIn(w, r)
	if !ok {
		return
	}
	var in struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if err := h.id.SignIn.ChangeOwnPassword(r.Context(), p.UserID, in.CurrentPassword, in.NewPassword); err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct{}{})
}

func (h *Handler) twoFactorStatus(w http.ResponseWriter, r *http.Request) {
	p, ok := h.signedIn(w, r)
	if !ok {
		return
	}
	status, err := h.id.SignIn.SecondFactorStatus(r.Context(), p.UserID)
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) regenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	p, ok := h.signedIn(w, r)
	if !ok {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	codes, err := h.id.SignIn.RegenerateRecoveryCodes(r.Context(), p.UserID, in.Code)
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string][]string{"recovery_codes": codes})
}

func (h *Handler) administrator(w http.ResponseWriter, r *http.Request) (apikey.Administrator, bool) {
	p, ok, err := h.id.Authenticate(r.Context(), r)
	if err != nil {
		h.fail(w, err)
		return apikey.Administrator{}, false
	}
	if !ok {
		h.fail(w, errUnauthorized)
		return apikey.Administrator{}, false
	}
	username := ""
	if !p.ViaKey {
		if account, found, err := h.id.SignIn.Account(r.Context(), p.UserID); err == nil && found {
			username = account.Username
		}
	}
	return apikey.Administrator{
		Principal:      p,
		Username:       username,
		OrganizationID: strings.TrimSpace(r.Header.Get(OrganizationHeader)),
	}, true
}

func (h *Handler) createKey(w http.ResponseWriter, r *http.Request) {
	by, ok := h.administrator(w, r)
	if !ok {
		return
	}
	var in struct {
		Name      string     `json:"name"`
		Roles     []string   `json:"roles"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	key, token, err := h.id.Keys.Create(r.Context(), by, in.Name, in.Roles, in.ExpiresAt)
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		apikey.Key
		Token string `json:"token"`
	}{key, token})
}

func (h *Handler) listKeys(w http.ResponseWriter, r *http.Request) {
	by, ok := h.administrator(w, r)
	if !ok {
		return
	}
	keys, err := h.id.Keys.List(r.Context(), by)
	if err != nil {
		h.fail(w, err)
		return
	}
	if keys == nil {
		keys = []apikey.Key{}
	}
	writeJSON(w, http.StatusOK, map[string][]apikey.Key{"keys": keys})
}

func (h *Handler) revokeKey(w http.ResponseWriter, r *http.Request) {
	by, ok := h.administrator(w, r)
	if !ok {
		return
	}
	if err := h.id.Keys.Revoke(r.Context(), by, r.PathValue("id")); err != nil {
		h.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var (
	errUnauthorized = errors.New("sign in first")
	errKeyNotHere   = errors.New("an integration API key cannot be used here; an administrator signs in to do this")
)

// fail answers an error as the engine did, {"error": "..."}, with what the
// caller can act on and nothing of how the server is built.
func (h *Handler) fail(w http.ResponseWriter, err error) {
	var throttled *signin.ThrottledError
	switch {
	case errors.As(err, &throttled):
		w.Header().Set("Retry-After", fmt.Sprint(int(throttled.RetryAfter.Seconds()+0.5)))
		writeError(w, http.StatusTooManyRequests, err.Error())
	case errors.Is(err, errUnauthorized), errors.Is(err, signin.ErrBadCredentials),
		errors.Is(err, signin.ErrBadCode), errors.Is(err, signin.ErrChallengeOver):
		writeError(w, http.StatusUnauthorized, err.Error())
	case errors.Is(err, errKeyNotHere), errors.Is(err, apikey.ErrForbidden):
		writeError(w, http.StatusForbidden, strings.TrimPrefix(err.Error(), "apikey: forbidden: "))
	case errors.Is(err, signin.ErrInvalid):
		writeError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), "signin: invalid: "))
	case errors.Is(err, apikey.ErrInvalid):
		writeError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), "apikey: invalid: "))
	case errors.Is(err, apikey.ErrNotFound), errors.Is(err, signin.ErrNoApp):
		writeError(w, http.StatusNotFound, strings.TrimPrefix(err.Error(), "apikey: "))
	default:
		h.log.Error("an identity request failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "sign-in is unavailable just now; try again shortly")
	}
}

func bearer(r *http.Request) (string, bool) {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}

func readJSON(w http.ResponseWriter, r *http.Request, into any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	if err := dec.Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "the request body is not the JSON this expects")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
