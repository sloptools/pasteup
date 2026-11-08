// Texel-exact shapes and fills, as rows of texels.
type Span = (x: number, y: number, w: number) => void

// Between two corner texels, both included.
export function rect(a: [number, number], b: [number, number], filled: boolean, width: number, span: Span) {
  const x0 = Math.min(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const w = Math.abs(b[0] - a[0]) + 1
  const h = Math.abs(b[1] - a[1]) + 1
  const t = Math.min(width, Math.ceil(w / 2), Math.ceil(h / 2))
  for (let y = y0; y < y0 + h; y++) {
    if (filled || y < y0 + t || y >= y0 + h - t) span(x0, y, w)
    else {
      span(x0, y, t)
      span(x0 + w - t, y, t)
    }
  }
}

// The texels whose centers lie in the ellipse inside the corner texels; an
// outline keeps those outside the ellipse shrunk by its width.
export function ellipse(a: [number, number], b: [number, number], filled: boolean, width: number, span: Span) {
  const x0 = Math.min(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const w = Math.abs(b[0] - a[0]) + 1
  const h = Math.abs(b[1] - a[1]) + 1
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const inside = (x: number, y: number, rx: number, ry: number) => rx > 0 && ry > 0 && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
  for (let y = y0; y < y0 + h; y++) {
    let from = -1
    for (let x = x0; x <= x0 + w; x++) {
      const on = x < x0 + w && inside(x, y, w / 2, h / 2) && (filled || !inside(x, y, w / 2 - width, h / 2 - width))
      if (on && from < 0) from = x
      if (!on && from >= 0) {
        span(from, y, x - from)
        from = -1
      }
    }
  }
}

// Texels like the one at x, y: touching it, or anywhere when not contiguous.
export function flood(pixels: Uint8ClampedArray, size: number, x: number, y: number, tolerance: number, contiguous: boolean): Uint8Array {
  const mask = new Uint8Array(size * size)
  if (x < 0 || y < 0 || x >= size || y >= size) return mask
  const o = (y * size + x) * 4
  const seed = [pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]]
  const like = (i: number) => {
    const p = i * 4
    // Fully clear texels are alike whatever color they keep.
    if (seed[3] === 0 && pixels[p + 3] === 0) return true
    for (let c = 0; c < 4; c++) if (Math.abs(pixels[p + c] - seed[c]) > tolerance) return false
    return true
  }

  if (!contiguous) {
    for (let i = 0; i < mask.length; i++) if (like(i)) mask[i] = 1
    return mask
  }
  const stack = [y * size + x]
  mask[stack[0]] = 1
  while (stack.length) {
    const i = stack.pop()!
    const ix = i % size
    for (const n of [ix > 0 ? i - 1 : -1, ix < size - 1 ? i + 1 : -1, i - size, i + size]) {
      if (n < 0 || n >= mask.length || mask[n] || !like(n)) continue
      mask[n] = 1
      stack.push(n)
    }
  }
  return mask
}
