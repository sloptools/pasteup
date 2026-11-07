<script lang="ts">
  import Icon from './Icon.svelte'
  import { app, removeLayer, type Layer } from './state.svelte'

  let armed = $state<string | null>(null)
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
  {#each app.layers.toReversed() as l (l.id)}
    <div
      class="row"
      class:active={l.id === app.active}
      role="button"
      tabindex="-1"
      onpointerdown={() => (app.active = l.id)}
      ondblclick={() => (app.renaming = l.id)}
    >
      <button class="icon" class:off={!l.visible} title="visible" onclick={() => (l.visible = !l.visible)}>
        <Icon name="eye" size={11} />
      </button>
      {#if app.renaming === l.id}
        <input class="name" value={l.name} use:focus onkeydown={(e) => nameKey(e, l)} onblur={(e) => rename(l, e.currentTarget.value)} />
      {:else}
        <span class="name">{l.name}</span>
      {/if}
      <span class="island mono">{l.island === null ? '' : `island ${l.island}`}</span>
      <button class="icon remove" class:armed={armed === l.id} title="delete (Backspace in the canvas)" onclick={() => remove(l.id)}>
        {#if armed === l.id}delete?{:else}<Icon name="x" size={11} />{/if}
      </button>
    </div>
  {:else}
    <div class="empty">cut a piece in the refs</div>
  {/each}
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
