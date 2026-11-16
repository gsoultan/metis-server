package web

import (
	"errors"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// NewEngineProxy forwards a request to the metis engine at target, unchanged
// apart from the address it goes to.
//
// The UI calls the engine through metis-server so that the browser talks to
// one origin: no CORS, and the bearer token in the Authorization header goes
// only where the page itself came from. The engine still does all of the
// authentication and authorization; this proxy decides nothing.
//
// X-Forwarded-For, -Host and -Proto are set for the engine. The engine trusts
// them only from the addresses in its METIS_TRUSTED_PROXIES, so that list must
// name metis-server, or every user shares metis-server's address in the
// engine's rate limiter and audit log.
func NewEngineProxy(target *url.URL) http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.SetXForwarded()
			// SetURL joins the target's path in front of the request's; keep
			// the request's own Host out of it so the engine sees its own name.
			pr.Out.Host = target.Host
		},
		// Flush as soon as the engine writes: the live updates at
		// /api/v1/events are server-sent events, which a buffering proxy
		// would hold back until the stream closes.
		FlushInterval: -1,
		ErrorHandler:  engineUnavailable,
	}
}

// engineUnavailableBody is engineUnavailable's answer, in the engine's error
// shape.
const engineUnavailableBody = `{"err":"The Metis engine could not be reached. Try again in a moment."}` + "\n"

// engineUnavailable answers a request the engine could not be reached for, in
// the engine's own error shape, so the UI shows it like any other failure.
func engineUnavailable(w http.ResponseWriter, r *http.Request, err error) {
	if r.Context().Err() != nil {
		// The browser went away; there is nobody to answer.
		return
	}
	slog.Warn("The engine could not be reached", "path", r.URL.Path, "error", err)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusBadGateway)
	if _, werr := w.Write([]byte(engineUnavailableBody)); werr != nil {
		slog.Debug("Could not write the engine-unavailable response", "error", werr)
	}
}

// ParseEngineURL reads the engine's base address. Only http and https are
// accepted, with a host and no path, query or credentials: anything else is a
// typo that would otherwise surface as every page failing.
func ParseEngineURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("METIS_ENGINE_URL is not set; point it at the metis engine, for example http://localhost:8273")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, errors.New("METIS_ENGINE_URL is not a URL: " + err.Error())
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("METIS_ENGINE_URL must start with http:// or https://")
	}
	if u.Host == "" {
		return nil, errors.New("METIS_ENGINE_URL has no host")
	}
	if u.User != nil {
		return nil, errors.New("METIS_ENGINE_URL must not carry a user name or password")
	}
	if (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("METIS_ENGINE_URL must be the engine's base address, with no path or query")
	}
	u.Path = ""
	return u, nil
}
