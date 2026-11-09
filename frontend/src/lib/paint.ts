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

// A soft dab as texels with weights: full inside the hard core, fading to the edge.
type Weights = [number, number, number][]
const softs = new Map<string, Weights>()

export function weights(size: number, tip: Tip, hardness: number): Weights {
  const key = `${size}${tip}${hardness}`
  let out = softs.get(key)
  if (out) return out

  out = []
  const c = (size - 1) / 2
  const o = Math.floor(c)
  const r = size / 2
  const core = r * hardness
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = tip === 'round' ? Math.hypot(i - c, j - c) : Math.max(Math.abs(i - c), Math.abs(j - c))
      const t = d <= core ? 1 : Math.min(Math.max((r - d) / Math.max(r - core, 1e-6), 0), 1)
      const w = t * t * (3 - 2 * t)
      if (w > 0) out.push([i - o, j - o, w])
    }
  }
  softs.set(key, out)
  return out
}

const blank = (w: number, h: number) => {
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  return out
}

// One stroke onto a copy of a layer's piece. Dabs go into a texel mask first, so
// overlapping dabs don't build up past the opacity; the mask then lands in the
// piece's pixels through the layer's transform, texel exact at scale 1.
export class Stroke {
  canvas: HTMLCanvasElement
  private mask: HTMLCanvasElement
  private paint: CanvasRenderingContext2D
  // The mask cut to where paint may land (selection, island), when limited.
  private kept: HTMLCanvasElement | null = null
  private rows: Rows

  private erase: boolean
  private replace: boolean
  private opacity: number
  // A soft brush keeps each texel's strongest dab here, so a stroke never builds up.
  private soft: { weights: Weights; strength: Float32Array; rgb: [number, number, number]; dirty: boolean } | null = null
  private size: number
  private clip: HTMLCanvasElement | null
  // Tile mode: offsets of the texture's copies, [0, 0] alone without it.
  private copies: [number, number][]
  private pattern: { texels: HTMLCanvasElement; colored: HTMLCanvasElement } | null = null

  constructor(
    private source: HTMLCanvasElement,
    // From texels to the piece's pixels.
    private toPiece: DOMMatrix,
    size: number,
    o: {
      color: string
      tipSize: number
      tip: Tip
      hardness?: number
      erase: boolean
      opacity: number
      clip: HTMLCanvasElement | null
      wrap: { x: boolean; y: boolean }
      // Clears where paint may land first, so gradients on masks set them rather than add.
      replace?: boolean
      // Texels whose colors the stroke lays down instead of the color, for cloning.
      pattern?: HTMLCanvasElement
    },
  ) {
    this.copies = []
    for (const dx of o.wrap.x ? [-size, 0, size] : [0]) for (const dy of o.wrap.y ? [-size, 0, size] : [0]) this.copies.push([dx, dy])
    this.erase = o.erase
    this.replace = o.replace ?? false
    this.opacity = o.opacity
    this.clip = o.clip
    this.canvas = blank(source.width, source.height)
    this.mask = blank(size, size)
    this.paint = this.mask.getContext('2d')!
    this.paint.fillStyle = o.color
    this.rows = footprint(o.tipSize, o.tip)
    this.size = size
    if ((o.hardness ?? 1) < 1) {
      const n = parseInt(o.color.slice(1), 16)
      const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      this.soft = { weights: weights(o.tipSize, o.tip, o.hardness!), strength: new Float32Array(size * size), rgb, dirty: false }
    }
    if (o.clip) this.kept = blank(size, size)
    if (o.pattern) this.pattern = { texels: o.pattern, colored: blank(size, size) }
  }

  // A row of texels, for shapes.
  span(x: number, y: number, w: number) {
    for (const [dx, dy] of this.copies) this.paint.fillRect(x + dx, y + dy, w, 1)
  }

  // A texel mask drawn in, for fills; it takes the stroke's color.
  stamp(mask: HTMLCanvasElement) {
    const p = this.paint
    p.drawImage(mask, 0, 0)
    p.globalCompositeOperation = 'source-in'
    p.fillRect(0, 0, this.mask.width, this.mask.height)
    p.globalCompositeOperation = 'source-over'
  }

  // Colored texels drawn in as they are, for gradients.
  image(texels: HTMLCanvasElement) {
    this.paint.drawImage(texels, 0, 0)
  }

  // Starts the mask over, for shapes redrawn while dragging.
  reset() {
    this.paint.clearRect(0, 0, this.mask.width, this.mask.height)
  }

  dot(x: number, y: number) {
    if (this.soft) return this.softDot(x, y)
    for (const [dy, dx, w] of this.rows) this.span(x + dx, y + dy, w)
  }

  private softDot(x: number, y: number) {
    const s = this.soft!
    const size = this.size
    for (const [dx, dy, w] of s.weights) {
      for (const [cx, cy] of this.copies) {
        const tx = x + dx + cx
        const ty = y + dy + cy
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue
        const i = ty * size + tx
        if (w > s.strength[i]) s.strength[i] = w
      }
    }
    s.dirty = true
  }

  // Lays the mask onto the source into canvas; call after dots and lines.
  flush() {
    const s = this.soft
    if (s?.dirty) {
      const img = this.paint.createImageData(this.size, this.size)
      for (let i = 0; i < s.strength.length; i++) {
        if (!s.strength[i]) continue
        img.data.set(s.rgb, i * 4)
        img.data[i * 4 + 3] = Math.round(s.strength[i] * 255)
      }
      this.paint.putImageData(img, 0, 0)
      s.dirty = false
    }
    let mask = this.mask
    if (this.kept && this.clip) {
      const k = this.kept.getContext('2d')!
      k.globalCompositeOperation = 'copy'
      k.drawImage(this.mask, 0, 0)
      k.globalCompositeOperation = 'destination-in'
      k.drawImage(this.clip, 0, 0)
      mask = this.kept
    }
    if (this.pattern) {
      const c = this.pattern.colored.getContext('2d')!
      c.globalCompositeOperation = 'copy'
      c.drawImage(mask, 0, 0)
      c.globalCompositeOperation = 'source-in'
      c.drawImage(this.pattern.texels, 0, 0)
      mask = this.pattern.colored
    }
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(this.source, 0, 0)
    if (this.replace) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.setTransform(this.toPiece)
      if (this.clip) ctx.drawImage(this.clip, 0, 0)
      else ctx.fillRect(0, 0, this.mask.width, this.mask.height)
      ctx.resetTransform()
    }
    ctx.globalAlpha = this.opacity
    ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over'
    ctx.imageSmoothingEnabled = false
    // Each copy of the texture shows the piece shifted, so the mask lands through each.
    for (const [dx, dy] of this.copies) {
      ctx.setTransform(this.toPiece.translate(-dx, -dy))
      ctx.drawImage(mask, 0, 0)
    }
    ctx.resetTransform()
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
