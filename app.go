package main

import (
	"context"
	"encoding/base64"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"pasteup/internal/mesh"
)

type App struct {
	ctx    context.Context
	bridge *bridge
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.startBridge(); err != nil {
		runtime.LogError(ctx, "bridge: "+err.Error())
	}
}

func (a *App) shutdown(ctx context.Context) {
	a.stopBridge()
}

// Layout is a model's UV layout: six coordinates per face, v down as in images.
type Layout struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	UVs     []float32 `json:"uvs"`
	Islands []int     `json:"islands"`
}

// OpenModel loads a GLB, asking for one when path is empty.
func (a *App) OpenModel(path string) (*Layout, error) {
	if path == "" {
		var err error
		path, err = runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
			Title:   "Open model",
			Filters: []runtime.FileFilter{{DisplayName: "glTF binary (*.glb)", Pattern: "*.glb"}},
		})
		if err != nil || path == "" {
			return nil, err
		}
	}

	return loadLayout(path, path, nil)
}

// loadLayout reads the UVs of a GLB; path names the layout, which can be the .blend
// the GLB came from.
func loadLayout(glb, path string, sets map[string]int) (*Layout, error) {
	m, err := mesh.LoadGLB(glb, sets)
	if err != nil {
		return nil, err
	}
	l := &Layout{
		Name:    strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)),
		Path:    path,
		UVs:     make([]float32, 0, len(m.Tris)*6),
		Islands: mesh.Islands(m.Tris),
	}
	for _, t := range m.Tris {
		for _, uv := range t.UV {
			l.UVs = append(l.UVs, float32(uv[0]), float32(uv[1]))
		}
	}
	return l, nil
}

// ExportPNG asks where to save the texture, starting at dir/name.png.
func (a *App) ExportPNG(dir, name, pngBase64 string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Export texture",
		DefaultDirectory: dir,
		DefaultFilename:  name + ".png",
		Filters:          []runtime.FileFilter{{DisplayName: "PNG (*.png)", Pattern: "*.png"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	data, err := base64.StdEncoding.DecodeString(pngBase64)
	if err != nil {
		return "", err
	}
	return path, os.WriteFile(path, data, 0o644)
}

// OpenPhotos asks for photos to add to the ref space.
func (a *App) OpenPhotos() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Open photos",
		Filters: []runtime.FileFilter{{DisplayName: "Images", Pattern: "*.png;*.jpg;*.jpeg;*.webp"}},
	})
}

var imageExt = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true}

// middleware serves dropped photos, which are too large for bindings.
func (a *App) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/photo" {
			next.ServeHTTP(w, r)
			return
		}
		path := r.URL.Query().Get("path")
		if !filepath.IsAbs(path) || !imageExt[strings.ToLower(filepath.Ext(path))] {
			http.Error(w, "bad image", http.StatusBadRequest)
			return
		}
		http.ServeFile(w, r, path)
	})
}
