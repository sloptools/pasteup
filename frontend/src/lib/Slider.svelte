<script lang="ts">
  // A range with its value; click the value to type one. Values show in units of
  // value × scale, so 0.5 opacity reads 50. Compact drops the range: drag the
  // value sideways to change it.
  let {
    value = $bindable(),
    min,
    max,
    step,
    label = '',
    scale = 1,
    decimals = 0,
    reset,
    title = '',
    compact = false,
  }: {
    value: number
    min: number
    max: number
    step: number
    label?: string
    scale?: number
    decimals?: number
    reset?: number
    title?: string
    compact?: boolean
  } = $props()

  let editing = $state(false)
  const shown = $derived((value * scale).toFixed(decimals))

  // Closing the field blurs it, so a commit after Enter or Esc must do nothing.
  function commit(text: string) {
    if (!editing) return
    editing = false
    const n = Number(text.replace(',', '.'))
    if (text.trim() === '' || !Number.isFinite(n)) return
    value = Math.min(Math.max(n / scale, min), max)
  }

  function key(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement
    if (e.key === 'Enter') commit(input.value)
    else if (e.key === 'Escape') editing = false
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  // Sideways drag, the whole range in about 200 px; a click without a drag types.
  function scrub(e: PointerEvent) {
    if (e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    const from = value
    const x0 = e.clientX
    let moved = false
    el.setPointerCapture(e.pointerId)
    const move = (m: PointerEvent) => {
      const dx = m.clientX - x0
      if (!moved && Math.abs(dx) < 3) return
      moved = true
      const raw = from + (dx * (max - min)) / 200
      value = Math.min(Math.max(Math.round(raw / step) * step, min), max)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      if (!moved) editing = true
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  function focus(input: HTMLInputElement) {
    input.focus()
    input.select()
  }
</script>

<div class="slider mono" class:compact {title}>
  {#if label}<span class="label">{label}</span>{/if}
  {#if !compact}<input type="range" {min} {max} {step} bind:value ondblclick={() => reset !== undefined && (value = reset)} />{/if}
  {#if editing}
    <input class="value field" type="text" inputmode="decimal" value={shown} use:focus onkeydown={key} onblur={(e) => commit(e.currentTarget.value)} />
  {:else}
    {#if compact}
      <button class="value scrub" title="drag sideways, or click to type" onpointerdown={scrub}>{shown}</button>
    {:else}
      <button class="value" title="click to type" onclick={() => (editing = true)}>{shown}</button>
    {/if}
  {/if}
</div>

<style>
  .slider {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 22px;
    font: 12px var(--mono);
    color: var(--fg);
  }
  .label {
    flex: none;
    width: var(--label-width, auto);
    color: var(--dim);
  }
  input[type='range'] {
    flex: var(--range-flex, 1);
    width: var(--range-width, 0);
    min-width: var(--range-min, 0);
  }
  .value {
    flex: none;
    width: var(--value-width, 34px);
    height: 20px;
    padding: 0 3px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    font: 12px var(--mono);
    color: var(--fg);
    text-align: right;
  }
  button.value:hover {
    border-color: var(--line);
    color: var(--strong);
  }
  .compact {
    gap: 4px;
  }
  .compact .value {
    width: var(--value-width, 40px);
    border-color: var(--line);
    background: var(--bg);
    cursor: ew-resize;
  }
  .compact input.value {
    cursor: text;
  }
  .field {
    border-color: var(--dim);
    background: var(--bg);
    color: var(--strong);
    outline: none;
  }
</style>
