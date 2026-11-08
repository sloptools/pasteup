import * as THREE from 'three'

// From texxer's TrackpadControls, without light and ortho views.

type Pick = (x: number, y: number) => THREE.Vector3 | undefined

// Gesture events are WebKit only, so WKWebView has them but the DOM types don't.
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }

const orbitSpeed = 0.006
const dragSpeed = 0.008
const maxPitch = Math.PI / 2 - 0.01
const fov = 35

// Trackpad first: two fingers orbit, shift pans, pinch zooms towards the cursor.
// Dragging orbits too, for a mouse; the right or middle button pans.
export class Orbit {
  target = new THREE.Vector3()
  yaw = 0.8
  pitch = 0.35
  dist = 3

  private goal = { target: new THREE.Vector3(), yaw: 0.8, pitch: 0.35, dist: 3 }
  private radius = 1
  // The model's bounding sphere center; clip planes hug the sphere, wherever the target went.
  private center = new THREE.Vector3()
  private gestureScale = 1
  private drag: { x: number; y: number; moved: boolean; mode: 'orbit' | 'pan' } | undefined
  private cleanup: () => void

  constructor(
    private camera: THREE.PerspectiveCamera,
    private el: HTMLElement,
    private pick: Pick,
  ) {
    const opts = { passive: false }
    const listen = (type: string, fn: (e: any) => void) => {
      el.addEventListener(type, fn, opts)
      return () => el.removeEventListener(type, fn)
    }
    const offs = [
      listen('wheel', (e: WheelEvent) => this.wheel(e)),
      listen('gesturestart', (e: GestureEvent) => {
        e.preventDefault()
        this.gestureScale = 1
      }),
      listen('gesturechange', (e: GestureEvent) => {
        e.preventDefault()
        this.zoomAt(e.clientX, e.clientY, this.gestureScale / e.scale)
        this.gestureScale = e.scale
      }),
      listen('gestureend', (e: GestureEvent) => e.preventDefault()),
      listen('pointerdown', (e: PointerEvent) => this.down(e)),
      listen('pointermove', (e: PointerEvent) => this.move(e)),
      listen('pointerup', () => (this.drag = undefined)),
      listen('contextmenu', (e: MouseEvent) => e.preventDefault()),
    ]
    this.cleanup = () => offs.forEach((off) => off())
  }

  private wheel(e: WheelEvent) {
    e.preventDefault()
    const scale = e.deltaMode === 1 ? 16 : 1
    const dx = e.deltaX * scale
    const dy = e.deltaY * scale
    if (e.ctrlKey) this.zoomAt(e.clientX, e.clientY, Math.exp(dy * 0.01))
    else if (e.shiftKey) this.pan(dx, dy)
    else this.orbit(dx * orbitSpeed, dy * orbitSpeed)
  }

  private down(e: PointerEvent) {
    if (e.button > 2) return
    this.el.setPointerCapture(e.pointerId)
    const mode = e.shiftKey || e.button === 1 || e.button === 2 ? 'pan' : 'orbit'
    this.drag = { x: e.clientX, y: e.clientY, moved: false, mode }
  }

  private move(e: PointerEvent) {
    const d = this.drag
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    if (d.mode === 'pan') this.pan(-dx, -dy)
    else this.orbit(-dx * dragSpeed, -dy * dragSpeed)
  }

  orbit(dYaw: number, dPitch: number) {
    this.goal.yaw += dYaw
    this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch - dPitch, -maxPitch, maxPitch)
  }

  pan(dx: number, dy: number) {
    const perPixel = (2 * this.goal.dist * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / this.el.clientHeight
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1)
    this.goal.target.addScaledVector(right, dx * perPixel).addScaledVector(up, -dy * perPixel)
  }

  // Zooms so the point under the cursor stays put.
  zoomAt(x: number, y: number, factor: number) {
    const dist = THREE.MathUtils.clamp(this.goal.dist * factor, this.radius * 0.05, this.radius * 30)
    const hit = this.pick(x, y)
    if (hit) this.goal.target.lerp(hit, 1 - dist / this.goal.dist)
    this.goal.dist = dist
  }

  frame(box: THREE.Box3) {
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    this.radius = Math.max(sphere.radius, 1e-3)
    this.center.copy(sphere.center)
    this.goal.target.copy(sphere.center)
    // The narrower of the two lens angles, so a tall view fits the model across too.
    const half = THREE.MathUtils.degToRad(fov / 2)
    const across = Math.atan(Math.tan(half) * this.camera.aspect)
    this.goal.dist = (this.radius / Math.sin(Math.min(half, across))) * 1.1
  }

  // Snaps to the goal on the first frame, then eases towards it; true while moving.
  update(dt: number, snap = false): boolean {
    const k = snap ? 1 : 1 - Math.exp(-dt * 22)
    const before = this.yaw + this.pitch + this.dist + this.target.x + this.target.y + this.target.z
    this.yaw += (this.goal.yaw - this.yaw) * k
    this.pitch += (this.goal.pitch - this.pitch) * k
    this.dist += (this.goal.dist - this.dist) * k
    this.target.lerp(this.goal.target, k)

    const c = Math.cos(this.pitch)
    this.camera.position.set(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c).multiplyScalar(this.dist).add(this.target)
    this.camera.lookAt(this.target)

    const toModel = this.camera.position.distanceTo(this.center)
    this.camera.near = Math.max(this.radius / 200, toModel - this.radius * 3)
    this.camera.far = toModel + this.radius * 200
    this.camera.updateProjectionMatrix()
    const after = this.yaw + this.pitch + this.dist + this.target.x + this.target.y + this.target.z
    return Math.abs(after - before) > 1e-6
  }

  dispose() {
    this.cleanup()
  }
}
