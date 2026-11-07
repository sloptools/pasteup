import { Application, Container } from 'pixi.js'

type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }

// Space held turns any drag into a pan.
let space = false
addEventListener('keydown', (e) => {
  if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) space = true
})
addEventListener('keyup', (e) => {
  if (e.key === ' ') space = false
})
addEventListener('blur', () => (space = false))

// A Pixi app that renders on demand, with a world to pan (two fingers, space drag,
// middle drag) and zoom (pinch, ctrl wheel) about the cursor.
export class View {
  pixi = new Application()
  world = new Container()
  zoom = 1
  onZoom = () => {}
  private frame = 0

  constructor(
    private el: HTMLElement,
    private range: [number, number],
  ) {}

  async init() {
    await this.pixi.init({
      resizeTo: this.el,
      background: '#131312',
      antialias: false,
      autoStart: false,
      resolution: devicePixelRatio,
      autoDensity: true,
      preference: 'webgl',
    })
    this.pixi.stage.addChild(this.world)
    this.el.appendChild(this.pixi.canvas)
    this.listen()
    new ResizeObserver(() => {
      this.pixi.resize()
      this.draw()
    }).observe(this.el)
  }

  draw() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.pixi.render()
    })
  }

  toWorld(clientX: number, clientY: number): [number, number] {
    const r = this.el.getBoundingClientRect()
    return [(clientX - r.left - this.world.x) / this.zoom, (clientY - r.top - this.world.y) / this.zoom]
  }

  // Shows the world rect w × h whole, centered.
  fit(x: number, y: number, w: number, h: number, pad = 40) {
    const r = this.el.getBoundingClientRect()
    const z = Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h)
    this.setZoom(Math.min(Math.max(z, this.range[0]), this.range[1]))
    this.world.position.set(r.width / 2 - (x + w / 2) * this.zoom, r.height / 2 - (y + h / 2) * this.zoom)
    this.draw()
  }

  zoomAt(clientX: number, clientY: number, factor: number) {
    const r = this.el.getBoundingClientRect()
    const sx = clientX - r.left
    const sy = clientY - r.top
    const [wx, wy] = this.toWorld(clientX, clientY)
    this.setZoom(Math.min(Math.max(this.zoom * factor, this.range[0]), this.range[1]))
    this.world.position.set(sx - wx * this.zoom, sy - wy * this.zoom)
    this.draw()
  }

  private setZoom(z: number) {
    this.zoom = z
    this.world.scale.set(z)
    this.onZoom()
  }

  // True while a drag pans, so tools leave it alone.
  panning = false

  private listen() {
    const el = this.el
    let gesture = 0

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        if (e.ctrlKey) {
          if (!gesture) this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
          return
        }
        this.world.x -= e.deltaX
        this.world.y -= e.deltaY
        this.draw()
      },
      { passive: false },
    )

    el.addEventListener('gesturestart', (e) => {
      e.preventDefault()
      gesture = (e as GestureEvent).scale
    })
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault()
      const g = e as GestureEvent
      this.zoomAt(g.clientX, g.clientY, g.scale / gesture)
      gesture = g.scale
    })
    el.addEventListener('gestureend', () => (gesture = 0))

    let last: [number, number] | null = null
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 1 && !(e.button === 0 && space)) return
      this.panning = true
      last = [e.clientX, e.clientY]
      el.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (!last) return
      this.world.x += e.clientX - last[0]
      this.world.y += e.clientY - last[1]
      last = [e.clientX, e.clientY]
      this.draw()
    })
    const end = () => {
      last = null
      this.panning = false
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }
}
