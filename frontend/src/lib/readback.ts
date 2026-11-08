import { layersOf } from './channels'
import { app, say, type Layer } from './state.svelte'

// Strokes painted in Blender land in their own layer on top of the color: the
// texels that differ from the texture Blender painted on.
export const blenderLayer = 'blender'

function decode(png: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      c.getContext('2d')!.drawImage(img, 0, 0)
      resolve(c)
    }
    img.onerror = () => reject(new Error('bad png'))
    img.src = `data:image/png;base64,${png}`
  })
}

export async function readBack(painted: string, base: string) {
  const [now, was] = await Promise.all([decode(painted), decode(base)])
  const size = app.size
  if (now.width !== size || was.width !== size) return say('blender painted on a texture of another size')

  const a = now.getContext('2d')!.getImageData(0, 0, size, size)
  const b = was.getContext('2d')!.getImageData(0, 0, size, size)
  const strokes = new ImageData(size, size)
  let changed = 0
  for (let i = 0; i < a.data.length; i += 4) {
    let differs = false
    for (let c = 0; c < 4; c++) if (Math.abs(a.data[i + c] - b.data[i + c]) > 2) differs = true
    if (!differs) continue
    strokes.data.set(a.data.subarray(i, i + 4), i)
    changed++
  }
  if (!changed) return

  const layers = layersOf('color')
  let layer = layers.find((l) => l.id === blenderLayer)
  if (!layer) {
    const blank = document.createElement('canvas')
    blank.width = blank.height = size
    const fresh: Layer = { id: blenderLayer, name: 'blender', canvas: blank, adjust: null, color: null, grunge: null, mask: null, blur: null, x: size / 2, y: size / 2, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false, island: null, visible: true, opacity: 1, blend: 'normal', clip: false }
    layers.push(fresh)
    layer = layers[layers.length - 1]
  }
  // A new piece, as pieces never change in place.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(layer.canvas!, 0, 0)
  const s = document.createElement('canvas')
  s.width = s.height = size
  s.getContext('2d')!.putImageData(strokes, 0, 0)
  ctx.drawImage(s, 0, 0)
  layer.canvas = canvas
  say(`painted in blender: ${changed} texels`)
}
