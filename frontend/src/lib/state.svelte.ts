import type { main } from '../../wailsjs/go/models'
import type { Selection } from './selection'
import type { Aim } from './gradientEdit'
import type { Mask } from './grunge.svelte'

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
  // The deskewed piece at photo resolution; null for adjustment and color layers.
  canvas: HTMLCanvasElement | null
  adjust: Adjust | null
  // A color layer: the whole texture in one color, to mask down to dirt and the like.
  color: string | null
  // Center in texels, texels per piece pixel across and down, quarter turns clockwise.
  x: number
  y: number
  scaleX: number
  scaleY: number
  turns: number
  flipX: boolean
  flipY: boolean
  // UV island the layer is clipped to.
  island: number | null
  // Grunge mask: the layer shows only where it does.
  grunge: Mask | null
  // Painted mask at texture size: the layer shows where it is opaque.
  mask: HTMLCanvasElement | null
  // Gaussian blur, standard deviation in texels across and down; linked moves both.
  blur: { x: number; y: number; linked: boolean } | null
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

export type Region = 'refs' | 'canvas' | 'layers'

export const tiles = ['off', 'x', 'y', 'xy'] as const
export type Tile = (typeof tiles)[number]
export const wraps = (t: Tile) => ({ x: t === 'x' || t === 'xy', y: t === 'y' || t === 'xy' })

export type CanvasTool = 'move' | 'transform' | 'island' | 'select' | 'brush' | 'eraser' | 'fill' | 'shape'
export const selectModes = ['rect', 'lasso'] as const
export type SelectMode = (typeof selectModes)[number]
export type PaintTool = 'brush' | 'eraser'
// Tools that lay color into the active layer, each with its own opacity.
export type ColorTool = PaintTool | 'fill' | 'shape'
export const colorTools: CanvasTool[] = ['brush', 'eraser', 'fill', 'shape']
export const shapes = ['rect', 'rect filled', 'ellipse', 'ellipse filled'] as const
export type Shape = (typeof shapes)[number]
export const fillModes = ['bucket', 'gradient'] as const
export type FillMode = (typeof fillModes)[number]
export const tips = ['round', 'square'] as const
export type Tip = (typeof tips)[number]

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
  canvasTool: 'move' as CanvasTool,
  tip: { brush: 'round', eraser: 'square' } as Record<PaintTool, Tip>,
  // Brush and eraser size in texels.
  tipSize: { brush: 1, eraser: 4 } as Record<PaintTool, number>,
  // 1 is hard and texel exact; lower fades the tip out toward its edge.
  hardness: { brush: 1, eraser: 1 } as Record<PaintTool, number>,
  paintOpacity: { brush: 1, eraser: 1, fill: 1, shape: 1 } as Record<ColorTool, number>,
  // Fill: how far colors may differ, only touching texels, sampling all visible layers.
  fill: { tolerance: 0, contiguous: true, merged: false },
  fillMode: 'bucket' as FillMode,
  // Gradient from the primary to the secondary color, or to clear.
  gradient: { radial: false, dither: false, clear: true },
  // The gradient being set up, until Enter applies it.
  gradientAim: null as Aim | null,
  shape: 'rect' as Shape,
  // Outline width in texels.
  shapeWidth: 1,
  // Brush, fill and shapes keep to the UV island the stroke starts in.
  islandClip: false,
  // Tile mode: the canvas shows neighbors, and paint and layers wrap at the edges.
  tile: 'off' as Tile,
  // Primary and secondary color; the right mouse button paints with the secondary.
  colors: ['#a89c88', '#3a342c'] as [string, string],
  swatches: ['#1c1a17', '#3a342c', '#5e554a', '#857a6a', '#a89c88', '#cfc6b4', '#6b4a32', '#8c6a3c', '#4a5a3a', '#3c4c5c', '#7a3a2a', '#b08a4a'],
  selectMode: 'rect' as SelectMode,
  // Transform corners keep the aspect; Shift while dragging does the other.
  keepAspect: true,
  selection: null as Selection | null,
  // Pixels waiting to be placed into a layer; restore is the layer before a lift.
  floating: null as { id: string; into: string; restore: Layer | null } | null,
  // The layer whose mask the color tools paint while it is active, instead of its pixels.
  maskOf: null as string | null,
  // The next canvas click picks a color.
  picking: false,
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
type NewLayer = Omit<Layer, 'id' | 'visible' | 'opacity' | 'blend' | 'clip' | 'adjust' | 'color' | 'grunge' | 'mask' | 'blur'> & Partial<Layer>

export function addLayer(l: NewLayer, at = app.layers.length) {
  const layer: Layer = { visible: true, opacity: 1, blend: 'normal', clip: false, adjust: null, color: null, grunge: null, mask: null, blur: null, ...l, id: newId() }
  app.layers.splice(at, 0, layer)
  app.active = layer.id
}

// The layer an unclipped layer's clip shows through: the next unclipped one below.
export function clipBase(index: number): Layer | undefined {
  for (let i = index - 1; i >= 0; i--) if (!app.layers[i].clip) return app.layers[i]
}

// Adjustment, grunge and blur are the nested parts of a layer.
export const cloneLayer = (l: Layer): Layer => ({ ...l, adjust: l.adjust && { ...l.adjust }, grunge: l.grunge && { ...l.grunge }, blur: l.blur && { ...l.blur } })

// Layers whose pixels the color tools can change: pieces, or any layer's mask in mask mode.
export const paintable = (l: Layer) => masking() || !!l.canvas

export const masking = () => app.maskOf !== null && app.maskOf === app.active
