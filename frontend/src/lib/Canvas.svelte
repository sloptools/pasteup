<script lang="ts">
  import { onMount } from 'svelte'
  import { Graphics, Sprite } from 'pixi.js'
  import { View } from './view'
  import { Composer, hits } from './compose'
  import { settle, box, cursors, fit as fitBox, handleAt, handles, hit, matrix, place, resize, type Box, type Handle } from './transform'
  import { edges, eachFace, islandAt } from './uv'
  import { activeLayer, app, cloneLayer, colorTools, say, type ColorTool, type PaintTool } from './state.svelte'
  import { bridge } from './bridge.svelte'
  import { mergeDown, newLayer } from './layerOps'
  import { footprint, Stroke } from './paint'
  import { ellipse, flood, rect } from './shapes'
  import { checkpoint } from './history.svelte'
  import { Marquee } from './marquee'
  import { combine, selection, type Combine } from './selection'
  import { place as clipPlace, useComposer } from './clipboard'

  let el: HTMLDivElement
  let view: View
  let composer: Composer
  let ready = $state(false)
  let hover = $state<[number, number] | null>(null)
  let hoverIsland = $state<number | null>(null)

  const checker = new Graphics()
  const uvLines = new Graphics()
  const islandMark = new Graphics()
  const frame = new Graphics()
  const tip = new Graphics()
  const grips = new Graphics()
  let zoom = $state(1)
  const marquee = new Marquee()
  let stopAnts = () => {}

  const painting = $derived(colorTools.includes(app.canvasTool))
  const brushing = $derived(app.canvasTool === 'brush' || app.canvasTool === 'eraser')
  // Where a shape drag started.
  let shapeFrom: [number, number] | null = null
  let stroke: { layer: string; paint: Stroke } | null = null
  // Where the last stroke ended, for Shift-click lines.
  let last: [number, number] | null = null

  onMount(() => {
    view = new View(el, [0.25, 64])
    view.init().then(() => {
      composer = new Composer(view.pixi.renderer, app.size)
      const texture = new Sprite(composer.target)
      view.world.addChild(checker, texture, uvLines, islandMark, frame, marquee.node, grips, tip)
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
      if (import.meta.env.DEV) Object.assign(window, { composer, canvasView: view })
      ready = true
      fit()
    })
    return () => {
      stopAnts()
      view.pixi.destroy(true)
    }
  })

  export function fit() {
    view?.fit(0, 0, app.size, app.size)
  }

  export function png(): string {
    return composer.png()
  }

  export function merge() {
    mergeDown(composer)
  }

  $effect(() => {
    if (!ready) return
    const size = app.size
    composer.resize(size)
    if (app.selection?.size !== size) app.selection = null
    checker.clear()
    const cell = size / 16
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) checker.rect(x * cell, y * cell, cell, cell).fill((x + y) % 2 ? 0x1f1f1d : 0x252522)
    }
    fit()
  })

  $effect(() => {
    if (!ready) return
    const size = app.size
    uvLines.clear()
    if (!app.layout) return view.draw()
    const e = edges(app.layout)
    for (let i = 0; i < e.length; i += 4) uvLines.moveTo(e[i] * size, e[i + 1] * size).lineTo(e[i + 2] * size, e[i + 3] * size)
    uvLines.stroke({ width: 1, color: 0xebe8df, alpha: 0.35, pixelLine: true })
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

  function compose() {
    composer.render(app.layers.map(cloneLayer), app.layout)
    bridge.changed()
    view.draw()
  }

  // Every layer property the texture depends on.
  $effect(() => {
    if (!ready) return
    void app.size
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
    const island = app.canvasTool === 'island' ? hoverIsland : null
    if (app.layout && island !== null) {
      const size = app.size
      eachFace(app.layout, island, (p) => islandMark.poly(p.map((c) => c * size)))
      islandMark.fill({ color: 0xffb020, alpha: 0.3 })
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

  // Into the primary color, or the secondary with the right button.
  function pickColor(e: PointerEvent, x: number, y: number) {
    const color = composer.pick(x, y)
    if (color) app.colors[e.button === 2 ? 1 : 0] = color
    app.picking = false
  }

  function paintStart(e: PointerEvent, x: number, y: number) {
    const tool = app.canvasTool as ColorTool
    const brush = tool === 'brush' || tool === 'eraser'
    // Alt picks a color, except with shapes, where it draws from the center.
    if (e.altKey && tool !== 'shape') return pickColor(e, x, y)

    clipPlace()
    checkpoint()
    if (!activeLayer() && tool !== 'eraser') newLayer()
    const l = activeLayer()
    if (!l) return
    if (!l.canvas) return say('adjustment layers take no paint')
    if (settle(l)) say(`${l.name} redrawn at texel size for painting`)

    const paint = new Stroke(l.canvas, matrix(l).inverse(), app.size, {
      color: app.colors[e.button === 2 ? 1 : 0],
      tipSize: brush ? app.tipSize[tool] : 1,
      tip: brush ? app.tip[tool] : 'square',
      erase: tool === 'eraser',
      opacity: app.paintOpacity[tool],
      selection: app.selection?.canvas ?? null,
    })
    // Colors to fill by, read before the stroke stands in for the layer.
    const sample = tool === 'fill' ? composer.canvas(app.fill.merged ? composer.target : composer.layer(l, app.layout)) : null
    stroke = { layer: l.id, paint }
    composer.stroke(l.id, paint.canvas)
    el.setPointerCapture(e.pointerId)

    if (sample) {
      const pixels = sample.getContext('2d')!.getImageData(0, 0, app.size, app.size).data
      const mask = selection(flood(pixels, app.size, x, y, app.fill.tolerance, app.fill.contiguous), app.size)
      if (mask) paint.stamp(mask.canvas)
      repaint()
      return paintEnd()
    }
    if (tool === 'shape') {
      shapeFrom = [x, y]
      return drawShape([x, y], e)
    }
    if (e.shiftKey && last) paint.line(last[0], last[1], x, y)
    else paint.dot(x, y)
    last = [x, y]
    repaint()
  }

  // The shape from where the drag started to p: ⇧ squares it, ⌥ centers it on the start.
  function drawShape(p: [number, number], e: PointerEvent) {
    if (!stroke || !shapeFrom) return
    const [fx, fy] = shapeFrom
    let dx = p[0] - fx
    let dy = p[1] - fy
    if (e.shiftKey) {
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      dx = Math.sign(dx || 1) * d
      dy = Math.sign(dy || 1) * d
    }
    const a: [number, number] = e.altKey ? [fx - dx, fy - dy] : [fx, fy]
    const b: [number, number] = [fx + dx, fy + dy]
    const [kind, filled] = app.shape.split(' ')
    const paint = stroke.paint
    paint.reset()
    ;(kind === 'rect' ? rect : ellipse)(a, b, filled === 'filled', app.shapeWidth, (x, y, w) => paint.span(x, y, w))
    repaint()
  }

  function repaint() {
    stroke?.paint.flush()
    composer.touch()
    compose()
  }

  function paintEnd() {
    shapeFrom = null
    if (!stroke) return
    const l = app.layers.find((l) => l.id === stroke!.layer)
    if (l) l.canvas = stroke.paint.canvas
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
      if (painting) return paintStart(e, Math.floor(p[0]), Math.floor(p[1]))
      if (app.canvasTool === 'select') {
        clipPlace()
        combining = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace'
        marquee.start(app.selectMode, p)
        el.setPointerCapture(e.pointerId)
        return
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
      if (stroke && shapeFrom) return drawShape(hover, e)
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
      paintEnd()
      selectEnd()
    })
    el.addEventListener('pointercancel', () => {
      paintEnd()
      selectEnd()
    })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('pointerleave', () => {
      hover = null
      hoverIsland = null
    })
  }
</script>

<div class="canvas" class:cross={app.canvasTool === 'island' || app.canvasTool === 'select' || painting || app.picking} bind:this={el}>
  {#if hover}
    <div class="coords">{hover[0]}, {hover[1]}{hoverIsland !== null ? ` · island ${hoverIsland}` : ''}</div>
  {/if}
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
  .canvas :global(canvas) {
    display: block;
  }
  .coords {
    position: absolute;
    right: 10px;
    bottom: 8px;
    font: 11px var(--mono);
    color: var(--dim);
    pointer-events: none;
  }
</style>
