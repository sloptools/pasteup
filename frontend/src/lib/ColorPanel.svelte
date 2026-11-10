<script lang="ts">
  import Icon from './Icon.svelte'
  import Slider from './Slider.svelte'
  import { BuiltinPalettes, LospecPalette, OpenPalette } from '../../wailsjs/go/main/App'
  import { app, chosenColors, say } from './state.svelte'

  let pickers: HTMLInputElement[] = []
  let tab = $state<'color' | 'finish'>('color')
  let slug = $state<string | null>(null)
  let builtins = $state<{ name: string; colors: string[] }[]>([])
  BuiltinPalettes().then((b) => (builtins = b))

  // The PS1's look: a 16 or 256 color table per texture, in 15-bit color.
  function psx(colors: number) {
    Object.assign(app.finish, { mode: 'auto', colors, psx: true })
  }

  // A palette for the project, chosen at once; one of the same name is replaced.
  function addPalette(p: { name: string; colors: string[] } | null) {
    if (!p) return
    app.palettes = [...app.palettes.filter((q) => q.name !== p.name), p]
    app.finish.palette = p.name
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

  // The project's palettes, then the built-in ones not taken yet.
  const choices = () => [...app.palettes.map((p) => p.name), ...builtins.map((b) => b.name).filter((n) => !app.palettes.some((p) => p.name === n))]

  // Lospec and file run their action; the list then shows the chosen palette again.
  function choosePalette(select: HTMLSelectElement) {
    const value = select.value
    select.value = app.finish.palette ?? ''
    if (value === ':lospec') slug = ''
    else if (value === ':file') file()
    else if (value === '') app.finish.palette = null
    else {
      const b = builtins.find((b) => b.name === value)
      if (b && !app.palettes.some((p) => p.name === value)) addPalette(b)
      else app.finish.palette = value
    }
  }

  function pick(e: MouseEvent, color: string) {
    e.preventDefault()
    app.colors[e.button === 2 ? 1 : 0] = color
  }

  function setHex(value: string) {
    const hex = value.trim().replace(/^#?/, '#').toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(hex)) app.colors[0] = hex
  }

  // In the swatches, ⌥ click removes.
  function swatch(e: MouseEvent, i: number) {
    e.preventDefault()
    if (e.altKey && app.finish.palette === null) app.swatches.splice(i, 1)
    else app.colors[e.button === 2 ? 1 : 0] = chosenColors()[i]
  }

  function add() {
    if (!app.swatches.includes(app.colors[0])) app.swatches.push(app.colors[0])
  }
</script>

<section>
  <div class="head">
    <button class="tab caps" class:on={tab === 'color'} onclick={() => (tab = 'color')}>color</button>
    <button class="tab caps" class:on={tab === 'finish'} onclick={() => (tab = 'finish')}>finish{app.finish.mode !== 'off' ? ` · ${app.finish.mode === 'auto' ? 'auto' : (app.finish.palette ?? 'swatches')}` : ''}</button>
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
    <button class="pick" class:on={app.picking} title="Pick from the canvas (I, ⌥ click while painting)" onclick={() => (app.picking = !app.picking)}>
      <Icon name="picker" />
    </button>
  </div>
  {#if tab === 'finish'}
    <div class="finish">
      <div class="line">
        <div class="seg" title="The texture maps to a palette: none, the chosen one, or one computed from it">
          {#each [['off', 'off'], ['fixed', 'palette'], ['auto', 'auto']] as const as [mode, label]}
            <button class:on={app.finish.mode === mode} onclick={() => (app.finish.mode = mode)}>{label}</button>
          {/each}
        </div>
        {#if app.finish.mode === 'auto'}
          <Slider compact bind:value={app.finish.colors} label="colors" min={2} max={256} step={1} title="How many colors the palette gets" />
        {/if}
      </div>
      {#if app.finish.mode === 'auto' && app.autoPalette.length}
        <div class="palette">
          {#each app.autoPalette as color, i (i)}
            <button class="dot" class:current={color === app.colors[0]} title="{color} · click primary, right-click secondary" style:background={color} onclick={(e) => pick(e, color)} oncontextmenu={(e) => pick(e, color)}></button>
          {/each}
        </div>
      {/if}
      <div class="line">
        <button class="check" class:on={app.finish.psx} title="The PS1's 15-bit color: 32 steps a channel" onclick={() => (app.finish.psx = !app.finish.psx)}>
          <span class="box"></span>psx
        </button>
        <button class="text-button" title="PS1 4-bit texture: 16 colors from the texture, 15-bit" onclick={() => psx(16)}>psx 16</button>
        <button class="text-button" title="PS1 8-bit texture: 256 colors from the texture, 15-bit" onclick={() => psx(256)}>psx 256</button>
      </div>
      <div class="line">
        <Slider compact bind:value={app.finish.dither} label="dither" min={0} max={1} step={0.01} scale={100} title="Ordered dither before the palette" />
        <Slider compact bind:value={app.finish.sharpen} label="sharpen" min={0} max={2} step={0.01} scale={100} title="Sharpen before the palette" />
      </div>
    </div>
  {:else}
    <div class="line chooser">
      <select class="mono palettes" title="The colors to paint with" value={app.finish.palette ?? ''} onchange={(e) => choosePalette(e.currentTarget)}>
        <option value="">swatches</option>
        {#each choices() as name}<option value={name}>{name}</option>{/each}
        <option disabled>──</option>
        <option value=":lospec">lospec…</option>
        <option value=":file">file…</option>
      </select>
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
    <div class="swatches" class:small={chosenColors().length > 48}>
      {#each chosenColors() as color, i (i)}
        <button
          class="cell"
          class:current={color === app.colors[0]}
          title="{color} · click primary, right-click secondary{app.finish.palette === null ? ', ⌥ click removes' : ''}"
          style:background={color}
          onclick={(e) => swatch(e, i)}
          oncontextmenu={(e) => swatch(e, i)}
        ></button>
      {/each}
      {#if app.finish.palette === null}
        <button class="cell add mono" title="Add the primary color" onclick={add}>+</button>
      {/if}
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
  .palettes {
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
  .slug {
    width: 100%;
    flex: none;
    margin-top: 6px;
  }
  .chooser {
    margin-top: 10px;
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
    max-height: 150px;
    overflow-y: auto;
  }
  .swatches.small {
    grid-template-columns: repeat(auto-fill, 10px);
    gap: 1px;
  }
  .small .cell {
    width: 10px;
    height: 10px;
    border-radius: 1px;
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
