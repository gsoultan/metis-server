// Package config reads metis-server's settings from the environment.
package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/gsoultan/metis-server/internal/web"
	"github.com/gsoultan/metis/engine"
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
	// Role is what this machine does, from METIS_ROLE. The embedded engine
	// reads the same variable.
	Role Role
}

// Role is what one metis-server machine does. Every machine uses the same
// database.
type Role string

const (
	// RoleAll serves the web app and the API and runs the engine's work. The
	// default, and what a single machine runs.
	RoleAll Role = "all"
	// RoleWeb serves the web app and the API and runs none of the engine's
	// jobs, timers or deliveries. A worker or an all machine does them.
	RoleWeb Role = "web"
	// RoleWorker runs the engine's work and serves only its health checks:
	// people reach the installation through the web machines.
	RoleWorker Role = "worker"
)

// ServesPeople reports whether the machine serves the web app and the API.
func (r Role) ServesPeople() bool { return r != RoleWorker }

func parseRole(value string) (Role, error) {
	switch role := Role(strings.ToLower(strings.TrimSpace(value))); role {
	case "", RoleAll:
		return RoleAll, nil
	case RoleWeb, RoleWorker:
		return role, nil
	default:
		return "", fmt.Errorf("METIS_ROLE=%q is not a role: use all, web or worker", value)
	}
}

// FromEnv reads METIS_SERVER_ADDRESS, METIS_ENGINE_URL and, when the engine
// runs in this process, METIS_HTTP_ADDRESS and the role: METIS_ROLE, or else
// server.role in the engine's config.yaml, as the engine itself reads it.
func FromEnv() (Config, error) {
	return parseWith(os.Getenv, engine.Role)
}

func parseWith(getenv func(string) string, engineRole func() (string, error)) (Config, error) {
	addr := strings.TrimSpace(getenv("METIS_SERVER_ADDRESS"))
	if addr == "" {
		addr = DefaultAddress
	}

	if strings.TrimSpace(getenv("METIS_ENGINE_URL")) != "" {
		// A machine in front of an engine elsewhere runs none of its work, so
		// it can only be a web machine.
		role, err := parseRole(getenv("METIS_ROLE"))
		if err != nil {
			return Config{}, err
		}
		if role != RoleAll && role != RoleWeb {
			return Config{}, fmt.Errorf("METIS_ROLE=%s needs the engine in this process; unset METIS_ENGINE_URL", role)
		}
		engine, err := web.ParseEngineURL(getenv("METIS_ENGINE_URL"))
		if err != nil {
			return Config{}, err
		}
		return Config{Address: addr, EngineURL: engine, Role: RoleWeb}, nil
	}

	read, err := engineRole()
	if err != nil {
		return Config{}, err
	}
	role, err := parseRole(read)
	if err != nil {
		return Config{}, err
	}

	engineAddr := strings.TrimSpace(getenv("METIS_HTTP_ADDRESS"))
	if engineAddr == "" {
		engineAddr = DefaultEmbeddedEngineAddress
	}
	engine, err := web.ParseEngineURL("http://" + dialable(engineAddr))
	if err != nil {
		return Config{}, err
	}
	return Config{Address: addr, EngineURL: engine, Embedded: true, EngineAddress: engineAddr, Role: role}, nil
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
