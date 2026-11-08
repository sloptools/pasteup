import type { Composer } from './compose'
import { matrix, settle } from './transform'
import { activeLayer, addLayer, app, cloneLayer, removeLayer, say, type Layer } from './state.svelte'

let composer: Composer

export function useComposer(c: Composer) {
  composer = c
}

// What copy took: pixels cropped to the selection, and where they came from.
let clip: { canvas: HTMLCanvasElement; x: number; y: number } | null = null

function blank(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function copyOf(source: HTMLCanvasElement) {
  const canvas = blank(source.width, source.height)
  canvas.getContext('2d')!.drawImage(source, 0, 0)
  return canvas
}

// Draws a texture-sized canvas into a copy of the layer's piece, through its transform.
function intoPiece(l: Layer, texels: HTMLCanvasElement, op: GlobalCompositeOperation): HTMLCanvasElement {
  settle(l)
  const canvas = copyOf(l.canvas!)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.globalCompositeOperation = op
  ctx.setTransform(matrix(l).inverse())
  ctx.drawImage(texels, 0, 0)
  return canvas
}

// The selected part of a texture-sized canvas, cropped.
function crop(texels: HTMLCanvasElement) {
  const s = app.selection!
  const canvas = blank(s.w, s.h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(texels, -s.x, -s.y)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(s.canvas, -s.x, -s.y)
  return { canvas, x: s.x, y: s.y }
}

// The layer as it lands in the texture.
const texels = (l: Layer) => composer.canvas(composer.layer(l, app.layout))

const piece = () => {
  const l = activeLayer()
  return l?.canvas ? l : null
}

export function copy(merged = false) {
  const l = piece()
  if (!app.selection || (!merged && !l)) return false
  clip = crop(merged ? composer.canvas(composer.target) : texels(l!))
  say(`copied ${clip.canvas.width}×${clip.canvas.height}`)
  return true
}

// Clears the selected pixels of the active layer.
export function clear() {
  const l = piece()
  if (!app.selection || !l) return false
  l.canvas = intoPiece(l, app.selection.canvas, 'destination-out')
  return true
}

export function cut() {
  return copy() && clear()
}

function addPiece(name: string, c: NonNullable<typeof clip>, at: number) {
  const { canvas, x, y } = c
  addLayer({ name, canvas, x: x + canvas.width / 2, y: y + canvas.height / 2, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false, island: null }, at)
}

// A new layer above the active one, where the pixels were copied; floating
// pastes go into the active layer once placed.
export function paste(floating = false) {
  if (!clip) return false
  const into = piece()
  const at = into ? app.layers.indexOf(into) + 1 : app.layers.length
  addPiece(floating ? 'floating' : 'pasted', clip, at)
  app.canvasTool = 'move'
  if (floating && into) {
    app.floating = { id: app.active!, into: into.id, restore: null }
    say('floating: Enter places it, Esc discards it')
  }
  return true
}

// Lifts the selected pixels of the active layer into a floating layer, to transform them.
export function lift() {
  const l = piece()
  if (!app.selection || !l || app.floating) return false
  const restore = cloneLayer(l)
  const lifted = crop(texels(l))
  clear()
  addPiece('floating', lifted, app.layers.indexOf(l) + 1)
  app.floating = { id: app.active!, into: l.id, restore }
  app.selection = null
  say('floating: Enter places it, Esc puts it back')
  return true
}

// Lays the floating layer into its layer.
export function place() {
  const f = app.floating
  const float = f && app.layers.find((l) => l.id === f.id)
  const into = f && app.layers.find((l) => l.id === f.into)
  app.floating = null
  say('')
  if (!float || !into?.canvas) return
  into.canvas = intoPiece(into, texels(float), 'source-over')
  removeLayer(float.id)
  app.active = into.id
}

export function discard() {
  const f = app.floating
  app.floating = null
  say('')
  if (!f) return
  removeLayer(f.id)
  const into = app.layers.find((l) => l.id === f.into)
  if (into && f.restore) {
    const { canvas, x, y, scaleX, scaleY, turns, flipX, flipY } = f.restore
    Object.assign(into, { canvas, x, y, scaleX, scaleY, turns, flipX, flipY })
  }
  if (into) app.active = into.id
}
