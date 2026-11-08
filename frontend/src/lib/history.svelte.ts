import { app, cloneLayer, type Layer } from './state.svelte'

// Undo over the layers and the texture size: a snapshot once edits rest, so a drag
// or a run of key presses is one step. Pieces are never changed in place, so
// snapshots share them.
type Snap = { layers: Layer[]; active: string | null; size: number }

const limit = 100
let past: Snap[] = []
let future: Snap[] = []
let last: Snap | null = null
let lastKey = ''
let timer = 0
let restoring = false

const copy = (layers: Layer[]): Layer[] => layers.map(cloneLayer)

function key(layers: Layer[], size: number) {
  return size + JSON.stringify(layers, (k, v) => (k === 'canvas' && v ? canvasKey(v) : v))
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
  const layers = copy(app.layers)
  const k = key(layers, app.size)
  if (k === lastKey) return
  if (last) past.push(last)
  if (past.length > limit) past.shift()
  future = []
  last = { layers, active: app.active, size: app.size }
  lastKey = k
}

// Ends the current step now, so a brush stroke is a step of its own.
export function checkpoint() {
  commit()
}

export function track() {
  $effect.root(() => {
    $effect(() => {
      key(app.layers, app.size)
      if (restoring) {
        restoring = false
        return
      }
      clearTimeout(timer)
      timer = window.setTimeout(commit, 300)
    })
  })
}

function restore(s: Snap) {
  restoring = true
  last = s
  lastKey = key(s.layers, s.size)
  app.layers = copy(s.layers)
  app.active = s.active
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

// What undo tracks, as a string: changes when the layers or the size do.
export const stateKey = () => key(app.layers, app.size)

// Starts undo over from what is there now, after opening a project.
export function resetHistory() {
  clearTimeout(timer)
  timer = 0
  past = []
  future = []
  last = { layers: copy(app.layers), active: app.active, size: app.size }
  lastKey = key(last.layers, last.size)
}
