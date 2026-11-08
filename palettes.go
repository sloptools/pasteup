package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"pasteup/internal/palette"
)

// Palette is a named list of #rrggbb colors.
type Palette struct {
	Name   string   `json:"name"`
	Colors []string `json:"colors"`
}

func hexes(pal []palette.Color) []string {
	out := make([]string, len(pal))
	for i, c := range pal {
		out[i] = c.Hex()
	}
	return out
}

func (a *App) QuakePalette() Palette {
	return Palette{Name: "quake", Colors: hexes(palette.Quake())}
}

// OpenPalette asks for a palette file: .lmp, .gpl, .hex or an image.
func (a *App) OpenPalette() (*Palette, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open palette",
		Filters: []runtime.FileFilter{
			{DisplayName: "Palette (*.lmp, *.gpl, *.hex, *.png)", Pattern: "*.lmp;*.gpl;*.hex;*.txt;*.png;*.gif"},
		},
	})
	if err != nil || path == "" {
		return nil, err
	}
	pal, err := palette.Load(path)
	if err != nil {
		return nil, err
	}
	return &Palette{Name: strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)), Colors: hexes(pal)}, nil
}

var slugPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

// LospecPalette fetches a palette by its slug, as in lospec.com/palette-list/<slug>.
func (a *App) LospecPalette(slug string) (*Palette, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if !slugPattern.MatchString(slug) {
		return nil, fmt.Errorf("%q is no Lospec slug", slug)
	}
	client := http.Client{Timeout: 10 * time.Second}
	res, err := client.Get("https://lospec.com/palette-list/" + slug + ".json")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("lospec has no palette %q", slug)
	}
	var p struct {
		Name   string   `json:"name"`
		Colors []string `json:"colors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&p); err != nil {
		return nil, err
	}
	pal, err := palette.ParseText(strings.Join(p.Colors, "\n"))
	if err != nil {
		return nil, err
	}
	name := p.Name
	if name == "" {
		name = slug
	}
	return &Palette{Name: name, Colors: hexes(pal)}, nil
}
