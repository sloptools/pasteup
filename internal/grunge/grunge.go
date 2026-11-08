// Package grunge reads the grunge maps from a folder of the user's: square grays,
// white = dirt, best tileable. None ship with pasteup.
package grunge

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var exts = []string{".png", ".jpg", ".jpeg"}

func isMap(file string) bool {
	ext := strings.ToLower(filepath.Ext(file))
	for _, e := range exts {
		if ext == e {
			return true
		}
	}
	return false
}

// Dir is the folder in the config dir the maps are read from, made if missing.
func Dir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "pasteup", "grunge")
	return dir, os.MkdirAll(dir, 0o755)
}

// Names lists the maps in dir by file name without extension, sorted.
func Names(dir string) []string {
	entries, _ := os.ReadDir(dir)
	names := []string{}
	for _, e := range entries {
		if !e.IsDir() && isMap(e.Name()) && !strings.HasPrefix(e.Name(), ".") {
			names = append(names, strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())))
		}
	}
	sort.Strings(names)
	return names
}

// Path is the file of the map by that name in dir.
func Path(dir, name string) (string, error) {
	if name == "" || strings.ContainsAny(name, `/\`) || strings.HasPrefix(name, ".") {
		return "", errors.New("bad map name")
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if isMap(e.Name()) && strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())) == name {
			return filepath.Join(dir, e.Name()), nil
		}
	}
	return "", errors.New("no such map")
}
