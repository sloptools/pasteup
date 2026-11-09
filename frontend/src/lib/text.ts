import { ready } from './fonts.svelte'
import { addLayer, app, removeLayer, type Layer, type Text } from './state.svelte'
import { box } from './transform'

// The text's pixels, one per texel: lines across, or in vertical mode columns from
// the right with the letters stacked. Hard keeps each texel full or empty.
export function renderText(t: Text): HTMLCanvasElement {
  const probe = document.createElement('canvas').getContext('2d')!
  const font = `${t.size}px "${t.font}", sans-serif`
  probe.font = font
  const m = probe.measureText('Hg永')
  const ascent = Math.ceil(m.fontBoundingBoxAscent ?? t.size * 0.8)
  const line = ascent + Math.ceil(m.fontBoundingBoxDescent ?? t.size * 0.2)
  const lines = t.value.split('\n')
  const advance = (ch: string) => probe.measureText(ch).width + t.spacing

  // Each glyph's left and top within the text, and how big that is.
  const glyphs: { ch: string; x: number; y: number }[] = []
  let w = 1
  let h = 1
  if (t.vertical) {
    const column = Math.ceil(Math.max(t.size, ...[...t.value].map((ch) => probe.measureText(ch).width)))
    const step = line + t.spacing
    w = Math.max(1, lines.length * column + (lines.length - 1) * t.spacing)
    lines.forEach((text, i) => {
      const x = w - (i + 1) * column - i * t.spacing
      ;[...text].forEach((ch, j) => glyphs.push({ ch, x: x + (column - probe.measureText(ch).width) / 2, y: j * step }))
      h = Math.max(h, [...text].length * step - t.spacing)
    })
  } else {
    lines.forEach((text, i) => {
      let x = 0
      for (const ch of text) {
        glyphs.push({ ch, x, y: i * line })
        x += advance(ch)
      }
      w = Math.max(w, Math.ceil(x - t.spacing))
    })
    h = Math.max(1, lines.length * line)
  }

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = t.color
  // Without spacing, whole lines keep the font's kerning.
  if (!t.vertical && t.spacing === 0) lines.forEach((text, i) => ctx.fillText(text, 0, i * line + ascent))
  else for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y + ascent)

  if (t.hard) {
    const img = ctx.getImageData(0, 0, w, h)
    const n = parseInt(t.color.slice(1), 16)
    for (let i = 0; i < img.data.length; i += 4) {
      const on = img.data[i + 3] >= 128
      img.data.set(on ? [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255] : [0, 0, 0, 0], i)
    }
    ctx.putImageData(img, 0, 0)
  }
  return out
}

// A new text layer with its top left at a texel, in the style the bar shows.
export function newText(x: number, y: number) {
  const text: Text = { value: '', ...app.textStyle, color: app.colors[0] }
  addLayer({ name: 'text', canvas: renderText(text), text, x: x + 0.5, y: y + 0.5, scaleX: 1, scaleY: 1, turns: 0, flipX: false, flipY: false, island: null })
  app.textEdit = app.active
}

// The latest change per layer, as fonts load at their own pace.
const latest = new Map<string, number>()
let changes = 0

// Changes a text layer and draws it again, its top left staying put.
export async function setText(l: Layer, change: Partial<Text>) {
  const text = { ...l.text!, ...change }
  const n = ++changes
  latest.set(l.id, n)
  l.text = text
  await ready(text.font)
  if (latest.get(l.id) !== n) return
  const from = box(l)
  l.canvas = renderText(text)
  const to = box(l)
  l.x += from.x - to.x
  l.y += from.y - to.y
}

// Typing ends; an empty text goes away.
export function endText() {
  const l = app.layers.find((l) => l.id === app.textEdit)
  app.textEdit = null
  if (l?.text && !l.text.value.trim()) removeLayer(l.id)
}
