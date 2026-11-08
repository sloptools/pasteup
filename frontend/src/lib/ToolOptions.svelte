<script lang="ts">
  import { footprint } from './paint'
  import Slider from './Slider.svelte'
  import Icon from './Icon.svelte'
  import { discard, place } from './clipboard'
  import { box, fit, flip, turn } from './transform'
  import { activeLayer, app, selectModes, tips, type Layer, type Tip } from './state.svelte'

  const turns: [() => void, string, 'rotate' | 'flip', string][] = [
    [() => withLayer((l) => turn(l, -1)), 'Rotate 90° counter-clockwise (⇧R)', 'rotate', 'mirror'],
    [() => withLayer((l) => turn(l, 1)), 'Rotate 90° clockwise (R)', 'rotate', ''],
    [() => withLayer((l) => flip(l, true)), 'Flip horizontally (H)', 'flip', ''],
    [() => withLayer((l) => flip(l, false)), 'Flip vertically (⇧H)', 'flip', 'upright'],
  ]

  const hints: Record<string, string> = {
    move: 'drag the active layer · arrows',
    island: 'click an island to clip the active layer to it',
  }

  const layer = $derived(activeLayer()?.canvas ? activeLayer() : undefined)
  const size = $derived(layer ? box(layer) : null)

  function withLayer(f: (l: Layer) => void) {
    const l = activeLayer()
    if (l?.canvas) f(l)
  }

  // A typed width or height, from the top left; the other side follows when the aspect is kept.
  function setSize(side: 'w' | 'h', text: string) {
    const l = activeLayer()
    const n = Math.round(Number(text))
    if (!l?.canvas || !Number.isFinite(n) || n < 1) return
    const b = box(l)
    const w = side === 'w' ? n : app.keepAspect ? (b.w * n) / b.h : b.w
    const h = side === 'h' ? n : app.keepAspect ? (b.h * n) / b.w : b.h
    fit(l, { x: b.x, y: b.y, w, h })
  }

  function sizeKey(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement
    if (e.key !== 'Enter' && e.key !== 'Escape') return
    e.stopPropagation()
    if (e.key === 'Escape') input.value = input.defaultValue
    input.blur()
  }

  let open = $state(false)

  function choose(tool: 'brush' | 'eraser', tip: Tip) {
    app.tip[tool] = tip
    open = false
  }

  // While the list is open, arrows pick the tip, Enter and Esc close it.
  function listKey(e: KeyboardEvent) {
    const tool = app.canvasTool
    if (!open || (tool !== 'brush' && tool !== 'eraser')) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const at = tips.indexOf(app.tip[tool]) + (e.key === 'ArrowDown' ? 1 : -1)
      app.tip[tool] = tips[Math.min(Math.max(at, 0), tips.length - 1)]
    } else if (e.key === 'Enter' || e.key === 'Escape') open = false
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  function outside(e: PointerEvent) {
    if (open && !(e.target as HTMLElement).closest('.tips')) open = false
  }
</script>

<svelte:window onpointerdown={outside} onkeydowncapture={listKey} />

{#snippet preview(tip: Tip)}
  <svg width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
    {#each footprint(7, tip) as [dy, dx, w]}<rect x={dx + 3} y={dy + 3} width={w} height="1" fill="currentColor" />{/each}
  </svg>
{/snippet}

<div class="options">
  {#if app.canvasTool === 'brush' || app.canvasTool === 'eraser'}
    {@const tool = app.canvasTool}
    <div class="tips">
      <button class="current mono" title="Tip (⇧{tool === 'brush' ? 'B' : 'E'})" onclick={() => (open = !open)}>
        {@render preview(app.tip[tool])}<span class="caret">▾</span>
      </button>
      {#if open}
        <div class="list">
          {#each tips as tip}
            <button class:on={app.tip[tool] === tip} title={tip} onclick={() => choose(tool, tip)}>{@render preview(tip)}</button>
          {/each}
        </div>
      {/if}
    </div>
    <Slider bind:value={app.tipSize[tool]} label="size" min={1} max={64} step={1} title="Size in texels ([ ])" />
    <Slider bind:value={app.paintOpacity[tool]} label="opacity" min={0.01} max={1} step={0.01} scale={100} title="Opacity (1–9, 0)" />
  {:else if app.canvasTool === 'select'}
    <div class="seg">
      {#each selectModes as mode}
        <button class:on={app.selectMode === mode} title="{mode} (⇧M)" onclick={() => (app.selectMode = mode)}>
          <Icon name={mode === 'rect' ? 'select' : 'lasso'} size={11} />
        </button>
      {/each}
    </div>
    <span class="hint">⇧ adds · ⌥ takes away · T transforms the selection</span>
  {:else if app.canvasTool === 'transform'}
    <div class="seg" title="Corners keep the aspect or not; ⇧ while dragging does the other">
      <button class:on={app.keepAspect} onclick={() => (app.keepAspect = true)}>keep</button>
      <button class:on={!app.keepAspect} onclick={() => (app.keepAspect = false)}>free</button>
    </div>
    {#if size}
      <div class="size mono">
        <input value={Math.round(size.w)} title="Width in texels" onkeydown={sizeKey} onchange={(e) => setSize('w', e.currentTarget.value)} />
        ×
        <input value={Math.round(size.h)} title="Height in texels" onkeydown={sizeKey} onchange={(e) => setSize('h', e.currentTarget.value)} />
      </div>
    {/if}
    <div class="turns">
      {#each turns as [act, title, icon, look]}
        <button class="turn {look}" {title} disabled={!layer} onclick={act}><Icon name={icon} /></button>
      {/each}
    </div>
    {#if app.floating}
      <button class="text-button" title="Enter" onclick={place}>place</button>
      <button class="text-button" title="Esc" onclick={discard}>cancel</button>
    {/if}
  {:else}
    <span class="hint">{hints[app.canvasTool]}</span>
  {/if}
</div>

<style>
  .options {
    --range-flex: none;
    --range-width: 90px;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .tips {
    position: relative;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    font: 12px var(--mono);
    color: var(--fg);
  }
  .current {
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
  }
  .current:hover {
    border-color: var(--faint);
  }
  .caret {
    font-size: 9px;
    color: var(--dim);
  }
  .list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 10;
    min-width: 100%;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 7px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  }
  .list button {
    height: 24px;
    padding: 0 6px;
    border-radius: 5px;
  }
  .list button:hover {
    background: var(--hover);
  }
  .list button {
    color: var(--dim);
  }
  .list button.on {
    color: var(--accent);
  }
  .size {
    display: flex;
    align-items: center;
    gap: 4px;
    font: 12px var(--mono);
    color: var(--dim);
  }
  .size input {
    width: 44px;
    height: 22px;
    padding: 0 5px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--bg);
    color: var(--fg);
    font: 12px var(--mono);
    text-align: right;
    outline: none;
  }
  .size input:focus {
    border-color: var(--dim);
  }
  .turns {
    display: flex;
    gap: 2px;
  }
  .turn {
    padding: 2px;
    border-radius: 5px;
    color: var(--dim);
  }
  .turn:hover:not(:disabled) {
    color: var(--strong);
    background: var(--hover);
  }
  .turn:disabled {
    color: var(--faint);
  }
  .turn.mirror :global(svg) {
    transform: scaleX(-1);
  }
  .turn.upright :global(svg) {
    transform: rotate(90deg);
  }
  .hint {
    font-size: 12px;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
