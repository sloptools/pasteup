import { Container, Graphics } from 'pixi.js'

// A gradient being set up: its start in texels, direction in degrees (0 points
// right, 90 down) and length in texels.
export type Aim = { a: [number, number]; angle: number; length: number }

export function end(g: Aim): [number, number] {
  const r = (g.angle * Math.PI) / 180
  return [g.a[0] + Math.cos(r) * g.length, g.a[1] + Math.sin(r) * g.length]
}

// From one point toward another: snaps to steps of 45° within a few screen
// pixels, always with steps, never when free.
export function aim(from: [number, number], to: [number, number], zoom: number, mode: 'snap' | 'steps' | 'free'): { angle: number; length: number; snapped: boolean } {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const length = Math.hypot(dx, dy)
  if (mode === 'free') return { angle, length, snapped: false }
  const near = Math.round(angle / 45) * 45
  const off = ((angle - near) * Math.PI) / 180
  if (mode === 'snap' && length * Math.abs(Math.sin(off)) * zoom > 8) return { angle, length, snapped: false }
  return { angle: near === -180 ? 180 : near, length: length * Math.cos(off), snapped: true }
}

export type Part = 'a' | 'b' | 'line'

// Which part of the gradient's handles a texel point is on, if any.
export function grab(g: Aim, p: [number, number], zoom: number): Part | null {
  const reach = 8 / zoom
  const b = end(g)
  if (Math.hypot(p[0] - b[0], p[1] - b[1]) <= reach) return 'b'
  if (Math.hypot(p[0] - g.a[0], p[1] - g.a[1]) <= reach) return 'a'
  const t = ((p[0] - g.a[0]) * (b[0] - g.a[0]) + (p[1] - g.a[1]) * (b[1] - g.a[1])) / Math.max(g.length * g.length, 1e-6)
  if (t < 0 || t > 1) return null
  const on = [g.a[0] + (b[0] - g.a[0]) * t, g.a[1] + (b[1] - g.a[1]) * t]
  return Math.hypot(p[0] - on[0], p[1] - on[1]) <= reach / 2 ? 'line' : null
}

const light = 0xebe8df
const dark = 0x131312
const accent = 0x7fc4af

// The line and its two handles; a guide through the fixed end while snapped.
export class Handles {
  node = new Container()
  private guide = new Graphics()
  private marks = new Graphics()

  constructor() {
    this.node.addChild(this.guide, this.marks)
  }

  draw(g: Aim | null, zoom: number, guide: { from: [number, number]; angle: number } | null) {
    this.guide.clear()
    this.marks.clear()
    if (guide) {
      const r = (guide.angle * Math.PI) / 180
      const far = 10000
      const [x, y] = guide.from
      this.guide.moveTo(x - Math.cos(r) * far, y - Math.sin(r) * far).lineTo(x + Math.cos(r) * far, y + Math.sin(r) * far)
      this.guide.stroke({ width: 1, color: accent, pixelLine: true })
    }
    if (!g) return
    const b = end(g)
    const w = 1 / zoom
    this.marks.moveTo(g.a[0], g.a[1]).lineTo(b[0], b[1]).stroke({ width: 3 * w, color: dark }).moveTo(g.a[0], g.a[1]).lineTo(b[0], b[1]).stroke({ width: w, color: light })
    this.marks.circle(g.a[0], g.a[1], 4 * w).fill(light).stroke({ width: w, color: dark })
    this.marks.circle(b[0], b[1], 4 * w).fill(dark).stroke({ width: 1.5 * w, color: light })
  }
}

// Set by the canvas, for the apply and cancel buttons in the bar.
export const gradientControl = { apply: () => {}, cancel: () => {} }
