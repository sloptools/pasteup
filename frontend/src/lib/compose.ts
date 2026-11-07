import { CanvasSource, Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { eachFace } from './uv'
import type { Layer, Layout } from './state.svelte'

// Lays the layers into the texture, bottom first, each clipped to its island.
export class Composer {
  target: RenderTexture
  private scene = new Container()
  private pieces = new Map<HTMLCanvasElement, Texture>()

  constructor(
    private renderer: Renderer,
    size: number,
  ) {
    this.target = RenderTexture.create({ width: size, height: size, scaleMode: 'nearest' })
  }

  resize(size: number) {
    if (this.target.width !== size) this.target.resize(size, size)
  }

  piece(canvas: HTMLCanvasElement): Texture {
    let tex = this.pieces.get(canvas)
    if (!tex) {
      tex = new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) })
      this.pieces.set(canvas, tex)
    }
    return tex
  }

  render(layers: Layer[], layout: Layout | null) {
    const size = this.target.width
    for (const c of this.scene.removeChildren()) c.destroy({ children: true })

    for (const l of layers) {
      if (!l.visible) continue
      const sprite = new Sprite(this.piece(l.canvas))
      place(sprite, l)

      if (l.island === null || !layout) {
        this.scene.addChild(sprite)
        continue
      }
      const mask = new Graphics()
      eachFace(layout, l.island, (p) => {
        mask.poly(p.map((c) => c * size))
      })
      mask.fill(0xffffff)
      const clipped = new Container()
      clipped.addChild(sprite, mask)
      sprite.mask = mask
      this.scene.addChild(clipped)
    }

    this.renderer.render({ container: this.scene, target: this.target, clear: true, clearColor: [0, 0, 0, 0] })
  }

  png(): string {
    const canvas = this.renderer.extract.canvas(this.target) as HTMLCanvasElement
    return canvas.toDataURL('image/png').split(',')[1]
  }
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
