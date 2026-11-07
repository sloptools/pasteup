import type { Layout } from './state.svelte'

// Unique face edges in UV space, four numbers each.
export function edges(layout: Layout): number[] {
  const seen = new Set<string>()
  const out: number[] = []
  const uv = layout.uvs
  for (let t = 0; t < uv.length; t += 6) {
    for (let c = 0; c < 3; c++) {
      const a = t + c * 2
      const b = t + ((c + 1) % 3) * 2
      const ka = `${uv[a]},${uv[a + 1]}`
      const kb = `${uv[b]},${uv[b + 1]}`
      const key = ka < kb ? ka + ' ' + kb : kb + ' ' + ka
      if (seen.has(key)) continue
      seen.add(key)
      out.push(uv[a], uv[a + 1], uv[b], uv[b + 1])
    }
  }
  return out
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
