import type { Composer } from './compose'
import { newMask } from './grunge.svelte'
import { activeLayer, addLayer, app, cloneLayer, neutral, newId, removeLayer } from './state.svelte'

export function duplicate() {
  const l = activeLayer()
  if (!l) return
  const at = app.layers.indexOf(l) + 1
  const copy = { ...cloneLayer(l), id: newId(), name: `${l.name} copy` }
  app.layers.splice(at, 0, copy)
  app.active = copy.id
}

// Moves the active layer up (1) or down (-1).
export function move(step: number) {
  const l = activeLayer()
  if (!l) return
  const from = app.layers.indexOf(l)
  const to = Math.min(Math.max(from + step, 0), app.layers.length - 1)
  if (to === from) return
  const [taken] = app.layers.splice(from, 1)
  app.layers.splice(to, 0, taken)
}

// Lays the active layer onto the one below into a single texture-sized layer.
export function mergeDown(composer: Composer) {
  const l = activeLayer()
  const at = l ? app.layers.indexOf(l) : -1
  if (!l || at < 1) return
  const below = cloneLayer(app.layers[at - 1])
  const pair = [{ ...below, opacity: 1, blend: 'normal' as const, clip: false, visible: true }, cloneLayer(l)]
  const canvas = composer.flatten(pair, app.layout)

  removeLayer(l.id)
  removeLayer(below.id)
  addLayer(
    {
      ...below,
      canvas,
      ...identity(),
      island: null,
      adjust: null,
    },
    at - 1,
  )
}

// A new texture size: the layers scale along, so the texture looks the same at the new resolution.
export function setSize(size: number) {
  const f = size / app.size
  if (f === 1) return
  for (const l of app.layers) {
    l.x *= f
    l.y *= f
    l.scaleX *= f
    l.scaleY *= f
  }
  app.size = size
}

// Untransformed placement at texture size: one canvas pixel per texel.
const identity = () => ({ x: app.size / 2, y: app.size / 2, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false })

export function blank(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = app.size
  canvas.height = app.size
  return canvas
}

// An empty layer to paint on, above the active one.
export function newLayer() {
  const l = activeLayer()
  const at = l ? app.layers.indexOf(l) + 1 : app.layers.length
  addLayer({ name: 'paint', canvas: blank(), island: null, ...identity() }, at)
}

// A layer of the primary color with a grunge mask, for dirt, rust and grime.
export function newGrunge() {
  const l = activeLayer()
  const at = l ? app.layers.indexOf(l) + 1 : app.layers.length
  const canvas = blank()
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = app.colors[0]
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  addLayer({ name: 'grunge', canvas, island: null, mask: newMask(), ...identity() }, at)
}

// An adjustment layer above the active one.
export function addAdjust() {
  const l = activeLayer()
  const at = l ? app.layers.indexOf(l) + 1 : app.layers.length
  addLayer({ name: 'adjust', canvas: null, adjust: { ...neutral }, x: 0, y: 0, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false, island: null }, at)
}
