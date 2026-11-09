import { place } from './clipboard'
import { app, channels, cloneLayer, newId, type Channel, type Layer } from './state.svelte'

// Where nothing is painted: no glow, no occlusion, matte.
export const base: Record<Channel, string | null> = { color: null, emission: '#000000', ao: '#ffffff', roughness: '#ffffff' }

// Channels that hold one value per texel, shown and written in gray.
export const gray = (ch: Channel) => ch === 'ao' || ch === 'roughness'

export const short: Record<Channel, string> = { color: 'color', emission: 'emission', ao: 'ao', roughness: 'rough' }

export function present(): Channel[] {
  return channels.filter((ch) => ch === 'color' || ch === app.channel || app.stacks[ch])
}

export function layersOf(ch: Channel): Layer[] {
  return ch === app.channel ? app.layers : (app.stacks[ch]?.layers ?? [])
}

// Shows another channel; one not there yet starts empty.
export function show(ch: Channel) {
  if (ch === app.channel) return
  // A floating paste lands in its layer before the stack goes away.
  place()
  app.stacks[app.channel] = { layers: app.layers, active: app.active }
  const next = app.stacks[ch] ?? { layers: [], active: null }
  delete app.stacks[ch]
  app.channel = ch
  app.layers = next.layers
  app.active = next.active
  app.maskOf = null
  if (app.onion.channel === ch) app.onion.channel = null
}

export function remove(ch: Channel) {
  if (ch === 'color') return
  if (app.channel === ch) show('color')
  delete app.stacks[ch]
  if (app.onion.channel === ch) app.onion.channel = null
}

// A copy of the layer on top of another channel's stack.
export function copyTo(l: Layer, ch: Channel) {
  const copy = { ...cloneLayer(l), id: newId() }
  if (ch === app.channel) app.layers.push(copy)
  else {
    const stack = (app.stacks[ch] ??= { layers: [], active: null })
    stack.layers.push(copy)
    stack.active = copy.id
  }
}

const virtual = (id: string, l: Partial<Layer>): Layer => ({
  id,
  name: id,
  canvas: null,
  adjust: null,
  color: null,
  grunge: null,
  mask: null,
  blur: null,
  outline: null,
  shadow: null,
  text: null,
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  turns: 0,
  flipX: false,
  flipY: false,
  island: null,
  visible: true,
  opacity: 1,
  blend: 'normal',
  clip: false,
  ...l,
})

// A channel's layers as they lay together: on its base value, gray ones in gray.
export function composed(ch: Channel): Layer[] {
  const layers = layersOf(ch).map(cloneLayer)
  const fill = base[ch]
  if (fill) layers.unshift(virtual(`base:${ch}`, { color: fill }))
  if (gray(ch)) layers.push(virtual(`gray:${ch}`, { adjust: { hue: 0, saturation: -1, brightness: 0, black: 0, gamma: 1, white: 1 } }))
  return layers
}

// The brightness of a color as a gray, for painting gray channels.
export function grayOf(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const v = Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255))
  return '#' + v.toString(16).padStart(2, '0').repeat(3)
}
