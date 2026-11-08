import { CanvasSource, Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { AdjustPass } from './adjust'
import { BlendPass } from './blend'
import { eachFace } from './uv'
import type { Layer, Layout } from './state.svelte'

// Each layer is drawn into a texture of its own at texture size, transformed and
// clipped to its island; those are then laid together, bottom first. Adjustment
// layers are drawn from what lies below them at their turn.
export class Composer {
  target: RenderTexture
  private pass: BlendPass
  private adjustPass: AdjustPass
  // Ping-pong pair for laying the layers together.
  private acc: [RenderTexture, RenderTexture]
  private pieces = new Map<HTMLCanvasElement, Texture>()
  // The canvas of a stroke in progress, shown in place of its layer's piece.
  private live: { id: string; canvas: HTMLCanvasElement; rev: number } | null = null
  private layers = new Map<string, { rt: RenderTexture; sig: string }>()
  private masks = new Map<string, RenderTexture>()
  private layout: Layout | null = null

  constructor(
    private renderer: Renderer,
    size: number,
  ) {
    this.target = this.texture(size)
    this.acc = [this.texture(size), this.texture(size)]
    this.pass = new BlendPass(renderer)
    this.adjustPass = new AdjustPass(renderer)
  }

  private texture(size: number) {
    return RenderTexture.create({ width: size, height: size, scaleMode: 'nearest' })
  }

  resize(size: number) {
    if (this.target.width === size) return
    this.target.resize(size, size)
    for (const rt of this.acc) rt.resize(size, size)
    this.dropMasks()
  }

  private dropMasks() {
    for (const rt of this.masks.values()) rt.destroy(true)
    this.masks.clear()
  }

  piece(canvas: HTMLCanvasElement): Texture {
    let tex = this.pieces.get(canvas)
    if (!tex) {
      tex = new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) })
      this.pieces.set(canvas, tex)
    }
    return tex
  }

  private entry(id: string) {
    const size = this.target.width
    let entry = this.layers.get(id)
    if (!entry || entry.rt.width !== size) {
      entry?.rt.destroy(true)
      entry = { rt: this.texture(size), sig: '' }
      this.layers.set(id, entry)
    }
    return entry
  }

  // White where the island lies.
  private mask(island: number, layout: Layout): RenderTexture {
    const size = this.target.width
    const key = `${island}:${idOf(layout)}`
    let rt = this.masks.get(key)
    if (rt) return rt
    rt = this.texture(size)
    const g = new Graphics()
    eachFace(layout, island, (p) => {
      g.poly(p.map((c) => c * size))
    })
    g.fill(0xffffff)
    this.renderer.render({ container: g, target: rt, clear: true, clearColor: [0, 0, 0, 0] })
    g.destroy()
    this.masks.set(key, rt)
    return rt
  }

  stroke(id: string, canvas: HTMLCanvasElement | null) {
    this.live = canvas && { id, canvas, rev: 0 }
  }

  // The stroke's canvas changed.
  touch() {
    if (!this.live) return
    this.live.rev++
    this.piece(this.live.canvas).source.update()
  }

  // The layer alone, as it lands in the texture.
  layer(l: Layer, layout: Layout | null): RenderTexture {
    const live = this.live?.id === l.id ? this.live : null
    const canvas = live?.canvas ?? l.canvas!
    const size = this.target.width
    const sig = [idOf(canvas), live?.rev, l.x, l.y, l.scale, l.turns, l.flipX, l.flipY, l.island, size, layout && idOf(layout)].join()
    const entry = this.entry(l.id)
    if (entry.sig === sig) return entry.rt

    const scene = new Container()
    const sprite = new Sprite(this.piece(canvas))
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
    if (layout !== this.layout) this.dropMasks()
    this.layout = layout
    const visible: [Layer, Layer | undefined][] = []
    let base: Layer | undefined
    for (const l of layers) {
      if (!l.clip) base = l
      if (l.visible && (!l.clip || (base && base !== l && base.visible))) visible.push([l, l.clip ? base : undefined])
    }

    let [below, next] = this.acc
    this.renderer.render({ container: new Container(), target: below, clear: true, clearColor: [0, 0, 0, 0] })
    const drawn = new Map<string, RenderTexture>()
    visible.forEach(([l, clipTo], i) => {
      const out = i === visible.length - 1 ? target : next
      const rt = l.adjust ? this.adjusted(l, below, layout) : this.layer(l, layout)
      drawn.set(l.id, rt)
      this.pass.draw(below, rt, clipTo ? drawn.get(clipTo.id)! : null, l.opacity, l.blend, out)
      ;[below, next] = [out, below]
    })
    if (!visible.length) this.renderer.render({ container: new Container(), target, clear: true, clearColor: [0, 0, 0, 0] })
    if (target === this.target) this.prune(layers)
  }

  private adjusted(l: Layer, below: RenderTexture, layout: Layout | null): RenderTexture {
    const entry = this.entry(l.id)
    entry.sig = ''
    const mask = l.island !== null && layout ? this.mask(l.island, layout) : null
    this.adjustPass.draw(below, mask, l.adjust!, entry.rt)
    return entry.rt
  }

  // Drops the textures of layers that are gone, and of pieces only undo still holds.
  private prune(layers: Layer[]) {
    const ids = new Set(layers.map((l) => l.id))
    for (const [id, entry] of this.layers) {
      if (ids.has(id)) continue
      entry.rt.destroy(true)
      this.layers.delete(id)
    }

    const used = new Set(layers.map((l) => l.canvas))
    if (this.live) used.add(this.live.canvas)
    for (const [canvas, tex] of this.pieces) {
      if (used.has(canvas)) continue
      tex.destroy(true)
      this.pieces.delete(canvas)
    }
  }

  // The composite color at a texel, as #rrggbb, or null where it is empty.
  pick(x: number, y: number): string | null {
    const { pixels, width } = this.renderer.extract.pixels(this.target)
    const o = (y * width + x) * 4
    const a = pixels[o + 3]
    if (!a) return null
    const c = [0, 1, 2].map((i) => Math.min(255, Math.round((pixels[o + i] * 255) / a)))
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
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

// Pieces and layouts are replaced, never changed, so identity tells them apart.
const objectIds = new WeakMap<object, number>()
let nextId = 0
function idOf(o: object) {
  if (!objectIds.has(o)) objectIds.set(o, nextId++)
  return objectIds.get(o)
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
  const canvas = l.canvas
  if (!canvas) return false
  const a = (-l.turns * Math.PI) / 2
  const dx = x - l.x
  const dy = y - l.y
  const rx = (dx * Math.cos(a) - dy * Math.sin(a)) / (l.scale * (l.flipX ? -1 : 1))
  const ry = (dx * Math.sin(a) + dy * Math.cos(a)) / (l.scale * (l.flipY ? -1 : 1))
  const px = Math.floor(rx + canvas.width / 2)
  const py = Math.floor(ry + canvas.height / 2)
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false
  return canvas.getContext('2d')!.getImageData(px, py, 1, 1).data[3] > 0
}
