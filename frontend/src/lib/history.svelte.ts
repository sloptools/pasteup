import { app, type Layer } from './state.svelte'

// Undo over the layers: a snapshot once edits rest, so a drag or a run of key
// presses is one step. Pieces are never changed in place, so snapshots share them.
type Snap = { layers: Layer[]; active: string | null }

const limit = 100
let past: Snap[] = []
let future: Snap[] = []
let last: Snap | null = null
let lastKey = ''
let timer = 0
let restoring = false

const copy = (layers: Layer[]): Layer[] => layers.map((l) => ({ ...l }))

function key(layers: Layer[]) {
  return JSON.stringify(layers, (k, v) => (k === 'canvas' ? `${v.width}x${v.height}:${canvasKey(v)}` : v))
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
  const k = key(layers)
  if (k === lastKey) return
  if (last) past.push(last)
  if (past.length > limit) past.shift()
  future = []
  last = { layers, active: app.active }
  lastKey = k
}

export function track() {
  $effect.root(() => {
    $effect(() => {
      key(app.layers)
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
  lastKey = key(s.layers)
  app.layers = copy(s.layers)
  app.active = s.active
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
