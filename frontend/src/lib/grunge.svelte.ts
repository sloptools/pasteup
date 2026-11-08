import { GrungeMaps } from '../../wailsjs/go/main/App'

// A layer's grunge mask: where its pixels show. Map is a generated one, a built-in
// one or one from the grunge folder; scale is repeats across the texture (noise: block size in
// texels), level shifts how much shows, contrast hardens the edges. Stretch pulls
// the map down (above 1) or across (below -1), for streaks and runs.
export type Mask = { map: string; scale: number; stretch: number; level: number; contrast: number; seed: number; invert: boolean }

export const generated = ['noise', 'clouds']

// A scale that suits the map: the maps are made to be seen once across.
export const scaleFor = (map: string) => (map === 'clouds' ? 4 : map === 'noise' ? 2 : 1)

export const newMask = (map = 'clouds'): Mask => ({ map, scale: scaleFor(map), stretch: 1, level: 0, contrast: 0.8, seed: 1, invert: false })

// How much longer the map runs down and across.
function stretched(m: Mask): [number, number] {
  const s = m.stretch ?? 1
  return s > 1 ? [1, s] : s < -1 ? [-s, 1] : [1, 1]
}

// Names of the built-in maps, then the grunge folder's; loaded counts maps that arrived, so masks redraw.
export const grunge = $state({ names: [] as string[], loaded: 0 })

export function loadNames() {
  GrungeMaps().then((names) => (grunge.names = names))
}

type Gray = { w: number; data: Float32Array }
const maps = new Map<string, Gray | 'loading'>()

// A map's grays, or null while it loads.
function gray(name: string): Gray | null {
  const m = maps.get(name)
  if (m && m !== 'loading') return m
  if (m) return null
  maps.set(name, 'loading')
  const img = new Image()
  img.onload = () => {
    const w = img.width
    const c = document.createElement('canvas')
    c.width = c.height = w
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, w, w).data
    const data = new Float32Array(w * w)
    for (let i = 0; i < data.length; i++) data[i] = px[i * 4] / 255
    maps.set(name, { w, data })
    grunge.loaded++
  }
  // Not in this machine's grunge folder: the mask shows everything.
  img.onerror = () => {
    maps.set(name, { w: 1, data: new Float32Array([1]) })
    grunge.loaded++
  }
  img.src = `/grunge?name=${encodeURIComponent(name)}`
  return null
}

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Value noise on a grid of cells that wraps, so it tiles.
function valueNoise2(x: number, y: number, cellsX: number, cellsY: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const at = (i: number, j: number) => hash(((i % cellsX) + cellsX) % cellsX, ((j % cellsY) + cellsY) % cellsY, seed)
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
  return top + (bottom - top) * sy
}

// The mask's grays at texture size, 0 to 1, or null while its map loads.
function values(m: Mask, size: number): Float32Array | null {
  const out = new Float32Array(size * size)
  const scale = Math.max(1, Math.round(m.scale))
  const [across, down] = stretched(m)

  if (m.map === 'noise') {
    const bx = scale * across
    const by = scale * down
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = hash(Math.floor(x / bx), Math.floor(y / by), m.seed)
    return out
  }
  if (m.map === 'clouds') {
    // Whole cells each way, so it still tiles.
    const cx = Math.max(1, Math.round(scale / across))
    const cy = Math.max(1, Math.round(scale / down))
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0
        let amp = 0.5
        for (let o = 0, f = 1; o < 4; o++, f *= 2, amp /= 2) v += amp * valueNoise2((x / size) * cx * f, (y / size) * cy * f, cx * f, cy * f, m.seed + o)
        out[y * size + x] = v / 0.9375
      }
    }
    return out
  }

  const g = gray(m.map)
  if (!g) return null
  // The seed shifts the map and turns it, for variants of one map.
  const ox = Math.floor(hash(m.seed, 1, 7) * g.w)
  const oy = Math.floor(hash(m.seed, 2, 7) * g.w)
  const turn = m.seed % 4
  const sample = (u: number, v: number) => {
    const iu = ((Math.floor(u) % g.w) + g.w) % g.w
    const iv = ((Math.floor(v) % g.w) + g.w) % g.w
    return g.data[iv * g.w + iu]
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let u = ((x + 0.5) / size) * (scale / across) * g.w
      let v = ((y + 0.5) / size) * (scale / down) * g.w
      if (turn === 1) [u, v] = [v, -u]
      else if (turn === 2) [u, v] = [-u, -v]
      else if (turn === 3) [u, v] = [-v, u]
      // Bilinear, so maps don't block up when stretched.
      const fu = u - 0.5
      const fv = v - 0.5
      const tu = fu - Math.floor(fu)
      const tv = fv - Math.floor(fv)
      const a = sample(fu + ox, fv + oy)
      const b = sample(fu + ox + 1, fv + oy)
      const c = sample(fu + ox, fv + oy + 1)
      const d = sample(fu + ox + 1, fv + oy + 1)
      out[y * size + x] = (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv
    }
  }
  return out
}

const masks = new Map<string, HTMLCanvasElement>()

// Where the layer hides, as alpha: drawn with the erase blend mode it leaves the
// layer only where the mask shows. Null while the map loads.
export function eraser(m: Mask, size: number): HTMLCanvasElement | null {
  const key = `${JSON.stringify(m)}:${size}`
  const cached = masks.get(key)
  if (cached) return cached
  const v = values(m, size)
  if (!v) return null

  const gain = 1 / Math.max(1 - m.contrast, 0.02)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < v.length; i++) {
    let shown = Math.min(Math.max((v[i] - 0.5 + m.level) * gain + 0.5, 0), 1)
    if (m.invert) shown = 1 - shown
    img.data[i * 4 + 3] = Math.round((1 - shown) * 255)
  }
  ctx.putImageData(img, 0, 0)
  if (masks.size > 32) masks.clear()
  masks.set(key, canvas)
  return canvas
}
