// Package config reads metis-server's settings from the environment.
package config

import (
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/gsoultan/metis-server/internal/web"
)

// DefaultAddress is where metis-server listens when METIS_SERVER_ADDRESS is
// not set. Not the engine's 8273, so both run on one machine as they are.
const DefaultAddress = ":8080"

// DefaultEmbeddedEngineAddress is where the engine metis-server runs in its
// own process listens when METIS_HTTP_ADDRESS is not set: loopback only, so
// the API is reached through metis-server alone, as with a separate engine.
const DefaultEmbeddedEngineAddress = "127.0.0.1:8273"

// Config is everything metis-server needs to start.
type Config struct {
	// Address is the listen address, such as ":8080".
	Address string
	// EngineURL is the metis engine the UI's API calls are forwarded to.
	EngineURL *url.URL
	// Embedded is true when metis-server runs the engine in its own process,
	// which it does unless METIS_ENGINE_URL names one elsewhere. EngineURL is
	// then the embedded engine's loopback address.
	Embedded bool
	// EngineAddress is the embedded engine's listen address, which it reads
	// from METIS_HTTP_ADDRESS. Empty when the engine is elsewhere.
	EngineAddress string
}

// FromEnv reads METIS_SERVER_ADDRESS, METIS_ENGINE_URL and, when the engine
// runs in this process, METIS_HTTP_ADDRESS.
func FromEnv() (Config, error) {
	return parse(os.Getenv)
}

func parse(getenv func(string) string) (Config, error) {
	addr := strings.TrimSpace(getenv("METIS_SERVER_ADDRESS"))
	if addr == "" {
		addr = DefaultAddress
	}

	if strings.TrimSpace(getenv("METIS_ENGINE_URL")) != "" {
		engine, err := web.ParseEngineURL(getenv("METIS_ENGINE_URL"))
		if err != nil {
			return Config{}, err
		}
		return Config{Address: addr, EngineURL: engine}, nil
	}

	engineAddr := strings.TrimSpace(getenv("METIS_HTTP_ADDRESS"))
	if engineAddr == "" {
		engineAddr = DefaultEmbeddedEngineAddress
	}
	engine, err := web.ParseEngineURL("http://" + dialable(engineAddr))
	if err != nil {
		return Config{}, err
	}
	return Config{Address: addr, EngineURL: engine, Embedded: true, EngineAddress: engineAddr}, nil
}

// dialable turns a listen address into one to connect to: a listener on every
// address (":8273", "0.0.0.0:8273", "[::]:8273") is reached on loopback.
func dialable(listen string) string {
	host, port, err := net.SplitHostPort(listen)
	if err != nil {
		return listen
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return net.JoinHostPort(host, port)
}
