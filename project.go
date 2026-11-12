package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// A project is one .pasteup file, a zip: project.json, pieces/ with the layers'
// pixels and masks as PNGs, refs/ with copies of the photos.

const manifestName = "project.json"

var projectFilter = runtime.FileFilter{DisplayName: "pasteup project (*.pasteup)", Pattern: "*.pasteup"}

// Saving writes the manifest, the new entries and, copied raw from the file
// already there, the entries that didn't change.
type SaveRequest struct {
	Path     string            `json:"path"`
	Manifest string            `json:"manifest"`
	Files    map[string]string `json:"files"` // entry → base64
	Disk     map[string]string `json:"disk"`  // entry → file to copy in, for photos
	Keep     []string          `json:"keep"`  // entries of the old file to copy over
	From     string            `json:"from"`  // the old file, when not Path (save as)
}

func (a *App) SaveProject(r SaveRequest) error {
	return saveProject(r)
}

func saveProject(r SaveRequest) error {
	var old *zip.ReadCloser
	if len(r.Keep) > 0 {
		from := r.From
		if from == "" {
			from = r.Path
		}
		var err error
		if old, err = zip.OpenReader(from); err != nil {
			return fmt.Errorf("reading the old file: %w", err)
		}
		defer old.Close()
	}

	tmp, err := os.CreateTemp(filepath.Dir(r.Path), ".pasteup-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	w := zip.NewWriter(tmp)
	if err := writeEntry(w, manifestName, zip.Deflate, strings.NewReader(r.Manifest)); err != nil {
		return err
	}
	for name, b64 := range r.Files {
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if err := writeEntry(w, name, zip.Store, bytes.NewReader(data)); err != nil {
			return err
		}
	}
	for name, file := range r.Disk {
		f, err := os.Open(file)
		if err != nil {
			return err
		}
		err = writeEntry(w, name, zip.Store, f)
		f.Close()
		if err != nil {
			return err
		}
	}
	if old != nil {
		keep := map[string]bool{}
		for _, name := range r.Keep {
			keep[name] = true
		}
		for _, f := range old.File {
			if !keep[f.Name] {
				continue
			}
			if err := w.Copy(f); err != nil {
				return err
			}
		}
	}
	if err := w.Close(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// Windows won't replace a file that is still open.
	if old != nil {
		old.Close()
	}
	// The new file replaces the old one only once it is whole.
	return os.Rename(tmp.Name(), r.Path)
}

func writeEntry(w *zip.Writer, name string, method uint16, r io.Reader) error {
	f, err := w.CreateHeader(&zip.FileHeader{Name: name, Method: method})
	if err != nil {
		return err
	}
	_, err = io.Copy(f, r)
	return err
}

// ProjectManifest reads a project's project.json.
func (a *App) ProjectManifest(path string) (string, error) {
	z, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer z.Close()
	f, err := z.Open(manifestName)
	if err != nil {
		return "", fmt.Errorf("%s has no %s", filepath.Base(path), manifestName)
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	return string(data), err
}

// serveEntry streams one entry of a project, for /project?path=…&entry=….
func serveEntry(w http.ResponseWriter, r *http.Request) {
	file := r.URL.Query().Get("path")
	entry := path.Clean(r.URL.Query().Get("entry"))
	if !filepath.IsAbs(file) || strings.HasPrefix(entry, "..") || entry == manifestName {
		http.Error(w, "bad entry", http.StatusBadRequest)
		return
	}
	z, err := zip.OpenReader(file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer z.Close()
	f, err := z.Open(entry)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", mime.TypeByExtension(path.Ext(entry)))
	io.Copy(w, f)
}

// OpenDialog asks for a project or a model to open.
func (a *App) OpenDialog() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open",
		Filters: []runtime.FileFilter{
			{DisplayName: "pasteup project or model (*.pasteup, *.glb)", Pattern: "*.pasteup;*.glb"},
		},
	})
}

// SaveDialog asks where to save the project, starting at dir/name.pasteup.
func (a *App) SaveDialog(dir, name string) (string, error) {
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Save project",
		DefaultDirectory: dir,
		DefaultFilename:  name + ".pasteup",
		Filters:          []runtime.FileFilter{projectFilter},
	})
	if err != nil || p == "" {
		return "", err
	}
	if filepath.Ext(p) != ".pasteup" {
		p += ".pasteup"
	}
	return p, nil
}

// Confirm asks a yes-or-no question; true for yes.
func (a *App) Confirm(title, message, yes string) bool {
	return ask(a.ctx, title, message, yes)
}

// ask shows a question with a yes button; Windows shows Yes and No instead.
func ask(ctx context.Context, title, message, yes string) bool {
	answer, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       []string{yes, "Cancel"},
		DefaultButton: "Cancel",
		CancelButton:  "Cancel",
	})
	return err == nil && (answer == yes || answer == "Yes")
}

var dirty struct {
	sync.Mutex
	on bool
}

// SetDirty tells whether the project has unsaved changes, so quitting can ask.
func (a *App) SetDirty(on bool) {
	dirty.Lock()
	dirty.on = on
	dirty.Unlock()
}

// beforeClose asks before unsaved changes are lost; true keeps the app open.
func (a *App) beforeClose(ctx context.Context) bool {
	dirty.Lock()
	on := dirty.on
	dirty.Unlock()
	if !on {
		return false
	}
	if !ask(ctx, "Unsaved changes", "Quit without saving?", "Quit") {
		return true
	}
	// Quitting without saving drops the changes on purpose, so nothing to recover.
	a.DiscardRecovery("")
	return false
}
