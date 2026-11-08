import type { Composer } from './compose'
import { activeLayer, addLayer, app, newId, removeLayer } from './state.svelte'

export function duplicate() {
  const l = activeLayer()
  if (!l) return
  const at = app.layers.indexOf(l) + 1
  const copy = { ...l, id: newId(), name: `${l.name} copy` }
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
  const below = { ...app.layers[at - 1] }
  const pair = [{ ...below, opacity: 1, blend: 'normal' as const, clip: false, visible: true }, { ...l }]
  const canvas = composer.flatten(pair, app.layout)
  const size = app.size

  removeLayer(l.id)
  removeLayer(below.id)
  addLayer(
    {
      ...below,
      canvas,
      x: size / 2,
      y: size / 2,
      scale: 1,
      turns: 0,
      flipX: false,
      flipY: false,
      island: null,
    },
    at - 1,
  )
}
