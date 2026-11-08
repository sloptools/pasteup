<script lang="ts">
  import Icon from './Icon.svelte'
  import Slider from './Slider.svelte'
  import ContextMenu, { type Item } from './ContextMenu.svelte'
  import { activeLayer, app, blends, channels, masking, neutral, removeLayer, type Channel, type Adjust, type Layer } from './state.svelte'
  import { addAdjust, duplicate, invertMask, newGrunge, newLayer, toggleMaskMode } from './layerOps'
  import { generated, grunge, loadNames, newMask, scaleFor } from './grunge.svelte'
  import { OpenGrungeFolder } from '../../wailsjs/go/main/App'
  import { thumbs } from './thumbs.svelte'
  import { copyTo, present, remove as removeChannel, short, show } from './channels'

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
  // Effect settings folded away to keep the list tall.
  let folded = $state({ grunge: false, blur: false })
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
        ...(l.mask ? [{ label: 'remove mask', action: () => removeMask(l) }] : []),
        ...(l.grunge ? [{ label: 'remove grunge', action: () => (l.grunge = null) }] : []),
        ...(l.blur ? [{ label: 'remove blur', action: () => (l.blur = null) }] : []),
        ...channels.filter((ch) => ch !== app.channel).map((ch) => ({ label: `copy to ${ch}`, action: () => copyTo(l, ch) })),
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

  function channelMenu(e: MouseEvent, ch: Channel) {
    e.preventDefault()
    e.stopPropagation()
    const items: Item[] = [{ label: 'show faintly over others', action: () => (app.onion.channel = ch), disabled: ch === app.channel }]
    if (ch !== 'color') items.push({ label: `remove ${ch}`, action: () => removeChannel(ch), danger: true })
    menu = { x: e.clientX, y: e.clientY, items }
  }

  function setGrunge(l: Layer, map: string) {
    if (l.grunge) Object.assign(l.grunge, { map, scale: scaleFor(map) })
    else l.grunge = newMask(map)
  }

  // The folder entry shows the grunge folder; the list then shows the map again.
  function chooseMap(l: Layer, select: HTMLSelectElement) {
    if (select.value !== ':folder') return setGrunge(l, select.value)
    select.value = l.grunge?.map ?? ''
    OpenGrungeFolder()
  }

  function blurTo(b: NonNullable<Layer['blur']>, axis: 'x' | 'y', v: number) {
    b[axis] = v
    if (b.linked) b[axis === 'x' ? 'y' : 'x'] = v
  }

  function removeMask(l: Layer) {
    l.mask = null
    if (app.maskOf === l.id) app.maskOf = null
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
  <div class="head" class:focus={app.focus === 'layers'}>
    {#each channels as ch, i}
      {@const there = present().includes(ch)}
      <button
        class="tab caps"
        class:on={app.channel === ch}
        class:absent={!there}
        title={there ? `${ch} (⌘${i + 1}); right-click for more` : `add ${ch} (⌘⇧${i + 1})`}
        onclick={() => show(ch)}
        oncontextmenu={(e) => there && channelMenu(e, ch)}>{short[ch]}</button
      >
    {/each}
  </div>
  {#if present().length > 1}
    <div class="channel-row">
      <span class="kind mono">onion</span>
      <select class="mono" title="Another channel faintly over the canvas, for reference" value={app.onion.channel ?? ''} onchange={(e) => (app.onion.channel = (e.currentTarget.value || null) as Channel | null)}>
        <option value="">none</option>
        {#each present().filter((ch) => ch !== app.channel) as ch}<option value={ch}>{ch}</option>{/each}
      </select>
      {#if app.onion.channel}
        <div class="onion-opacity"><Slider bind:value={app.onion.opacity} min={0.05} max={1} step={0.05} scale={100} title="Onion opacity" /></div>
      {/if}
    </div>
    {#if present().includes('emission')}
      <div class="channel-row">
        <span class="kind mono">glow</span>
        <div class="onion-opacity"><Slider bind:value={app.emissionStrength} min={0} max={10} step={0.1} decimals={1} reset={1} title="Emission strength, in Blender and the 3D view; double-click resets" /></div>
      </div>
    {/if}
    {#if present().includes('ao')}
      <div class="channel-row">
        <button class="check" class:on={app.bakeAO} title="Export and Blender get the color with the AO multiplied in; off writes the AO as its own file" onclick={() => (app.bakeAO = !app.bakeAO)}>
          <span class="box"></span>ao into color
        </button>
      </div>
    {/if}
  {/if}
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
        <span class="thumb" class:off={!l.visible}>
          {#if l.adjust}<Icon name="adjust" size={11} />{:else if thumbs[l.id]}<img src={thumbs[l.id]} alt="" />{/if}
        </span>
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
        {#if l.blur}<span class="badge" title="blurred"><Icon name="blur" size={11} /></span>{/if}
        {#if l.grunge}<span class="badge" title="grunge mask"><Icon name="grunge" size={11} /></span>{/if}
        {#if l.mask}
          <button
            class="badge mask"
            class:on={masking() && l.id === app.active}
            title="Paint the mask (Q)"
            onclick={() => {
              app.maskOf = masking() && l.id === app.active ? null : l.id
              app.active = l.id
            }}><Icon name="invert" size={11} /></button
          >
        {/if}
        <button class="icon remove" class:armed={armed === l.id} title="delete (Backspace in the canvas)" onclick={() => remove(l.id)}>
          {#if armed === l.id}delete?{:else}<Icon name="x" size={11} />{/if}
        </button>
      </div>
    {:else}
      <div class="empty">cut a piece in the refs, paint, or paste</div>
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
      {#if active.color}
        <div class="props">
          <label class="swatch" title="The layer's color" style:background={active.color}>
            <input type="color" bind:value={active.color} />
          </label>
          <span class="hex mono">{active.color}</span>
          <div class="spacer"></div>
          <button class="text-button" title="Take the primary color" onclick={() => active.color && (active.color = app.colors[0])}>primary</button>
        </div>
      {/if}
      {#if active.mask}
        <div class="props">
          <span class="kind mono">mask</span>
          <button class="check" class:on={masking()} title="Paint the mask: brush shows, eraser hides (Q)" onclick={() => (app.maskOf = masking() ? null : active.id)}>
            <span class="box"></span>paint
          </button>
          <div class="spacer"></div>
          <button class="icon small" title="Swap shown and hidden" onclick={() => invertMask(active)}><Icon name="invert" /></button>
          <button class="icon small" title="Remove the painted mask" onclick={() => removeMask(active)}><Icon name="trash" /></button>
        </div>
      {/if}
      {#if active.grunge}
        {@const g = active.grunge}
        <div class="props">
          <button class="kind fold mono" title="Show or hide its settings" onclick={() => (folded.grunge = !folded.grunge)}>
            <span class="caret" class:open={!folded.grunge}>▸</span>grunge
          </button>
          <select class="mono grunge-map" title="Grunge mask: the layer shows only where it does" value={g.map} onfocus={loadNames} onchange={(e) => chooseMap(active, e.currentTarget)}>
            {#each [...generated, ...grunge.names] as name}<option value={name}>{name.replace('_', ' ')}</option>{/each}
            {#if !generated.includes(g.map) && !grunge.names.includes(g.map)}<option value={g.map}>{g.map.replace('_', ' ')} (missing)</option>{/if}
            <option disabled>──</option>
            <option value=":folder">maps folder…</option>
          </select>
          <button class="icon small" class:on={g.invert} title="Inverted: show where the grunge hides" onclick={() => (g.invert = !g.invert)}><Icon name="invert" /></button>
          <button class="icon small" title="Remove the grunge mask" onclick={() => (active.grunge = null)}><Icon name="trash" /></button>
        </div>
        {#if !folded.grunge}
          <div class="adjust">
            <Slider bind:value={g.scale} label={g.map === 'noise' ? 'block' : 'scale'} min={1} max={16} step={1} title={g.map === 'noise' ? 'Block size in texels' : 'Repeats across the texture'} />
            <Slider bind:value={g.stretch} label="stretch" min={-8} max={8} step={1} reset={1} title="Pulls the map down (up to 8) or across (down to -8); double-click resets" />
            <Slider bind:value={g.level} label="level" min={-1} max={1} step={0.01} scale={100} reset={0} title="How much shows; double-click resets" />
            <Slider bind:value={g.contrast} label="contrast" min={0} max={1} step={0.01} scale={100} title="Soft to hard edges" />
            <Slider bind:value={g.seed} label="seed" min={1} max={99} step={1} title="Another variant" />
          </div>
        {/if}
      {/if}
      {#if active.blur}
        {@const b = active.blur}
        <div class="props">
          <button class="kind fold mono" title="Show or hide its settings" onclick={() => (folded.blur = !folded.blur)}>
            <span class="caret" class:open={!folded.blur}>▸</span>blur
          </button>
          <span class="summary mono">{b.x}{b.linked ? '' : ` × ${b.y}`}</span>
          <div class="spacer"></div>
          <button class="icon small" class:on={b.linked} title="Across and down together" onclick={() => (b.linked = !b.linked)}><Icon name="link" /></button>
          <button class="icon small" title="Remove the blur" onclick={() => (active.blur = null)}><Icon name="trash" /></button>
        </div>
        {#if !folded.blur}
          <div class="adjust">
            <Slider bind:value={() => b.x, (v) => blurTo(b, 'x', v)} label="across" min={0} max={32} step={0.5} decimals={1} title="Standard deviation in texels" />
            <Slider bind:value={() => b.y, (v) => blurTo(b, 'y', v)} label="down" min={0} max={32} step={0.5} decimals={1} title="Standard deviation in texels" />
          </div>
        {/if}
      {/if}
      {#if !active.mask || !active.grunge || (!active.blur && !active.adjust)}
        <div class="props adds">
          {#if !active.mask}<button class="text-button" title="A mask to paint where the layer shows (Q)" onclick={toggleMaskMode}>+ mask</button>{/if}
          {#if !active.grunge}<button class="text-button" title="A grunge mask: the layer shows only where it does" onclick={() => setGrunge(active, 'clouds')}>+ grunge</button>{/if}
          {#if !active.blur && !active.adjust}<button class="text-button" title="Gaussian blur, before the masks" onclick={() => (active.blur = { x: 2, y: 2, linked: true })}>+ blur</button>{/if}
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
    height: 30px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 2px;
  }
  .opacity {
    flex: 1;
  }
  .grunge-map {
    flex: 1;
    min-width: 0;
  }
  .kind {
    width: 60px;
    flex: none;
    font: 12px var(--mono);
    color: var(--dim);
  }
  .fold {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .fold:hover {
    color: var(--strong);
  }
  .caret {
    font-size: 11px;
    line-height: 1;
    transition: transform 0.1s;
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .summary {
    font: 12px var(--mono);
    color: var(--fg);
  }
  .adds {
    gap: 6px;
  }
  .icon.small {
    padding: 3px;
    border-radius: 5px;
  }
  .icon.small:hover {
    color: var(--strong);
    background: var(--hover);
  }
  .icon.small.on {
    color: var(--accent);
  }
  .thumb {
    width: 22px;
    height: 22px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--dim);
    background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 8px 8px;
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .thumb.off {
    opacity: 0.4;
  }
  .badge {
    display: grid;
    place-items: center;
    padding: 2px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--dim);
  }
  .badge.mask:hover {
    color: var(--strong);
    background: var(--hover);
  }
  .badge.on {
    color: var(--accent);
  }
  .swatch {
    position: relative;
    width: 22px;
    height: 22px;
    border: 1px solid var(--faint);
    border-radius: 4px;
    overflow: hidden;
  }
  .swatch input {
    position: absolute;
    inset: 0;
    opacity: 0;
  }
  .hex {
    font: 12px var(--mono);
    color: var(--fg);
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
  .tab {
    height: 22px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    background: none;
  }
  .tab:hover {
    color: var(--fg);
  }
  .tab.on {
    background: var(--active);
    color: var(--strong);
  }
  .tab.absent {
    color: var(--faint);
  }
  .tab.absent:hover {
    color: var(--dim);
  }
  .channel-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 6px;
  }
  .onion-opacity {
    flex: 1;
    --value-width: 30px;
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
