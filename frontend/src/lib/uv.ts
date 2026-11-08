import type { Layout } from './state.svelte'

// Unique face edges in UV space, four numbers each: island outlines (edges of
// one face of their island) and the edges inside islands. Counted per island, so
// islands stacked on each other keep their outlines.
export function edges(layout: Layout): { outline: number[]; inside: number[] } {
  const found = new Map<string, { at: number[]; faces: number }>()
  const uv = layout.uvs
  for (let t = 0; t < uv.length; t += 6) {
    const island = layout.islands[t / 6]
    for (let c = 0; c < 3; c++) {
      const a = t + c * 2
      const b = t + ((c + 1) % 3) * 2
      const ka = `${uv[a]},${uv[a + 1]}`
      const kb = `${uv[b]},${uv[b + 1]}`
      const key = island + ':' + (ka < kb ? ka + ' ' + kb : kb + ' ' + ka)
      const e = found.get(key)
      if (e) e.faces++
      else found.set(key, { at: [uv[a], uv[a + 1], uv[b], uv[b + 1]], faces: 1 })
    }
  }
  const outline: number[] = []
  const inside: number[] = []
  for (const e of found.values()) (e.faces === 1 ? outline : inside).push(...e.at)
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
