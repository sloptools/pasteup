<script lang="ts">
  import { onMount } from 'svelte'
  import { Graphics, Sprite } from 'pixi.js'
  import { View } from './view'
  import { Composer, hits, place } from './compose'
  import { edges, eachFace, islandAt } from './uv'
  import { activeLayer, app, cloneLayer, say, type PaintTool } from './state.svelte'
  import { bridge } from './bridge.svelte'
  import { isTexels, mergeDown, newLayer, toTexels } from './layerOps'
  import { footprint, Stroke } from './paint'
  import { checkpoint } from './history.svelte'

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

  const painting = $derived(app.canvasTool === 'brush' || app.canvasTool === 'eraser')
  let stroke: { layer: string; paint: Stroke } | null = null
  // Where the last stroke ended, for Shift-click lines.
  let last: [number, number] | null = null

  onMount(() => {
    view = new View(el, [0.25, 64])
    view.init().then(() => {
      composer = new Composer(view.pixi.renderer, app.size)
      const texture = new Sprite(composer.target)
      view.world.addChild(checker, texture, uvLines, islandMark, frame, tip)
      listen()
      if (import.meta.env.DEV) Object.assign(window, { composer, canvasView: view })
      ready = true
      fit()
    })
    return () => view.pixi.destroy(true)
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
    if (painting && hover) {
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
    if (l?.canvas) {
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
    const tool = app.canvasTool as PaintTool
    if (e.altKey) return pickColor(e, x, y)

    checkpoint()
    if (!activeLayer() && tool === 'brush') newLayer()
    const l = activeLayer()
    if (!l) return
    if (l.adjust) return say('adjustment layers take no paint')
    if (!isTexels(l)) {
      toTexels(l, composer)
      say(`${l.name} baked to texels for painting`)
    }

    stroke = { layer: l.id, paint: new Stroke(l.canvas!, app.colors[e.button === 2 ? 1 : 0], app.tipSize[tool], app.tip[tool], tool === 'eraser', app.paintOpacity[tool]) }
    composer.stroke(l.id, stroke.paint.canvas)
    if (e.shiftKey && last) stroke.paint.line(last[0], last[1], x, y)
    else stroke.paint.dot(x, y)
    last = [x, y]
    el.setPointerCapture(e.pointerId)
    repaint()
  }

  function repaint() {
    stroke?.paint.flush()
    composer.touch()
    compose()
  }

  function paintEnd() {
    if (!stroke) return
    const l = app.layers.find((l) => l.id === stroke!.layer)
    if (l) l.canvas = stroke.paint.canvas
    composer.stroke(stroke.layer, null)
    stroke = null
    checkpoint()
  }

  function listen() {
    let drag: { from: [number, number]; at: [number, number] } | null = null

    el.addEventListener('pointerenter', () => (app.focus = 'canvas'))
    el.addEventListener('pointerdown', (e) => {
      app.focus = 'canvas'
      const right = e.button === 2 && (painting || app.picking)
      if (view.panning || (e.button !== 0 && !right)) return
      const p = texel(e)
      if (app.picking) return pickColor(e, Math.floor(p[0]), Math.floor(p[1]))
      if (painting) return paintStart(e, Math.floor(p[0]), Math.floor(p[1]))
      if (e.shiftKey) return pick(p)
      const l = activeLayer()

      if (app.canvasTool === 'island') {
        if (!l) return
        const island = app.layout ? islandAt(app.layout, p[0] / app.size, p[1] / app.size) : null
        l.island = island === l.island ? null : island
        return
      }
      if (!l?.canvas) return
      drag = { from: p, at: [l.x, l.y] }
      el.setPointerCapture(e.pointerId)
    })

    el.addEventListener('pointermove', (e) => {
      const p = texel(e)
      hover = [Math.floor(p[0]), Math.floor(p[1])]
      hoverIsland = app.layout ? islandAt(app.layout, p[0] / app.size, p[1] / app.size) : null
      if (stroke && last) {
        stroke.paint.line(last[0], last[1], hover[0], hover[1])
        last = [...hover]
        repaint()
        return
      }

      const l = activeLayer()
      if (!drag || !l) return
      l.x = Math.round(drag.at[0] + p[0] - drag.from[0])
      l.y = Math.round(drag.at[1] + p[1] - drag.from[1])
    })

    el.addEventListener('pointerup', () => {
      drag = null
      paintEnd()
    })
    el.addEventListener('pointercancel', paintEnd)
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('pointerleave', () => {
      hover = null
      hoverIsland = null
    })
  }
</script>

<div class="canvas" class:cross={app.canvasTool === 'island' || painting || app.picking} bind:this={el}>
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
