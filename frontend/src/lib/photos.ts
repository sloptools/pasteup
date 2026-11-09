import { app, newId, type Photo } from './state.svelte'
import { levels, type Levels } from './deskew'
import { dirOf, fileOf } from './paths'

const cache = new WeakMap<HTMLImageElement, Levels>()

export function photoLevels(p: Photo): Levels {
  let l = cache.get(p.img)
  if (!l) {
    l = levels(p.img)
    cache.set(p.img, l)
  }
  return l
}

const imageExt = /\.(png|jpe?g|webp)$/i

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`can't load ${url}`))
    img.src = url
  })
}

// Adds photos side by side, starting at a board point.
async function add(sources: { name: string; dir: string; url: string }[], at: [number, number]) {
  let x = at[0]
  for (const s of sources) {
    const img = await load(s.url)
    app.photos.push({ id: newId(), name: s.name, dir: s.dir, img, x: Math.round(x), y: Math.round(at[1]) })
    x += img.naturalWidth + 40
  }
}

export function addPaths(paths: string[], at: [number, number]) {
  const sources = paths
    .filter((p) => imageExt.test(p))
    .map((p) => ({ name: fileOf(p), dir: dirOf(p), url: `/photo?path=${encodeURIComponent(p)}` }))
  return add(sources, at)
}

export function addFiles(files: File[], at: [number, number]) {
  const sources = files
    .filter((f) => imageExt.test(f.name))
    .map((f) => ({ name: f.name, dir: '', url: URL.createObjectURL(f) }))
  return add(sources, at)
}
