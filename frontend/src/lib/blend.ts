import { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, type Renderer } from 'pixi.js'
import { blends, type Blend } from './state.svelte'

export const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`

// One layer onto what lies below, the W3C way: the blend color where both have
// pixels, then source-over with the layer's alpha. Colors are premultiplied.
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
uniform sampler2D uBelow;
uniform sampler2D uLayer;
uniform sampler2D uClip;
uniform float uOpacity;
uniform float uMode;
uniform float uClipped;

vec3 softLight(vec3 b, vec3 s) {
  vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
  return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
}

vec3 blend(vec3 b, vec3 s) {
  int m = int(uMode + 0.5);
  if (m == 1) return b * s;
  if (m == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (m == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (m == 4) return min(b + s, 1.0);
  if (m == 5) return softLight(b, s);
  return s;
}

void main() {
  vec4 below = texture(uBelow, vUV);
  vec4 layer = texture(uLayer, vUV);
  float a = layer.a * uOpacity;
  if (uClipped > 0.5) a *= texture(uClip, vUV).a;

  vec3 s = layer.a > 0.0 ? layer.rgb / layer.a : vec3(0.0);
  vec3 b = below.a > 0.0 ? below.rgb / below.a : vec3(0.0);
  vec3 mixed = (1.0 - below.a) * s + below.a * blend(b, s);
  color = vec4(a * mixed + (1.0 - a) * below.rgb, a + below.a * (1.0 - a));
}
`

// Draws one layer over what lies below into another texture, full size.
export class BlendPass {
  private mesh: Mesh<MeshGeometry, Shader>
  private shader: Shader

  constructor(private renderer: Renderer) {
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'pasteup-blend' }),
      resources: {
        uBelow: Texture.EMPTY.source,
        uLayer: Texture.EMPTY.source,
        uClip: Texture.EMPTY.source,
        blend: {
          uOpacity: { value: 1, type: 'f32' },
          uMode: { value: 0, type: 'f32' },
          uClipped: { value: 0, type: 'f32' },
        },
      },
    })
    this.mesh = quad(this.shader)
  }

  draw(below: RenderTexture, layer: RenderTexture, clip: RenderTexture | null, opacity: number, mode: Blend, target: RenderTexture) {
    const r = this.shader.resources
    r.uBelow = below.source
    r.uLayer = layer.source
    r.uClip = (clip ?? layer).source
    const u = r.blend.uniforms
    u.uOpacity = opacity
    u.uMode = blends.indexOf(mode)
    u.uClipped = clip ? 1 : 0
    this.mesh.scale.set(target.width, target.height)
    this.renderer.render({ container: this.mesh, target, clear: true, clearColor: [0, 0, 0, 0] })
  }
}

// A unit square for a full-texture shader pass; scale it to the target.
export function quad(shader: Shader) {
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  })
  return new Mesh({ geometry, shader })
}
