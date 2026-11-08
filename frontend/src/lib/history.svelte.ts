import { app, channels, cloneLayer, type Channel, type Layer } from './state.svelte'

// Undo over the layers of every channel and the texture size: a snapshot once edits
// rest, so a drag or a run of key presses is one step. Pieces are never changed in
// place, so snapshots share them. Showing another channel is no step.
type Stacks = Partial<Record<Channel, { layers: Layer[]; active: string | null }>>
type Snap = { layers: Layer[]; active: string | null; size: number; channel: Channel; stacks: Stacks }

const limit = 100
let past: Snap[] = []
let future: Snap[] = []
let last: Snap | null = null
let lastKey = ''
let timer = 0
let restoring = false

const copy = (layers: Layer[]): Layer[] => layers.map(cloneLayer)
const copyStacks = (st: Stacks): Stacks => Object.fromEntries(Object.entries(st).map(([ch, v]) => [ch, { layers: copy(v!.layers), active: v!.active }]))

const now = (): Snap => ({ layers: app.layers, active: app.active, size: app.size, channel: app.channel, stacks: app.stacks })

// Each channel's layers as a string, whichever channel shows.
function channelKeys(s: Snap): Partial<Record<Channel, string>> {
  const out: Partial<Record<Channel, string>> = {}
  for (const ch of channels) {
    const layers = ch === s.channel ? s.layers : s.stacks[ch]?.layers
    if (layers) out[ch] = layersKey(layers)
  }
  return out
}

export function layersKey(layers: Layer[]) {
  return JSON.stringify(layers, (k, v) => ((k === 'canvas' || k === 'mask') && v ? canvasKey(v) : v))
}

function key(s: Snap) {
  const keys = channelKeys(s)
  return s.size + channels.map((ch) => (keys[ch] === undefined ? '' : ch + keys[ch])).join('|')
}

const keys = new WeakMap<HTMLCanvasElement, number>()
let next = 0
function canvasKey(c: HTMLCanvasElement) {
  if (!keys.has(c)) keys.set(c, next++)
  return keys.get(c)
}

function commit() {
  clearTimeout(timer)
  timer = 0
  const snap = { ...now(), layers: copy(app.layers), stacks: copyStacks(app.stacks) }
  const k = key(snap)
  if (k === lastKey) return
  if (last) past.push(last)
  if (past.length > limit) past.shift()
  future = []
  last = snap
  lastKey = k
}

// Ends the current step now, so a brush stroke is a step of its own.
export function checkpoint() {
  commit()
}

export function track() {
  $effect.root(() => {
    $effect(() => {
      key(now())
      if (restoring) {
        restoring = false
        return
      }
      clearTimeout(timer)
      timer = window.setTimeout(commit, 300)
    })
  })
}

// Shows the channel the undone or redone step changed, so the change is seen.
function restore(s: Snap) {
  const was = last ? channelKeys(last) : {}
  const will = channelKeys(s)
  const changed = channels.find((ch) => was[ch] !== will[ch]) ?? app.channel
  restoring = true
  last = s
  lastKey = key(s)
  const all: Stacks = { ...copyStacks(s.stacks), [s.channel]: { layers: copy(s.layers), active: s.active } }
  const shown = all[changed] ? changed : s.channel
  const { layers, active } = all[shown]!
  delete all[shown]
  app.stacks = all
  app.channel = shown
  app.layers = layers
  app.active = active
  app.size = s.size
}

export function undo() {
  if (timer) commit()
  const s = past.pop()
  if (!s || !last) return false
  future.push(last)
  restore(s)
  return true
}

export function redo() {
  if (timer) commit()
  const s = future.pop()
  if (!s || !last) return false
  past.push(last)
  restore(s)
  return true
}

// Starts undo over from what is there now, after opening a project.
export function resetHistory() {
  clearTimeout(timer)
  timer = 0
  past = []
  future = []
  last = { ...now(), layers: copy(app.layers), stacks: copyStacks(app.stacks) }
  lastKey = key(last)
}
