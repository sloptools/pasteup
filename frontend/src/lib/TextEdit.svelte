<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from './state.svelte'
  import { endText, setText } from './text'

  // Where the text layer's top left and bottom are on screen, relative to the canvas.
  let { place }: { place: () => { left: number; top: number } | null } = $props()

  let field: HTMLTextAreaElement
  let at = $state<{ left: number; top: number } | null>(null)
  const layer = $derived(app.layers.find((l) => l.id === app.textEdit && l.text))

  // The view pans and zooms outside Svelte, so the field follows it each frame.
  onMount(() => {
    let frame = requestAnimationFrame(function follow() {
      at = place()
      frame = requestAnimationFrame(follow)
    })
    field.focus()
    return () => cancelAnimationFrame(frame)
  })

  // Enter ends, ⇧Enter starts a new line (a new column when vertical).
  function key(e: KeyboardEvent) {
    e.stopPropagation()
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
      e.preventDefault()
      field.blur()
    }
  }
</script>

<textarea
  bind:this={field}
  class="edit mono"
  rows={Math.max(1, (layer?.text?.value.match(/\n/g)?.length ?? 0) + 1)}
  style:left="{at?.left ?? 0}px"
  style:top="{at?.top ?? 0}px"
  style:opacity={at ? 1 : 0}
  placeholder="type, ⏎ ends"
  value={layer?.text?.value ?? ''}
  oninput={(e) => layer && setText(layer, { value: e.currentTarget.value })}
  onkeydown={key}
  onblur={endText}
></textarea>

<style>
  .edit {
    position: absolute;
    z-index: 5;
    min-width: 120px;
    padding: 3px 6px;
    resize: none;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--raised);
    color: var(--strong);
    font: 12px var(--mono);
    outline: none;
  }
</style>
