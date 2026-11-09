package main

import (
	"context"
	"net/http"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"pasteup/internal/grunge"
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
	// Corners in world space, nine per face, for the 3D view.
	Positions []float32 `json:"positions"`
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

	return loadLayout(path, path, nil, "")
}

// loadLayout reads the UVs of a GLB, with a material only its faces; the layout
// is named after the material, or the path, which can be the .blend the GLB came from.
func loadLayout(glb, path string, sets map[string]int, material string) (*Layout, error) {
	m, err := mesh.LoadGLB(glb, sets, material)
	if err != nil {
		return nil, err
	}
	name := material
	if name == "" {
		name = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	l := &Layout{
		Name:      name,
		Path:      path,
		UVs:       make([]float32, 0, len(m.Tris)*6),
		Islands:   mesh.Islands(m.Tris),
		Positions: make([]float32, 0, len(m.Tris)*9),
	}
	for _, t := range m.Tris {
		for c, uv := range t.UV {
			l.UVs = append(l.UVs, float32(uv[0]), float32(uv[1]))
			l.Positions = append(l.Positions, float32(t.P[c][0]), float32(t.P[c][1]), float32(t.P[c][2]))
		}
	}
	return l, nil
}

// ExportPNG asks where to save the texture, starting at dir/name.png; the other
// channels go beside it as name_<channel>.png.
func (a *App) ExportPNG(dir, name string, pngs map[string]string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Export texture",
		DefaultDirectory: dir,
		DefaultFilename:  name + ".png",
		Filters:          []runtime.FileFilter{{DisplayName: "PNG (*.png)", Pattern: "*.png"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if filepath.Ext(path) != ".png" {
		path += ".png"
	}
	for channel, b64 := range pngs {
		p, err := channelPath(path, channel)
		if err != nil {
			return "", err
		}
		if err := writePNG(p, b64); err != nil {
			return "", err
		}
	}
	return path, nil
}

// OpenPhotos asks for photos to add to the ref space.
func (a *App) OpenPhotos() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Open photos",
		Filters: []runtime.FileFilter{{DisplayName: "Images", Pattern: "*.png;*.jpg;*.jpeg;*.webp"}},
	})
}

var imageExt = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true}

// GrungeMaps lists the built-in grunge maps, then the ones in the grunge folder, served at /grunge?name=.
func (a *App) GrungeMaps() []string {
	dir, err := grunge.Dir()
	if err != nil {
		return []string{}
	}
	return grunge.Names(dir)
}

// OpenGrungeFolder shows the grunge folder in the file manager.
func (a *App) OpenGrungeFolder() error {
	dir, err := grunge.Dir()
	if err != nil {
		return err
	}
	return openFolder(dir)
}

func openFolder(dir string) error {
	switch goruntime.GOOS {
	case "darwin":
		return exec.Command("open", dir).Start()
	case "windows":
		return exec.Command("explorer", dir).Start()
	}
	return exec.Command("xdg-open", dir).Start()
}

// middleware serves dropped photos, project entries, grunge maps and fonts, which are too large for bindings.
func (a *App) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/project" {
			serveEntry(w, r)
			return
		}
		if r.URL.Path == "/font" {
			serveFont(w, r)
			return
		}
		if r.URL.Path == "/grunge" {
			dir, _ := grunge.Dir()
			data, err := grunge.PNG(dir, r.URL.Query().Get("name"))
			if err != nil {
				http.Error(w, "no such map", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "image/png")
			w.Write(data)
			return
		}
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
