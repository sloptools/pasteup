<script lang="ts">
  import Icon from './Icon.svelte'
  import Slider from './Slider.svelte'
  import ContextMenu, { type Item } from './ContextMenu.svelte'
  import { activeLayer, app, blends, neutral, removeLayer, type Adjust, type Layer } from './state.svelte'
  import { addAdjust, duplicate, newGrunge, newLayer } from './layerOps'
  import { generated, grunge, newMask, scaleFor } from './grunge.svelte'

  let { onmerge }: { onmerge: () => void } = $props()
  const active = $derived(activeLayer())

  // Slider ranges and the scale each value reads in.
  const controls: [keyof Adjust, string, number, number, number, number, number][] = [
    ['hue', 'hue', -180, 180, 1, 1, 0],
    ['saturation', 'sat', -1, 1, 0.01, 100, 0],
    ['brightness', 'bright', -1, 1, 0.01, 100, 0],
    ['black', 'black', 0, 1, 1 / 255, 255, 0],
    ['gamma', 'gamma', 0.1, 3, 0.01, 1, 2],
    ['white', 'white', 0, 1, 1 / 255, 255, 0],
  ]

  let armed = $state<string | null>(null)
  let menu = $state<{ x: number; y: number; items: Item[] } | null>(null)

  // On a row the menu acts on that layer, which becomes active; elsewhere only new layers.
  function openMenu(e: MouseEvent) {
    e.preventDefault()
    const row = (e.target as HTMLElement).closest<HTMLElement>('.row')
    if (row?.dataset.id) app.active = row.dataset.id
    const items: Item[] = [
      { label: 'new layer', key: '⌘⇧N', action: newLayer },
      { label: 'new adjustment', key: '⌘⇧A', action: addAdjust },
      { label: 'new grunge layer', action: newGrunge },
    ]
    const l = row && activeLayer()
    if (l) {
      const at = app.layers.indexOf(l)
      items.push(
        { label: 'rename', key: '↵', action: () => (app.renaming = l.id) },
        { label: 'duplicate', key: '⌘J', action: duplicate },
        { label: 'merge down', key: '⌘E', action: onmerge, disabled: at < 1 },
        { label: 'delete', action: () => removeLayer(l.id), danger: true },
      )
    }
    menu = { x: e.clientX, y: e.clientY, items }
  }
  let list: HTMLDivElement
  // While a row is dragged: its id and the gap it would drop into, counted from the top.
  let drag = $state<{ id: string; slot: number } | null>(null)
  let lineY = $state(0)

  function grab(e: PointerEvent, l: Layer) {
    app.active = l.id
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return
    const row = e.currentTarget as HTMLElement
    const startY = e.clientY
    row.setPointerCapture(e.pointerId)

    const move = (m: PointerEvent) => {
      if (!drag && Math.abs(m.clientY - startY) < 4) return
      const rows = [...list.querySelectorAll<HTMLElement>('.row')]
      const top = list.getBoundingClientRect().top
      let slot = rows.findIndex((r) => m.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2)
      if (slot < 0) slot = rows.length
      const edge = slot < rows.length ? rows[slot].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom
      lineY = edge - top + list.scrollTop
      drag = { id: l.id, slot }
    }
    const up = () => {
      row.removeEventListener('pointermove', move)
      row.removeEventListener('pointerup', up)
      row.removeEventListener('pointercancel', up)
      if (drag) drop(drag.id, drag.slot)
      drag = null
    }
    row.addEventListener('pointermove', move)
    row.addEventListener('pointerup', up)
    row.addEventListener('pointercancel', up)
  }

  // The list shows the top layer first, so slot s lies above array index n - s.
  function drop(id: string, slot: number) {
    const from = app.layers.findIndex((l) => l.id === id)
    let to = app.layers.length - slot
    if (from < to) to--
    if (from < 0 || to === from) return
    const [taken] = app.layers.splice(from, 1)
    app.layers.splice(to, 0, taken)
  }
  let disarm = 0

  // Two clicks delete, the first arms for a moment.
  function remove(id: string) {
    if (armed !== id) {
      armed = id
      clearTimeout(disarm)
      disarm = setTimeout(() => (armed = null), 2500)
      return
    }
    removeLayer(id)
    armed = null
  }

  function setMask(l: Layer, map: string) {
    if (!map) l.mask = null
    else if (l.mask) Object.assign(l.mask, { map, scale: scaleFor(map) })
    else l.mask = newMask(map)
  }

  function rename(l: Layer, name: string) {
    if (app.renaming !== l.id) return
    if (name.trim()) l.name = name.trim()
    app.renaming = null
  }

  function nameKey(e: KeyboardEvent, l: Layer) {
    const input = e.currentTarget as HTMLInputElement
    if (e.key === 'Enter') rename(l, input.value)
    else if (e.key === 'Escape') app.renaming = null
    else return
    e.preventDefault()
  }

  function focus(input: HTMLInputElement) {
    input.focus()
    input.select()
  }
