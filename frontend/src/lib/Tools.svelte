<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte'
  import { useTool } from './keys'
  import { app, fillModes, selectModes, shapes, tips, type CanvasTool, type FillMode, type PaintTool, type SelectMode, type Shape, type Tip } from './state.svelte'

  type Variants = { options: readonly string[]; get: () => string; set: (v: string) => void }
  type Tool = { id: CanvasTool; label: string; key: string; icon: () => IconName; variants?: Variants }

  const tipsOf = (tool: PaintTool): Variants => ({ options: tips, get: () => app.tip[tool], set: (v) => (app.tip[tool] = v as Tip) })

  const tools: Tool[] = [
    { id: 'move', label: 'move', key: 'V', icon: () => 'move' },
    { id: 'transform', label: 'transform', key: 'T', icon: () => 'transform' },
    { id: 'island', label: 'island', key: 'I', icon: () => 'island' },
    {
      id: 'select',
      label: 'select',
      key: 'M',
      icon: () => (app.selectMode === 'rect' ? 'select' : 'lasso'),
      variants: { options: selectModes, get: () => app.selectMode, set: (v) => (app.selectMode = v as SelectMode) },
    },
    { id: 'brush', label: 'brush', key: 'B', icon: () => 'brush', variants: tipsOf('brush') },
    { id: 'eraser', label: 'eraser', key: 'E', icon: () => 'eraser', variants: tipsOf('eraser') },
    {
      id: 'fill',
      label: 'fill',
      key: 'G',
      icon: () => (app.fillMode === 'bucket' ? 'fill' : 'gradient'),
      variants: { options: fillModes, get: () => app.fillMode, set: (v) => (app.fillMode = v as FillMode) },
    },
    {
      id: 'shape',
      label: 'shape',
      key: 'U',
      icon: () => app.shape,
      variants: { options: shapes, get: () => app.shape, set: (v) => (app.shape = v as Shape) },
    },
  ]

  // Tools by kind, with a line between kinds: placing, selecting, painting, filling.
  const groups: CanvasTool[][] = [['move', 'transform', 'island'], ['select'], ['brush', 'eraser'], ['fill', 'shape']]
  const group = (t: Tool) => groups.findIndex((g) => g.includes(t.id))

  // The tool whose tip shows, after a short rest on its button.
  let tipFor = $state<{ tool: Tool; top: number } | null>(null)
  let tipTimer = 0

  function enter(e: PointerEvent, t: Tool) {
    const top = (e.currentTarget as HTMLElement).offsetTop
    clearTimeout(tipTimer)
    if (tipFor) tipFor = { tool: t, top }
    else tipTimer = window.setTimeout(() => (tipFor = { tool: t, top }), 500)
  }

  // A short grace, so moving to the next button keeps the tip up.
  function leave() {
    clearTimeout(tipTimer)
    clearTimeout(hold)
    tipTimer = window.setTimeout(() => (tipFor = null), 300)
  }

  // The tool whose variants are open.
  let open = $state<CanvasTool | null>(null)
  let openAt = $state(0)
  let hold = 0

  function press(e: PointerEvent, t: Tool) {
    tipFor = null
    clearTimeout(tipTimer)
    if (e.button !== 0 || !t.variants) return
    const top = (e.currentTarget as HTMLElement).offsetTop
    hold = window.setTimeout(() => show(t, top), 350)
  }

  function show(t: Tool, top: number) {
    open = t.id
    openAt = top
  }

  function choose(t: Tool, variant?: string) {
    if (t.variants && variant) t.variants.set(variant)
    useTool(t.id)
    open = null
  }

  function outside(e: PointerEvent) {
    if (open && !(e.target as HTMLElement).closest('.variants')) open = null
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => e.key === 'Escape' && (open = null)} />

<div class="tools">
  {#each tools as t, i}
    {#if i && group(t) !== group(tools[i - 1])}<span class="sep"></span>{/if}
    <button
      class="tool"
      class:on={app.canvasTool === t.id}
      aria-label={t.label}
      onpointerenter={(e) => enter(e, t)}
      onpointerdown={(e) => press(e, t)}
      onpointerup={() => clearTimeout(hold)}
      onpointerleave={leave}
      onclick={() => open !== t.id && choose(t)}
      oncontextmenu={(e) => {
        e.preventDefault()
        if (t.variants) show(t, e.currentTarget.offsetTop)
      }}
    >
      <Icon name={t.icon()} />
      {#if t.variants}<span class="more"></span>{/if}
    </button>
  {/each}

  {#if tipFor && !open}
    {@const t = tipFor.tool}
    <div class="tip" style:top="{tipFor.top}px">
      <span>{t.label}</span><kbd>{t.key}</kbd>
    </div>
  {/if}

  {#each tools as t}
    {#if open === t.id && t.variants}
      {@const v = t.variants}
      <div class="variants" style:top="{openAt}px">
        {#each v.options as option}
          <button class:on={v.get() === option} onclick={() => choose(t, option)}>{t.label} {option}</button>
        {/each}
      </div>
    {/if}
  {/each}
</div>

<style>
  .tools {
    position: relative;
    width: 36px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 0;
    background: var(--panel);
    border-left: 1px solid var(--line);
  }
  .sep {
    width: 16px;
    height: 1px;
    margin: 3px 0;
    background: var(--line);
  }
  .tool {
    position: relative;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--dim);
  }
  .tool:hover {
    color: var(--strong);
  }
  .tool.on {
    background: var(--active);
    color: var(--strong);
  }
  .more {
    position: absolute;
    right: 3px;
    bottom: 3px;
    border-left: 3px solid transparent;
    border-bottom: 3px solid currentColor;
  }
  .tip {
    position: absolute;
    right: calc(100% + 6px);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    white-space: nowrap;
    font-size: 12px;
    color: var(--strong);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 7px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
    pointer-events: none;
  }
  .variants {
    position: absolute;
    right: calc(100% + 4px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 7px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  }
  .variants button {
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    font: 12px var(--mono);
    color: var(--fg);
    text-align: left;
    white-space: nowrap;
  }
  .variants button:hover {
    background: var(--hover);
  }
  .variants button.on {
    color: var(--accent);
  }
</style>
