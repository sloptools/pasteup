import type { main } from '../../wailsjs/go/models'

export type Layout = main.Layout

export type Photo = {
  id: string
  name: string
  // Folder of the photo on disk, empty for photos dropped in a browser.
  dir: string
  img: HTMLImageElement
  // Top left on the board, in board pixels; photos keep their pixel size.
  x: number
  y: number
}

export type Layer = {
  id: string
  name: string
  // The deskewed piece at photo resolution; null for adjustment layers.
  canvas: HTMLCanvasElement | null
  adjust: Adjust | null
  // Center in texels, texels per piece pixel, quarter turns clockwise.
  x: number
  y: number
  scale: number
  turns: number
  flipX: boolean
  flipY: boolean
  // UV island the layer is clipped to.
  island: number | null
  visible: boolean
  opacity: number
  blend: Blend
  // Shows only where the next unclipped layer below has pixels.
  clip: boolean
}

// Color adjustment of everything below: levels, then brightness, then hue and saturation.
export type Adjust = {
  hue: number
  saturation: number
  brightness: number
  black: number
  gamma: number
  white: number
}

export const neutral: Adjust = { hue: 0, saturation: 0, brightness: 0, black: 0, gamma: 1, white: 1 }

export const blends = ['normal', 'multiply', 'screen', 'overlay', 'add', 'soft-light'] as const
export type Blend = (typeof blends)[number]

export type Region = 'refs' | 'canvas'

export const sizes = [128, 256, 512, 1024]

export const app = $state({
  layout: null as Layout | null,
  // The .blend the layout came from over the bridge.
  blend: null as string | null,
  size: 256,
  photos: [] as Photo[],
  layers: [] as Layer[],
  active: null as string | null,
  // The layer whose name is being edited.
  renaming: null as string | null,
  // Ref space beside the canvas, collapsed or maximized.
  refs: 'open' as 'open' | 'closed' | 'max',
  // Keys go to the region the pointer was last pressed in.
  focus: 'canvas' as Region,
  refTool: 'move' as 'move' | 'cut',
  // Cuts become rectangles; off keeps the shape as the photo shows it.
  deskew: true,
  canvasTool: 'move' as 'move' | 'island',
  status: '',
})

let next = 0
export const newId = () => `${Date.now().toString(36)}${(next++).toString(36)}`

export function activeLayer(): Layer | undefined {
  return app.layers.find((l) => l.id === app.active)
}

export function say(text: string) {
  app.status = text
}

export function removeLayer(id: string) {
  const at = app.layers.findIndex((l) => l.id === id)
  if (at < 0) return
  app.layers.splice(at, 1)
  if (app.active === id) app.active = app.layers[Math.max(0, at - 1)]?.id ?? null
}

// A new layer above the others, made active.
type NewLayer = Omit<Layer, 'id' | 'visible' | 'opacity' | 'blend' | 'clip' | 'adjust'> & Partial<Layer>

export function addLayer(l: NewLayer, at = app.layers.length) {
  const layer: Layer = { visible: true, opacity: 1, blend: 'normal', clip: false, adjust: null, ...l, id: newId() }
  app.layers.splice(at, 0, layer)
  app.active = layer.id
}

// The layer an unclipped layer's clip shows through: the next unclipped one below.
export function clipBase(index: number): Layer | undefined {
  for (let i = index - 1; i >= 0; i--) if (!app.layers[i].clip) return app.layers[i]
}

// Adjustments are the only nested part of a layer.
export const cloneLayer = (l: Layer): Layer => ({ ...l, adjust: l.adjust && { ...l.adjust } })
