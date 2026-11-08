package main

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestPaintedPNGFlipsRows(t *testing.T) {
	dir := t.TempDir()
	raw := filepath.Join(dir, "a.pasteup.rgba")
	// Two rows bottom up: red below, blue on top.
	os.WriteFile(raw, []byte{255, 0, 0, 255, 0, 0, 255, 255}, 0o644)
	b64, err := paintedPNG(BridgePaint{Blend: filepath.Join(dir, "a.blend"), Written: raw, Width: 1, Height: 2})
	if err != nil {
		t.Fatal(err)
	}
	data, _ := base64.StdEncoding.DecodeString(b64)
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if r, _, b, _ := img.At(0, 0).RGBA(); b == 0 || r != 0 {
		t.Fatalf("top row should be blue")
	}
	if _, err := paintedPNG(BridgePaint{Blend: filepath.Join(dir, "a.blend"), Written: raw, Width: 2, Height: 2}); err == nil {
		t.Fatal("wrong size accepted")
	}
}

func TestKeepBacksUpFilesItDidNotWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nightstand.png")
	os.WriteFile(path, []byte("painted elsewhere"), 0o644)
	b := &bridge{}
	if err := b.keep(path, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := b.keep(path, []byte("second")); err != nil {
		t.Fatal(err)
	}
	backups, _ := filepath.Glob(filepath.Join(dir, ".pasteup-backup", "nightstand-*.png"))
	if len(backups) != 1 {
		t.Fatalf("%d backups, want 1 (only the file pasteup didn't write)", len(backups))
	}
	if data, _ := os.ReadFile(backups[0]); string(data) != "painted elsewhere" {
		t.Fatalf("backup holds %q", data)
	}
	if data, _ := os.ReadFile(path); string(data) != "second" {
		t.Fatalf("file holds %q", data)
	}
}

func TestTexturePath(t *testing.T) {
	cases := []struct {
		files   map[string]string
		channel string
		want    string
	}{
		{nil, "color", "/scene/Lamp_Shade.png"},
		{nil, "emission", "/scene/Lamp_Shade_emission.png"},
		{map[string]string{"color": "/tex/lamp.jpg"}, "color", "/tex/lamp.png"},
		{map[string]string{"color": "/tex/lamp.png"}, "roughness", "/tex/lamp_roughness.png"},
		{map[string]string{"color": "/tex/lamp.png", "emission": "/tex/glow.png"}, "emission", "/tex/glow.png"},
		{map[string]string{"color": "relative.png"}, "color", "/scene/Lamp_Shade.png"},
	}
	for _, c := range cases {
		got, err := texturePath("/scene/room.blend", "Lamp Shade", c.files, c.channel)
		if err != nil || got != c.want {
			t.Errorf("%v %s: %q %v, want %q", c.files, c.channel, got, err, c.want)
		}
	}
}
