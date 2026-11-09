import { Fonts } from '../../wailsjs/go/main/App'

// Fonts for text layers: built in, the user's from the font folder, and the
// system's that are there (Chinese and Japanese ones mostly).
type Font = { name: string; url: string | null }

const builtIn: Font[] = [
  ['Black Ops One', 'BlackOpsOne'],
  ['Big Shoulders Stencil', 'BigShouldersStencil'],
  ['Bebas Neue', 'BebasNeue'],
  ['Anton', 'Anton'],
  ['Archivo Black', 'ArchivoBlack'],
  ['Silkscreen', 'Silkscreen'],
  ['Fusion Pixel', 'FusionPixel12'],
  ['ZCOOL QingKe HuangYou', 'ZCOOLQingKeHuangYou'],
  ['Dela Gothic One', 'DelaGothicOne'],
].map(([name, file]) => ({ name, url: `/fonts/${file}.woff2` }))

const system = ['PingFang HK', 'PingFang SC', 'Hiragino Sans', 'Microsoft JhengHei', 'Microsoft YaHei', 'Yu Gothic', 'Impact', 'Arial Black']

export const fonts = $state({ own: [] as Font[], system: [] as string[] })

// A system font is there when text in it measures unlike both fallbacks.
function installed(name: string) {
  const ctx = document.createElement('canvas').getContext('2d')!
  const width = (font: string) => {
    ctx.font = `40px ${font}`
    return ctx.measureText('mmWl 永和 あア').width
  }
  return ['monospace', 'serif'].every((fallback) => width(`"${name}", ${fallback}`) !== width(fallback))
}

export async function loadFonts() {
  fonts.system = system.filter(installed)
  try {
    const files = await Fonts()
    fonts.own = files.map((f) => ({ name: f.replace(/\.\w+$/, ''), url: `/font?file=${encodeURIComponent(f)}` }))
  } catch {
    fonts.own = []
  }
}

const loading = new Map<string, Promise<void>>()

// Resolves once the font can draw; missing fonts fall back to the system's.
export function ready(name: string): Promise<void> {
  const font = [...builtIn, ...fonts.own].find((f) => f.name === name)
  if (!font?.url) return Promise.resolve()
  let p = loading.get(name)
  if (!p) {
    const face = new FontFace(name, `url(${font.url})`)
    p = face.load().then(
      () => void document.fonts.add(face),
      () => undefined,
    )
    loading.set(name, p)
  }
  return p
}

export const builtInNames = builtIn.map((f) => f.name)

// Pixel fonts stay crisp only at multiples of the size they are drawn for.
export const pixelSizes: Record<string, number> = { Silkscreen: 8, 'Fusion Pixel': 12 }
