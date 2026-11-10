package palette

import (
	"cmp"
	"embed"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

type Color [3]float32

// MedianCut reduces pix to at most n representative colors. It reorders pix.
func MedianCut(pix []Color, n int) []Color {
	boxes := [][]Color{pix}

	for len(boxes) < n {
		i, ch := widest(boxes)
		if i < 0 {
			break
		}

		b := boxes[i]
		slices.SortFunc(b, func(p, q Color) int { return cmp.Compare(p[ch], q[ch]) })

		mid := len(b) / 2
		boxes[i] = b[:mid]
		boxes = append(boxes, b[mid:])
	}

	pal := make([]Color, len(boxes))
	for i, b := range boxes {
		pal[i] = mean(b)
	}
	return pal
}

// Load reads a Quake .lmp palette, a GIMP .gpl or a .hex list (as Lospec offers
// them), or all distinct colors of an image reduced to 256 if needed.
func Load(path string) ([]Color, error) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".lmp":
		return loadLmp(path)
	case ".gpl", ".hex", ".txt":
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		return ParseText(string(data))
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	src, _, err := image.Decode(f)
	if err != nil {
		return nil, err
	}

	seen := map[Color]bool{}
	r := src.Bounds()
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			cr, cg, cb, _ := src.At(x, y).RGBA()
			seen[Color{float32(cr) / 0xffff, float32(cg) / 0xffff, float32(cb) / 0xffff}] = true
		}
	}

	pal := make([]Color, 0, len(seen))
	for c := range seen {
		pal = append(pal, c)
	}
	if len(pal) > 256 {
		pal = MedianCut(pal, 256)
	}
	return pal, nil
}

// loadLmp reads 256 RGB triplets.
func loadLmp(path string) ([]Color, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) < 768 {
		return nil, fmt.Errorf("%s: palette too short", path)
	}

	return parseLmp(data), nil
}

func parseLmp(data []byte) []Color {
	pal := make([]Color, 256)
	for i := range pal {
		pal[i] = Color{float32(data[i*3]) / 255, float32(data[i*3+1]) / 255, float32(data[i*3+2]) / 255}
	}
	return pal
}

// ParseText reads colors from text, one per line: hex (rrggbb, #rrggbb) or
// GIMP's "r g b name"; headers and comments are skipped.
func ParseText(text string) ([]Color, error) {
	var pal []Color
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") && len(line) != 7 || strings.HasPrefix(line, ";") {
			continue
		}
		if c, ok := parseHex(line); ok {
			pal = append(pal, c)
			continue
		}
		var r, g, b int
		if n, _ := fmt.Sscanf(line, "%d %d %d", &r, &g, &b); n == 3 {
			pal = append(pal, Color{float32(r) / 255, float32(g) / 255, float32(b) / 255})
		}
	}
	if len(pal) == 0 {
		return nil, fmt.Errorf("no colors")
	}
	return pal, nil
}

func parseHex(s string) (Color, bool) {
	s = strings.TrimPrefix(s, "#")
	var r, g, b int
	if len(s) != 6 {
		return Color{}, false
	}
	if n, _ := fmt.Sscanf(s, "%02x%02x%02x", &r, &g, &b); n != 3 {
		return Color{}, false
	}
	return Color{float32(r) / 255, float32(g) / 255, float32(b) / 255}, true
}

// Hex is the color as #rrggbb.
func (c Color) Hex() string {
	b := func(v float32) int { return int(v*255 + 0.5) }
	return fmt.Sprintf("#%02x%02x%02x", b(c[0]), b(c[1]), b(c[2]))
}

func Nearest(pal []Color, c Color) Color {
	best, bestDist := pal[0], float32(1e9)

	for _, p := range pal {
		dr, dg, db := p[0]-c[0], p[1]-c[1], p[2]-c[2]
		// Weighted towards green, roughly matching perceived brightness.
		d := 0.3*dr*dr + 0.59*dg*dg + 0.11*db*db
		if d < bestDist {
			best, bestDist = p, d
		}
	}
	return best
}

func widest(boxes [][]Color) (index, channel int) {
	index, channel = -1, 0
	var best float32

	for i, b := range boxes {
		if len(b) < 2 {
			continue
		}

		lo, hi := b[0], b[0]
		for _, c := range b {
			for ch := range 3 {
				lo[ch] = min(lo[ch], c[ch])
				hi[ch] = max(hi[ch], c[ch])
			}
		}

		for ch := range 3 {
			if r := hi[ch] - lo[ch]; r > best {
				best, index, channel = r, i, ch
			}
		}
	}
	return index, channel
}

func mean(b []Color) Color {
	var sum [3]float64
	for _, c := range b {
		for ch := range 3 {
			sum[ch] += float64(c[ch])
		}
	}

	n := float64(len(b))
	return Color{float32(sum[0] / n), float32(sum[1] / n), float32(sum[2] / n)}
}

//go:embed quake.lmp
var quakeLmp []byte

// Quake returns the 256 colors of Quake's palette.
func Quake() []Color {
	return parseLmp(quakeLmp)
}

// Quake 2's palette (from pics/colormap.pcx), as func_godot ships it (MIT).
//
//go:embed quake2.lmp
var quake2Lmp []byte

func Quake2() []Color {
	return parseLmp(quake2Lmp)
}

// Palettes from lospec.com, as .hex files, in the order the app lists them.
//
//go:embed lospec/*.hex
var lospecHex embed.FS

var lospecNames = [][2]string{
	{"gameboy", "gameboy"},
	{"rosy 42", "rosy-42"},
	{"resurrect 64", "resurrect-64"},
	{"endesga 64", "endesga-64"},
	{"pico-8", "pico-8"},
	{"nes", "nes"},
	{"snes", "snes"},
	{"lospec500", "lospec500"},
}

type Named struct {
	Name   string
	Colors []Color
}

func Lospec() []Named {
	out := make([]Named, 0, len(lospecNames))
	for _, n := range lospecNames {
		data, err := lospecHex.ReadFile("lospec/" + n[1] + ".hex")
		if err != nil {
			panic(err)
		}
		pal, err := ParseText(string(data))
		if err != nil {
			panic(err)
		}
		out = append(out, Named{n[0], pal})
	}
	return out
}
