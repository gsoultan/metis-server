// Package ui is the built Metis web app, embedded into the metis-server binary.
//
// The tree tracks only ui/dist/.gitkeep, so `go build` works on a fresh clone
// before the UI is built: the binary then answers every page with a 503 that
// says to run `make ui-build`. A release is always built with the UI in it.
package ui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// Dist returns the embedded dist filesystem.
func Dist() fs.FS {
	f, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return f
}
