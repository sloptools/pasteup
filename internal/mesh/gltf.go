// Package mesh reads the UV layout of binary glTF models.
package mesh

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
)

type Tri struct {
	UV [3][2]float64
	// Corners in world space.
	P    [3]Vec
	Part int
}

type Model struct {
	Tris []Tri
	// Parts are node names, indexed by Tri.Part.
	Parts []string
	sets  map[string]int
	// Only faces of this material, when set.
	material string
}

type gltfDoc struct {
	Scene  int `json:"scene"`
	Scenes []struct {
		Nodes []int `json:"nodes"`
	} `json:"scenes"`
	Nodes []struct {
		Name        string    `json:"name"`
		Mesh        *int      `json:"mesh"`
		Children    []int     `json:"children"`
		Matrix      []float64 `json:"matrix"`
		Translation []float64 `json:"translation"`
		Rotation    []float64 `json:"rotation"`
		Scale       []float64 `json:"scale"`
	} `json:"nodes"`
	Meshes []struct {
		Primitives []struct {
			Attributes map[string]int `json:"attributes"`
			Indices    *int           `json:"indices"`
			Mode       *int           `json:"mode"`
			Material   *int           `json:"material"`
		} `json:"primitives"`
	} `json:"meshes"`
	Materials []struct {
		Name string `json:"name"`
	} `json:"materials"`
	Accessors []struct {
		BufferView    *int   `json:"bufferView"`
		ByteOffset    int    `json:"byteOffset"`
		ComponentType int    `json:"componentType"`
		Count         int    `json:"count"`
		Type          string `json:"type"`
	} `json:"accessors"`
	BufferViews []struct {
		ByteOffset int `json:"byteOffset"`
		ByteLength int `json:"byteLength"`
		ByteStride int `json:"byteStride"`
	} `json:"bufferViews"`
}

// LoadGLB reads the triangles of a binary glTF with embedded buffers. Sets picks
// the UV set per node name; nodes not listed use the first.
func LoadGLB(path string, sets map[string]int, material string) (*Model, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseGLB(data, sets, material)
}

// ParseGLB reads the triangles; with a material name, only the faces that have it.
func ParseGLB(data []byte, sets map[string]int, material string) (*Model, error) {
	doc, bin, err := parseGLB(data)
	if err != nil {
		return nil, err
	}

	roots := []int{}
	if len(doc.Scenes) > 0 {
		roots = doc.Scenes[doc.Scene].Nodes
	} else {
		for i := range doc.Nodes {
			roots = append(roots, i)
		}
	}

	m := &Model{sets: sets, material: material}
	for _, n := range roots {
		if err := m.addNode(doc, bin, n, identity()); err != nil {
			return nil, err
		}
	}
	if len(m.Tris) == 0 {
		if material != "" {
			return nil, fmt.Errorf("no faces with the material %q", material)
		}
		return nil, errors.New("model has no triangles")
	}
	return m, nil
}

func parseGLB(data []byte) (*gltfDoc, []byte, error) {
	if len(data) < 20 || string(data[:4]) != "glTF" {
		return nil, nil, errors.New("not a binary glTF file")
	}

	var doc gltfDoc
	var bin []byte
	for at := 12; at+8 <= len(data); {
		size := int(binary.LittleEndian.Uint32(data[at:]))
		kind := string(data[at+4 : at+8])
		chunk := data[at+8 : min(at+8+size, len(data))]

		switch kind {
		case "JSON":
			if err := json.Unmarshal(chunk, &doc); err != nil {
				return nil, nil, err
			}
		case "BIN\x00":
			bin = chunk
		}
		at += 8 + size
	}
	return &doc, bin, nil
}

