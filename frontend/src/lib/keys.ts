import { activeLayer, app, blends, removeLayer, selectModes, tips, type CanvasTool, type PaintTool } from './state.svelte'
import { clear, lift } from './clipboard'
import { flip, scaleBy, turn } from './transform'

// Picks a tool; the transform tool first lifts a selection into a floating layer.
export function useTool(tool: CanvasTool) {
  if (tool === 'transform') lift()
  app.canvasTool = tool
}

// Canvas keys; true when handled. Moves and transforms act on the active layer only.
export function canvasKey(e: KeyboardEvent): boolean {
  switch (e.key) {
    case 'v':
      app.canvasTool = 'move'
      return true
    case 'i':
      app.canvasTool = 'island'
      return true
    case 't':
      useTool('transform')
      return true
    case 'b':
    case 'e':
      app.canvasTool = e.key === 'b' ? 'brush' : 'eraser'
      return true
    case 'B':
    case 'E':
      return cycleTip(e.key === 'B' ? 'brush' : 'eraser')
    case 'm':
      app.canvasTool = 'select'
      return true
    case 'M':
      if (app.canvasTool === 'select') app.selectMode = selectModes[(selectModes.indexOf(app.selectMode) + 1) % selectModes.length]
      app.canvasTool = 'select'
      return true
    case 'x':
      app.colors.reverse()
      return true
    case 'Escape':
      if (app.picking) {
        app.picking = false
        return true
      }
      if (app.canvasTool === 'move') return false
      app.canvasTool = 'move'
      return true
  }

  // With a selection, delete clears its pixels instead of the layer.
  if ((e.key === 'Backspace' || e.key === 'Delete') && app.selection) {
    clear()
    return true
  }

  // 1 to 9 set the opacity in tens, 0 to full, as in Photoshop: the paint's
  // with brush and eraser, the layer's otherwise.
  const digit = /^Digit\d$/.test(e.code) && !e.shiftKey ? Number(e.code.slice(5)) : null
  const opacity = digit === 0 ? 1 : (digit ?? 0) / 10

  const tool = app.canvasTool
  if (tool === 'brush' || tool === 'eraser') {
    if (e.key === '[' || e.key === ']') {
      const size = app.tipSize[tool] + (e.key === ']' ? 1 : -1)
      app.tipSize[tool] = Math.min(Math.max(size, 1), 64)
      return true
    }
    if (digit !== null) {
      app.paintOpacity[tool] = opacity
      return true
    }
  }

  const l = activeLayer()
  if (!l) return false

  if (digit !== null) {
    l.opacity = opacity
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

  if (!l.canvas || (tool !== 'move' && tool !== 'transform')) return false
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
  }

  if (tool !== 'transform') return false
  switch (e.key) {
    case '[':
    case ']':
      scaleBy(l, e.key === ']' ? 1.1 : 1 / 1.1)
      return true
    case 'r':
    case 'R':
      turn(l, e.key === 'r' ? 1 : -1)
      return true
    case 'h':
    case 'H':
      flip(l, e.key === 'h')
      return true
  }
  return false
}

// Selects the tool, or its next variant when it is already selected.
function cycleTip(tool: PaintTool) {
  if (app.canvasTool === tool) app.tip[tool] = tips[(tips.indexOf(app.tip[tool]) + 1) % tips.length]
  app.canvasTool = tool
  return true
}

// Layer panel keys after a click in it; the rest act as in the canvas.
export function layersKey(e: KeyboardEvent): boolean {
  const l = activeLayer()
  const at = l ? app.layers.indexOf(l) : -1
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      const to = at + (e.key === 'ArrowUp' ? 1 : -1)
      if (at >= 0 && to >= 0 && to < app.layers.length) app.active = app.layers[to].id
      return true
    }
    case 'Backspace':
    case 'Delete':
      if (l) removeLayer(l.id)
      return true
  }
  return canvasKey(e)
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
