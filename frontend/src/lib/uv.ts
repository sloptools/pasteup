import type { Layout } from './state.svelte'

// Unique face edges in UV space, four numbers each: island outlines and the edges
// inside islands. An edge is inside only with faces on both of its sides, so faces
// stacked on each other, which lie on the same side, keep their outlines.
export function edges(layout: Layout): { outline: number[]; inside: number[] } {
  const found = new Map<string, { at: number[]; sides: number }>()
  const uv = layout.uvs
  for (let t = 0; t < uv.length; t += 6) {
    for (let c = 0; c < 3; c++) {
      let a = t + c * 2
      let b = t + ((c + 1) % 3) * 2
      const o = t + ((c + 2) % 3) * 2
      const ka = `${uv[a]},${uv[a + 1]}`
      const kb = `${uv[b]},${uv[b + 1]}`
      if (kb < ka) [a, b] = [b, a]
      const key = kb < ka ? kb + ' ' + ka : ka + ' ' + kb
      // Which side of the edge, taken one fixed way round, the face's third corner is on.
      const cross = (uv[b] - uv[a]) * (uv[o + 1] - uv[a + 1]) - (uv[b + 1] - uv[a + 1]) * (uv[o] - uv[a])
      const side = cross > 0 ? 1 : cross < 0 ? 2 : 0
      const e = found.get(key)
      if (e) e.sides |= side
      else found.set(key, { at: [uv[a], uv[a + 1], uv[b], uv[b + 1]], sides: side })
    }
  }
  const outline: number[] = []
  const inside: number[] = []
  for (const e of found.values()) (e.sides === 3 ? inside : outline).push(...e.at)
  return { outline, inside }
}

// The island under a UV point, or null.
export function islandAt(layout: Layout, u: number, v: number): number | null {
  const uv = layout.uvs
  for (let t = 0; t < uv.length; t += 6) {
    const [ax, ay, bx, by, cx, cy] = uv.slice(t, t + 6)
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if (d === 0) continue
    const l1 = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / d
    const l2 = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / d
    if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) return layout.islands[t / 6]
  }
  return null
}

// Calls fn with the three UV corners of each face of an island.
export function eachFace(layout: Layout, island: number, fn: (p: number[]) => void) {
  const uv = layout.uvs
  for (let t = 0; t < uv.length; t += 6) {
    if (layout.islands[t / 6] === island) fn(uv.slice(t, t + 6))
  }
}

const masks = new WeakMap<Layout, Map<string, HTMLCanvasElement>>()

// Every texel an island touches, even partly, so paint reaches its seams.
export function islandMask(layout: Layout, island: number, size: number): HTMLCanvasElement {
  let byIsland = masks.get(layout)
  if (!byIsland) masks.set(layout, (byIsland = new Map()))
  const key = `${island}:${size}`
  const cached = byIsland.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  eachFace(layout, island, (p) => {
    ctx.beginPath()
    ctx.moveTo(p[0] * size, p[1] * size)
    ctx.lineTo(p[2] * size, p[3] * size)
    ctx.lineTo(p[4] * size, p[5] * size)
    ctx.closePath()
    ctx.fill()
  })
  // Edge texels come out partly covered; any coverage counts.
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 0 ? 255 : 0
  ctx.putImageData(img, 0, 0)
  byIsland.set(key, canvas)
  return canvas
}
