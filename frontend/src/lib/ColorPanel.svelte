<script lang="ts">
  import Icon from './Icon.svelte'
  import Slider from './Slider.svelte'
  import { LospecPalette, OpenPalette, QuakePalette } from '../../wailsjs/go/main/App'
  import { app, paletteColors, say } from './state.svelte'

  let pickers: HTMLInputElement[] = []
  let tab = $state<'swatches' | 'palette'>('swatches')
  let slug = $state<string | null>(null)

  // A palette for the project, chosen at once; one of the same name is replaced.
  function addPalette(p: { name: string; colors: string[] } | null) {
    if (!p) return
    app.palettes = [...app.palettes.filter((q) => q.name !== p.name), p]
    app.finish.palette = p.name
    app.finish.mode = 'fixed'
    say(`palette ${p.name}: ${p.colors.length} colors`)
  }

  async function lospec(text: string) {
    slug = null
    try {
      addPalette(await LospecPalette(text))
    } catch (e) {
      say(String(e))
    }
  }

  async function file() {
    try {
      addPalette(await OpenPalette())
    } catch (e) {
      say(String(e))
    }
  }

  function focusOn(input: HTMLInputElement) {
    input.focus()
  }

  function pick(e: MouseEvent, color: string) {
    e.preventDefault()
    app.colors[e.button === 2 ? 1 : 0] = color
  }

  function setHex(value: string) {
    const hex = value.trim().replace(/^#?/, '#').toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(hex)) app.colors[0] = hex
  }

  function swatch(e: MouseEvent, i: number) {
    e.preventDefault()
    if (e.altKey) app.swatches.splice(i, 1)
    else app.colors[e.button === 2 ? 1 : 0] = app.swatches[i]
  }

  function add() {
    if (!app.swatches.includes(app.colors[0])) app.swatches.push(app.colors[0])
  }
</script>

<section>
  <div class="head">
    <button class="tab caps" class:on={tab === 'swatches'} onclick={() => (tab = 'swatches')}>color</button>
    <button class="tab caps" class:on={tab === 'palette'} onclick={() => (tab = 'palette')}>palette{app.finish.mode !== 'off' ? ` · ${paletteColors().length}` : ''}</button>
  </div>
  <div class="row">
    <div class="pair">
      <button class="color secondary" title="Secondary, the right mouse button" style:background={app.colors[1]} onclick={() => pickers[1].click()}></button>
      <button class="color primary" title="Primary" style:background={app.colors[0]} onclick={() => pickers[0].click()}></button>
      <input type="color" bind:this={pickers[0]} bind:value={app.colors[0]} />
      <input type="color" bind:this={pickers[1]} bind:value={app.colors[1]} />
    </div>
    <button class="swap mono" title="Swap (X)" onclick={() => app.colors.reverse()}>⇄</button>
    <input class="hex mono" value={app.colors[0]} onchange={(e) => setHex(e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    <button class="pick" class:on={app.picking} title="Pick from the canvas (⌥ click while painting)" onclick={() => (app.picking = !app.picking)}>
      <Icon name="picker" />
    </button>
  </div>
  {#if tab === 'palette'}
    <div class="finish">
      <div class="line">
        <div class="seg" title="The texture maps to the palette: none, computed from it, or a chosen one">
          {#each ['off', 'auto', 'fixed'] as const as mode}
            <button class:on={app.finish.mode === mode} onclick={() => (app.finish.mode = mode)}>{mode}</button>
          {/each}
        </div>
        {#if app.finish.mode === 'auto'}
          <Slider compact bind:value={app.finish.colors} label="colors" min={2} max={256} step={1} title="How many colors the palette gets" />
        {/if}
      </div>
      {#if app.finish.mode === 'fixed'}
        <div class="line">
          {#if app.palettes.length}
            <select class="mono" bind:value={app.finish.palette}>
              {#each app.palettes as p}<option value={p.name}>{p.name}</option>{/each}
            </select>
          {/if}
          <button class="text-button" title="Quake's 256 colors" onclick={async () => addPalette(await QuakePalette())}>quake</button>
          <button class="text-button" title="A palette from lospec.com by its slug" onclick={() => (slug = '')}>lospec</button>
          <button class="text-button" title="A palette file: .lmp, .gpl, .hex or an image" onclick={file}>file</button>
        </div>
        {#if slug !== null}
          <input
            class="hex slug mono"
            placeholder="slug, as in lospec.com/palette-list/…"
            use:focusOn
            onkeydown={(e) => {
              if (e.key === 'Enter') lospec(e.currentTarget.value)
              else if (e.key === 'Escape') slug = null
              e.stopPropagation()
            }}
          />
        {/if}
      {/if}
      {#if paletteColors().length}
        <div class="palette">
          {#each paletteColors() as color, i (i)}
            <button class="dot" class:current={color === app.colors[0]} title="{color} · click primary, right-click secondary" style:background={color} onclick={(e) => pick(e, color)} oncontextmenu={(e) => pick(e, color)}></button>
          {/each}
        </div>
      {/if}
      <div class="line">
        <Slider compact bind:value={app.finish.dither} label="dither" min={0} max={1} step={0.01} scale={100} title="Ordered dither before the palette" />
        <Slider compact bind:value={app.finish.sharpen} label="sharpen" min={0} max={2} step={0.01} scale={100} title="Sharpen before the palette" />
      </div>
    </div>
  {:else}
  <div class="swatches">
    {#each app.swatches as color, i (color)}
      <button
        class="cell"
        class:current={color === app.colors[0]}
        title="{color} · click primary, right-click secondary, ⌥ click removes"
        style:background={color}
        onclick={(e) => swatch(e, i)}
        oncontextmenu={(e) => swatch(e, i)}
      ></button>
    {/each}
    <button class="cell add mono" title="Add the primary color" onclick={add}>+</button>
  </div>
  {/if}
</section>

<style>
  section {
    padding: 0 14px 10px;
    border-bottom: 1px solid var(--line);
  }
  .head {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: -6px;
  }
  .tab {
    height: 22px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    background: none;
  }
  .tab:hover {
    color: var(--fg);
  }
  .tab.on {
    background: var(--active);
    color: var(--strong);
  }
  .finish {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .line select {
    height: 24px;
    max-width: 110px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: 12px var(--mono);
    outline: none;
  }
  .slug {
    width: 100%;
    flex: none;
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(auto-fill, 10px);
    gap: 1px;
    max-height: 120px;
    overflow-y: auto;
  }
  .dot {
    width: 10px;
    height: 10px;
    padding: 0;
    border: 0;
    border-radius: 1px;
  }
  .dot.current {
    box-shadow: 0 0 0 1px var(--strong);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pair {
    position: relative;
    width: 34px;
    height: 30px;
    flex: none;
  }
  .color {
    position: absolute;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--faint);
    border-radius: 4px;
  }
  .primary {
    left: 0;
    top: 0;
    z-index: 1;
  }
  .secondary {
    right: 0;
    bottom: 0;
  }
  input[type='color'] {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .swap {
    padding: 0;
    border: 0;
    background: none;
    color: var(--dim);
    font-size: 13px;
  }
  .swap:hover {
    color: var(--strong);
  }
  .hex {
    width: 0;
    flex: 1;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: 12px var(--mono);
    outline: none;
  }
  .hex:focus {
    border-color: var(--dim);
  }
  .pick {
    padding: 3px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--dim);
  }
  .pick:hover {
    color: var(--strong);
  }
  .pick.on {
    background: var(--active);
    color: var(--accent);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, 14px);
    gap: 3px;
    margin-top: 10px;
  }
  .cell {
    width: 14px;
    height: 14px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgb(235 232 223 / 0.08);
  }
  .cell.current {
    box-shadow: 0 0 0 1px var(--bg), 0 0 0 2px var(--strong);
  }
  .add {
    display: grid;
    place-items: center;
    border: 1px dashed var(--faint);
    background: none;
    color: var(--dim);
    font-size: 11px;
  }
</style>
