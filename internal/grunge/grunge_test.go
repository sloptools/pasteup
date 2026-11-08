package grunge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMapsFromFolder(t *testing.T) {
	dir := t.TempDir()
	for _, f := range []string{"specks_1.png", "dirt.JPG", "notes.txt", ".hidden.png"} {
		os.WriteFile(filepath.Join(dir, f), []byte("x"), 0o644)
	}
	names := Names(dir)
	if len(names) != 2 || names[0] != "dirt" || names[1] != "specks_1" {
		t.Fatalf("names %v", names)
	}
	if p, err := Path(dir, "dirt"); err != nil || filepath.Base(p) != "dirt.JPG" {
		t.Fatalf("dirt: %q %v", p, err)
	}
	for _, bad := range []string{"../grunge", "notes", "", ".hidden"} {
		if _, err := Path(dir, bad); err == nil {
			t.Fatalf("%q should not be a map", bad)
		}
	}
}
