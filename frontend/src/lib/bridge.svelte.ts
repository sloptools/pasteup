import { BridgeConnected, BridgeRequestSync, BridgeTexture } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { app, say, type Layout } from './state.svelte'

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

// Blender sends a .blend's objects with their UVs; pasteup sends the texture back
// as a PNG beside the .blend, once it rests.
class Bridge {
  // The .blend files whose add-on is listening.
  connected = $state<string[]>([])
  private snapshot: () => string = () => ''
  private timer = 0
  private sent = ''

  get live() {
    return !!app.blend && this.connected.includes(app.blend)
  }

  start(snapshot: () => string) {
    this.snapshot = snapshot
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
    const png = this.snapshot()
    const sig = hash(png)
    if (sig === this.sent) return
    this.sent = sig
    try {
      await BridgeTexture(blend, png)
    } catch (err) {
      say(String(err))
    }
  }

  requestSync() {
    if (app.blend) BridgeRequestSync(app.blend)
  }
}

export const bridge = new Bridge()
