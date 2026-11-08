package main

import (
	"archive/zip"
	"encoding/base64"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func entries(t *testing.T, path string) map[string]string {
	z, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer z.Close()
	out := map[string]string{}
	for _, f := range z.File {
		r, _ := f.Open()
		data, _ := io.ReadAll(r)
		r.Close()
		out[f.Name] = string(data)
	}
	return out
}

func TestSaveKeepsUnchangedEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.pasteup")
	photo := filepath.Join(dir, "photo.jpg")
	os.WriteFile(photo, []byte("jpeg"), 0o644)
	b64 := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

	err := saveProject(SaveRequest{Path: path, Manifest: `{"v":1}`, Files: map[string]string{"pieces/a.png": b64("A"), "pieces/b.png": b64("B")}, Disk: map[string]string{"refs/p.jpg": photo}})
	if err != nil {
		t.Fatal(err)
	}
	err = saveProject(SaveRequest{Path: path, Manifest: `{"v":2}`, Files: map[string]string{"pieces/c.png": b64("C")}, Keep: []string{"pieces/a.png", "refs/p.jpg"}})
	if err != nil {
		t.Fatal(err)
	}

	got := entries(t, path)
	want := map[string]string{manifestName: `{"v":2}`, "pieces/a.png": "A", "pieces/c.png": "C", "refs/p.jpg": "jpeg"}
	if len(got) != len(want) {
		t.Fatalf("entries %v", got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("%s = %q, want %q", k, got[k], v)
		}
	}
	if left, _ := filepath.Glob(filepath.Join(dir, ".pasteup-*")); len(left) > 0 {
		t.Fatalf("temp files left: %v", left)
	}
}
