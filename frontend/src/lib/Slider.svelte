<script lang="ts">
  // A range with its value; click the value to type one. Values show in units of
  // value × scale, so 0.5 opacity reads 50.
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

  function focus(input: HTMLInputElement) {
    input.focus()
    input.select()
  }
</script>

<div class="slider mono" {title}>
  {#if label}<span class="label">{label}</span>{/if}
  <input type="range" {min} {max} {step} bind:value ondblclick={() => reset !== undefined && (value = reset)} />
  {#if editing}
    <input class="value field" type="text" inputmode="decimal" value={shown} use:focus onkeydown={key} onblur={(e) => commit(e.currentTarget.value)} />
  {:else}
    <button class="value" title="click to type" onclick={() => (editing = true)}>{shown}</button>
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
    width: var(--label-width, auto);
    color: var(--dim);
  }
  input[type='range'] {
    flex: var(--range-flex, 1);
    width: var(--range-width, 0);
    min-width: 0;
  }
  .value {
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
  .field {
    border-color: var(--dim);
    background: var(--bg);
    color: var(--strong);
    outline: none;
  }
</style>
