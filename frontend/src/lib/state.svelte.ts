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
  // The deskewed piece at photo resolution.
  canvas: HTMLCanvasElement
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
}

export type Region = 'refs' | 'canvas'

export const sizes = [128, 256, 512, 1024]

export const app = $state({
  layout: null as Layout | null,
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
