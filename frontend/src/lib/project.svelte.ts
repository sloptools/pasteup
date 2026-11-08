import { Confirm, OpenDialog, ProjectManifest, SaveDialog, SaveProject } from '../../wailsjs/go/main/App'
import { layersKey, resetHistory } from './history.svelte'
import { channels, app, newId, say, type Channel, type Layer, type Layout, type Photo, type Texture, type Tile } from './state.svelte'
import { blank, setTextures, stateOf, type TextureState } from './textures.svelte'

// A .pasteup file: project.json, pieces/ (layer pixels and painted masks), refs/
// (photo copies). Each texture's layers sit under their channels.
type LayerJson = Omit<Layer, 'canvas' | 'mask'> & { canvas: string | null; mask: string | null }
type TextureJson = Texture & {
  size: number
  tile: Tile
  layout: Layout | null
  blend: string | null
  active: string | null
  channels: Partial<Record<Channel, { layers: LayerJson[] }>>
  bakeAO?: boolean
  emissionStrength?: number
}
type Shared = {
  colors: [string, string]
  swatches: string[]
  finish?: typeof app.finish
  palettes?: typeof app.palettes
  autoPalette?: string[]
  photos: { id: string; name: string; entry: string; x: number; y: number }[]
}
type Manifest = Shared & { version: 2; textures: TextureJson[]; texture: string }
// Before textures: one, its fields at the top.
type ManifestV1 = Shared & Omit<TextureJson, keyof Texture> & { version: 1 }

// A texture state's channels that have a stack, color always.
const stacksOf = (s: TextureState) => channels.filter((ch) => ch === 'color' || ch === s.channel || s.stacks[ch])
const layersIn = (s: TextureState, ch: Channel) => (ch === s.channel ? s.layers : (s.stacks[ch]?.layers ?? []))

export const project = $state({ path: null as string | null, saved: '' })

// Entry names of pieces and photos, kept across saves: pieces never change in
// place, so one already in the file is copied over instead of written again.
const pieceEntries = new WeakMap<HTMLCanvasElement, string>()
const photoEntries = new Map<string, string>()
// The file the entries are in.
let entriesIn: { path: string; names: Set<string> } | null = null

function textureKey(t: Texture) {
  const s = stateOf(t)
  return (t.material ?? '') + s.size + stacksOf(s).map((ch) => ch + layersKey(layersIn(s, ch))).join() + s.bakeAO + s.emissionStrength + s.tile + (s.layout?.path ?? '') + (s.layout?.uvs.length ?? 0)
}

const changes = () => app.textures.map(textureKey).join('|') + JSON.stringify([app.finish, app.palettes]) + JSON.stringify(app.photos.map((p) => [p.id, p.x, p.y])) + app.swatches.join()

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

  const textures = app.textures.map((t): TextureJson => {
    const s = stateOf(t)
    const stacks: TextureJson['channels'] = {}
    for (const ch of stacksOf(s)) stacks[ch] = { layers: layersIn(s, ch).map((l): LayerJson => ({ ...$state.snapshot(l), canvas: piece(l.canvas), mask: piece(l.mask) }) as LayerJson) }
    return {
      ...$state.snapshot(t),
      size: s.size,
      tile: s.tile,
      layout: $state.snapshot(s.layout) as Layout | null,
      blend: s.blend,
      active: s.channel === 'color' ? s.active : (s.stacks.color?.active ?? null),
      channels: stacks,
      bakeAO: s.bakeAO,
      emissionStrength: s.emissionStrength,
    }
  })

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
    version: 2,
    textures,
    texture: app.texture,
    colors: [...app.colors],
    swatches: [...app.swatches],
    finish: $state.snapshot(app.finish),
    palettes: $state.snapshot(app.palettes),
    autoPalette: [...app.autoPalette],
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
    const m = upgrade(JSON.parse(await ProjectManifest(path)))
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

    const textures: { texture: Texture; state: TextureState }[] = []
    for (const t of m.textures) {
      const stacks: TextureState['stacks'] = {}
      for (const [ch, c] of Object.entries(t.channels) as [Channel, { layers: LayerJson[] }][]) {
        const layers: Layer[] = []
        for (const l of c.layers) layers.push({ ...l, canvas: await piece(l.canvas), mask: await piece(l.mask) })
        stacks[ch] = { layers, active: layers.at(-1)?.id ?? null }
      }
      const color = stacks.color ?? { layers: [], active: null }
      delete stacks.color
      textures.push({
        texture: { id: t.id, name: t.name, material: t.material, files: t.files ?? {} },
        state: { ...blank(t.size), tile: t.tile, layout: t.layout, blend: t.blend, layers: color.layers, active: t.active, stacks, bakeAO: t.bakeAO ?? true, emissionStrength: t.emissionStrength ?? 1 },
      })
    }
    const photos: Photo[] = []
    for (const p of m.photos) {
      photos.push({ id: p.id, name: p.name, dir: '', img: await load(url(p.entry)), x: p.x, y: p.y })
      photoEntries.set(p.id, p.entry)
      names.add(p.entry)
    }

    setTextures(textures, textures.some((t) => t.texture.id === m.texture) ? m.texture : textures[0].texture.id)
    Object.assign(app, {
      colors: m.colors,
      swatches: m.swatches,
      unknown: null,
      finish: { mode: 'off', colors: 64, palette: null, dither: 0, sharpen: 0, psx: false, ...m.finish },
      palettes: m.palettes ?? [],
      autoPalette: m.autoPalette ?? [],
      photos,
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

// A project from before textures: one texture, for the material the old add-on
// made, writing where it wrote.
function upgrade(m: Manifest | ManifestV1): Manifest {
  if (m.version === 2) return m
  const { version, size, tile, layout, blend, active, channels, bakeAO, emissionStrength, ...shared } = m
  const name = blend?.replace(/^.*\//, '').replace(/\.blend$/, '')
  const texture: TextureJson = {
    id: 'texture',
    name: name ?? layout?.name ?? 'texture',
    material: name ? `pasteup ${name}` : null,
    files: blend ? { color: blend.replace(/\.blend$/, '.png') } : {},
    size,
    tile,
    layout,
    blend,
    active,
    channels,
    bakeAO,
    emissionStrength,
  }
  return { ...shared, version: 2, textures: [texture], texture: texture.id }
}

// ⌘O: a project, or a model to lay the texture onto.
export async function openAny(openModel: (path: string) => void) {
  const path = await OpenDialog()
  if (!path) return
  if (path.endsWith('.pasteup')) open(path)
  else openModel(path)
}
