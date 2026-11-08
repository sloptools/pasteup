package main

import (
	"os"
	"testing"
)

func TestRecoveryKeepsEachSession(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", os.Getenv("HOME"))
	a := &App{}
	old := []string{}
	for _, stamp := range []string{"20261101-100000.000000", "20261102-100000.000000"} {
		dir, _ := recoveryDir()
		p := dir + "/recovery-" + stamp + ".pasteup"
		os.WriteFile(p, []byte("left"), 0o644)
		old = append(old, p)
	}
	os.WriteFile(a.RecoveryPath(), []byte("mine"), 0o644)

	left := a.Recovery()
	if len(left) != 2 {
		t.Fatalf("%d left, want the 2 earlier sessions, not this one", len(left))
	}
	a.DiscardRecovery(left[0].Path)
	a.DiscardRecovery("/etc/hosts")
	if len(a.Recovery()) != 1 {
		t.Fatal("discard should remove exactly one")
	}
	if _, err := os.Stat("/etc/hosts"); err != nil {
		t.Fatal("discard must stay in the recovery dir")
	}
}
