<script lang="ts">
  import { onMount, tick } from 'svelte'
  import Canvas from './lib/Canvas.svelte'
  import RefSpace from './lib/RefSpace.svelte'
  import Layers from './lib/Layers.svelte'
  import Icon from './lib/Icon.svelte'
  import { canvasKey, layersKey, refKey } from './lib/keys'
  import { copy, cut, discard, paste, place } from './lib/clipboard'
  import { all, invert, selection } from './lib/selection'
  import { addPaths } from './lib/photos'
  import { activeLayer, app, say, sizes } from './lib/state.svelte'
  import { bridge } from './lib/bridge.svelte'
  import { redo, track, undo } from './lib/history.svelte'
  import { addAdjust, duplicate, move, newLayer } from './lib/layerOps'
  import Tools from './lib/Tools.svelte'
  import ColorPanel from './lib/ColorPanel.svelte'
  import ToolOptions from './lib/ToolOptions.svelte'
  import { ExportPNG, OpenModel } from '../wailsjs/go/main/App'
  import { OnFileDrop } from '../wailsjs/runtime/runtime'

  let canvas: Canvas
  let refs: RefSpace
  const wails = 'go' in window

  async function openModel(path = '') {
    try {
      const layout = await OpenModel(path)
      if (!layout) return
      app.layout = layout
      app.blend = null
      say(`${layout.name}: ${layout.uvs.length / 6} faces, ${new Set(layout.islands).size} islands`)
    } catch (err) {
      say(String(err))
    }
  }

  async function exportPNG() {
    const png = canvas.png()
    const name = app.layout?.name ?? 'texture'
    if (!wails) {
      const a = document.createElement('a')
      a.href = `data:image/png;base64,${png}`
      a.download = `${name}.png`
      a.click()
      return
    }
    const dir = app.layout?.path.replace(/\/[^/]*$/, '') ?? ''
    try {
      const path = await ExportPNG(dir, name, png)
      if (path) say(`exported ${path}`)
    } catch (err) {
      say(String(err))
    }
  }

  function toggleRefs(max: boolean) {
    if (max) app.refs = app.refs === 'max' ? 'open' : 'max'
    else app.refs = app.refs === 'open' ? 'closed' : 'open'
    tick().then(() => canvas.fit())
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement && e.target.type === 'text') return
    if (e.key === 'Tab') {
      e.preventDefault()
      toggleRefs(e.shiftKey)
      return
    }
    if (e.metaKey) {
      if (metaKey(e)) e.preventDefault()
      return
    }
    if (e.ctrlKey || e.altKey) return
    if (app.floating && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault()
      return e.key === 'Enter' ? place() : discard()
    }
    // Esc drops a selection in any tool, before anything else it would do.
    if (e.key === 'Escape' && app.selection && app.focus !== 'refs') {
      e.preventDefault()
      app.selection = null
      return
    }

    let handled: boolean
    if (app.focus === 'refs' && app.refs !== 'closed') handled = refs.key(e) || refKey(e)
    else if (app.focus === 'layers') handled = layersKey(e)
    else handled = canvasKey(e)
    if (handled) e.preventDefault()
  }

  // Buttons never take focus, so keys stay with the regions and Enter can't press one again.
  function keepFocus(e: PointerEvent) {
    const target = e.target as HTMLElement
    if (target.closest('input, select, textarea') || !target.closest('button, [role="button"]')) return
    e.preventDefault()
    // What a click elsewhere would do: an open name or number field takes its value.
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
  }

  // ⌘ keys; layer keys as in Photoshop. True when handled.
  function metaKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase()
    if (k === 'z') return e.shiftKey ? redo() || true : undo() || true
    if (k === 'o') openModel()
    else if (k === 'e' && e.shiftKey) exportPNG()
    else if (k === 'e') canvas.merge()
    else if (k === 'j') duplicate()
    else if (k === 'c') copy(e.shiftKey)
    else if (k === 'x') cut()
    else if (k === 'v') paste(e.shiftKey)
    else if (k === 'a' && !e.shiftKey) app.selection = selection(all(app.size), app.size)
    else if (k === 'd') app.selection = null
    else if (k === 'i' && e.shiftKey) app.selection = selection(invert(app.selection, app.size), app.size)
    else if (k === 'a' && e.shiftKey) addAdjust()
    else if (k === 'n' && e.shiftKey) newLayer()
    else if (e.code === 'BracketRight') move(1)
    else if (e.code === 'BracketLeft') move(-1)
    else if (k === 'g' && e.altKey) {
      const l = activeLayer()
      if (l) l.clip = !l.clip
    } else if (e.code === 'Digit0') {
      if (app.focus === 'refs' && app.refs !== 'closed') refs.fit()
      else canvas.fit()
    } else return false
    return true
  }

  onMount(() => {
    track()
    if (!wails) return
    bridge.start(() => canvas.png())
    OnFileDrop((x, y, paths) => {
      const glb = paths.find((p) => p.toLowerCase().endsWith('.glb'))
      if (glb) return openModel(glb)
      if (app.refs === 'closed') app.refs = 'open'
      tick().then(() => addPaths(paths, refs.contains(x, y) ? refs.toWorld(x, y) : [0, 0]))
    }, false)
  })
