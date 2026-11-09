import { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, type Renderer } from 'pixi.js'
import { quad, vertex } from './blend'
import type { Layer } from './state.svelte'

// Outline and shadow of a layer, texel exact, behind its pixels; cut to its island.
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
uniform sampler2D uSource;
uniform sampler2D uIsland;
uniform float uSize;
uniform vec2 uWrap;
uniform float uWidth;
uniform vec3 uOutline;
uniform vec2 uOffset;
uniform vec4 uShadow;
uniform float uClip;

vec4 at(vec2 t) {
  if (uWrap.x > 0.5) t.x = mod(t.x, uSize);
  if (uWrap.y > 0.5) t.y = mod(t.y, uSize);
  if (t.x < 0.0 || t.y < 0.0 || t.x >= uSize || t.y >= uSize) return vec4(0.0);
  return texture(uSource, t / uSize);
}

// The alpha with the outline grown around it.
float grown(vec2 t) {
  float a = at(t).a;
  int r = int(uWidth);
  for (int dy = -8; dy <= 8; dy++) {
    for (int dx = -8; dx <= 8; dx++) {
      if (abs(dx) > r || abs(dy) > r || dx * dx + dy * dy > r * r + r) continue;
      a = max(a, at(t + vec2(dx, dy)).a);
    }
  }
  return a;
}

void main() {
  vec2 t = vUV * uSize;
  vec4 src = at(t);
  float o = uWidth > 0.0 ? grown(t) : 0.0;
  float s = uShadow.a > 0.0 ? (uWidth > 0.0 ? grown(t - uOffset) : at(t - uOffset).a) : 0.0;
  vec4 c = vec4(uShadow.rgb, 1.0) * uShadow.a * s;
  c = vec4(uOutline, 1.0) * o + c * (1.0 - o);
  c = src + c * (1.0 - src.a);
  if (uClip > 0.5) c *= texture(uIsland, vUV).a;
  color = c;
}
`

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
}

export class EffectsPass {
  private mesh: Mesh<MeshGeometry, Shader>
  private shader: Shader
  private scratch: RenderTexture | null = null

  constructor(private renderer: Renderer) {
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'pasteup-effects' }),
      resources: {
        uSource: Texture.EMPTY.source,
        uIsland: Texture.WHITE.source,
        effects: {
          uSize: { value: 0, type: 'f32' },
          uWrap: { value: [0, 0], type: 'vec2<f32>' },
          uWidth: { value: 0, type: 'f32' },
          uOutline: { value: [0, 0, 0], type: 'vec3<f32>' },
          uOffset: { value: [0, 0], type: 'vec2<f32>' },
          uShadow: { value: [0, 0, 0, 0], type: 'vec4<f32>' },
          uClip: { value: 0, type: 'f32' },
        },
      },
    })
    this.mesh = quad(this.shader)
  }

  // Draws the layer's effects into rt, behind what it holds.
  draw(rt: RenderTexture, l: Layer, island: RenderTexture | null, wrap: { x: boolean; y: boolean }) {
    const size = rt.width
    if (this.scratch?.width !== size) {
      this.scratch?.destroy(true)
      this.scratch = RenderTexture.create({ width: size, height: size, scaleMode: 'nearest' })
    }
    const r = this.shader.resources
    r.uSource = rt.source
    r.uIsland = (island ?? Texture.WHITE).source
    const u = r.effects.uniforms
    u.uSize = size
    u.uWrap = [wrap.x ? 1 : 0, wrap.y ? 1 : 0]
    u.uWidth = l.outline ? Math.min(Math.round(l.outline.width), 8) : 0
    u.uOutline = rgb(l.outline?.color ?? '#000000')
    u.uOffset = l.shadow ? [l.shadow.x, l.shadow.y] : [0, 0]
    u.uShadow = l.shadow ? [...rgb(l.shadow.color), l.shadow.opacity] : [0, 0, 0, 0]
    u.uClip = island ? 1 : 0
    this.mesh.scale.set(size, size)
    this.renderer.render({ container: this.mesh, target: this.scratch, clear: true, clearColor: [0, 0, 0, 0] })
    // Back into rt, which callers hold on to: the same pass with no effects copies.
    r.uSource = this.scratch.source
    u.uWidth = 0
    u.uShadow = [0, 0, 0, 0]
    u.uClip = 0
    this.renderer.render({ container: this.mesh, target: rt, clear: true, clearColor: [0, 0, 0, 0] })
  }
}
