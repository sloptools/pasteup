<script lang="ts">
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
        ['⌘0', 'fit the view'],
        ['?', 'this overview'],
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
    if (e.key !== 'Escape' && e.key !== '?') return
    e.preventDefault()
    e.stopPropagation()
    onclose()
  }
</script>

<svelte:window onkeydowncapture={key} />

<div class="backdrop" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet">
    {#each groups as [title, keys]}
      <section>
        <div class="caps">{title}</div>
        {#each keys as [k, what]}
          <div class="row"><span class="keys mono">{k}</span><span>{what}</span></div>
        {/each}
      </section>
    {/each}
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
    display: grid;
    grid-template-columns: repeat(3, 280px);
    gap: 18px 28px;
    padding: 22px 26px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.4);
  }
  .caps {
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
