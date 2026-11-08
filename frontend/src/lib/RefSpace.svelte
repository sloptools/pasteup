<script lang="ts">
  import { onMount } from 'svelte'
  import { Container, Graphics, ImageSource, Sprite, Texture } from 'pixi.js'
  import { View } from './view'
  import ContextMenu, { type Item } from './ContextMenu.svelte'
  import { cutout, deskew, type Corner, type Quad } from './deskew'
  import { addFiles, addPaths, photoLevels } from './photos'
  import { addLayer, app, say, type Photo } from './state.svelte'
  import { OpenPhotos } from '../../wailsjs/go/main/App'

  let el: HTMLDivElement
  let view: View
  let ready = $state(false)
  let zoom = $state(1)
  let selected = $state<string | null>(null)
  let cut = $state<{ photo: string; quad: Quad } | null>(null)
  // Lines to the corners a dragged corner snapped to, in photo pixels.
  let guides = $state<number[][]>([])
  let menu = $state<{ x: number; y: number; items: Item[] } | null>(null)
  let picker: HTMLInputElement
  let pickAt: [number, number] = [0, 0]

  const photos = new Container()
  const marks = new Graphics()
  const sprites = new Map<string, Sprite>()

  onMount(() => {
    view = new View(el, [0.02, 16])
    view.onZoom = () => (zoom = view.zoom)
    view.init().then(() => {
      view.world.addChild(photos, marks)
      listen()
      ready = true
      fit()
    })
    return () => view.destroy()
  })

  export function fit() {
    if (!view) return
    if (!app.photos.length) return view.fit(-400, -300, 800, 600)
    const x0 = Math.min(...app.photos.map((p) => p.x))
    const y0 = Math.min(...app.photos.map((p) => p.y))
    const x1 = Math.max(...app.photos.map((p) => p.x + p.img.naturalWidth))
    const y1 = Math.max(...app.photos.map((p) => p.y + p.img.naturalHeight))
    view.fit(x0, y0, x1 - x0, y1 - y0)
  }

  export function toWorld(clientX: number, clientY: number): [number, number] {
    return view.toWorld(clientX, clientY)
  }

  export function contains(x: number, y: number): boolean {
    const r = el.getBoundingClientRect()
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom
  }

  // Keys while the ref space has focus; true when handled.
  export function key(e: KeyboardEvent): boolean {
    switch (e.key) {
      case 'Enter':
        if (!cut) return false
        makeLayer()
        return true
      case 'Escape':
        if (!cut) return false
        cut = null
        return true
      case 'Backspace':
      case 'Delete':
        if (app.refTool !== 'move' || !selected) return false
        removePhoto(selected)
        return true
    }
    return false
  }

  $effect(() => {
    if (!ready) return
    const ids = new Set(app.photos.map((p) => p.id))
    for (const [id, s] of sprites) {
      if (!ids.has(id)) {
        s.destroy()
        sprites.delete(id)
      }
    }
    for (const p of app.photos) {
      let s = sprites.get(p.id)
      if (!s) {
        s = new Sprite(new Texture({ source: new ImageSource({ resource: p.img, autoGenerateMipmaps: true }) }))
        sprites.set(p.id, s)
        photos.addChild(s)
      }
      s.position.set(p.x, p.y)
    }
    view.draw()
  })

  $effect(() => {
    if (!ready) return
    marks.clear()
    const z = zoom
    const sel = app.photos.find((p) => p.id === selected)
    if (sel && app.refTool === 'move') {
      marks.rect(sel.x, sel.y, sel.img.naturalWidth, sel.img.naturalHeight)
      marks.stroke({ width: 1, color: 0x7fc4af, pixelLine: true })
    }
    const p = cut && app.photos.find((p) => p.id === cut!.photo)
    if (cut && p) {
      const q = cut.quad.map(([x, y]) => [x + p.x, y + p.y])
      marks.poly(q.flat())
      marks.stroke({ width: 1, color: 0xffb020, pixelLine: true })
      const h = 4 / z
      for (const [x, y] of q) marks.rect(x - h, y - h, h * 2, h * 2)
      marks.fill(0xffb020)
      for (const [x0, y0, x1, y1] of guides) marks.moveTo(x0 + p.x, y0 + p.y).lineTo(x1 + p.x, y1 + p.y)
      if (guides.length) marks.stroke({ width: 1, color: 0x7fc4af, pixelLine: true })
    }
    view.draw()
  })

  function photoAt(x: number, y: number): Photo | undefined {
    return app.photos.findLast((p) => x >= p.x && y >= p.y && x < p.x + p.img.naturalWidth && y < p.y + p.img.naturalHeight)
  }

  function cornerAt(x: number, y: number): number {
    const p = cut && app.photos.find((p) => p.id === cut!.photo)
    if (!cut || !p) return -1
    const r = 8 / view.zoom
    return cut.quad.findIndex(([cx, cy]) => Math.hypot(cx + p.x - x, cy + p.y - y) < r)
  }

  function makeLayer() {
    const p = cut && app.photos.find((p) => p.id === cut!.photo)
    if (!cut || !p) return
    const quad = $state.snapshot(cut.quad) as Quad
    const canvas = app.deskew ? deskew(photoLevels(p), quad) : cutout(p.img, quad)
    const scale = app.size / 2 / Math.max(canvas.width, canvas.height)
    addLayer({
      name: `${p.name.replace(/\.\w+$/, '')} ${app.layers.length + 1}`,
      canvas,
      x: app.size / 2,
      y: app.size / 2,
      scaleX: scale,
      scaleY: scale,
      turns: 0,
      flipX: false,
      flipY: false,
      island: null,
    })
    cut = null
    say(`piece ${canvas.width}×${canvas.height} placed`)
  }

  function listen() {
    type Drag =
      | { kind: 'photo'; photo: Photo; from: Corner; at: Corner }
      | { kind: 'rect'; photo: Photo; from: Corner }
      | { kind: 'corner'; photo: Photo; index: number }
    let drag: Drag | null = null

    el.addEventListener('pointerenter', () => (app.focus = 'refs'))
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      openMenu(e)
    })

    el.addEventListener('pointerdown', (e) => {
      app.focus = 'refs'
      if (view.panning || e.button !== 0) return
      const [x, y] = view.toWorld(e.clientX, e.clientY)

      if (app.refTool === 'cut') {
        const corner = cornerAt(x, y)
        const current = cut && app.photos.find((p) => p.id === cut!.photo)
        if (corner >= 0 && current) drag = { kind: 'corner', photo: current, index: corner }
        else {
          const photo = photoAt(x, y)
          if (!photo) return
          drag = { kind: 'rect', photo, from: [x - photo.x, y - photo.y] }
          cut = null
        }
      } else {
        const photo = photoAt(x, y)
        selected = photo?.id ?? null
        if (!photo) return
        drag = { kind: 'photo', photo, from: [x, y], at: [photo.x, photo.y] }
      }
      el.setPointerCapture(e.pointerId)
    })

    el.addEventListener('pointermove', (e) => {
      if (!drag) return
      const [x, y] = view.toWorld(e.clientX, e.clientY)
      const p = drag.photo
      const clamp = (px: number, py: number): Corner => [
        Math.min(Math.max(px - p.x, 0), p.img.naturalWidth),
        Math.min(Math.max(py - p.y, 0), p.img.naturalHeight),
      ]

      if (drag.kind === 'photo') {
        p.x = Math.round(drag.at[0] + x - drag.from[0])
        p.y = Math.round(drag.at[1] + y - drag.from[1])
      } else if (drag.kind === 'rect') {
        const [ax, ay] = drag.from
        let [bx, by] = clamp(x, y)
        if (e.shiftKey) {
          const side = Math.min(Math.abs(bx - ax), Math.abs(by - ay))
          bx = ax + Math.sign(bx - ax) * side
          by = ay + Math.sign(by - ay) * side
        }
        cut = { photo: p.id, quad: [[ax, ay], [bx, ay], [bx, by], [ax, by]] }
      } else if (cut) {
        moveCorner(drag.index, [x - p.x, y - p.y], e.altKey, p)
      }
    })

    const end = () => {
      guides = []
      if (drag?.kind === 'rect' && cut) {
        const [[ax, ay], , [bx, by]] = cut.quad
        if (Math.abs(bx - ax) < 4 || Math.abs(by - ay) < 4) cut = null
        else normalize()
      }
      drag = null
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)

    // Dropped files in a browser; the app gets them from Wails instead.
    el.addEventListener('dragover', (e) => e.preventDefault())
    el.addEventListener('drop', (e) => {
      e.preventDefault()
      const files = [...(e.dataTransfer?.files ?? [])]
      addFiles(files, view.toWorld(e.clientX, e.clientY))
    })
  }

  // Snaps the corner level or plumb with another corner, or mirrored to its
  // partner on the same edge about the opposite edge's middle. Alt turns it off.
  function moveCorner(index: number, to: Corner, free: boolean, p: Photo) {
    if (!cut) return
    const others = cut.quad.filter((_, i) => i !== index)
    const partner = cut.quad[[1, 0, 3, 2][index]]
    const across = [[3, 2], [2, 3], [1, 0], [0, 1]][index].map((i) => cut!.quad[i])
    const mid = (across[0][0] + across[1][0]) / 2
    const mirror = across[0][0] + across[1][0] - partner[0]

    const reach = 6 / view.zoom
    const near = (v: number, options: number[]) =>
      options.reduce<number | null>((best, o) => (Math.abs(o - v) < reach && (best === null || Math.abs(o - v) < Math.abs(best - v)) ? o : best), null)

    let [x, y] = to
    guides = []
    if (!free) {
      const sx = near(x, [...others.map((c) => c[0]), mirror])
      const sy = near(y, others.map((c) => c[1]))
      if (sx !== null) {
        x = sx
        if (sx === mirror && !others.some((c) => c[0] === sx)) guides.push([mid, Math.min(to[1], ...across.map((c) => c[1])), mid, Math.max(to[1], ...across.map((c) => c[1]))])
      }
      if (sy !== null) y = sy
      for (const c of others) {
        if (sx !== null && c[0] === x) guides.push([x, y, c[0], c[1]])
        if (sy !== null && c[1] === y) guides.push([x, y, c[0], c[1]])
      }
    }
    cut.quad[index] = [Math.min(Math.max(x, 0), p.img.naturalWidth), Math.min(Math.max(y, 0), p.img.naturalHeight)]
  }

  function openMenu(e: MouseEvent) {
    const [x, y] = view.toWorld(e.clientX, e.clientY)
    const photo = photoAt(x, y)
    const items: Item[] = [{ label: 'open images…', action: () => openPhotos([x, y]) }]
    if (photo) items.push({ label: 'remove image', danger: true, action: () => removePhoto(photo.id) })
    menu = { x: e.clientX, y: e.clientY, items }
  }

  async function openPhotos(at: [number, number]) {
    if (!('go' in window)) {
      pickAt = at
      picker.click()
      return
    }
    const paths = await OpenPhotos()
    if (paths?.length) addPaths(paths, at)
  }

  function removePhoto(id: string) {
    app.photos = app.photos.filter((p) => p.id !== id)
    if (selected === id) selected = null
    if (cut?.photo === id) cut = null
  }

  // Keeps the corners in order after a rect dragged up or left.
  function normalize() {
    if (!cut) return
    const xs = cut.quad.map((c) => c[0])
    const ys = cut.quad.map((c) => c[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    cut.quad = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  }
</script>

<div class="refs" class:cut={app.refTool === 'cut'} bind:this={el}>
  {#if !app.photos.length}
    <div class="empty">
      <button class="text-button" onclick={() => openPhotos([0, 0])}>open photos…</button>
      <span>or drop them here</span>
    </div>
  {/if}
  {#if cut}
    <div class="hint mono">
      corners snap level and mirrored · <kbd>Alt</kbd> free · <kbd>Enter</kbd> place · <kbd>Esc</kbd> drop
    </div>
  {/if}
</div>

{#if menu}
  <ContextMenu {...menu} onclose={() => (menu = null)} />
{/if}

<input
  class="picker"
  type="file"
  accept="image/png,image/jpeg,image/webp"
  multiple
  bind:this={picker}
  onchange={() => {
    addFiles([...(picker.files ?? [])], pickAt)
    picker.value = ''
  }}
/>

<style>
  .refs {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .refs.cut {
    cursor: crosshair;
  }
  .refs :global(canvas) {
    display: block;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--dim);
    pointer-events: none;
  }
  .empty button {
    pointer-events: auto;
  }
  .picker {
    display: none;
  }
  .hint {
    position: absolute;
    left: 10px;
    bottom: 8px;
    font: 11px var(--mono);
    color: var(--dim);
    pointer-events: none;
  }
</style>
