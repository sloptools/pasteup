import { Container, Graphics } from 'pixi.js'
import { lasso, outline, rect, type Selection } from './selection'
import type { SelectMode } from './state.svelte'

const light = 0xebe8df
const dark = 0x131312

// Marching ants around the selection, and the outline of a selection being drawn.
export class Marquee {
  node = new Container()
  private even = new Graphics()
  private odd = new Graphics()
  private draft = new Graphics()
  private phase = false
  private drag: { mode: SelectMode; from: [number, number]; points: [number, number][]; moved: boolean } | null = null

  constructor() {
    this.node.addChild(this.even, this.odd, this.draft)
  }

  show(s: Selection | null) {
    this.even.clear()
    this.odd.clear()
    if (!s) return
    const lines = outline(s)
    for (let i = 0; i < lines.length; i += 4) {
      const g = (lines[i] + lines[i + 1]) % 2 ? this.odd : this.even
      g.moveTo(lines[i], lines[i + 1]).lineTo(lines[i + 2], lines[i + 3])
    }
    for (const g of [this.even, this.odd]) g.stroke({ width: 1, color: 0xffffff, pixelLine: true })
    this.tick()
  }

  // Swaps the dashes' colors, so they march.
  tick() {
    this.phase = !this.phase
    this.even.tint = this.phase ? light : dark
    this.odd.tint = this.phase ? dark : light
  }

  get dragging() {
    return this.drag !== null
  }

  start(mode: SelectMode, p: [number, number]) {
    this.drag = { mode, from: p, points: [p], moved: false }
  }

  move(p: [number, number]) {
    const d = this.drag
    if (!d) return
    d.moved ||= Math.floor(p[0]) !== Math.floor(d.from[0]) || Math.floor(p[1]) !== Math.floor(d.from[1])
    if (d.mode === 'lasso') d.points.push(p)
    else d.points = [d.from, p]

    this.draft.clear()
    if (d.mode === 'rect') {
      const [a, b] = this.corners(d.from, p)
      this.draft.rect(a[0], a[1], b[0] - a[0] + 1, b[1] - a[1] + 1)
    } else this.draft.poly(d.points.flat(), false)
    this.draft.stroke({ width: 1, color: light, pixelLine: true })
  }

  // The drawn shape as mask data, or null for a click without a drag.
  end(size: number): Uint8Array | null {
    const d = this.drag
    this.drag = null
    this.draft.clear()
    if (!d?.moved) return null
    if (d.mode === 'lasso') return lasso(size, d.points)
    const [a, b] = this.corners(d.from, d.points[1])
    return rect(size, a, b)
  }

  private corners(a: [number, number], b: [number, number]): [[number, number], [number, number]] {
    const fa = [Math.floor(a[0]), Math.floor(a[1])]
    const fb = [Math.floor(b[0]), Math.floor(b[1])]
    return [
      [Math.min(fa[0], fb[0]), Math.min(fa[1], fb[1])],
      [Math.max(fa[0], fb[0]), Math.max(fa[1], fb[1])],
    ]
  }
}
