import { activeLayer, app, blends, removeLayer } from './state.svelte'

// Canvas keys; true when handled. Transforms act on the active layer only.
export function canvasKey(e: KeyboardEvent): boolean {
  switch (e.key) {
    case 'v':
      app.canvasTool = 'move'
      return true
    case 'i':
      app.canvasTool = 'island'
      return true
    case 'Escape':
      if (app.canvasTool === 'move') return false
      app.canvasTool = 'move'
      return true
  }

  const l = activeLayer()
  if (!l) return false

  // 1 to 9 set the opacity in tens, 0 to full, as in Photoshop.
  if (/^Digit\d$/.test(e.code) && !e.shiftKey) {
    const d = Number(e.code.slice(5))
    l.opacity = d === 0 ? 1 : d / 10
    return true
  }
  if (e.key === '+' || e.key === '_' || (e.shiftKey && (e.code === 'Equal' || e.code === 'Minus'))) {
    const at = blends.indexOf(l.blend) + (e.code === 'Equal' || e.key === '+' ? 1 : -1)
    l.blend = blends[(at + blends.length) % blends.length]
    return true
  }

  const step = e.shiftKey ? 8 : 1
  switch (e.key) {
    case 'Enter':
      app.renaming = l.id
      return true
    case 'Backspace':
    case 'Delete':
      removeLayer(l.id)
      return true
  }

  if (!l.canvas) return false
  switch (e.key) {
    case 'ArrowLeft':
      l.x -= step
      return true
    case 'ArrowRight':
      l.x += step
      return true
    case 'ArrowUp':
      l.y -= step
      return true
    case 'ArrowDown':
      l.y += step
      return true
    case '[':
      l.scale /= 1.1
      return true
    case ']':
      l.scale *= 1.1
      return true
    case 'r':
      l.turns = (l.turns + 1) % 4
      return true
    case 'R':
      l.turns = (l.turns + 3) % 4
      return true
    case 'h':
      l.flipX = !l.flipX
      return true
    case 'H':
      l.flipY = !l.flipY
      return true
  }
  return false
}

export function refKey(e: KeyboardEvent): boolean {
  switch (e.key) {
    case 'v':
      app.refTool = 'move'
      return true
    case 'c':
      app.refTool = 'cut'
      return true
    case 'd':
      app.deskew = !app.deskew
      return true
    case 'Escape':
      if (app.refTool === 'move') return false
      app.refTool = 'move'
      return true
  }
  return false
}
