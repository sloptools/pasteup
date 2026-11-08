import type { Tip } from './state.svelte'

// A dab as rows of texels around the texel under the cursor: [dy, dx, width].
type Rows = [number, number, number][]
const footprints = new Map<string, Rows>()

export function footprint(size: number, tip: Tip): Rows {
  const key = `${size}${tip}`
  let rows = footprints.get(key)
  if (rows) return rows

  rows = []
  const c = (size - 1) / 2
  const o = Math.floor(c)
  for (let j = 0; j < size; j++) {
    let start = -1
    let end = -1
    for (let i = 0; i < size; i++) {
      if (tip === 'round' && (i - c) ** 2 + (j - c) ** 2 >= (size / 2) ** 2) continue
      if (start < 0) start = i
      end = i
    }
    if (start >= 0) rows.push([j - o, start - o, end - start + 1])
  }
  footprints.set(key, rows)
  return rows
}

const canvasLike = (c: HTMLCanvasElement) => {
  const out = document.createElement('canvas')
  out.width = c.width
  out.height = c.height
  return out
}

// One stroke onto a copy of a texture-sized canvas, hard and texel exact. Dabs
// go into a mask first, so overlapping dabs don't build up past the opacity.
export class Stroke {
  canvas: HTMLCanvasElement
  private mask: HTMLCanvasElement
  private paint: CanvasRenderingContext2D
  private rows: Rows

  constructor(
    private source: HTMLCanvasElement,
    color: string,
    size: number,
    tip: Tip,
    private erase: boolean,
    private opacity: number,
  ) {
    this.canvas = canvasLike(source)
    this.mask = canvasLike(source)
    this.paint = this.mask.getContext('2d')!
    this.paint.fillStyle = color
    this.rows = footprint(size, tip)
  }

  dot(x: number, y: number) {
    for (const [dy, dx, w] of this.rows) this.paint.fillRect(x + dx, y + dy, w, 1)
  }

  // Lays the mask onto the source into canvas; call after dots and lines.
  flush() {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(this.source, 0, 0)
    ctx.globalAlpha = this.opacity
    ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over'
    ctx.drawImage(this.mask, 0, 0)
  }

  // Bresenham, so diagonal lines stay one texel thin.
  line(x0: number, y0: number, x1: number, y1: number) {
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.dot(x0, y0)
      if (x0 === x1 && y0 === y1) return
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }
}
