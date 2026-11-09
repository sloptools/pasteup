import { CanvasSource, Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { AdjustPass } from './adjust'
import { BlendPass } from './blend'
import { BlurPass } from './blur'
import { EffectsPass } from './effects'
import { FinishPass, type Finish } from './finish'
import { eraser, grunge } from './grunge.svelte'
import { eachFace } from './uv'
import { box, exact, matrix, place, raster } from './transform'
import type { Layer, Layout } from './state.svelte'

// Each layer is drawn into a texture of its own at texture size, transformed and
// clipped to its island; those are then laid together, bottom first. Adjustment
// layers are drawn from what lies below them at their turn.
export class Composer {
  target: RenderTexture
  private pass: BlendPass
  private adjustPass: AdjustPass
  private blurPass: BlurPass
  private effectsPass: EffectsPass
  private finishPass: FinishPass
  // Ping-pong pair for laying the layers together.
  private acc: [RenderTexture, RenderTexture]
  // Pieces land one pixel per texel (see raster), so their textures are always crisp.
  private pieces = new Map<HTMLCanvasElement, Texture>()
  // The canvas of a stroke in progress, shown in place of its layer's piece.
  private live: { id: string; canvas: HTMLCanvasElement; rev: number; mask: boolean } | null = null
  private layers = new Map<string, { rt: RenderTexture; sig: string }>()
  private masks = new Map<string, RenderTexture>()
  // Tile mode: layers past an edge come back in on the other side.
  wrap = { x: false, y: false }
  private layout: Layout | null = null

  constructor(
    private renderer: Renderer,
    size: number,
  ) {
    this.target = this.texture(size)
    this.acc = [this.texture(size), this.texture(size)]
    this.pass = new BlendPass(renderer)
    this.adjustPass = new AdjustPass(renderer)
    this.blurPass = new BlurPass(renderer)
    this.effectsPass = new EffectsPass(renderer)
    this.finishPass = new FinishPass(renderer)
  }

  private texture(size: number) {
    return RenderTexture.create({ width: size, height: size, scaleMode: 'nearest' })
  }

  // New textures rather than resized ones: sprites showing the old ones keep their old size.
  resize(size: number) {
    if (this.target.width === size) return
    this.target.destroy(true)
    for (const rt of this.acc) rt.destroy(true)
    this.target = this.texture(size)
    this.acc = [this.texture(size), this.texture(size)]
    this.dropMasks()
  }

  private dropMasks() {
    for (const rt of this.masks.values()) rt.destroy(true)
    this.masks.clear()
  }

  piece(canvas: HTMLCanvasElement): Texture {
    let tex = this.pieces.get(canvas)
    if (!tex) {
      tex = new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) })
      this.pieces.set(canvas, tex)
    }
    return tex
  }

  // What shows of a layer: its pixels when they land one per texel, else its raster.
  private shown(l: Layer, canvas: HTMLCanvasElement) {
    return canvas !== l.canvas || exact(l) ? canvas : raster(l).canvas
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

  // A stroke on a layer's pixels, or on its mask.
  stroke(id: string, canvas: HTMLCanvasElement | null, mask = false) {
    this.live = canvas && { id, canvas, rev: 0, mask }
  }

  // The stroke's canvas changed.
  touch() {
    if (!this.live) return
    this.live.rev++
    this.pieces.get(this.live.canvas)?.source.update()
  }

  private liveMask(l: Layer) {
    return this.live?.id === l.id && this.live.mask ? this.live : null
  }

  // The layer alone, as it lands in the texture.
  layer(l: Layer, layout: Layout | null): RenderTexture {
    const live = this.live?.id === l.id ? this.live : null
    const canvas = live && !live.mask ? live.canvas : l.canvas
    const size = this.target.width
    const mask = this.liveMask(l)?.canvas ?? l.mask
    const sig = [canvas && idOf(canvas), l.color, mask && idOf(mask), live?.rev, l.x, l.y, l.scaleX, l.scaleY, l.turns, l.flipX, l.flipY, l.island, size, layout && idOf(layout), this.wrap.x, this.wrap.y, JSON.stringify(l.grunge), JSON.stringify(l.blur), JSON.stringify(l.outline), JSON.stringify(l.shadow), grunge.loaded].join()
    const entry = this.entry(l.id)
    if (entry.sig === sig) return entry.rt

    const scene = new Container()
    const pixels = new Container()
    if (l.color) pixels.addChild(new Graphics().rect(0, 0, size, size).fill(l.color))
    const shown = canvas && this.shown(l, canvas)
    for (const dx of shown ? (this.wrap.x ? [-size, 0, size] : [0]) : []) {
      for (const dy of this.wrap.y ? [-size, 0, size] : [0]) {
        const sprite = new Sprite(this.piece(shown!))
        if (shown === canvas) place(sprite, l)
        else sprite.position.set(raster(l).x, raster(l).y)
        sprite.position.x += dx
        sprite.position.y += dy
        pixels.addChild(sprite)
      }
    }
    scene.addChild(pixels)
    if (l.island !== null && layout) {
      const mask = new Graphics()
      eachFace(layout, l.island, (p) => {
        mask.poly(p.map((c) => c * size))
      })
      mask.fill(0xffffff)
      scene.addChild(mask)
      pixels.mask = mask
    }
    this.renderer.render({ container: scene, target: entry.rt, clear: true, clearColor: [0, 0, 0, 0] })
    scene.destroy({ children: true })
    // Blur before the masks, so they still cut sharp.
    if (l.blur) this.blurPass.draw(entry.rt, l.blur.x, l.blur.y, this.wrap)
    this.applyMask(l, entry.rt)
    if (l.outline || l.shadow) this.effectsPass.draw(entry.rt, l, l.island !== null && layout ? this.mask(l.island, layout) : null, this.wrap)
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
    this.applyMask(l, entry.rt)
    return entry.rt
  }

  // Cuts the layer's texture to its grunge mask and its painted mask.
  private applyMask(l: Layer, rt: RenderTexture) {
    const live = this.liveMask(l)
    const painted = live?.canvas ?? l.mask
    const paintedErase = painted && hidden(painted, !!live)
    if (paintedErase && live) this.piece(paintedErase).source.update()
    for (const erase of [l.grunge && eraser(l.grunge, rt.width), paintedErase]) {
      if (!erase) continue
      // Pixi ignores the blend mode of the container it renders, so the sprite goes in one.
      const scene = new Container()
      const sprite = new Sprite(this.piece(erase))
      sprite.blendMode = 'erase'
      scene.addChild(sprite)
      this.renderer.render({ container: scene, target: rt, clear: false })
      scene.destroy({ children: true })
    }
  }

  // What the layer's texture was last drawn from; empty for adjustments, which redraw each time.
  sigOf(id: string) {
    return this.layers.get(id)?.sig ?? ''
  }

  // A small picture of the layer as it last landed: pieces cropped to their rectangle.
  thumb(l: Layer, px: number): HTMLCanvasElement | null {
    const entry = this.layers.get(l.id)
    if (!entry || l.adjust) return null
    const size = this.target.width
    let [x, y, w, h] = [0, 0, size, size]
    if (l.canvas) {
      const b = box(l)
      x = Math.max(0, Math.floor(b.x))
      y = Math.max(0, Math.floor(b.y))
      w = Math.min(size, Math.ceil(b.x + b.w)) - x
      h = Math.min(size, Math.ceil(b.y + b.h)) - y
      if (w <= 0 || h <= 0) [x, y, w, h] = [0, 0, size, size]
    }
    const f = px / Math.max(w, h)
    const out = document.createElement('canvas')
    out.width = out.height = px
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingEnabled = f < 1
    ctx.drawImage(this.canvas(entry.rt), x, y, w, h, (px - w * f) / 2, (px - h * f) / 2, w * f, h * f)
    return out
  }

  // Drops the textures of layers that are gone, and of pieces only undo still holds.
  private prune(layers: Layer[]) {
    const ids = new Set(layers.map((l) => l.id))
    for (const [id, entry] of this.layers) {
      if (ids.has(id)) continue
      entry.rt.destroy(true)
      this.layers.delete(id)
    }

    const used = new Set(layers.filter((l) => l.canvas).map((l) => this.shown(l, l.canvas!)))
    for (const l of layers) {
      const erase = l.grunge && eraser(l.grunge, this.target.width)
      if (erase) used.add(erase)
      if (l.mask) used.add(hidden(l.mask, false))
    }
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
    if (x < 0 || y < 0 || x >= width || y >= width) return null
    const o = (y * width + x) * 4
    const a = pixels[o + 3]
    if (!a) return null
    const c = [0, 1, 2].map((i) => Math.min(255, Math.round((pixels[o + i] * 255) / a)))
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
  }

  // The given layers laid together, as a canvas at texture size, finished if asked.
  flatten(layers: Layer[], layout: Layout | null, finish?: Finish): HTMLCanvasElement {
    const rt = this.texture(this.target.width)
    this.render(layers, layout, rt)
    if (finish) {
      const done = this.texture(rt.width)
      this.finishPass.draw(rt, finish, done)
      rt.destroy(true)
      const canvas = this.canvas(done)
      done.destroy(true)
      return canvas
    }
    const canvas = this.canvas(rt)
    rt.destroy(true)
    return canvas
  }

  finish(source: RenderTexture, f: Finish, target: RenderTexture) {
    this.finishPass.draw(source, f, target)
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

// A painted mask turned around for the erase blend: opaque where the layer hides.
// Masks being painted change in place, so theirs is redrawn each time.
const hiddens = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()
function hidden(mask: HTMLCanvasElement, live: boolean) {
  let out = hiddens.get(mask)
  if (out && !live) return out
  if (!out) {
    out = document.createElement('canvas')
    out.width = mask.width
    out.height = mask.height
    hiddens.set(mask, out)
  }
  const ctx = out.getContext('2d')!
  ctx.globalCompositeOperation = 'copy'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(mask, 0, 0)
  return out
}

// Pieces and layouts are replaced, never changed, so identity tells them apart.
const objectIds = new WeakMap<object, number>()
let nextId = 0
function idOf(o: object) {
  if (!objectIds.has(o)) objectIds.set(o, nextId++)
  return objectIds.get(o)
}

// Whether a texel point hits an opaque pixel of the layer.
export function hits(l: Layer, x: number, y: number): boolean {
  const canvas = l.canvas
  if (!canvas) return false
  const p = matrix(l).inverse().transformPoint({ x, y })
  const px = Math.floor(p.x)
  const py = Math.floor(p.y)
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false
  return canvas.getContext('2d')!.getImageData(px, py, 1, 1).data[3] > 0
}
