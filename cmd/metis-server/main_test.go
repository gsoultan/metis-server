package main

import (
	"context"
	"testing"

	"github.com/gsoultan/metis/engine"
)

// The engine in this process reports metis-server's version, and the names it
// is given are a package and a repository it accepts: an engine refusing them
// would refuse to start.
func TestTheEngineReportsMetisServersBuild(t *testing.T) {
	before := version
	t.Cleanup(func() { version = before })
	version = "v0.2.3"

	e := engine.New(withBuild())
	if got := engine.Version(); got != "v0.2.3" {
		t.Fatalf("engine.Version() = %q, want metis-server's v0.2.3", got)
	}
	if err := e.Run(context.Background(), []string{"-help"}); err != nil {
		t.Fatalf("the engine refused metis-server's build: %v", err)
	}
}
