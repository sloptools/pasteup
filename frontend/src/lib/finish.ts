import { CanvasSource, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, type Renderer } from 'pixi.js'
import { quad, vertex } from './blend'

// The crunch over the finished color: sharpen, ordered dither, then the nearest
// palette color. Colors are premultiplied; alpha stays.
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
uniform sampler2D uSource;
uniform sampler2D uPalette;
uniform float uColors;
uniform float uDither;
uniform float uSharpen;
uniform vec2 uTexel;

const float bayer[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);

vec3 rgb(vec4 p, vec3 empty) {
  return p.a > 0.0 ? p.rgb / p.a : empty;
}

void main() {
  vec4 s = texture(uSource, vUV);
  if (s.a <= 0.0) {
    color = vec4(0.0);
    return;
  }
  vec3 c = rgb(s, vec3(0.0));

  if (uSharpen > 0.0) {
    // Clear neighbors count as the texel itself, so edges don't grow dark rims.
    vec3 n = rgb(texture(uSource, vUV + vec2(uTexel.x, 0.0)), c)
      + rgb(texture(uSource, vUV - vec2(uTexel.x, 0.0)), c)
      + rgb(texture(uSource, vUV + vec2(0.0, uTexel.y)), c)
      + rgb(texture(uSource, vUV - vec2(0.0, uTexel.y)), c);
    c = clamp(c + uSharpen * (c - n * 0.25), 0.0, 1.0);
  }

  if (uDither > 0.0) {
    ivec2 t = ivec2(gl_FragCoord.xy);
    c += ((bayer[(t.y % 4) * 4 + t.x % 4] + 0.5) / 16.0 - 0.5) * uDither * 0.15;
  }

  if (uColors > 0.5) {
    vec3 best = c;
    float bestDist = 1e9;
    for (int i = 0; i < 256; i++) {
      if (float(i) >= uColors) break;
      vec3 p = texelFetch(uPalette, ivec2(i, 0), 0).rgb;
      vec3 d = p - c;
      float dist = dot(d * d, vec3(0.3, 0.59, 0.11));
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    c = best;
  }

  color = vec4(clamp(c, 0.0, 1.0) * s.a, s.a);
}
`

export type Finish = { colors: string[]; dither: number; sharpen: number }

export class FinishPass {
  private mesh: Mesh<MeshGeometry, Shader>
  private shader: Shader
  private palette: { key: string; texture: Texture } | null = null

  constructor(private renderer: Renderer) {
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'pasteup-finish' }),
      resources: {
        uSource: Texture.EMPTY.source,
        uPalette: Texture.EMPTY.source,
        finish: {
          uColors: { value: 0, type: 'f32' },
          uDither: { value: 0, type: 'f32' },
          uSharpen: { value: 0, type: 'f32' },
          uTexel: { value: [0, 0], type: 'vec2<f32>' },
        },
      },
    })
    this.mesh = quad(this.shader)
  }

  // The palette as a row of texels.
  private paletteTexture(colors: string[]) {
    const key = colors.join()
    if (this.palette?.key === key) return this.palette.texture
    this.palette?.texture.destroy(true)
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 1
    const ctx = c.getContext('2d')!
    colors.slice(0, 256).forEach((hex, i) => {
      ctx.fillStyle = hex
      ctx.fillRect(i, 0, 1, 1)
    })
    const texture = new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'nearest' }) })
    this.palette = { key, texture }
    return texture
  }

  draw(source: RenderTexture, f: Finish, target: RenderTexture) {
    const r = this.shader.resources
    r.uSource = source.source
    r.uPalette = this.paletteTexture(f.colors).source
    const u = r.finish.uniforms
    u.uColors = Math.min(f.colors.length, 256)
    u.uDither = f.dither
    u.uSharpen = f.sharpen
    u.uTexel = [1 / source.width, 1 / source.height]
    this.mesh.scale.set(target.width, target.height)
    this.renderer.render({ container: this.mesh, target, clear: true, clearColor: [0, 0, 0, 0] })
  }
}
