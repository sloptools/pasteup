import { BridgeConnected, BridgeRequestSync, BridgeTexture } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { app, say, type Layout } from './state.svelte'
import { readBack } from './readback'

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

// Blender sends a .blend's objects with their UVs; pasteup sends the channels back
// as PNGs beside the .blend, once they rest.
class Bridge {
  // The .blend files whose add-on is listening.
  connected = $state<string[]>([])
  private snapshot: () => Record<string, string> = () => ({})
  private timer = 0
  private sent = ''
  // The color of the last few versions sent, to read Blender's paint against.
  private versions = new Map<number, string>()

  get live() {
    return !!app.blend && this.connected.includes(app.blend)
  }

  start(snapshot: () => Record<string, string>) {
    this.snapshot = snapshot
    EventsOn('bridge:paint', (p: { blend: string; png: string; texture: number }) => {
      const base = this.versions.get(p.texture)
      if (p.blend !== app.blend) return
      if (!base) return say('blender painted on a texture pasteup no longer has')
      readBack(p.png, base)
    })
    EventsOn('bridge:sync', (s: { blend: string; layout: Layout }) => {
      app.layout = s.layout
      app.blend = s.blend
      this.sent = ''
      say(`synced ${s.layout.name} from blender: ${s.layout.uvs.length / 6} faces`)
      this.changed(true)
    })
    setInterval(() => this.poll(), 1500)
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
    const blend = app.blend
    if (!blend) return
    const pngs = this.snapshot()
    const sig = hash(Object.entries(pngs).flat().join())
    if (sig === this.sent) return
    this.sent = sig
    try {
      const version = await BridgeTexture(blend, pngs)
      if (pngs.color) this.versions.set(version, pngs.color)
      for (const v of this.versions.keys()) if (v < version - 8) this.versions.delete(v)
    } catch (err) {
      say(String(err))
    }
  }

  requestSync() {
    if (app.blend) BridgeRequestSync(app.blend)
  }
}

export const bridge = new Bridge()
