import { place } from './clipboard'
import { giveHistory, takeHistory, type History } from './history.svelte'
import { app, newId, type Texture } from './state.svelte'

// Several textures in one project, one per Blender material. The shown one's
// state lives in app; switching swaps it with the stashed state of another.
export type TextureState = Pick<typeof app, 'layout' | 'blend' | 'size' | 'tile' | 'layers' | 'active' | 'channel' | 'stacks' | 'onion' | 'bakeAO' | 'emissionStrength'>

const stashed = new Map<string, { state: TextureState; history: History | null }>()

export const current = () => app.textures.find((t) => t.id === app.texture)!

export function stateOf(t: Texture): TextureState {
  if (t.id === app.texture) {
    const { layout, blend, size, tile, layers, active, channel, stacks, onion, bakeAO, emissionStrength } = app
    return { layout, blend, size, tile, layers, active, channel, stacks, onion, bakeAO, emissionStrength }
  }
  return stashed.get(t.id)!.state
}

export const blank = (size = app.size): TextureState => ({ layout: null, blend: null, size, tile: 'off', layers: [], active: null, channel: 'color', stacks: {}, onion: { channel: null, opacity: 0.3 }, bakeAO: true, emissionStrength: 1 })

function apply(s: TextureState) {
  Object.assign(app, s, { selection: null, floating: null, maskOf: null, gradientAim: null })
}

export function switchTo(id: string) {
  if (id === app.texture || !app.textures.some((t) => t.id === id)) return
  place()
  stashed.set(app.texture, { state: stateOf(current()), history: takeHistory() })
  const next = stashed.get(id)!
  stashed.delete(id)
  app.texture = id
  apply(next.state)
  giveHistory(next.history)
}

// A new texture, shown.
export function addTexture(t: Omit<Texture, 'id'>, s: TextureState) {
  const id = newId()
  stashed.set(id, { state: s, history: null })
  app.textures.push({ ...t, id })
  switchTo(id)
  return id
}

export function removeTexture(id: string) {
  if (app.textures.length < 2) return
  if (id === app.texture) switchTo(app.textures.find((t) => t.id !== id)!.id)
  stashed.delete(id)
  app.textures = app.textures.filter((t) => t.id !== id)
}

// The project's textures as they are, after opening one: the first entry shows.
export function setTextures(list: { texture: Texture; state: TextureState }[], shown: string) {
  stashed.clear()
  for (const { texture, state } of list) if (texture.id !== shown) stashed.set(texture.id, { state, history: null })
  app.textures = list.map((l) => l.texture)
  app.texture = shown
  apply(list.find((l) => l.texture.id === shown)!.state)
}

export const textureFor = (blend: string, material: string) => app.textures.find((t) => t.material === material && stateOf(t).blend === blend)

// Nothing in it yet: no layers and no model.
export const empty = (t: Texture) => {
  const s = stateOf(t)
  return !s.layout && !s.layers.length && !Object.values(s.stacks).some((st) => st?.layers.length)
}
