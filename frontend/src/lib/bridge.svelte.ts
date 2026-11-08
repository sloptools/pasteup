import { BridgeConnected, BridgeRequestSync, BridgeTexture } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { addLayer, app, say, sizes, type Channel, type Layout } from './state.svelte'
import { readBack } from './readback'
import { addTexture, blank, current, empty, stateOf, switchTo, textureFor } from './textures.svelte'

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

type Sync = { blend: string; material: string; layout: Layout; images: Record<string, string> | null }

function image(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not read ${path}`))
    img.src = `/photo?path=${encodeURIComponent(path)}`
  })
}

// The images a material already has become the first layer of their channels,
// the texture taking the color image's size.
async function importImages(images: Record<string, string>) {
  for (const ch of ['color', 'emission', 'roughness'] as Channel[]) {
    if (!images[ch]) continue
    let img: HTMLImageElement
    try {
      img = await image(images[ch])
    } catch (err) {
      say(String(err))
      continue
    }
    if (ch === 'color') app.size = sizes.find((s) => s >= img.naturalWidth) ?? sizes[sizes.length - 1]
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    const layer = { name: images[ch].replace(/^.*\//, ''), canvas, x: app.size / 2, y: app.size / 2, scaleX: app.size / canvas.width, scaleY: app.size / canvas.height, turns: 0, flipX: false, flipY: false, island: null }
    if (ch === app.channel) addLayer(layer)
    else {
      const shown = { layers: app.layers, active: app.active }
      app.layers = []
      addLayer(layer)
      app.stacks[ch] = { layers: app.layers, active: app.active }
      app.layers = shown.layers
      app.active = shown.active
    }
  }
}

// Blender sends the objects of a material with their UVs; pasteup sends that
// texture's channels back as PNGs, into the material's images, once they rest.
class Bridge {
  // The .blend files whose add-on is listening.
  connected = $state<string[]>([])
  private snapshot: () => Record<string, string> = () => ({})
  private timer = 0
  private sent = ''
  // The color of the last versions sent, by material and version, to read Blender's paint against.
  private versions = new Map<string, string>()

  get live() {
    return !!app.blend && this.connected.includes(app.blend)
  }

  start(snapshot: () => Record<string, string>) {
    this.snapshot = snapshot
    EventsOn('bridge:sync', (s: Sync) => this.synced(s))
    EventsOn('bridge:select', (s: { blend: string; material: string; object: string }) => this.selected(s))
    EventsOn('bridge:paint', (p: { blend: string; material: string; png: string; texture: number }) => {
      const t = textureFor(p.blend, p.material)
      if (!t) return
      const base = this.versions.get(`${p.material}:${p.texture}`)
      if (!base) return say('blender painted on a texture pasteup no longer has')
      switchTo(t.id)
      readBack(p.png, base)
    })
    setInterval(() => this.poll(), 1500)
  }

  // A material's texture: the one there is, an untouched one, or a new one.
  private async synced(s: Sync) {
    let t = textureFor(s.blend, s.material)
    const fresh = !t || empty(t)
    if (t) switchTo(t.id)
    else if (!current().material && empty(current())) Object.assign(current(), { name: s.material, material: s.material })
    else addTexture({ name: s.material, material: s.material, files: {} }, blank())
    t = current()
    t.files = s.images ?? {}
    app.layout = s.layout
    app.blend = s.blend
    if (app.unknown?.material === s.material || app.unknown?.object === s.material) app.unknown = null
    if (fresh) await importImages(t.files)
    this.sent = ''
    say(`synced ${s.material} from blender: ${s.layout.uvs.length / 6} faces`)
    this.changed(true)
  }

  // An object made active in Blender: its texture shows, or pasteup offers to sync it.
  private selected(s: { blend: string; material: string; object: string }) {
    if (!app.textures.some((t) => stateOf(t).blend === s.blend)) return
    const t = s.material ? textureFor(s.blend, s.material) : undefined
    app.unknown = t || !s.object ? null : { object: s.object, material: s.material }
    if (t && app.follow) switchTo(t.id)
  }

  private async poll() {
    const was = this.live
    this.connected = await BridgeConnected()
    // A .blend that just started listening gets the texture as it is.
    if (this.live && !was) {
      this.sent = ''
      this.changed(true)
    }
  }

  changed(now = false) {
    if (!this.live) return
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.send(), now ? 0 : 300)
  }

  private async send() {
    const { blend } = app
    const { material, files } = current()
    if (!blend || !material) return
    const pngs = this.snapshot()
    const strength = app.emissionStrength
    const sig = hash(material + Object.entries(pngs).flat().join() + strength)
    if (sig === this.sent) return
    this.sent = sig
    try {
      const version = await BridgeTexture(blend, material, $state.snapshot(files), pngs, strength)
      if (pngs.color) this.versions.set(`${material}:${version}`, pngs.color)
      while (this.versions.size > 16) this.versions.delete(this.versions.keys().next().value!)
    } catch (err) {
      say(String(err))
    }
  }

  // Gets a material's objects again; with a name Blender has no material of, the object's.
  requestSync(name = current().material ?? '') {
    if (app.blend) BridgeRequestSync(app.blend, name)
  }
}

export const bridge = new Bridge()
