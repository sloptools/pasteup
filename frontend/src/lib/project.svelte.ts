import { Confirm, OpenDialog, ProjectManifest, SaveDialog, SaveProject } from '../../wailsjs/go/main/App'
import { resetHistory, stateKey } from './history.svelte'
import { app, newId, say, type Layer, type Layout, type Photo, type Tile } from './state.svelte'

// A .pasteup file: project.json, pieces/ (layer pixels and painted masks), refs/
// (photo copies). Layers sit under channels, color for now.
type LayerJson = Omit<Layer, 'canvas' | 'mask'> & { canvas: string | null; mask: string | null }
type Manifest = {
  version: 1
  size: number
  tile: Tile
  colors: [string, string]
  swatches: string[]
  layout: Layout | null
  blend: string | null
  active: string | null
  channels: { color: { layers: LayerJson[] } }
  photos: { id: string; name: string; entry: string; x: number; y: number }[]
}

export const project = $state({ path: null as string | null, saved: '' })

// Entry names of pieces and photos, kept across saves: pieces never change in
// place, so one already in the file is copied over instead of written again.
const pieceEntries = new WeakMap<HTMLCanvasElement, string>()
const photoEntries = new Map<string, string>()
// The file the entries are in.
let entriesIn: { path: string; names: Set<string> } | null = null

const changes = () => stateKey() + JSON.stringify(app.photos.map((p) => [p.id, p.x, p.y])) + app.tile + app.swatches.join() + (app.layout?.path ?? '') + (app.layout?.uvs.length ?? 0)

export const dirty = () => changes() !== project.saved

export const projectName = () => project.path?.replace(/^.*\//, '').replace(/\.pasteup$/, '') ?? 'untitled'

// Nothing to save in a fresh app.
export function markClean() {
  project.saved = changes()
}

const base64 = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1]

function imageCanvas(img: HTMLImageElement) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

async function write(path: string) {
  const files: Record<string, string> = {}
  const disk: Record<string, string> = {}
  const keep: string[] = []
  const names = new Set<string>()
  const kept = (name: string) => entriesIn?.names.has(name)

  const piece = (c: HTMLCanvasElement | null) => {
    if (!c) return null
    let name = pieceEntries.get(c)
    if (!name) pieceEntries.set(c, (name = `pieces/${newId()}.png`))
    if (!names.has(name)) {
      names.add(name)
      if (kept(name)) keep.push(name)
      else files[name] = base64(c)
    }
    return name
  }

  const layers = app.layers.map((l): LayerJson => ({ ...$state.snapshot(l), canvas: piece(l.canvas), mask: piece(l.mask) }) as LayerJson)

  const photos = app.photos.map((p) => {
    let entry = photoEntries.get(p.id)
    if (!entry) photoEntries.set(p.id, (entry = `refs/${p.id}${p.name.match(/\.\w+$/)?.[0] ?? '.png'}`))
    names.add(entry)
    if (kept(entry)) keep.push(entry)
    else if (p.dir) disk[entry] = `${p.dir}/${p.name}`
    else files[entry] = base64(imageCanvas(p.img))
    return { id: p.id, name: p.name, entry, x: p.x, y: p.y }
  })

  const manifest: Manifest = {
    version: 1,
    size: app.size,
    tile: app.tile,
    colors: [...app.colors],
    swatches: [...app.swatches],
    layout: $state.snapshot(app.layout) as Layout | null,
    blend: app.blend,
    active: app.active,
    channels: { color: { layers } },
    photos,
  }
  await SaveProject({ path, manifest: JSON.stringify(manifest), files, disk, keep, from: entriesIn?.path ?? '' })
  entriesIn = { path, names }
  project.path = path
  markClean()
  say(`saved ${projectName()}`)
}

export async function save(as = false) {
  let path = project.path
  if (as || !path) {
    const dir = (project.path ?? app.layout?.path ?? '').replace(/\/[^/]*$/, '')
    path = await SaveDialog(dir, project.path ? projectName() : (app.layout?.name ?? 'texture'))
    if (!path) return
  }
  try {
    await write(path)
  } catch (e) {
    say(`could not save: ${e}`)
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`missing ${url}`))
    img.src = url
  })
}

export async function open(path: string) {
  if (dirty() && !(await Confirm('Unsaved changes', `Open ${path.replace(/^.*\//, '')} and drop the changes?`, 'Open'))) return
  try {
    const m = JSON.parse(await ProjectManifest(path)) as Manifest
    const url = (entry: string) => `/project?path=${encodeURIComponent(path)}&entry=${encodeURIComponent(entry)}`
    const names = new Set<string>()
    const canvases = new Map<string, HTMLCanvasElement>()
    const piece = async (entry: string | null) => {
      if (!entry) return null
      if (!canvases.has(entry)) {
        const c = imageCanvas(await load(url(entry)))
        pieceEntries.set(c, entry)
        canvases.set(entry, c)
        names.add(entry)
      }
      return canvases.get(entry)!
    }

    const layers: Layer[] = []
    for (const l of m.channels.color.layers) layers.push({ ...l, canvas: await piece(l.canvas), mask: await piece(l.mask) })
    const photos: Photo[] = []
    for (const p of m.photos) {
      photos.push({ id: p.id, name: p.name, dir: '', img: await load(url(p.entry)), x: p.x, y: p.y })
      photoEntries.set(p.id, p.entry)
      names.add(p.entry)
    }

    Object.assign(app, {
      size: m.size,
      tile: m.tile,
      colors: m.colors,
      swatches: m.swatches,
      layout: m.layout,
      blend: m.blend,
      layers,
      photos,
      active: m.active,
      selection: null,
      floating: null,
      maskOf: null,
      gradientAim: null,
    })
    entriesIn = { path, names }
    project.path = path
    resetHistory()
    markClean()
    say(`opened ${projectName()}`)
  } catch (e) {
    say(`could not open: ${e}`)
  }
}

// ⌘O: a project, or a model to lay the texture onto.
export async function openAny(openModel: (path: string) => void) {
  const path = await OpenDialog()
  if (!path) return
  if (path.endsWith('.pasteup')) open(path)
  else openModel(path)
}
