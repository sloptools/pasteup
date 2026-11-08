// A selection is a texel mask at texture size: data for geometry, canvas for compositing.
export type Selection = {
  size: number
  data: Uint8Array
  x: number
  y: number
  w: number
  h: number
  canvas: HTMLCanvasElement
}

export type Combine = 'replace' | 'add' | 'subtract'

// Bounds and the mask canvas for raw data, or null when nothing is selected.
export function selection(data: Uint8Array, size: number): Selection | null {
  let x0 = size
  let y0 = size
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < data.length; i++) if (data[i]) img.data[i * 4 + 3] = 255
  ctx.putImageData(img, 0, 0)
  return { size, data, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, canvas }
}

// Texels from one corner texel to the other, both included.
export function rect(size: number, a: [number, number], b: [number, number]): Uint8Array {
  const data = new Uint8Array(size * size)
  const x0 = Math.max(0, Math.min(a[0], b[0]))
  const x1 = Math.min(size - 1, Math.max(a[0], b[0]))
  const y0 = Math.max(0, Math.min(a[1], b[1]))
  const y1 = Math.min(size - 1, Math.max(a[1], b[1]))
  for (let y = y0; y <= y1; y++) data.fill(1, y * size + x0, y * size + x1 + 1)
  return data
}

// Texels whose centers lie inside the polygon, even-odd.
export function lasso(size: number, points: [number, number][]): Uint8Array {
  const data = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    const cy = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i]
      const [bx, by] = points[(i + 1) % points.length]
      if (ay <= cy === by <= cy) continue
      xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil(xs[i] - 0.5))
      const to = Math.min(size, Math.ceil(xs[i + 1] - 0.5))
      if (to > from) data.fill(1, y * size + from, y * size + to)
    }
  }
  return data
}

export function combine(base: Selection | null, data: Uint8Array, mode: Combine): Uint8Array {
  if (!base || mode === 'replace') return data
  const out = base.data.slice()
  for (let i = 0; i < out.length; i++) {
    if (mode === 'add') out[i] |= data[i]
    else if (data[i]) out[i] = 0
  }
  return out
}

export function all(size: number) {
  return new Uint8Array(size * size).fill(1)
}

export function invert(s: Selection | null, size: number) {
  if (!s) return all(size)
  return s.data.map((v) => 1 - v)
}

// Texel edges between selected and unselected texels, as x0, y0, x1, y1 runs.
export function outline(s: Selection): number[] {
  const { size, data } = s
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && data[y * size + x] === 1
  const lines: number[] = []
  for (let y = s.y; y < s.y + s.h; y++) {
    for (let x = s.x; x < s.x + s.w; x++) {
      if (!at(x, y)) continue
      if (!at(x - 1, y)) lines.push(x, y, x, y + 1)
      if (!at(x + 1, y)) lines.push(x + 1, y, x + 1, y + 1)
      if (!at(x, y - 1)) lines.push(x, y, x + 1, y)
      if (!at(x, y + 1)) lines.push(x, y + 1, x + 1, y + 1)
    }
  }
  return lines
}

// The selection as data again, after its canvas was drawn into.
export function fromCanvas(canvas: HTMLCanvasElement): Selection | null {
  const size = canvas.width
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, size, size).data
  const data = new Uint8Array(size * size)
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3] > 127 ? 1 : 0
  return selection(data, size)
}
