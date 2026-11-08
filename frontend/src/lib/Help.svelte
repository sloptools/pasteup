<script lang="ts">
  import Docs from './Docs.svelte'
  import Icon from './Icon.svelte'
  import { help } from './helpState.svelte'

  let { onclose }: { onclose: () => void } = $props()

  // Keys by area; the docs have the details.
  const groups: [string, [string, string][]][] = [
    [
      'everywhere',
      [
        ['⌘S ⌘⇧S', 'save, save as'],
        ['⌘O', 'open a project or model'],
        ['⌘Z ⌘⇧Z', 'undo, redo'],
        ['⌘⇧E', 'export the texture'],
        ['Tab ⇧Tab', 'hide, maximize the refs'],
        ['`', 'refs or the 3D view'],
        ['P', '3D view at game resolution'],
        ['⌘0', 'fit the view'],
        ['? F1', 'help: docs and keys'],
      ],
    ],
    [
      'canvas tools',
      [
        ['V T I', 'move, transform, island'],
        ['M ⇧M', 'select, rect or lasso'],
        ['B E', 'brush, eraser (⇧ next tip)'],
        ['G ⇧G', 'fill, bucket or gradient'],
        ['U ⇧U', 'shape, next kind'],
        ['L', 'line (⇧ 45° steps)'],
        ['X', 'swap colors'],
        ['⌥ click', 'pick a color'],
        ['⇧T O', 'tile mode, offset by half'],
      ],
    ],
    [
      'painting',
      [
        ['[ ]', 'size, outline width'],
        ['1–9 0', 'opacity'],
        ['⇧ click', 'line from the last stroke'],
        ['right button', 'secondary color'],
        ['⇧I', 'keep to the island'],
        ['Q', 'paint the layer mask'],
      ],
    ],
    [
      'selection, transform',
      [
        ['⌘A ⌘D ⌘⇧I', 'all, none, invert'],
        ['⌘C ⌘X', 'copy, cut (⌘⇧C everything)'],
        ['⌘V ⌘⇧V', 'paste floating, as a layer'],
        ['Enter Esc', 'place, discard'],
        ['T', 'transform, lifting a selection'],
        ['R H [ ]', 'turn, flip, scale (transform)'],
      ],
    ],
    [
      'layers',
      [
        ['⌘⇧N ⌘⇧A', 'new layer, adjustment'],
        ['⌘J ⌘E', 'duplicate, merge down'],
        ['⌘[ ⌘]', 'move down, up'],
        ['⌘⌥G', 'clip to the layer below'],
        ['⇧+ ⇧−', 'blend mode'],
        ['Enter', 'rename'],
        ['↑ ↓', 'select (after a click in the list)'],
      ],
    ],
    [
      'refs',
      [
        ['V C', 'move, cut'],
        ['D', 'straighten cuts'],
        ['Enter Esc', 'place the cut, drop it'],
        ['⌥ drag', 'corner without snapping'],
      ],
    ],
  ]

  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape' && e.key !== '?' && e.key !== 'F1') return
    e.preventDefault()
    e.stopPropagation()
    onclose()
  }
</script>

<svelte:window onkeydowncapture={key} />

<div class="backdrop" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet">
    <header>
      <button class="tab caps" class:on={help.tab === 'docs'} onclick={() => (help.tab = 'docs')}>docs</button>
      <button class="tab caps" class:on={help.tab === 'keys'} onclick={() => (help.tab = 'keys')}>keys</button>
      <div class="spacer"></div>
      <button class="close" onclick={onclose} aria-label="Close"><Icon name="x" size={11} /></button>
    </header>
    {#if help.tab === 'docs'}
      <div class="docs"><Docs /></div>
    {:else}
      <div class="keys-grid">
        {#each groups as [title, keys]}
          <section>
            <div class="caps">{title}</div>
            {#each keys as [k, what]}
              <div class="row"><span class="keys mono">{k}</span><span>{what}</span></div>
            {/each}
          </section>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.35);
  }
  .sheet {
    width: min(960px, 92vw);
    height: min(720px, 86vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.4);
  }
  header {
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
  }
  .tab {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: none;
  }
  .tab.on {
    background: var(--active);
    color: var(--strong);
  }
  .spacer {
    flex: 1;
  }
  .close {
    padding: 4px;
    border: 0;
    background: none;
    color: var(--dim);
  }
  .close:hover {
    color: var(--strong);
  }
  .docs {
    flex: 1;
    min-height: 0;
  }
  .keys-grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-content: start;
    gap: 18px 28px;
    padding: 22px 26px;
  }
  section .caps {
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    white-space: nowrap;
    gap: 10px;
    font-size: 12px;
    line-height: 20px;
    color: var(--fg);
  }
  .keys {
    width: 92px;
    flex: none;
    font: 11px/20px var(--mono);
    color: var(--strong);
  }
</style>
