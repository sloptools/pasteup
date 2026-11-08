import type { Graphics, Sprite } from 'pixi.js'
import type { Layer } from './state.svelte'

// From the piece's pixels to texels: center on the piece, scale, flip, turn, place.
export function matrix(l: Layer): DOMMatrix {
  const { width: w, height: h } = l.canvas!
  return new DOMMatrix()
    .translate(l.x, l.y)
    .rotate(l.turns * 90)
    .scale(l.scaleX * (l.flipX ? -1 : 1), l.scaleY * (l.flipY ? -1 : 1))
    .translate(-w / 2, -h / 2)
}

// Sets a sprite or frame to the layer's transform, in texels.
export function place(node: Sprite | Graphics, l: Layer) {
  if ('anchor' in node) node.anchor.set(0.5)
  node.position.set(l.x, l.y)
  node.rotation = (l.turns * Math.PI) / 2
  node.scale.set(l.scaleX * (l.flipX ? -1 : 1), l.scaleY * (l.flipY ? -1 : 1))
}

export type Box = { x: number; y: number; w: number; h: number }

// The layer's rectangle in texels; turns are quarter turns, so it stays axis aligned.
export function box(l: Layer): Box {
  const side = l.turns % 2 === 1
  const across = l.canvas!.width * l.scaleX
  const down = l.canvas!.height * l.scaleY
  const w = side ? down : across
  const h = side ? across : down
  return { x: l.x - w / 2, y: l.y - h / 2, w, h }
}

// Fits the layer to a rectangle in texels, edges on whole texels.
export function fit(l: Layer, b: Box) {
  const w = Math.max(1, Math.round(b.w))
  const h = Math.max(1, Math.round(b.h))
  const x = Math.round(b.x)
  const y = Math.round(b.y)
  const side = l.turns % 2 === 1
  l.scaleX = (side ? h : w) / l.canvas!.width
  l.scaleY = (side ? w : h) / l.canvas!.height
  l.x = x + w / 2
  l.y = y + h / 2
}

// Quarter turns about the center, then back onto whole texels; toward zero both
// ways, so turning back lands where it started.
export function turn(l: Layer, by: number) {
  const b = box(l)
  l.turns = (l.turns + by + 4) % 4
  fit(l, { x: b.x + Math.trunc((b.w - b.h) / 2), y: b.y + Math.trunc((b.h - b.w) / 2), w: b.h, h: b.w })
}

// Grows or shrinks about the center, keeping the aspect.
export function scaleBy(l: Layer, f: number) {
  const b = box(l)
  // At least a texel each step, so small pieces still change.
  const by = Math.round(b.w * f) - b.w
  const w = Math.max(1, b.w + (f > 1 ? Math.max(1, by) : Math.min(-1, by)))
  const h = Math.max(1, Math.round((b.h * w) / b.w))
  fit(l, { x: b.x + Math.trunc((b.w - w) / 2), y: b.y + Math.trunc((b.h - h) / 2), w, h })
}

// Mirrors as seen in the texture, whatever the turns.
export function flip(l: Layer, horizontal: boolean) {
  if (horizontal === (l.turns % 2 === 0)) l.flipX = !l.flipX
  else l.flipY = !l.flipY
}

// A handle on the frame: -1, 0 or 1 per axis, 0 for the middle of an edge.
export type Handle = { sx: number; sy: number }

export const handles: Handle[] = [-1, 0, 1].flatMap((sy) => [-1, 0, 1].map((sx) => ({ sx, sy }))).filter((h) => h.sx || h.sy)

export function handleAt(b: Box, h: Handle): [number, number] {
  return [b.x + ((h.sx + 1) / 2) * b.w, b.y + ((h.sy + 1) / 2) * b.h]
}

// The handle within reach of a texel point, or 'inside' the frame, or null.
export function hit(b: Box, x: number, y: number, reach: number): Handle | 'inside' | null {
  for (const h of handles) {
    const [hx, hy] = handleAt(b, h)
    if (Math.abs(x - hx) <= reach && Math.abs(y - hy) <= reach) return h
  }
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? 'inside' : null
}

// The frame while a handle is dragged to a point; the opposite side stays put.
export function resize(from: Box, h: Handle, x: number, y: number, keep: boolean): Box {
  let w = h.sx === 1 ? x - from.x : h.sx === -1 ? from.x + from.w - x : from.w
  let ht = h.sy === 1 ? y - from.y : h.sy === -1 ? from.y + from.h - y : from.h
  w = Math.max(1, w)
  ht = Math.max(1, ht)
  if (keep) {
    const f = h.sx && h.sy ? Math.max(w / from.w, ht / from.h) : h.sx ? w / from.w : ht / from.h
    w = from.w * f
    ht = from.h * f
  }
  const at = (s: number, start: number, size: number, now: number) => (s === 1 ? start : s === -1 ? start + size - now : start + (size - now) / 2)
  return { x: at(h.sx, from.x, from.w, w), y: at(h.sy, from.y, from.h, ht), w, h: ht }
}

export const cursors: Record<string, string> = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize' }

// Redraws a scaled or stretched layer at one pixel per texel, in place and at its
// size, so painting on it is texel exact. True when it changed.
export function settle(l: Layer): boolean {
  const b = box(l)
  if (l.scaleX === 1 && l.scaleY === 1 && Number.isInteger(b.x) && Number.isInteger(b.y)) return false

  const x = Math.round(b.x)
  const y = Math.round(b.y)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(b.w))
  canvas.height = Math.max(1, Math.round(b.h))
  const ctx = canvas.getContext('2d')!
  // As the canvas shows it: crisp when grown, smooth when shrunk.
  ctx.imageSmoothingEnabled = l.scaleX < 1 || l.scaleY < 1
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(new DOMMatrix().translate(-x, -y).multiply(matrix(l)))
  ctx.drawImage(l.canvas!, 0, 0)

  Object.assign(l, { canvas, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false })
  l.x = x + canvas.width / 2
  l.y = y + canvas.height / 2
  return true
}
