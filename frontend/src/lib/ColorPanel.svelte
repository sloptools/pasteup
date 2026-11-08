<script lang="ts">
  import Icon from './Icon.svelte'
  import { app } from './state.svelte'

  let pickers: HTMLInputElement[] = []

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
  <div class="head caps">color</div>
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
</section>

<style>
  section {
    padding: 0 14px 10px;
    border-bottom: 1px solid var(--line);
  }
  .head {
    height: 26px;
    display: flex;
    align-items: center;
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
    grid-template-columns: repeat(auto-fill, 16px);
    gap: 3px;
    margin-top: 10px;
  }
  .cell {
    width: 16px;
    height: 16px;
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
