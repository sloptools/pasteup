<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js'
  import { composed, gray, grayOf, present } from './channels'
  import { autoPalette } from './palette'
  import { View } from './view'
  import { Composer, hits } from './compose'
  import { settle, box, cover, cursors, fit as fitBox, handleAt, handles, hit, matrix, place, resize, type Box, type Handle } from './transform'
  import { edges, eachFace, islandAt, islandBox, islandMask } from './uv'
  import { activeLayer, app, colorTools, finishing, masking, paletteColors, say, wraps, type Channel, type ColorTool, type PaintTool } from './state.svelte'
  import { bridge } from './bridge.svelte'
  import { addMask, mergeDown, newLayer } from './layerOps'
  import { footprint, Stroke } from './paint'
  import { ellipse, flood, rect } from './shapes'
  import { gradient, rgba } from './gradient'
  import { aim, end, grab, gradientControl, Handles, type Aim, type Part } from './gradientEdit'
  import { checkpoint } from './history.svelte'
  import { Marquee } from './marquee'
  import { combine, selection, type Combine } from './selection'
  import { place as clipPlace, useComposer } from './clipboard'
  import { refreshThumbs } from './thumbs.svelte'
  import { newText } from './text'
  import TextEdit from './TextEdit.svelte'

  let el: HTMLDivElement
  let view: View
  let composer: Composer
  let ready = $state(false)
  let hover = $state<[number, number] | null>(null)
  let hoverIsland = $state<number | null>(null)

  const checker = new Graphics()
  let texture: Sprite
  let finished: RenderTexture | null = null
  const onionSprite = new Sprite()
  let onionTarget: RenderTexture | null = null
  // The texture again around itself, in tile mode.
  const neighbors = new Container()
  const uvLines = new Graphics()
  const islandMark = new Graphics()
  const frame = new Graphics()
  const cloneMark = new Graphics()
  const tip = new Graphics()
  const grips = new Graphics()
  let zoom = $state(1)
  const marquee = new Marquee()
  let stopAnts = () => {}

  const painting = $derived(colorTools.includes(app.canvasTool))
  const brushing = $derived(app.canvasTool === 'brush' || app.canvasTool === 'eraser' || app.canvasTool === 'clone')
  // Where a shape or gradient drag started.
  let dragFrom: [number, number] | null = null
  let dragRight = false
  let stroke: { layer: string; paint: Stroke; mask: boolean } | null = null
  // Where the last stroke ended, for Shift-click lines.
  let last: [number, number] | null = null

  onMount(() => {
    view = new View(el, [0.25, 64])
    view.init().then(() => {
      composer = new Composer(view.pixi.renderer, app.size)
      texture = new Sprite(composer.target)
      view.world.addChild(checker, neighbors, texture, onionSprite, uvLines, islandMark, frame, marquee.node, grips, ends.node, tip, cloneMark)
      gradientControl.apply = applyGradient
      gradientControl.cancel = cancelGradient
      view.onZoom = () => (zoom = view.zoom)
      zoom = view.zoom
      useComposer(composer)
      listen()
      const ants = setInterval(() => {
        if (!app.selection) return
        marquee.tick()
        view.draw()
      }, 300)
      stopAnts = () => clearInterval(ants)
      if (import.meta.env.DEV) Object.assign(window, { composer, canvasView: view, pngs })
      ready = true
      fit()
    })
    return () => {
      stopAnts()
      view.destroy()
    }
  })

  export function fit() {
    view?.fit(0, 0, app.size, app.size)
  }

  const finishSettings = () => ({ colors: paletteColors(), dither: app.finish.dither, sharpen: app.finish.sharpen, psx: app.finish.psx })

  // The auto palette follows the color once edits rest; set again only when it changed.
  let paletteTimer = 0
  function schedulePalette() {
    if (app.finish.mode !== 'auto') return
    void app.finish.colors
    clearTimeout(paletteTimer)
    paletteTimer = window.setTimeout(() => {
      const colors = autoPalette(composer.flatten(composed('color'), app.layout), app.finish.colors, $state.snapshot(app.autoPalette))
      if (colors.join() !== app.autoPalette.join()) app.autoPalette = colors
    }, 400)
  }

  // Every channel as it is written, color with the AO multiplied in unless it is kept apart.
  export function flats(): Partial<Record<Channel, HTMLCanvasElement>> {
    const out: Partial<Record<Channel, HTMLCanvasElement>> = {}
    const ao = present().includes('ao') ? composer.flatten(composed('ao'), app.layout) : null
    for (const ch of present()) {
      if (ch === 'ao' && app.bakeAO) continue
      const layers = composed(ch)
      if (ch === 'color' && ao && app.bakeAO) layers.push({ name: 'ao', ...aoLayer(ao) })
      out[ch] = ch === 'ao' && ao ? ao : composer.flatten(layers, app.layout, ch === 'color' && finishing() ? finishSettings() : undefined)
    }
    return out
  }

  export function pngs(): Partial<Record<Channel, string>> {
    return Object.fromEntries(Object.entries(flats()).map(([ch, c]) => [ch, c.toDataURL('image/png').split(',')[1]]))
  }

  // The AO channel as a layer multiplied over the color.
  function aoLayer(ao: HTMLCanvasElement) {
    return { id: 'bake:ao', canvas: ao, color: null, adjust: null, grunge: null, mask: null, blur: null, outline: null, shadow: null, text: null, blend: 'multiply' as const, opacity: 1, visible: true, clip: false, island: null, x: app.size / 2, y: app.size / 2, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false }
  }

  export function merge() {
    mergeDown(composer)
  }

  $effect(() => {
    if (!ready) return
    const size = app.size
    current()
    // Only the size: the selection changing must not fit the view again.
    untrack(() => {
      if (app.selection && app.selection.size !== size) app.selection = null
    })
    fit()
  })

  // Checker and neighbors over every copy tile mode shows.
  $effect(() => {
    if (!ready) return
    const size = app.size
    const wrap = wraps(app.tile)
    current()
    checker.clear()
    neighbors.removeChildren().forEach((n) => n.destroy())
    const cell = size / 16
    for (const ox of wrap.x ? [-1, 0, 1] : [0]) {
      for (const oy of wrap.y ? [-1, 0, 1] : [0]) {
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) checker.rect(ox * size + x * cell, oy * size + y * cell, cell, cell).fill((x + y) % 2 ? 0x1f1f1d : 0x252522)
        }
        if (!ox && !oy) continue
        const copy = new Sprite(composer.target)
        copy.position.set(ox * size, oy * size)
        neighbors.addChild(copy)
      }
    }
    view.draw()
  })

  // F: the active piece covers the island under the cursor and keeps to it.
  export function fitIsland() {
    const l = activeLayer()
    if (!['move', 'transform', 'island'].includes(app.canvasTool) || !l?.canvas) return false
    if (!app.layout || hoverIsland === null) {
      say('f fits the layer to the island under the cursor')
      return true
    }
    checkpoint()
    cover(l, islandBox(app.layout, hoverIsland, app.size))
    l.island = hoverIsland
    return true
  }

  // Shifts the view by half the texture along the tiled axes, to bring a seam to the middle.
  export function offset() {
    const wrap = wraps(app.tile)
    if (!view || (!wrap.x && !wrap.y)) return
    if (wrap.x) view.world.x += (app.size / 2) * view.zoom
    if (wrap.y) view.world.y += (app.size / 2) * view.zoom
    view.draw()
  }

  $effect(() => {
    if (!ready) return
    const size = app.size
    uvLines.clear()
    if (!app.layout) return view.draw()
    // Island outlines matter for painting; the edges inside only faintly.
    const { outline, inside } = edges(app.layout)
    for (const [lines, alpha] of [[inside, 0.1], [outline, 0.8]] as const) {
      for (let i = 0; i < lines.length; i += 4) uvLines.moveTo(lines[i] * size, lines[i + 1] * size).lineTo(lines[i + 2] * size, lines[i + 3] * size)
      uvLines.stroke({ width: 1, color: 0xebe8df, alpha, pixelLine: true })
    }
    view.draw()
  })

  // The transform frame's handles, a constant size on screen.
  $effect(() => {
    if (!ready) return
    grips.clear()
    const l = activeLayer()
    if (app.canvasTool === 'transform' && l?.canvas) {
      const b = box(l)
      const r = 3 / zoom
      grips.rect(b.x, b.y, b.w, b.h).stroke({ width: 1, color: 0x7fc4af, pixelLine: true })
      for (const h of handles) {
        const [x, y] = handleAt(b, h)
        grips.rect(x - r, y - r, 2 * r, 2 * r)
      }
      grips.fill(0x131312).stroke({ width: 1 / zoom, color: 0x7fc4af })
    }
    view.draw()
  })

  $effect(() => {
    if (!ready) return
    marquee.show(app.selection)
    view.draw()
  })

  // Shift adds to the selection, Alt takes away; a click without a drag deselects.
  let combining: Combine = 'replace'

  function selectEnd() {
    if (!marquee.dragging) return
    const data = marquee.end(app.size)
    if (data) app.selection = selection(combine(app.selection, data, combining), app.size)
    else if (combining === 'replace') app.selection = null
    view.draw()
  }

  // The composite texture at the current size; a new size makes a new one.
  function current() {
    composer.resize(app.size)
    texture.texture = composer.target
  }

  function compose() {
    current()
    composer.wrap = wraps(app.tile)
    composer.render(composed(app.channel), app.layout)
    // The color shows finished, as it will be written.
    let shown = composer.target
    if (app.channel === 'color' && finishing()) {
      if (finished?.width !== app.size) {
        finished?.destroy(true)
        finished = RenderTexture.create({ width: app.size, height: app.size, scaleMode: 'nearest' })
      }
      composer.finish(composer.target, finishSettings(), finished)
      shown = finished
    }
    texture.texture = shown
    for (const n of neighbors.children as Sprite[]) n.texture = shown
    schedulePalette()
    // The onion: another channel faintly on top, as a reference.
    const onion = app.onion.channel
    onionSprite.visible = !!onion && onion !== app.channel
    if (onionSprite.visible) {
      if (onionTarget?.width !== app.size) {
        onionTarget?.destroy(true)
        onionTarget = RenderTexture.create({ width: app.size, height: app.size, scaleMode: 'nearest' })
        onionSprite.texture = onionTarget
      }
      composer.render(composed(onion!), app.layout, onionTarget)
      onionSprite.alpha = app.onion.opacity
    }
    refreshThumbs(composer)
    untrack(() => app.revision++)
    bridge.changed()
    view.draw()
  }

  // Every layer property the texture depends on.
  $effect(() => {
    if (!ready) return
    void app.size
    void app.tile
    // Not in the texture, but Blender takes it with it.
    void app.emissionStrength
    compose()
  })

  // The brush footprint under the cursor.
  $effect(() => {
    if (!ready) return
    tip.clear()
    if (brushing && hover) {
      const tool = app.canvasTool as PaintTool
      for (const [dy, dx, w] of footprint(app.tipSize[tool], app.tip[tool])) tip.rect(hover[0] + dx, hover[1] + dy, w, 1)
      tip.fill(tool === 'brush' ? { color: app.colors[0], alpha: 0.7 } : { color: 0xebe8df, alpha: 0.35 })
    }
    view.draw()
  })

  // The clone source under the brush: a cross here, or the spot in the photo for the refs.
  $effect(() => {
    if (!ready) return
    cloneMark.clear()
    const spot = app.canvasTool === 'clone' && hover ? cloneSource(hover) : null
    app.cloneSpot = app.clone?.photo ? spot : null
    if (spot && !app.clone?.photo) {
      const [x, y] = [spot[0] + 0.5, spot[1] + 0.5]
      const r = 6 / zoom
      cloneMark.moveTo(x - r, y).lineTo(x + r, y).moveTo(x, y - r).lineTo(x, y + r)
      cloneMark.stroke({ width: 1, color: 0xffb020, pixelLine: true })
    }
    view.draw()
  })

  $effect(() => {
    if (!ready) return
    frame.clear()
    const l = activeLayer()
    if (l?.canvas && app.canvasTool !== 'transform') {
      place(frame, l)
      frame.rect(-l.canvas.width / 2, -l.canvas.height / 2, l.canvas.width, l.canvas.height)
      frame.stroke({ width: 1, color: 0x7fc4af, pixelLine: true })
    }
    view.draw()
  })

  $effect(() => {
    if (!ready) return
    islandMark.clear()
    // The island tool marks the island under the cursor, and so do the color tools keeping to it.
    const tool = app.canvasTool
    const island = tool === 'island' || (painting && app.islandClip) ? hoverIsland : null
    if (app.layout && island !== null) {
      const size = app.size
      eachFace(app.layout, island, (p) => islandMark.poly(p.map((c) => c * size)))
      islandMark.fill({ color: 0xffb020, alpha: tool === 'island' ? 0.3 : 0.12 })
    }
    view.draw()
  })

  function texel(e: PointerEvent): [number, number] {
    return view.toWorld(e.clientX, e.clientY)
  }

  // The topmost visible layer under a texel point, clipped to its island.
  function pick([x, y]: [number, number]) {
    const island = app.layout ? islandAt(app.layout, x / app.size, y / app.size) : null
    const l = app.layers.findLast((l) => l.visible && (l.island === null || l.island === island) && hits(l, x, y))
    if (l) app.active = l.id
  }

  // A texel coordinate brought into the texture, for clicks on a neighbor in tile mode.
  function wrapped(c: number) {
    return app.tile === 'off' ? c : ((c % app.size) + app.size) % app.size
  }

  // Into the primary color, or the secondary with the right button.
  function pickColor(e: PointerEvent, x: number, y: number) {
    const color = composer.pick(wrapped(x), wrapped(y))
    if (color) app.colors[e.button === 2 ? 1 : 0] = color
    app.picking = false
  }

  // The clone source for texel p: the picked point until a stroke anchors it, then
  // at the same offset from p.
  function cloneSource(p: [number, number]): [number, number] | null {
    const c = app.clone
    if (!c) return null
    if (!c.anchor) return [c.x, c.y]
    const s = c.photo ? 1 / app.cloneScale : 1
    return [c.x + (p[0] - c.anchor[0]) * s, c.y + (p[1] - c.anchor[1]) * s]
  }

  // The colors a clone stroke lays down: the source moved onto the texels it paints.
  function clonePattern(x: number, y: number): HTMLCanvasElement | null {
    const c = app.clone
    if (!c) {
      say('⌥ click in the canvas or a photo to pick where to clone from')
      return null
    }
    const photo = c.photo && app.photos.find((p) => p.id === c.photo)
    if (c.photo && !photo) {
      app.clone = null
      say('the photo to clone from is gone')
      return null
    }
    c.anchor ??= [x, y]
    const size = app.size
    const out = document.createElement('canvas')
    out.width = out.height = size
    const ctx = out.getContext('2d')!
    if (photo) {
      const s = app.cloneScale
      if (gray(app.channel)) ctx.filter = 'grayscale(1)'
      ctx.imageSmoothingQuality = 'high'
      ctx.setTransform(s, 0, 0, s, c.anchor[0] + 0.5 - c.x * s, c.anchor[1] + 0.5 - c.y * s)
      ctx.drawImage(photo.img, 0, 0)
      return out
    }
    const merged = composer.canvas(composer.target)
    const wrap = wraps(app.tile)
    for (const dx of wrap.x ? [-size, 0, size] : [0]) {
      for (const dy of wrap.y ? [-size, 0, size] : [0]) ctx.drawImage(merged, c.anchor[0] - c.x + dx, c.anchor[1] - c.y + dy)
    }
    return out
  }

  function paintStart(e: PointerEvent, p: [number, number]) {
    const [x, y] = [Math.floor(p[0]), Math.floor(p[1])]
    const tool = app.canvasTool as ColorTool
    const brush = tool === 'brush' || tool === 'eraser' || tool === 'clone'
    const line = tool === 'shape' && app.shape === 'line'
    if (e.altKey && tool === 'clone') {
      app.clone = { photo: null, x: wrapped(x), y: wrapped(y), anchor: null }
      return
    }
    // Alt picks a color, except with shapes, where it draws from the center.
    if (e.altKey && tool !== 'shape') return pickColor(e, x, y)
    if (tool === 'clone' && masking()) return say('clone paints pixels, not masks')
    const pattern = tool === 'clone' ? clonePattern(x, y) : undefined
    if (pattern === null) return

    clipPlace()
    checkpoint()
    if (!activeLayer() && tool !== 'eraser') newLayer()
    const l = activeLayer()
    if (!l) return
    // In mask mode the mask takes the paint: white shows the layer.
    const onMask = masking()
    if (onMask && !l.mask) addMask(l)
    if (!onMask && !l.canvas) return say(l.color ? 'color layers take no paint, only their mask (Q)' : 'adjustment layers take no paint, only their mask (Q)')
    if (!onMask && settle(l)) say(`${l.name} redrawn at texel size for painting`)

    const source = onMask ? l.mask! : l.canvas!
    const paint = new Stroke(source, onMask ? new DOMMatrix() : matrix(l).inverse(), app.size, {
      color: onMask ? '#ffffff' : paintColor(app.colors[e.button === 2 ? 1 : 0]),
      // A line is drawn with dabs as wide as the outline.
      tipSize: brush ? app.tipSize[tool] : line ? app.shapeWidth : 1,
      tip: brush ? app.tip[tool] : line ? 'round' : 'square',
      hardness: brush ? app.hardness[tool] : 1,
      erase: tool === 'eraser',
      opacity: app.paintOpacity[tool],
      clip: clipAt(wrapped(x), wrapped(y)),
      wrap: wraps(app.tile),
      replace: onMask && tool === 'fill' && app.fillMode === 'gradient',
      pattern,
    })
    // Colors to fill by, read before the stroke stands in for the layer.
    const bucket = tool === 'fill' && app.fillMode === 'bucket'
    const sample = !bucket ? null : onMask ? source : composer.canvas(app.fill.merged ? composer.target : composer.layer(l, app.layout))
    stroke = { layer: l.id, paint, mask: onMask }
    composer.stroke(l.id, paint.canvas, onMask)
    el.setPointerCapture(e.pointerId)

    if (sample) {
      const pixels = sample.getContext('2d')!.getImageData(0, 0, app.size, app.size).data
      const mask = selection(flood(pixels, app.size, wrapped(x), wrapped(y), app.fill.tolerance, app.fill.contiguous, wraps(app.tile)), app.size)
      if (mask) paint.stamp(mask.canvas)
      repaint()
      return paintEnd()
    }
    if (tool === 'fill') {
      dragRight = e.button === 2
      app.gradientAim = { a: p, angle: 0, length: 0 }
      aiming = { part: 'b', from: p, was: { a: p, angle: 0, length: 0 } }
      return
    }
    if (tool === 'shape') {
      dragFrom = [x, y]
      return drawShape([x, y], e)
    }
    if (e.shiftKey && last) paint.line(last[0], last[1], x, y)
    else paint.dot(x, y)
    last = [x, y]
    repaint()
  }

  // Gray channels take the brightness of the color.
  const paintColor = (c: string) => (gray(app.channel) ? grayOf(c) : c)

  // Where paint may land: inside the selection and, with island clip, the island at x, y.
  function clipAt(x: number, y: number): HTMLCanvasElement | null {
    const sel = app.selection?.canvas ?? null
    const island = app.islandClip && app.layout ? islandAt(app.layout, (x + 0.5) / app.size, (y + 0.5) / app.size) : null
    if (island === null) return sel
    const mask = islandMask(app.layout!, island, app.size)
    if (!sel) return mask
    const both = document.createElement('canvas')
    both.width = both.height = app.size
    const ctx = both.getContext('2d')!
    ctx.drawImage(sel, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(mask, 0, 0)
    return both
  }

  // The shape from where the drag started to p: ⇧ squares it (a line: steps of
  // 45°), ⌥ centers it on the start.
  function drawShape(p: [number, number], e: PointerEvent) {
    if (!stroke || !dragFrom) return
    const [fx, fy] = dragFrom
    let dx = p[0] - fx
    let dy = p[1] - fy
    const lining = app.shape === 'line'
    if (e.shiftKey && lining) {
      const lean = Math.tan(Math.PI / 8)
      if (Math.abs(dy) < Math.abs(dx) * lean) dy = 0
      else if (Math.abs(dx) < Math.abs(dy) * lean) dx = 0
      else {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        dx = Math.sign(dx) * d
        dy = Math.sign(dy) * d
      }
    } else if (e.shiftKey) {
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      dx = Math.sign(dx || 1) * d
      dy = Math.sign(dy || 1) * d
    }
    const a: [number, number] = e.altKey ? [fx - dx, fy - dy] : [fx, fy]
    const b: [number, number] = [fx + dx, fy + dy]
    const [kind, filled] = app.shape.split(' ')
    const paint = stroke.paint
    paint.reset()
    if (lining) paint.line(a[0], a[1], b[0], b[1])
    else (kind === 'rect' ? rect : ellipse)(a, b, filled === 'filled', app.shapeWidth, (x, y, w) => paint.span(x, y, w))
    repaint()
  }

  // Gradients wait to be set up: handles move its ends or the whole, Enter applies it.
  const ends = new Handles()
  let aiming: { part: Part; from: [number, number]; was: Aim } | null = null
  let guide = $state<{ from: [number, number]; angle: number } | null>(null)

  const gradientTool = () => app.canvasTool === 'fill' && app.fillMode === 'gradient'

  // Snaps to steps of 45° near them; ⇧ always, ⌥ never.
  function moveAim(p: [number, number], e: PointerEvent) {
    if (!aiming) return
    const { part, from, was } = aiming
    const mode = e.altKey ? 'free' : e.shiftKey ? 'steps' : 'snap'
    if (part === 'line') {
      app.gradientAim = { ...was, a: [was.a[0] + p[0] - from[0], was.a[1] + p[1] - from[1]] }
      return
    }
    const fixed = part === 'b' ? was.a : end(was)
    const r = aim(fixed, p, zoom, mode)
    guide = r.snapped ? { from: fixed, angle: r.angle } : null
    if (part === 'b') app.gradientAim = { a: fixed, angle: r.angle, length: r.length }
    else {
      const t = (r.angle * Math.PI) / 180
      app.gradientAim = { a: [fixed[0] + Math.cos(t) * r.length, fixed[1] + Math.sin(t) * r.length], angle: r.angle > 0 ? r.angle - 180 : r.angle + 180, length: r.length }
    }
  }

  // A click without a drag sets up nothing.
  function aimEnd() {
    aiming = null
    guide = null
    if (app.gradientAim && app.gradientAim.length < 1) cancelGradient()
  }

  export function applyGradient() {
    if (!app.gradientAim) return
    app.gradientAim = null
    paintEnd()
  }

  export function cancelGradient() {
    if (!app.gradientAim) return
    app.gradientAim = null
    if (!stroke) return
    composer.stroke(stroke.layer, null)
    stroke = null
    compose()
  }

  // Enter and Esc while a gradient is set up; true when handled.
  export function gradientKey(e: KeyboardEvent) {
    if (!app.gradientAim || (e.key !== 'Enter' && e.key !== 'Escape')) return false
    if (e.key === 'Enter') applyGradient()
    else cancelGradient()
    return true
  }

  // The gradient as set up, primary to secondary (the other way with the right button).
  $effect(() => {
    if (!ready) return
    const g = app.gradientAim ? ($state.snapshot(app.gradientAim) as Aim) : null
    const o = $state.snapshot(app.gradient)
    const [first, second] = (dragRight ? [app.colors[1], app.colors[0]] : [app.colors[0], app.colors[1]]).map(paintColor)
    if (g && stroke) {
      // On a mask: from showing to hidden, the other way with the right button.
      const pair = stroke.mask ? (dragRight ? [rgba('#ffffff', 0), rgba('#ffffff')] : [rgba('#ffffff'), rgba('#ffffff', 0)]) : [rgba(first), o.clear ? rgba(first, 0) : rgba(second)]
      stroke.paint.reset()
      if (g.length >= 1) stroke.paint.image(gradient(app.size, g.a, end(g), pair[0], pair[1], o.radial, o.dither))
      repaint()
    }
    ends.draw(g, zoom, guide)
    view.draw()
  })

  // Another tool or layer applies a gradient left set up.
  $effect(() => {
    const leaving = !gradientTool() || app.active !== untrack(() => stroke?.layer)
    if (leaving && untrack(() => app.gradientAim)) applyGradient()
  })

  function repaint() {
    stroke?.paint.flush()
    composer.touch()
    compose()
  }

  // A click with the text tool types into the text layer there, or starts one.
  // Anywhere in its box counts, a texel around it too, not just on the letters.
  function textAt([x, y]: [number, number]) {
    const inBox = (b: Box) => x >= b.x - 1 && y >= b.y - 1 && x < b.x + b.w + 1 && y < b.y + b.h + 1
    const hit = app.layers.findLast((l) => l.text && l.visible && inBox(box(l)))
    checkpoint()
    if (!hit) return newText(Math.floor(x), Math.floor(y))
    app.active = hit.id
    app.textEdit = hit.id
  }

  // The text layer's bottom left on screen, for the field typing into it.
  function textPlace() {
    const l = app.layers.find((l) => l.id === app.textEdit)
    if (!l?.canvas || !view) return null
    const b = box(l)
    return { left: view.world.x + b.x * zoom, top: view.world.y + (b.y + b.h) * zoom + 6 }
  }

  function paintEnd() {
    dragFrom = null
    if (!stroke) return
    const l = app.layers.find((l) => l.id === stroke!.layer)
    if (l && stroke.mask) l.mask = stroke.paint.canvas
    else if (l) {
      l.canvas = stroke.paint.canvas
      // Painted on, a text layer is pixels from now on.
      l.text = null
    }
    composer.stroke(stroke.layer, null)
    stroke = null
    checkpoint()
  }

  function listen() {
    let drag: { from: [number, number]; at: [number, number] } | null = null
    let sizing: { from: Box; handle: Handle } | null = null

    el.addEventListener('pointerenter', () => (app.focus = 'canvas'))
    el.addEventListener('pointerdown', (e) => {
      app.focus = 'canvas'
      const right = e.button === 2 && (painting || app.picking)
      if (view.panning || (e.button !== 0 && !right)) return
      const p = texel(e)
      if (app.picking) return pickColor(e, Math.floor(p[0]), Math.floor(p[1]))
      if (gradientTool() && app.gradientAim) {
        const part = grab(app.gradientAim, p, zoom)
        if (part) {
          aiming = { part, from: p, was: $state.snapshot(app.gradientAim) as Aim }
          el.setPointerCapture(e.pointerId)
          return
        }
        applyGradient()
      }
      if (painting) return paintStart(e, p)
      if (app.canvasTool === 'select') {
        clipPlace()
        combining = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace'
        marquee.start(app.selectMode, p)
        el.setPointerCapture(e.pointerId)
        return
      }
      if (app.canvasTool === 'text') {
        // The click would take the focus from the field it opens.
        e.preventDefault()
        return textAt(p)
      }
      if (e.shiftKey && app.canvasTool !== 'transform') return pick(p)
      const l = activeLayer()

      if (app.canvasTool === 'island') {
        if (!l) return
        const island = app.layout ? islandAt(app.layout, p[0] / app.size, p[1] / app.size) : null
        l.island = island === l.island ? null : island
        return
      }
      if (!l?.canvas) return
      if (app.canvasTool === 'transform') {
        const from = box(l)
        const handle = hit(from, p[0], p[1], 5 / zoom)
        if (!handle) return
        if (handle !== 'inside') {
          checkpoint()
          sizing = { from, handle }
          el.setPointerCapture(e.pointerId)
          return
        }
      }
      checkpoint()
      drag = { from: p, at: [l.x, l.y] }
      el.setPointerCapture(e.pointerId)
    })

    el.addEventListener('pointermove', (e) => {
      const p = texel(e)
      hover = [Math.floor(p[0]), Math.floor(p[1])]
      hoverIsland = app.layout ? islandAt(app.layout, p[0] / app.size, p[1] / app.size) : null
      if (aiming) return moveAim(p, e)
      if (stroke && dragFrom) return drawShape(hover, e)
      if (stroke && last) {
        stroke.paint.line(last[0], last[1], hover[0], hover[1])
        last = [...hover]
        repaint()
        return
      }
      if (marquee.dragging) {
        marquee.move(p)
        view.draw()
        return
      }

      const l = activeLayer()
      if (sizing && l?.canvas) {
        fitBox(l, resize(sizing.from, sizing.handle, p[0], p[1], app.keepAspect !== e.shiftKey))
        return
      }
      if (app.canvasTool === 'transform' && l?.canvas && !drag) {
        const h = hit(box(l), p[0], p[1], 5 / zoom)
        el.style.cursor = !h ? '' : h === 'inside' ? 'move' : cursors[`${h.sx},${h.sy}`]
      } else el.style.cursor = ''
      if (!drag || !l) return
      // Whole texels from where it was, so odd-sized pieces keep their half-texel center.
      l.x = drag.at[0] + Math.round(p[0] - drag.from[0])
      l.y = drag.at[1] + Math.round(p[1] - drag.from[1])
    })

    el.addEventListener('pointerup', () => {
      if (drag || sizing) checkpoint()
      drag = null
      sizing = null
      if (aiming) aimEnd()
      else if (!app.gradientAim) paintEnd()
      selectEnd()
    })
    el.addEventListener('pointercancel', () => {
      if (aiming) aimEnd()
      else if (!app.gradientAim) paintEnd()
      selectEnd()
    })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('pointerleave', () => {
      hover = null
      hoverIsland = null
    })
  }
</script>

<div class="canvas" class:cross={app.canvasTool === 'island' || app.canvasTool === 'select' || painting || app.picking}
  class:typing={app.canvasTool === 'text'} bind:this={el}>
  {#if app.textEdit}
    <TextEdit place={textPlace} />
  {/if}
  {#if hover}
    <div class="coords">{hover[0]}, {hover[1]}{hoverIsland !== null ? ` · island ${hoverIsland}` : ''}</div>
  {/if}
  <button class="zoom mono" title="Fit (⌘0)" onclick={fit}>{Math.round(zoom * 100)}%</button>
</div>

<style>
  .canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .canvas.cross {
    cursor: crosshair;
  }
  .canvas.typing {
    cursor: text;
  }
  .canvas :global(canvas) {
    display: block;
  }
  .zoom {
    position: absolute;
    right: 8px;
    bottom: 6px;
    padding: 0 4px;
    border: 0;
    border-radius: 4px;
    background: none;
    font: 11px var(--mono);
    color: var(--dim);
  }
  .zoom:hover {
    color: var(--strong);
    background: var(--hover);
  }
  .coords {
    position: absolute;
    right: 56px;
    bottom: 8px;
    font: 11px var(--mono);
    color: var(--dim);
    pointer-events: none;
  }
</style>
