<script lang="ts">
  import { footprint } from './paint'
  import Slider from './Slider.svelte'
  import Icon from './Icon.svelte'
  import { discard, place } from './clipboard'
  import { gradientControl } from './gradientEdit'
  import { box, fit, flip, turn } from './transform'
  import { builtInNames, fonts, loadFonts, pixelSizes } from './fonts.svelte'
  import { setText } from './text'
  import { OpenFontsFolder } from '../../wailsjs/go/main/App'
  import { activeLayer, app, selectModes, shapes, tips, type Layer, type PaintTool, type Text, type Tip } from './state.svelte'

  const turns: [() => void, string, 'rotate' | 'flip', string][] = [
    [() => withLayer((l) => turn(l, -1)), 'Rotate 90° counter-clockwise (⇧R)', 'rotate', 'mirror'],
    [() => withLayer((l) => turn(l, 1)), 'Rotate 90° clockwise (R)', 'rotate', ''],
    [() => withLayer((l) => flip(l, true)), 'Flip horizontally (H)', 'flip', ''],
    [() => withLayer((l) => flip(l, false)), 'Flip vertically (⇧H)', 'flip', 'upright'],
  ]

  const hints: Record<string, string> = {
    move: 'drag the active layer · arrows',
    island: 'click an island to clip the active layer to it, F to fit it there too',
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
  // The list is fixed on screen below its button: the bar scrolls sideways, so it would cut it off.
  let listAt = $state({ left: 0, top: 0 })

  function toggleTips(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    listAt = { left: r.left, top: r.bottom + 4 }
    open = !open
  }

  // The text bar sets the active text layer, or how the next one starts.
  const textLayer = $derived(activeLayer()?.text ? activeLayer() : undefined)
  const style = $derived(textLayer?.text ?? { ...app.textStyle, color: app.colors[0] })

  // New text takes the primary color, so without a text layer the swatch sets that.
  function setStyle(change: Partial<Text>) {
    if (textLayer) setText(textLayer, change)
    const { color, value, ...rest } = change
    if (color && !textLayer) app.colors[0] = color
    Object.assign(app.textStyle, rest)
  }

  function chooseFont(select: HTMLSelectElement) {
    const pixel = pixelSizes[select.value]
    if (select.value !== ':folder') return setStyle({ font: select.value, ...(pixel && style.size % pixel ? { size: pixel } : {}) })
    select.value = style.font
    OpenFontsFolder()
  }

  function choose(tool: PaintTool, tip: Tip) {
    app.tip[tool] = tip
    open = false
  }

  // While the list is open, arrows pick the tip, Enter and Esc close it.
  function listKey(e: KeyboardEvent) {
    const tool = app.canvasTool
    if (!open || (tool !== 'brush' && tool !== 'eraser' && tool !== 'clone')) return
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

{#snippet islandClip()}
  <button class="check" class:on={app.islandClip} title={app.layout ? 'Keep to the UV island the stroke starts in (⇧I)' : 'Keeps to UV islands once a model is loaded (⇧I)'} onclick={() => (app.islandClip = !app.islandClip)}>
    <span class="box"></span>island
  </button>
{/snippet}

<div class="options">
  {#if app.canvasTool === 'brush' || app.canvasTool === 'eraser' || app.canvasTool === 'clone'}
    {@const tool = app.canvasTool}
    <div class="tips">
      <button class="current mono" title="Tip (⇧{{ brush: 'B', eraser: 'E', clone: 'S' }[tool]})" onclick={toggleTips}>
        {@render preview(app.tip[tool])}<span class="caret">▾</span>
      </button>
      {#if open}
        <div class="list" style:left="{listAt.left}px" style:top="{listAt.top}px">
          {#each tips as tip}
            <button class:on={app.tip[tool] === tip} title={tip} onclick={() => choose(tool, tip)}>{@render preview(tip)}</button>
          {/each}
        </div>
      {/if}
    </div>
    <Slider compact bind:value={app.tipSize[tool]} label="size" min={1} max={64} step={1} title="Size in texels ([ ])" />
    <Slider compact bind:value={app.hardness[tool]} label="hard" min={0} max={1} step={0.01} scale={100} title="Hardness: 100 is hard and texel exact, lower fades the tip out toward its edge" />
    <Slider compact bind:value={app.paintOpacity[tool]} label="opacity" min={0.01} max={1} step={0.01} scale={100} title="Opacity (1–9, 0)" />
    {@render islandClip()}
    {#if tool === 'clone'}
      {#if app.clone?.photo}
        <Slider compact bind:value={app.cloneScale} label="scale" min={0.01} max={1} step={0.01} scale={100} title="Texels per photo pixel, in %" />
      {:else if !app.clone}
        <span class="hint">⌥ click the canvas or a photo to clone from</span>
      {/if}
    {/if}
  {:else if app.canvasTool === 'fill' && app.fillMode === 'gradient'}
    <div class="seg">
      <button class:on={!app.gradient.radial} title="linear" onclick={() => (app.gradient.radial = false)}><Icon name="linear" size={11} /></button>
      <button class:on={app.gradient.radial} title="radial, around the start" onclick={() => (app.gradient.radial = true)}><Icon name="radial" size={11} /></button>
    </div>
    <button class="check" class:on={app.gradient.dither} title="Each texel one color or the other, in a Bayer pattern" onclick={() => (app.gradient.dither = !app.gradient.dither)}>
      <span class="box"></span>dither
    </button>
    <button class="check" class:on={app.gradient.clear} title="From the primary color to clear, instead of to the secondary" onclick={() => (app.gradient.clear = !app.gradient.clear)}>
      <span class="box"></span>clear
    </button>
    {#if app.gradientAim}
      {@const g = app.gradientAim}
      <Slider compact bind:value={g.angle} label="angle" min={-180} max={180} step={1} title="Direction in degrees, 0 to the right, 90 down" />
      <Slider compact bind:value={g.length} label="length" min={1} max={app.size * 2} step={1} title="Length in texels" />
      <button class="turn" title="Apply (Enter)" onclick={gradientControl.apply}><Icon name="check" /></button>
      <button class="turn" title="Discard (Esc)" onclick={gradientControl.cancel}><Icon name="x" /></button>
    {:else}
      {@render islandClip()}
      <Slider compact bind:value={app.paintOpacity.fill} label="opacity" min={0.01} max={1} step={0.01} scale={100} title="Opacity (1–9, 0)" />
    {/if}
  {:else if app.canvasTool === 'fill'}
    <Slider compact bind:value={app.fill.tolerance} label="tolerance" min={0} max={255} step={1} title="How far colors may differ, 0–255" />
    <button class="check" class:on={app.fill.contiguous} title="Only texels touching the clicked one" onclick={() => (app.fill.contiguous = !app.fill.contiguous)}>
      <span class="box"></span>contiguous
    </button>
    <button class="check" class:on={app.fill.merged} title="Compare colors of all visible layers, not just the active one" onclick={() => (app.fill.merged = !app.fill.merged)}>
      <span class="box"></span>all
    </button>
    <Slider compact bind:value={app.paintOpacity.fill} label="opacity" min={0.01} max={1} step={0.01} scale={100} title="Opacity (1–9, 0)" />
    {@render islandClip()}
  {:else if app.canvasTool === 'shape'}
    <div class="seg">
      {#each shapes as shape}
        <button class:on={app.shape === shape} title="{shape} (⇧U)" onclick={() => (app.shape = shape)}><Icon name={shape} size={11} /></button>
      {/each}
    </div>
    {#if !app.shape.endsWith('filled')}
      <Slider compact bind:value={app.shapeWidth} label="width" min={1} max={32} step={1} title="Outline or line width in texels ([ ])" />
    {/if}
    <Slider compact bind:value={app.paintOpacity.shape} label="opacity" min={0.01} max={1} step={0.01} scale={100} title="Opacity (1–9, 0)" />
    {@render islandClip()}
  {:else if app.canvasTool === 'text'}
    <select class="mono font" title="Font" value={style.font} onfocus={loadFonts} onchange={(e) => chooseFont(e.currentTarget)}>
      {#each builtInNames as name}<option value={name}>{name}</option>{/each}
      {#if fonts.own.length}<option disabled>──</option>{/if}
      {#each fonts.own as f}<option value={f.name}>{f.name}</option>{/each}
      {#if fonts.system.length}<option disabled>──</option>{/if}
      {#each fonts.system as name}<option value={name}>{name}</option>{/each}
      {#if ![...builtInNames, ...fonts.own.map((f) => f.name), ...fonts.system].includes(style.font)}<option value={style.font}>{style.font} (missing)</option>{/if}
      <option disabled>──</option>
      <option value=":folder">fonts folder…</option>
    </select>
    <label class="swatch" title="Text color" style:background={style.color}>
      <input type="color" value={style.color} oninput={(e) => setStyle({ color: e.currentTarget.value })} />
    </label>
    <Slider compact bind:value={() => style.size, (v) => setStyle({ size: v })} label="size" min={4} max={128} step={1} title="Size in texels" />
    <Slider compact bind:value={() => style.spacing, (v) => setStyle({ spacing: v })} label="spacing" min={-4} max={32} step={1} title="Extra space between letters in texels" />
    <button class="check" class:on={style.vertical} title="Letters stacked; lines become columns from the right" onclick={() => setStyle({ vertical: !style.vertical })}>
      <span class="box"></span>vertical
    </button>
    <button class="check" class:on={style.hard} title="Each texel full or empty, no soft edges" onclick={() => setStyle({ hard: !style.hard })}>
      <span class="box"></span>hard
    </button>
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
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    white-space: nowrap;
    /* Too narrow, it scrolls sideways rather than squeezing its controls. */
    overflow-x: auto;
    scrollbar-width: none;
  }
  .options::-webkit-scrollbar {
    display: none;
  }
  .options > :global(*) {
    flex-shrink: 0;
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
    position: fixed;
    z-index: 10;
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
  .font {
    height: 22px;
    max-width: 180px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: 12px var(--mono);
  }
  .swatch {
    position: relative;
    flex: none;
    width: 18px;
    height: 18px;
    border: 1px solid var(--faint);
    border-radius: 4px;
    overflow: hidden;
  }
  .swatch input {
    position: absolute;
    inset: 0;
    opacity: 0;
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
