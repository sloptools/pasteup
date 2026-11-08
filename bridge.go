package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// The Blender bridge: a server on localhost the add-on talks to. The add-on finds
// its port and token in bridge.json in the config dir; only callers with the token
// get through.
type bridge struct {
	mu     sync.Mutex
	token  string
	file   string
	blends map[string]*blendState
	// What pasteup last wrote to each texture file, so one it didn't write is kept.
	written map[string][32]byte
}

// blendState is what pasteup has for one .blend: the textures by material, and
// a count of syncs pasteup asked for, with the material to sync.
type blendState struct {
	Textures map[string]*textureState `json:"textures"`
	Sync     int                      `json:"sync"`
	SyncOf   string                   `json:"syncOf"`
	seen     time.Time
}

// textureState is one material's texture files, with a count that goes up with
// each new set. A channel the texture doesn't have is empty.
type textureState struct {
	Version  int    `json:"version"`
	Color    string `json:"color"`
	Emission string `json:"emission"`
	// How strongly the emission glows in the material.
	Strength  float64 `json:"strength"`
	Roughness string  `json:"roughness"`
}

// BridgeSync is what the add-on sends after writing the objects with a material
// into a GLB: the UV set per object that Blender renders with, and the image
// files the material already uses, by channel.
type BridgeSync struct {
	Blend    string            `json:"blend"`
	Written  string            `json:"written"`
	UVSets   map[string]int    `json:"uvSets"`
	Material string            `json:"material"`
	Images   map[string]string `json:"images"`
}

// BridgeSelect is the material of the object just made active in Blender.
type BridgeSelect struct {
	Blend    string `json:"blend"`
	Material string `json:"material"`
	Object   string `json:"object"`
}

