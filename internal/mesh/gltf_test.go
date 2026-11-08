package mesh

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"math"
	"testing"
)

// glb builds a binary glTF with one triangle under a node that is moved and scaled.
func glb(t *testing.T) []byte {
	var bin bytes.Buffer
	for _, f := range []float32{0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1} {
		binary.Write(&bin, binary.LittleEndian, math.Float32bits(f))
	}
	doc := map[string]any{
		"scene":  0,
		"scenes": []any{map[string]any{"nodes": []int{0}}},
		"nodes":  []any{map[string]any{"name": "box", "mesh": 0, "translation": []float64{1, 2, 3}, "scale": []float64{2, 2, 2}}},
		"meshes": []any{map[string]any{"primitives": []any{map[string]any{"attributes": map[string]int{"POSITION": 0, "TEXCOORD_0": 1}}}}},
		"accessors": []any{
			map[string]any{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
			map[string]any{"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC2"},
		},
		"bufferViews": []any{map[string]any{"byteOffset": 0, "byteLength": 36}, map[string]any{"byteOffset": 36, "byteLength": 24}},
		"buffers":     []any{map[string]any{"byteLength": 60}},
	}
	js, _ := json.Marshal(doc)
	for len(js)%4 != 0 {
		js = append(js, ' ')
	}

	var out bytes.Buffer
	w := func(v uint32) { binary.Write(&out, binary.LittleEndian, v) }
	w(0x46546c67)
	w(2)
	w(uint32(12 + 8 + len(js) + 8 + bin.Len()))
	w(uint32(len(js)))
	w(0x4e4f534a)
	out.Write(js)
	w(uint32(bin.Len()))
	w(0x004e4942)
	out.Write(bin.Bytes())
	return out.Bytes()
}

func TestPositionsInWorldSpace(t *testing.T) {
	m, err := ParseGLB(glb(t), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Tris) != 1 {
		t.Fatalf("%d triangles", len(m.Tris))
	}
	want := [3]Vec{{1, 2, 3}, {3, 2, 3}, {1, 4, 3}}
	if m.Tris[0].P != want {
		t.Fatalf("corners %v, want %v", m.Tris[0].P, want)
	}
}
