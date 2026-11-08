import type { Composer } from './compose'
import { app } from './state.svelte'

// Layer thumbnails for the list, redrawn once edits rest and only for layers that changed.
export const thumbs = $state<Record<string, string>>({})

const drawn = new Map<string, string>()
let timer = 0

export function refreshThumbs(composer: Composer) {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    for (const l of app.layers) {
      const sig = composer.sigOf(l.id)
      if (!sig || drawn.get(l.id) === sig) continue
      drawn.set(l.id, sig)
      thumbs[l.id] = composer.thumb(l, 44)?.toDataURL() ?? ''
    }
  }, 300)
}
