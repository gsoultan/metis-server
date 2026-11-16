// Package config reads metis-server's settings from the environment.
package config

import (
	"net/url"
	"os"
	"strings"

	"github.com/gsoultan/metis-server/internal/web"
)

// DefaultAddress is where metis-server listens when METIS_SERVER_ADDRESS is
// not set. Not the engine's 8273, so both run on one machine as they are.
const DefaultAddress = ":8080"

// Config is everything metis-server needs to start.
type Config struct {
	// Address is the listen address, such as ":8080".
	Address string
	// EngineURL is the metis engine the UI's API calls are forwarded to.
	EngineURL *url.URL
}

// FromEnv reads METIS_SERVER_ADDRESS and METIS_ENGINE_URL.
func FromEnv() (Config, error) {
	return parse(os.Getenv)
}

func parse(getenv func(string) string) (Config, error) {
	engine, err := web.ParseEngineURL(getenv("METIS_ENGINE_URL"))
	if err != nil {
		return Config{}, err
	}
	addr := strings.TrimSpace(getenv("METIS_SERVER_ADDRESS"))
	if addr == "" {
		addr = DefaultAddress
	}
	return Config{Address: addr, EngineURL: engine}, nil
}
