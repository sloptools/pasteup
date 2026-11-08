import type { Composer } from './compose'
import { activeLayer, addLayer, app, cloneLayer, neutral, newId, removeLayer, type Layer } from './state.svelte'

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

// Untransformed placement at texture size: one canvas pixel per texel.
const identity = () => ({ x: app.size / 2, y: app.size / 2, scale: 1, turns: 0, flipX: false, flipY: false })

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

// Whether painting on the layer lands one canvas pixel per texel.
export function isTexels(l: Layer) {
  const i = identity()
  return l.canvas?.width === app.size && l.canvas.height === app.size && (Object.keys(i) as (keyof typeof i)[]).every((k) => l[k] === i[k])
}

// Bakes a placed piece into texels, so a brush can paint on it.
export function toTexels(l: Layer, composer: Composer) {
  const canvas = composer.flatten([{ ...cloneLayer(l), visible: true, opacity: 1, blend: 'normal', clip: false }], app.layout)
  Object.assign(l, { canvas, ...identity() })
}

// An adjustment layer above the active one.
export function addAdjust() {
  const l = activeLayer()
  const at = l ? app.layers.indexOf(l) + 1 : app.layers.length
  addLayer({ name: 'adjust', canvas: null, adjust: { ...neutral }, x: 0, y: 0, scale: 1, turns: 0, flipX: false, flipY: false, island: null }, at)
}