// BridgePaint is what the add-on sends when the texture was painted on in Blender:
// its pixels as raw RGBA bytes, rows bottom up as Blender keeps them, and the
// texture version they were painted on.
type BridgePaint struct {
	Blend    string `json:"blend"`
	Material string `json:"material"`
	Written  string `json:"written"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Texture  int    `json:"texture"`
}

// BridgePainted goes to the frontend: the painted texture as a PNG and its base version.
type BridgePainted struct {
	Blend    string `json:"blend"`
	Material string `json:"material"`
	PNG      string `json:"png"`
	Texture  int    `json:"texture"`
}

type BridgeLayout struct {
	Blend    string            `json:"blend"`
	Material string            `json:"material"`
	Layout   *Layout           `json:"layout"`
	Images   map[string]string `json:"images"`
}

func bridgeFile() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "pasteup", "bridge.json"), nil
}

func (a *App) startBridge() error {
	key := make([]byte, 16)
	if _, err := rand.Read(key); err != nil {
		return err
	}
	file, err := bridgeFile()
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	b := &bridge{token: hex.EncodeToString(key), file: file, blends: map[string]*blendState{}}
	a.bridge = b

	info, _ := json.Marshal(map[string]any{"port": ln.Addr().(*net.TCPAddr).Port, "token": b.token})
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(file, info, 0o600); err != nil {
		return err
	}
	go http.Serve(ln, a.bridgeHandler())
	return nil
}

func (a *App) stopBridge() {
	if a.bridge != nil {
		os.Remove(a.bridge.file)
	}
}

func (b *bridge) state(blend string) *blendState {
	s, ok := b.blends[blend]
	if !ok {
		s = &blendState{Textures: map[string]*textureState{}}
		b.blends[blend] = s
	}
	return s
}

func (a *App) bridgeHandler() http.Handler {
	b := a.bridge
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Pasteup-Token")), []byte(b.token)) != 1 {
			http.Error(w, "bad token", http.StatusForbidden)
			return
		}
		switch r.URL.Path {
		case "/state":
			blend := r.URL.Query().Get("blend")
			b.mu.Lock()
			s := b.state(blend)
			s.seen = time.Now()
			out, _ := json.Marshal(s)
			b.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.Write(out)

		case "/sync":
			var s BridgeSync
			if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if !filepath.IsAbs(s.Blend) || !strings.EqualFold(filepath.Ext(s.Written), ".glb") {
				http.Error(w, "bad sync", http.StatusBadRequest)
				return
			}
			layout, err := loadLayout(s.Written, s.Blend, s.UVSets, s.Material)
			os.Remove(s.Written)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			runtime.EventsEmit(a.ctx, "bridge:sync", BridgeLayout{Blend: s.Blend, Material: s.Material, Layout: layout, Images: s.Images})
			runtime.WindowShow(a.ctx)

		case "/select":
			var s BridgeSelect
			if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			runtime.EventsEmit(a.ctx, "bridge:select", s)

		case "/paint":
			var p BridgePaint
			if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			png, err := paintedPNG(p)
			os.Remove(p.Written)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			runtime.EventsEmit(a.ctx, "bridge:paint", BridgePainted{Blend: p.Blend, Material: p.Material, PNG: png, Texture: p.Texture})

		default:
			http.NotFound(w, r)
		}
	})
}

// paintedPNG turns the add-on's raw pixels into a PNG, rows top down.
func paintedPNG(p BridgePaint) (string, error) {
	if !filepath.IsAbs(p.Blend) || !strings.HasSuffix(p.Written, ".pasteup.rgba") || p.Width <= 0 || p.Height <= 0 || p.Width > 8192 || p.Height > 8192 {
		return "", errors.New("bad paint")
	}
	data, err := os.ReadFile(p.Written)
	if err != nil {
		return "", err
	}
	if len(data) != p.Width*p.Height*4 {
		return "", fmt.Errorf("paint has %d bytes, want %d", len(data), p.Width*p.Height*4)
	}
	img := image.NewNRGBA(image.Rect(0, 0, p.Width, p.Height))
	row := p.Width * 4
	for y := range p.Height {
		copy(img.Pix[y*row:(y+1)*row], data[(p.Height-1-y)*row:(p.Height-y)*row])
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// BridgeConnected lists the .blend files whose add-on asked in the last seconds.
func (a *App) BridgeConnected() []string {
	out := []string{}
	if a.bridge == nil {
		return out
	}
	b := a.bridge
	b.mu.Lock()
	defer b.mu.Unlock()
	for blend, s := range b.blends {
		if time.Since(s.seen) < 3*time.Second {
			out = append(out, blend)
		}
	}
	return out
}

// BridgeTexture writes a material's channels into the image files it uses, or
// beside the .blend as <material>.png and <material>_<channel>.png, and tells the
// add-on. It returns the version, which comes back with paint from Blender.
func (a *App) BridgeTexture(blend, material string, files, pngs map[string]string, strength float64) (int, error) {
	if a.bridge == nil {
		return 0, errors.New("no bridge")
	}
	if !filepath.IsAbs(blend) || material == "" {
		return 0, errors.New("bad blend")
	}
	paths := map[string]string{}
	for channel, b64 := range pngs {
		path, err := texturePath(blend, material, files, channel)
		if err != nil {
			return 0, err
		}
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return 0, err
		}
		if err := a.bridge.keep(path, data); err != nil {
			return 0, err
		}
		paths[channel] = path
	}

	b := a.bridge
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.state(blend).Textures[material]
	if t == nil {
		t = &textureState{}
		b.state(blend).Textures[material] = t
	}
	t.Version++
	t.Color = paths["color"]
	t.Emission = paths["emission"]
	t.Roughness = paths["roughness"]
	t.Strength = strength
	return t.Version, nil
}

// texturePath is the file a channel goes to: the material's own image, as a PNG,
// or one named after the material beside the .blend.
func texturePath(blend, material string, files map[string]string, channel string) (string, error) {
	png := func(p string) string { return strings.TrimSuffix(p, filepath.Ext(p)) + ".png" }
	if p := files[channel]; filepath.IsAbs(p) {
		if !channelNames[channel] {
			return "", fmt.Errorf("no channel %q", channel)
		}
		return png(p), nil
	}
	color := filepath.Join(filepath.Dir(blend), fileName(material)+".png")
	if p := files["color"]; filepath.IsAbs(p) {
		color = png(p)
	}
	return channelPath(color, channel)
}

// fileName keeps letters, digits, dot, dash and underscore of a material's name.
func fileName(material string) string {
	return strings.Map(func(r rune) rune {
		if r == '.' || r == '-' || r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' {
			return r
		}
		return '_'
	}, material)
}

var channelNames = map[string]bool{"color": true, "emission": true, "ao": true, "roughness": true}

// channelPath is where a channel goes beside the color file: name.png, name_emission.png.
func channelPath(color, channel string) (string, error) {
	if !channelNames[channel] {
		return "", fmt.Errorf("no channel %q", channel)
	}
	if channel == "color" {
		return color, nil
	}
	return strings.TrimSuffix(color, ".png") + "_" + channel + ".png", nil
}

// keep writes a texture file, first moving a file there that pasteup didn't
// write (or that changed since) into .pasteup-backup beside it, so a texture
// painted elsewhere, or by another project, is never lost.
func (b *bridge) keep(path string, data []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.written == nil {
		b.written = map[string][32]byte{}
	}
	if old, err := os.ReadFile(path); err == nil {
		if mark, ok := b.written[path]; !ok || mark != sha256.Sum256(old) {
			dir := filepath.Join(filepath.Dir(path), ".pasteup-backup")
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return err
			}
			name := strings.TrimSuffix(filepath.Base(path), ".png") + time.Now().Format("-2006-01-02-150405") + ".png"
			if err := os.WriteFile(filepath.Join(dir, name), old, 0o644); err != nil {
				return err
			}
		}
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	b.written[path] = sha256.Sum256(data)
	return nil
}

func writePNG(path, b64 string) error {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// BridgeRequestSync asks the add-on of a .blend to send the objects with a material again.
func (a *App) BridgeRequestSync(blend, material string) {
	if a.bridge == nil {
		return
	}
	a.bridge.mu.Lock()
	defer a.bridge.mu.Unlock()
	s := a.bridge.state(blend)
	s.Sync++
	s.SyncOf = material
}
