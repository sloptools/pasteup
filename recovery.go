package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Session recovery: while there are unsaved changes the frontend writes the
// project to this session's recovery-<start>.pasteup in the config dir, so no
// session overwrites another's. Quitting on purpose removes it; the ones still
// there at the next start were left by sessions that ended otherwise, and wait
// until restored or discarded.

var session = struct {
	once sync.Once
	file string
}{}

func recoveryDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "pasteup")
	return dir, os.MkdirAll(dir, 0o755)
}

// RecoveryPath is where this session keeps its unsaved changes.
func (a *App) RecoveryPath() string {
	session.once.Do(func() {
		if dir, err := recoveryDir(); err == nil {
			session.file = filepath.Join(dir, time.Now().Format("recovery-20060102-150405.000000.pasteup"))
		}
	})
	return session.file
}

// Recovered is a session left unsaved: its file and when it was last written.
type Recovered struct {
	Path     string `json:"path"`
	Modified string `json:"modified"`
}

// Recovery lists what earlier sessions left, newest first.
func (a *App) Recovery() []Recovered {
	out := []Recovered{}
	dir, err := recoveryDir()
	if err != nil {
		return out
	}
	files, _ := filepath.Glob(filepath.Join(dir, "recovery-*.pasteup"))
	own := a.RecoveryPath()
	times := map[string]time.Time{}
	for _, f := range files {
		if info, err := os.Stat(f); err == nil && f != own {
			times[f] = info.ModTime()
		}
	}
	for f := range times {
		out = append(out, Recovered{Path: f, Modified: times[f].Format("2 Jan 15:04")})
	}
	sort.Slice(out, func(i, j int) bool { return times[out[i].Path].After(times[out[j].Path]) })
	return out
}

// SaveRecovery writes the unsaved project to this session's recovery file.
func (a *App) SaveRecovery(r SaveRequest) error {
	r.Path = a.RecoveryPath()
	return saveProject(r)
}

// DiscardRecovery removes a recovery file, this session's when path is empty.
func (a *App) DiscardRecovery(path string) {
	if path == "" {
		path = a.RecoveryPath()
	}
	dir, err := recoveryDir()
	name := filepath.Base(path)
	if err != nil || filepath.Dir(path) != dir || !strings.HasPrefix(name, "recovery-") || filepath.Ext(name) != ".pasteup" {
		return
	}
	os.Remove(path)
}
