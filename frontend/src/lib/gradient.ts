// A gradient over the whole texture, from a to b in texels: linear, or radial
// around a. Dithered, each texel takes one end or the other by a 4×4 Bayer
// pattern, the retro way.
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export type Rgba = [number, number, number, number]

export function rgba(hex: string, alpha = 255): Rgba {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

export function gradient(size: number, a: [number, number], b: [number, number], from: Rgba, to: Rgba, radial: boolean, dither: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = Math.max(Math.hypot(dx, dy), 1e-6)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - a[0]
      const py = y + 0.5 - a[1]
      let t = radial ? Math.hypot(px, py) / length : (px * dx + py * dy) / (length * length)
      t = Math.min(Math.max(t, 0), 1)
      if (dither) t = t > (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16 ? 1 : 0
      const o = (y * size + x) * 4
      for (let c = 0; c < 4; c++) img.data[o + c] = from[c] + (to[c] - from[c]) * t
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
