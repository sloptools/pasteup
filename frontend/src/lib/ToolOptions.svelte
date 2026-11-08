<script lang="ts">
  import { footprint } from './paint'
  import Slider from './Slider.svelte'
  import { app, tips, type Tip } from './state.svelte'

  const hints: Record<string, string> = {
    move: 'drag the active layer · arrows, [ ], R, H',
    island: 'click an island to clip the active layer to it',
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
  .hint {
    font-size: 12px;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
