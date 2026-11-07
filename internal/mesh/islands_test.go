package mesh

import "testing"

func TestIslands(t *testing.T) {
	quad := func(x float64) []Tri {
		return []Tri{
			{UV: [3][2]float64{{x, 0}, {x + 1, 0}, {x + 1, 1}}},
			{UV: [3][2]float64{{x, 0}, {x + 1, 1}, {x, 1}}},
		}
	}
	tris := append(quad(0), quad(2)...)

	got := Islands(tris)
	if got[0] != got[1] || got[2] != got[3] || got[0] == got[2] {
		t.Fatalf("islands = %v", got)
	}
}
