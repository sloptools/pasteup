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