</script>

<svelte:window onkeydown={onKey} onpointerdowncapture={keepFocus} />

<div class="shell refs-{app.refs}">
  <header>
    <span class="title">pasteup</span>
    <span class="model mono">{app.layout?.name ?? 'no model'}</span>
    <button class="text-button" title="Open a GLB (⌘O)" onclick={() => openModel()}>open model</button>
    {#if app.blend}
      <span class="blender mono" class:live={bridge.live}>
        <span class="dot"></span>blender {bridge.live ? 'live' : 'offline'}
      </span>
      <button class="text-button" title="Get the objects from Blender again" disabled={!bridge.live} onclick={() => bridge.requestSync()}>sync</button>
    {/if}
    <div class="spacer"></div>
    <div class="seg">
      {#each sizes as s}
        <button class:on={app.size === s} onclick={() => (app.size = s)}>{s}</button>
      {/each}
    </div>
    <button class="text-button" title="Export the texture as PNG (⌘⇧E)" onclick={exportPNG}>export</button>
  </header>

  <section class="refs" class:focus={app.focus === 'refs'}>
    <div class="bar">
      <span class="caps">refs</span>
      <div class="seg">
        <button class:on={app.refTool === 'move'} onclick={() => (app.refTool = 'move')}>move <kbd>V</kbd></button>
        <button class:on={app.refTool === 'cut'} onclick={() => (app.refTool = 'cut')}>cut <kbd>C</kbd></button>
      </div>
      <button class="check" class:on={app.deskew} title="Straighten cuts into rectangles (D)" onclick={() => (app.deskew = !app.deskew)}>
        <span class="box"></span>deskew <kbd>D</kbd>
      </button>
    </div>
    <div class="view"><RefSpace bind:this={refs} /></div>
  </section>

  <section class="canvas" class:focus={app.focus === 'canvas'}>
    <div class="bar">
      <button class="icon" title="Show or hide the refs (Tab)" onclick={() => toggleRefs(false)}><Icon name="panel" size={11} /></button>
      <span class="caps">canvas</span>
      <ToolOptions />
      {#if app.selection}
        <span class="selected mono">
          selection {app.selection.w}×{app.selection.h}
          <button class="icon" title="Deselect (Esc, ⌘D)" onclick={() => (app.selection = null)}><Icon name="x" size={11} /></button>
        </span>
      {/if}
    </div>
    <div class="work">
      <div class="view"><Canvas bind:this={canvas} /></div>
      <Tools />
    </div>
  </section>

  <aside>
    <ColorPanel />
    <Layers onmerge={() => canvas.merge()} />
  </aside>

  <footer class="mono">{app.status}</footer>
</div>

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: 44px minmax(0, 1fr) 24px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 260px;
    grid-template-areas: 'head head head' 'refs canvas side' 'foot foot foot';
  }
  .shell.refs-closed {
    grid-template-columns: 0 minmax(0, 1fr) 260px;
  }
  .shell.refs-max {
    grid-template-columns: minmax(0, 1fr) 0 0;
  }
  .refs-closed .refs,
  .refs-max .canvas,
  .refs-max aside {
    visibility: hidden;
  }

  header {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 84px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    --wails-draggable: drag;
  }
  .title {
    font-weight: 600;
    color: var(--strong);
  }
  .model {
    font: 12px var(--mono);
    color: var(--dim);
  }
  .blender {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 12px var(--mono);
    color: var(--dim);
  }
  .blender .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
  }
  .blender.live {
    color: var(--fg);
  }
  .blender.live .dot {
    background: var(--accent);
  }
  .spacer {
    flex: 1;
  }

  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .refs {
    grid-area: refs;
    border-right: 1px solid var(--line);
  }
  .canvas {
    grid-area: canvas;
  }
  .bar {
    height: 32px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
  }
  section.focus .bar .caps {
    color: var(--fg);
  }
  .view {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .selected {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    font: 12px var(--mono);
    color: var(--dim);
  }
  .work {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  aside {
    grid-area: side;
    background: var(--panel);
    border-left: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding-top: 4px;
  }

  footer {
    grid-area: foot;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font: 11px var(--mono);
    color: var(--dim);
    background: var(--panel);
    border-top: 1px solid var(--line);
  }

  .icon {
    border: 0;
    padding: 2px;
    background: none;
    color: var(--dim);
  }
  .icon:hover {
    color: var(--strong);
  }
</style>
