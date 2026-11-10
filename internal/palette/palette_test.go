package palette

import "testing"

func TestMedianCut(t *testing.T) {
	var pix []Color
	for i := range 1000 {
		v := float32(i) / 1000
		pix = append(pix, Color{v, v * 0.5, 1 - v})
	}

	pal := MedianCut(pix, 16)
	if len(pal) != 16 {
		t.Fatalf("got %d colors, want 16", len(pal))
	}

	if c := Nearest(pal, Color{0, 0, 1}); c[0] > 0.1 {
		t.Errorf("nearest to blue end is %v", c)
	}
}

func TestParseText(t *testing.T) {
	gpl := "GIMP Palette\nName: test\n#\n255   0   0 red\n  0 128 255\n"
	pal, err := ParseText(gpl)
	if err != nil || len(pal) != 2 || pal[0].Hex() != "#ff0000" || pal[1].Hex() != "#0080ff" {
		t.Fatalf("gpl: %v %v", pal, err)
	}
	pal, err = ParseText("ff0000\n#00ff00\n")
	if err != nil || len(pal) != 2 || pal[1].Hex() != "#00ff00" {
		t.Fatalf("hex: %v %v", pal, err)
	}
	if len(Quake()) != 256 || len(Quake2()) != 256 {
		t.Fatal("quake palettes")
	}
	if Quake2()[1].Hex() != "#0f0f0f" {
		t.Fatalf("quake 2 second color %s", Quake2()[1].Hex())
	}
}

func TestLospec(t *testing.T) {
	sizes := map[string]int{"gameboy": 4, "pico-8": 16, "endesga 64": 64}
	for _, p := range Lospec() {
		if n, ok := sizes[p.Name]; ok && len(p.Colors) != n {
			t.Fatalf("%s has %d colors", p.Name, len(p.Colors))
		}
	}
	if len(Lospec()) != 8 {
		t.Fatalf("%d palettes", len(Lospec()))
	}
}
