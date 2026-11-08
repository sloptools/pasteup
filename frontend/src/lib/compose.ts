import { CanvasSource, Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { BlendPass } from './blend'
import { eachFace } from './uv'
import type { Layer, Layout } from './state.svelte'

// Each layer is drawn into a texture of its own at texture size, transformed and
// clipped to its island; those are then laid together, bottom first.
export class Composer {
  target: RenderTexture
  private pass: BlendPass
  // Ping-pong pair for laying the layers together.
  private acc: [RenderTexture, RenderTexture]
  private pieces = new WeakMap<HTMLCanvasElement, Texture>()
  private layers = new Map<string, { rt: RenderTexture; sig: string }>()

  constructor(
    private renderer: Renderer,
    size: number,
  ) {
    this.target = this.texture(size)
    this.acc = [this.texture(size), this.texture(size)]
    this.pass = new BlendPass(renderer)
  }

  private texture(size: number) {
    return RenderTexture.create({ width: size, height: size, scaleMode: 'nearest' })
  }

  resize(size: number) {
    if (this.target.width === size) return
    this.target.resize(size, size)
    for (const rt of this.acc) rt.resize(size, size)
  }

  piece(canvas: HTMLCanvasElement): Texture {
    let tex = this.pieces.get(canvas)
    if (!tex) {
      tex = new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) })
      this.pieces.set(canvas, tex)
    }
    return tex
  }

  // The layer alone, as it lands in the texture.
  layer(l: Layer, layout: Layout | null): RenderTexture {
    const size = this.target.width
    const sig = [canvasId(l.canvas), l.x, l.y, l.scale, l.turns, l.flipX, l.flipY, l.island, size, layout?.uvs.length ?? 0].join()
    let entry = this.layers.get(l.id)
    if (entry && entry.sig === sig) return entry.rt
    if (!entry || entry.rt.width !== size) {
      entry?.rt.destroy(true)
      entry = { rt: this.texture(size), sig: '' }
      this.layers.set(l.id, entry)
    }

    const scene = new Container()
    const sprite = new Sprite(this.piece(l.canvas))
    place(sprite, l)
    scene.addChild(sprite)
    if (l.island !== null && layout) {
      const mask = new Graphics()
      eachFace(layout, l.island, (p) => {
        mask.poly(p.map((c) => c * size))
      })
      mask.fill(0xffffff)
      scene.addChild(mask)
      sprite.mask = mask
    }
    this.renderer.render({ container: scene, target: entry.rt, clear: true, clearColor: [0, 0, 0, 0] })
    scene.destroy({ children: true })
    entry.sig = sig
    return entry.rt
  }

  // Lays the layers together into target, or into the main texture.
  render(layers: Layer[], layout: Layout | null, target = this.target) {
    const visible: [Layer, Layer | undefined][] = []
    let base: Layer | undefined
    for (const l of layers) {
      if (!l.clip) base = l
      if (l.visible && (!l.clip || (base && base !== l && base.visible))) visible.push([l, l.clip ? base : undefined])
    }

    let [below, next] = this.acc
    this.renderer.render({ container: new Container(), target: below, clear: true, clearColor: [0, 0, 0, 0] })
    visible.forEach(([l, clipTo], i) => {
      const out = i === visible.length - 1 ? target : next
      const clip = clipTo ? this.layer(clipTo, layout) : null
      this.pass.draw(below, this.layer(l, layout), clip, l.opacity, l.blend, out)
      ;[below, next] = [out, below]
    })
    if (!visible.length) this.renderer.render({ container: new Container(), target, clear: true, clearColor: [0, 0, 0, 0] })
    this.prune(layers)
  }

  // Drops the textures of layers that are gone.
  private prune(layers: Layer[]) {
    const ids = new Set(layers.map((l) => l.id))
    for (const [id, entry] of this.layers) {
      if (ids.has(id)) continue
      entry.rt.destroy(true)
      this.layers.delete(id)
    }
  }

  // The given layers laid together, as a canvas at texture size.
  flatten(layers: Layer[], layout: Layout | null): HTMLCanvasElement {
    const rt = this.texture(this.target.width)
    this.render(layers, layout, rt)
    const canvas = this.canvas(rt)
    rt.destroy(true)
    return canvas
  }

  png(): string {
    return this.canvas(this.target).toDataURL('image/png').split(',')[1]
  }

  // A texture's pixels with straight alpha, as canvases and PNGs keep them.
  canvas(rt: RenderTexture): HTMLCanvasElement {
    const { pixels, width, height } = this.renderer.extract.pixels(rt)
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3]
      if (a === 0 || a === 255) continue
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round((pixels[i + c] * 255) / a))
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.putImageData(new ImageData(Uint8ClampedArray.from(pixels), width, height), 0, 0)
    return canvas
  }
}

const canvasIds = new WeakMap<HTMLCanvasElement, number>()
let nextCanvas = 0
function canvasId(c: HTMLCanvasElement) {
  if (!canvasIds.has(c)) canvasIds.set(c, nextCanvas++)
  return canvasIds.get(c)
}

// Sets a sprite or frame to the layer's transform, in texels.
export function place(node: Sprite | Graphics, l: Layer) {
  if (node instanceof Sprite) node.anchor.set(0.5)
  node.position.set(l.x, l.y)
  node.rotation = (l.turns * Math.PI) / 2
  node.scale.set(l.scale * (l.flipX ? -1 : 1), l.scale * (l.flipY ? -1 : 1))
}

// Whether a texel point hits an opaque pixel of the layer.
export function hits(l: Layer, x: number, y: number): boolean {
  const a = (-l.turns * Math.PI) / 2
  const dx = x - l.x
  const dy = y - l.y
  const rx = (dx * Math.cos(a) - dy * Math.sin(a)) / (l.scale * (l.flipX ? -1 : 1))
  const ry = (dx * Math.sin(a) + dy * Math.cos(a)) / (l.scale * (l.flipY ? -1 : 1))
  const px = Math.floor(rx + l.canvas.width / 2)
  const py = Math.floor(ry + l.canvas.height / 2)
  if (px < 0 || py < 0 || px >= l.canvas.width || py >= l.canvas.height) return false
  return l.canvas.getContext('2d')!.getImageData(px, py, 1, 1).data[3] > 0
}
