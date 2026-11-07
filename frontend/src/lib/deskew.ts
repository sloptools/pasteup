// Four-corner deskew of a photo region, from texxer's cut.ts.

export type Corner = [number, number]

// Top left, top right, bottom right, bottom left, in photo pixels.
export type Quad = [Corner, Corner, Corner, Corner]

// A photo's pixels, halved again and again, so any cut samples a level near its size.
export type Levels = { width: number; height: number; data: ImageData[] }

export function levels(img: HTMLImageElement): Levels {
  const width = img.naturalWidth
  const height = img.naturalHeight
  const data: ImageData[] = []
  let w = width
  let h = height
  let src: CanvasImageSource = img
  while (true) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, w, h)
    data.push(ctx.getImageData(0, 0, w, h))
    if (w <= 64 || h <= 64) break
    src = canvas
    w = Math.max(1, w >> 1)
    h = Math.max(1, h >> 1)
  }
  return { width, height, data }
}

// Maps the unit square onto the quad (Heckbert), u to the right, v down.
function squareToQuad(q: Corner[]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  let g = 0
  let h = 0
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = x1 - x2
    const dx2 = x3 - x2
    const dy1 = y1 - y2
    const dy2 = y3 - y2
    const den = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - dx2 * sy) / den
    h = (dx1 * sy - sx * dy1) / den
  }
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + h * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + h * y3
  return (u: number, v: number): Corner => {
    const w = g * u + h * v + 1
    return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w]
  }
}

const dist = (p: Corner, q: Corner) => Math.hypot(p[0] - q[0], p[1] - q[1])

function sample(img: ImageData, x: number, y: number, out: number[]) {
  const w = img.width
  const h = img.height
  x = Math.min(Math.max(x - 0.5, 0), w - 1)
  y = Math.min(Math.max(y - 0.5, 0), h - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = x - x0
  const fy = y - y0
  const d = img.data
  for (let c = 0; c < 4; c++) {
    const top = d[(y0 * w + x0) * 4 + c] * (1 - fx) + d[(y0 * w + x1) * 4 + c] * fx
    const bottom = d[(y1 * w + x0) * 4 + c] * (1 - fx) + d[(y1 * w + x1) * 4 + c] * fx
    out[c] += top * (1 - fy) + bottom * fy
  }
}

const sub = 2
const maxSide = 1024

// The quad straightened into a rectangle as large as the photo shows it.
export function deskew(photo: Levels, q: Quad): HTMLCanvasElement {
  const across = Math.max(dist(q[0], q[1]), dist(q[3], q[2]))
  const down = Math.max(dist(q[0], q[3]), dist(q[1], q[2]))
  const fit = Math.min(1, maxSide / Math.max(across, down))
  const ow = Math.max(1, Math.round(across * fit))
  const oh = Math.max(1, Math.round(down * fit))

  // The level with about sub photo pixels per output pixel.
  const level = Math.min(photo.data.length - 1, Math.max(0, Math.floor(Math.log2(across / ow / sub))))
  const img = photo.data[level]
  const scale = img.width / photo.width
  const map = squareToQuad(q.map(([x, y]) => [x * scale, y * scale]))

  const out = new ImageData(ow, oh)
  const acc = [0, 0, 0, 0]
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0
      for (let j = 0; j < sub; j++) {
        for (let i = 0; i < sub; i++) {
          const [sx, sy] = map((x + (i + 0.5) / sub) / ow, (y + (j + 0.5) / sub) / oh)
          sample(img, sx, sy, acc)
        }
      }
      const k = (y * ow + x) * 4
      for (let c = 0; c < 4; c++) out.data[k + c] = Math.round(acc[c] / (sub * sub))
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = ow
  canvas.height = oh
  canvas.getContext('2d')!.putImageData(out, 0, 0)
  return canvas
}

// The quad as the photo shows it: its bounding box, transparent outside.
export function cutout(img: HTMLImageElement, q: Quad): HTMLCanvasElement {
  const xs = q.map((c) => c[0])
  const ys = q.map((c) => c[1])
  const x0 = Math.floor(Math.min(...xs))
  const y0 = Math.floor(Math.min(...ys))
  const w = Math.ceil(Math.max(...xs)) - x0
  const h = Math.ceil(Math.max(...ys)) - y0
  const fit = Math.min(1, maxSide / Math.max(w, h))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * fit))
  canvas.height = Math.max(1, Math.round(h * fit))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(fit, fit)
  ctx.translate(-x0, -y0)
  ctx.beginPath()
  q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.clip()
  ctx.drawImage(img, 0, 0)
  return canvas
}
