package mesh

import "math"

// Islands numbers the UV islands: faces of a part joined by edges with the same UVs.
// Splits for hard normals keep their UVs, so they don't cut an island.
func Islands(tris []Tri) []int {
	parent := make([]int, len(tris))
	for i := range parent {
		parent[i] = i
	}
	var find func(int) int
	find = func(i int) int {
		if parent[i] != i {
			parent[i] = find(parent[i])
		}
		return parent[i]
	}

	type point struct{ u, v int64 }
	type edge struct {
		part int
		a, b point
	}
	at := func(uv [2]float64) point {
		return point{int64(math.Round(uv[0] * 1e5)), int64(math.Round(uv[1] * 1e5))}
	}

	first := map[edge]int{}
	for i, t := range tris {
		for c := range 3 {
			a, b := at(t.UV[c]), at(t.UV[(c+1)%3])
			if b.u < a.u || (b.u == a.u && b.v < a.v) {
				a, b = b, a
			}
			e := edge{t.Part, a, b}
			if j, ok := first[e]; ok {
				parent[find(i)] = find(j)
			} else {
				first[e] = i
			}
		}
	}

	ids := map[int]int{}
	out := make([]int, len(tris))
	for i := range tris {
		r := find(i)
		id, ok := ids[r]
		if !ok {
			id = len(ids)
			ids[r] = id
		}
		out[i] = id
	}
	return out
}
