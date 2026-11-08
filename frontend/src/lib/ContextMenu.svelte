<script lang="ts">
  export type Item = { label: string; action: () => void; danger?: boolean; key?: string; disabled?: boolean }

  let { x, y, items, onclose }: { x: number; y: number; items: Item[]; onclose: () => void } = $props()
  let el: HTMLDivElement

  function outside(e: PointerEvent) {
    if (!el.contains(e.target as Node)) onclose()
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onclose()
  }
</script>

<svelte:window onpointerdowncapture={outside} onkeydowncapture={key} onblur={onclose} />

<div class="menu" style:left="{x}px" style:top="{y}px" bind:this={el}>
  {#each items as item}
    <button
      class:danger={item.danger}
      disabled={item.disabled}
      onclick={() => {
        onclose()
        item.action()
      }}
    >
      {item.label}
      {#if item.key}<span class="key mono">{item.key}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 10;
    min-width: 150px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 7px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.4);
  }
  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: none;
    text-align: left;
  }
  button:disabled {
    color: var(--faint);
  }
  .key {
    font: 11px var(--mono);
    color: var(--dim);
  }
  button:hover:not(:disabled) {
    background: var(--active);
    color: var(--strong);
  }
  button.danger:hover {
    color: var(--error);
  }
</style>
