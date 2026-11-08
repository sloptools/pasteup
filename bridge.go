package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
}

// blendState is what pasteup has for one .blend: its texture files with a count
// that goes up with each new set, and a count of syncs pasteup asked for. A
// channel the project doesn't have is empty.
type blendState struct {
	Texture   int    `json:"texture"`
	Color     string `json:"color"`
	Emission  string `json:"emission"`
	Roughness string `json:"roughness"`
	Sync      int    `json:"sync"`
	seen      time.Time
}

// BridgeSync is what the add-on sends after writing a .blend's objects into a GLB,
// with the UV set per object that Blender renders with.
type BridgeSync struct {
	Blend   string         `json:"blend"`
	Written string         `json:"written"`
	UVSets  map[string]int `json:"uvSets"`
}

type BridgeLayout struct {
	Blend  string  `json:"blend"`
	Layout *Layout `json:"layout"`
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
		s = &blendState{}
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
			layout, err := loadLayout(s.Written, s.Blend, s.UVSets)
			os.Remove(s.Written)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			runtime.EventsEmit(a.ctx, "bridge:sync", BridgeLayout{Blend: s.Blend, Layout: layout})
			runtime.WindowShow(a.ctx)

		default:
			http.NotFound(w, r)
		}
	})
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

// BridgeTexture writes the live channels beside the .blend, color as <name>.png,
// the others as <name>_<channel>.png, and tells the add-on.
func (a *App) BridgeTexture(blend string, pngs map[string]string) error {
	if a.bridge == nil {
		return errors.New("no bridge")
	}
	if !filepath.IsAbs(blend) {
		return errors.New("bad blend")
	}
	paths := map[string]string{}
	for channel, b64 := range pngs {
		path, err := channelPath(strings.TrimSuffix(blend, filepath.Ext(blend))+".png", channel)
		if err != nil {
			return err
		}
		if err := writePNG(path, b64); err != nil {
			return err
		}
		paths[channel] = path
	}

	b := a.bridge
	b.mu.Lock()
	defer b.mu.Unlock()
	s := b.state(blend)
	s.Texture++
	s.Color = paths["color"]
	s.Emission = paths["emission"]
	s.Roughness = paths["roughness"]
	return nil
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

func writePNG(path, b64 string) error {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// BridgeRequestSync asks the add-on of a .blend to send its objects again.
func (a *App) BridgeRequestSync(blend string) {
	if a.bridge == nil {
		return
	}
	a.bridge.mu.Lock()
	defer a.bridge.mu.Unlock()
	a.bridge.state(blend).Sync++
}