</script>

<div class="layers" role="presentation" oncontextmenu={openMenu} onpointerdown={() => (app.focus = 'layers')}>
  <div class="head caps" class:focus={app.focus === 'layers'}>layers</div>
  <div class="list" bind:this={list}>
    {#each app.layers.toReversed() as l (l.id)}
      <div
        class="row"
        data-id={l.id}
        class:active={l.id === app.active}
        class:dragged={drag?.id === l.id}
        role="button"
        tabindex="-1"
        onpointerdown={(e) => grab(e, l)}
        ondblclick={() => (app.renaming = l.id)}
      >
        {#if l.clip}<span class="clipped" title="clipped to the layer below">↳</span>{/if}
        <button class="icon" class:off={!l.visible} title="visible" onclick={() => (l.visible = !l.visible)}>
          <Icon name="eye" size={11} />
        </button>
        {#if app.renaming === l.id}
          <input class="name" value={l.name} use:focus onkeydown={(e) => nameKey(e, l)} onblur={(e) => rename(l, e.currentTarget.value)} />
        {:else}
          <span class="name">{l.name}</span>
        {/if}
        <span class="island mono">
          {[l.blend === 'normal' ? '' : l.blend, l.opacity < 1 ? Math.round(l.opacity * 100) : '', l.island === null ? '' : `island ${l.island}`, l.mask ? 'mask' : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
        <button class="icon remove" class:armed={armed === l.id} title="delete (Backspace in the canvas)" onclick={() => remove(l.id)}>
          {#if armed === l.id}delete?{:else}<Icon name="x" size={11} />{/if}
        </button>
      </div>
    {:else}
      <div class="empty">cut a piece in the refs</div>
    {/each}
    {#if drag}<div class="line" style:top="{lineY - 1}px"></div>{/if}
  </div>
  {#if active}
    <div class="settings">
      <div class="props">
        <select class="mono" title="Blend mode (⇧+ ⇧−)" bind:value={active.blend}>
          {#each blends as b}<option value={b}>{b}</option>{/each}
        </select>
        <div class="spacer"></div>
        <button class="check" class:on={active.clip} title="Clip to the layer below (⌘⌥G)" onclick={() => (active.clip = !active.clip)}>
          <span class="box"></span>clip
        </button>
      </div>
      <div class="props">
        <div class="opacity">
          <Slider bind:value={active.opacity} min={0} max={1} step={0.01} scale={100} title="Opacity (1–9, 0)" />
        </div>
      </div>
      {#if active.adjust}
        {@const adjust = active.adjust}
        <div class="adjust">
          {#each controls as [key, label, min, max, step, scale, decimals]}
            <Slider bind:value={adjust[key]} {label} {min} {max} {step} {scale} {decimals} reset={neutral[key]} title="double-click resets" />
          {/each}
        </div>
      {/if}
      <div class="props">
        <select class="mono" title="Grunge mask: the layer shows only where it does" value={active.mask?.map ?? ''} onchange={(e) => setMask(active, e.currentTarget.value)}>
          <option value="">no mask</option>
          {#each [...generated, ...grunge.names] as name}<option value={name}>{name.replace('_', ' ')}</option>{/each}
        </select>
        {#if active.mask}
          <div class="spacer"></div>
          <button class="check" class:on={active.mask.invert} title="Show where the mask hides" onclick={() => active.mask && (active.mask.invert = !active.mask.invert)}>
            <span class="box"></span>invert
          </button>
        {/if}
      </div>
      {#if active.mask}
        {@const mask = active.mask}
        <div class="adjust">
          <Slider bind:value={mask.scale} label={mask.map === 'noise' ? 'block' : 'scale'} min={1} max={16} step={1} title={mask.map === 'noise' ? 'Block size in texels' : 'Repeats across the texture'} />
          <Slider bind:value={mask.level} label="level" min={-1} max={1} step={0.01} scale={100} reset={0} title="How much shows; double-click resets" />
          <Slider bind:value={mask.contrast} label="contrast" min={0} max={1} step={0.01} scale={100} title="Soft to hard edges" />
          <Slider bind:value={mask.seed} label="seed" min={1} max={99} step={1} title="Another variant" />
        </div>
      {/if}
    </div>
  {/if}
  <div class="actions">
    <button class="icon" title="New layer to paint on (⌘⇧N)" onclick={newLayer}><Icon name="layer" /></button>
    <button class="icon" title="Adjustment layer (⌘⇧A)" onclick={addAdjust}><Icon name="adjust" /></button>
    <button class="icon" title="Grunge layer in the primary color" onclick={newGrunge}><Icon name="grunge" /></button>
    <button class="icon" title="Duplicate (⌘J)" disabled={!active} onclick={duplicate}><Icon name="duplicate" /></button>
    <button class="icon" title="Merge down (⌘E)" disabled={!active} onclick={onmerge}><Icon name="merge" /></button>
    <div class="spacer"></div>
    <button class="icon remove-active" class:armed={active && armed === active.id} title="Delete (Backspace in the canvas)" disabled={!active} onclick={() => active && remove(active.id)}>
      {#if active && armed === active.id}<span class="mono">delete?</span>{:else}<Icon name="trash" />{/if}
    </button>
  </div>
</div>

{#if menu}
  <ContextMenu {...menu} onclose={() => (menu = null)} />
{/if}

<style>
  .layers {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 8px;
  }
  .head {
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px;
  }
  .opacity {
    flex: 1;
  }
  .adjust {
    --label-width: 60px;
    display: grid;
    gap: 2px;
    padding: 0 6px 8px;
  }
  .props {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 8px;
  }
  .spacer {
    flex: 1;
  }
  select {
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: 12px var(--mono);
    outline: none;
  }
  .clipped {
    margin-right: -2px;
    font: 11px var(--mono);
    color: var(--dim);
  }
  .head.focus {
    color: var(--fg);
  }
  .list {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 6px;
  }
  .settings {
    flex: none;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .row:focus {
    outline: none;
  }
  .actions {
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 2px;
    border-top: 1px solid var(--line);
  }
  .actions .icon {
    padding: 3px;
    border-radius: 5px;
  }
  .actions .icon:hover:not(:disabled) {
    color: var(--strong);
    background: var(--hover);
  }
  .actions .icon:disabled {
    color: var(--faint);
  }
  .remove-active.armed {
    color: var(--error);
    font: 11px var(--mono);
  }
  .line {
    position: absolute;
    left: 6px;
    right: 6px;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
    pointer-events: none;
  }
  .row.dragged {
    opacity: 0.5;
  }
  .row {
    height: 28px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    border-radius: 6px;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.active {
    background: var(--active);
    color: var(--strong);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  input.name {
    height: 22px;
    margin: 0 -4px;
    padding: 0 4px;
    border: 1px solid var(--dim);
    border-radius: 5px;
    background: var(--bg);
    color: var(--strong);
    font: inherit;
    outline: none;
  }
  .island {
    font: 11px var(--mono);
    color: var(--dim);
  }
  .icon {
    border: 0;
    padding: 2px;
    background: none;
    color: var(--dim);
  }
  .icon.off {
    color: var(--faint);
  }
  .remove {
    visibility: hidden;
    font: 11px var(--mono);
  }
  .row:hover .remove,
  .remove.armed {
    visibility: visible;
  }
  .remove.armed {
    color: var(--error);
  }
  .empty {
    padding: 6px;
    color: var(--dim);
  }
</style>