func (m *Model) addNode(doc *gltfDoc, bin []byte, index int, parent mat4) error {
	node := doc.Nodes[index]
	world := parent.mul(localMatrix(node.Matrix, node.Translation, node.Rotation, node.Scale))

	if node.Mesh != nil {
		part := len(m.Parts)
		m.Parts = append(m.Parts, node.Name)
		for _, prim := range doc.Meshes[*node.Mesh].Primitives {
			if prim.Mode != nil && *prim.Mode != 4 {
				continue
			}
			if m.material != "" && (prim.Material == nil || *prim.Material >= len(doc.Materials) || doc.Materials[*prim.Material].Name != m.material) {
				continue
			}
			if err := m.addPrimitive(doc, bin, prim.Attributes, prim.Indices, part, m.sets[node.Name], world); err != nil {
				return err
			}
		}
	}

	for _, c := range node.Children {
		if err := m.addNode(doc, bin, c, world); err != nil {
			return err
		}
	}
	return nil
}

func (m *Model) addPrimitive(doc *gltfDoc, bin []byte, attrs map[string]int, indices *int, part, set int, world mat4) error {
	ti, ok := attrs[fmt.Sprintf("TEXCOORD_%d", set)]
	pi, hasPos := attrs["POSITION"]
	if !ok || !hasPos {
		return nil
	}
	uv, err := readFloats(doc, bin, ti, 2)
	if err != nil {
		return err
	}
	pos, err := readFloats(doc, bin, pi, 3)
	if err != nil {
		return err
	}

	var idx []int
	if indices != nil {
		if idx, err = readInts(doc, bin, *indices); err != nil {
			return err
		}
	} else {
		for i := range uv {
			idx = append(idx, i)
		}
	}

	for k := 0; k+2 < len(idx); k += 3 {
		t := Tri{Part: part}
		for c := range 3 {
			v := idx[k+c]
			t.UV[c] = [2]float64{uv[v][0], uv[v][1]}
			t.P[c] = world.point(Vec{pos[v][0], pos[v][1], pos[v][2]})
		}
		m.Tris = append(m.Tris, t)
	}
	return nil
}

var componentSize = map[int]int{5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}

func readFloats(doc *gltfDoc, bin []byte, index, n int) ([][]float64, error) {
	a := doc.Accessors[index]
	if a.ComponentType != 5126 {
		return nil, fmt.Errorf("accessor %d: only float attributes are supported", index)
	}
	raw, stride, err := accessorBytes(doc, bin, index, n*4)
	if err != nil {
		return nil, err
	}

	out := make([][]float64, a.Count)
	for i := range out {
		out[i] = make([]float64, n)
		for c := range n {
			bits := binary.LittleEndian.Uint32(raw[i*stride+c*4:])
			out[i][c] = float64(math.Float32frombits(bits))
		}
	}
	return out, nil
}

func readInts(doc *gltfDoc, bin []byte, index int) ([]int, error) {
	a := doc.Accessors[index]
	size, ok := componentSize[a.ComponentType]
	if !ok || a.ComponentType == 5126 {
		return nil, fmt.Errorf("accessor %d: bad index type", index)
	}
	raw, stride, err := accessorBytes(doc, bin, index, size)
	if err != nil {
		return nil, err
	}

	out := make([]int, a.Count)
	for i := range out {
		b := raw[i*stride:]
		switch size {
		case 1:
			out[i] = int(b[0])
		case 2:
			out[i] = int(binary.LittleEndian.Uint16(b))
		default:
			out[i] = int(binary.LittleEndian.Uint32(b))
		}
	}
	return out, nil
}

// accessorBytes returns the accessor's data and the byte stride between elements.
func accessorBytes(doc *gltfDoc, bin []byte, index, elemSize int) ([]byte, int, error) {
	a := doc.Accessors[index]
	if a.BufferView == nil {
		return nil, 0, fmt.Errorf("accessor %d has no buffer view", index)
	}

	bv := doc.BufferViews[*a.BufferView]
	stride := bv.ByteStride
	if stride == 0 {
		stride = elemSize
	}

	start := bv.ByteOffset + a.ByteOffset
	end := start + (a.Count-1)*stride + elemSize
	if a.Count == 0 || end > len(bin) {
		return nil, 0, fmt.Errorf("accessor %d is out of range", index)
	}
	return bin[start:end], stride, nil
}
