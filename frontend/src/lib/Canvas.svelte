<script lang="ts">
  import { onMount } from 'svelte'
  import { Graphics, Sprite } from 'pixi.js'
  import { View } from './view'
  import { Composer, hits, place } from './compose'
  import { edges, eachFace, islandAt } from './uv'
  import { activeLayer, app } from './state.svelte'
  import { bridge } from './bridge.svelte'

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

  onMount(() => {
    view = new View(el, [0.25, 64])
    view.init().then(() => {
      composer = new Composer(view.pixi.renderer, app.size)
      const texture = new Sprite(composer.target)
      view.world.addChild(checker, texture, uvLines, islandMark, frame)
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

  // Every layer property the texture depends on.
  $effect(() => {
    if (!ready) return
    void app.size
    const layers = app.layers.map((l) => ({ ...l }))
    composer.render(layers, app.layout)
    bridge.changed()
    view.draw()
  })

  $effect(() => {
    if (!ready) return
    frame.clear()
    const l = activeLayer()
    if (l) {
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

  function listen() {
    let drag: { from: [number, number]; at: [number, number] } | null = null

    el.addEventListener('pointerenter', () => (app.focus = 'canvas'))
    el.addEventListener('pointerdown', (e) => {
      app.focus = 'canvas'
      if (view.panning || e.button !== 0) return
      const p = texel(e)
      if (e.shiftKey) return pick(p)
      const l = activeLayer()

      if (app.canvasTool === 'island') {
        if (!l) return
        const island = app.layout ? islandAt(app.layout, p[0] / app.size, p[1] / app.size) : null
        l.island = island === l.island ? null : island
        return
      }
      if (!l) return
      drag = { from: p, at: [l.x, l.y] }
      el.setPointerCapture(e.pointerId)
    })

    el.addEventListener('pointermove', (e) => {
      const p = texel(e)
      hover = [Math.floor(p[0]), Math.floor(p[1])]
      hoverIsland = app.layout ? islandAt(app.layout, p[0] / app.size, p[1] / app.size) : null

      const l = activeLayer()
      if (!drag || !l) return
      l.x = Math.round(drag.at[0] + p[0] - drag.from[0])
      l.y = Math.round(drag.at[1] + p[1] - drag.from[1])
    })

    el.addEventListener('pointerup', () => (drag = null))
    el.addEventListener('pointerleave', () => {
      hover = null
      hoverIsland = null
    })
  }
</script>

<div class="canvas" class:island={app.canvasTool === 'island'} bind:this={el}>
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
  .canvas.island {
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
