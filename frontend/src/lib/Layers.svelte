<script lang="ts">
  import Icon from './Icon.svelte'
  import { activeLayer, app, blends, removeLayer, type Layer } from './state.svelte'
  import { duplicate } from './layerOps'

  let { onmerge }: { onmerge: () => void } = $props()
  const active = $derived(activeLayer())

  let armed = $state<string | null>(null)
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
      lineY = edge - top
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

<div class="layers">
  <div class="head caps">layers</div>
  {#if active}
    <div class="props">
      <select class="mono" title="Blend mode (⇧+ ⇧−)" bind:value={active.blend}>
        {#each blends as b}<option value={b}>{b}</option>{/each}
      </select>
      <label class="opacity mono" title="Opacity (1–9, 0)">
        <input type="range" min="0" max="1" step="0.01" bind:value={active.opacity} />
        <span>{Math.round(active.opacity * 100)}</span>
      </label>
    </div>
    <div class="props">
      <button class="check" class:on={active.clip} title="Clip to the layer below (⌘⌥G)" onclick={() => (active.clip = !active.clip)}>
        <span class="box"></span>clip
      </button>
      <div class="spacer"></div>
      <button class="text-button" title="Duplicate (⌘J)" onclick={duplicate}>duplicate</button>
      <button class="text-button" title="Merge down (⌘E)" onclick={onmerge}>merge</button>
    </div>
  {/if}
  <div class="list" bind:this={list}>
    {#each app.layers.toReversed() as l (l.id)}
      <div
        class="row"
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
          {[l.blend === 'normal' ? '' : l.blend, l.opacity < 1 ? Math.round(l.opacity * 100) : '', l.island === null ? '' : `island ${l.island}`]
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
</div>

<style>
  .layers {
    display: flex;
    flex-direction: column;
    padding: 0 8px;
  }
  .head {
    height: 26px;
    display: flex;
    align-items: center;
    padding: 0 6px;
  }
  .props {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 8px;
  }
  .props:last-of-type {
    border-bottom: 1px solid var(--line);
    margin-bottom: 6px;
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
  .opacity {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 12px var(--mono);
    color: var(--fg);
  }
  .opacity input {
    flex: 1;
    width: 0;
    min-width: 0;
    accent-color: var(--dim);
  }
  .opacity span {
    width: 24px;
    text-align: right;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0;
    border: 0;
    background: none;
    font: 12px var(--mono);
    color: var(--dim);
  }
  .check .box {
    width: 9px;
    height: 9px;
    border: 1px solid var(--faint);
    border-radius: 2px;
  }
  .check.on {
    color: var(--fg);
  }
  .check.on .box {
    background: var(--accent);
    border-color: var(--accent);
  }
  .clipped {
    margin-right: -2px;
    font: 11px var(--mono);
    color: var(--dim);
  }
  .list {
    position: relative;
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
