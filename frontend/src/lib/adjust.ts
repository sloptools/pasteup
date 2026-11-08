import { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, type Renderer } from 'pixi.js'
import { quad, vertex } from './blend'
import type { Adjust } from './state.svelte'

// What lies below, color adjusted, cut to the mask. Colors are premultiplied.
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
uniform sampler2D uBelow;
uniform sampler2D uMask;
uniform float uMasked;
uniform float uHue;
uniform float uSaturation;
uniform float uBrightness;
uniform float uBlack;
uniform float uGamma;
uniform float uWhite;

vec3 hsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  vec4 below = texture(uBelow, vUV);
  vec3 c = below.a > 0.0 ? below.rgb / below.a : vec3(0.0);

  c = clamp((c - uBlack) / max(uWhite - uBlack, 1e-3), 0.0, 1.0);
  c = pow(c, vec3(1.0 / uGamma));
  c = clamp(c + uBrightness, 0.0, 1.0);

  vec3 h = hsv(c);
  h.x = fract(h.x + uHue / 360.0);
  c = rgb(h);
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(luma), c, 1.0 + uSaturation), 0.0, 1.0);

  float a = below.a;
  if (uMasked > 0.5) a *= texture(uMask, vUV).a;
  color = vec4(c * a, a);
}
`

export class AdjustPass {
  private mesh: Mesh<MeshGeometry, Shader>
  private shader: Shader

  constructor(private renderer: Renderer) {
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'pasteup-adjust' }),
      resources: {
        uBelow: Texture.EMPTY.source,
        uMask: Texture.EMPTY.source,
        adjust: {
          uMasked: { value: 0, type: 'f32' },
          uHue: { value: 0, type: 'f32' },
          uSaturation: { value: 0, type: 'f32' },
          uBrightness: { value: 0, type: 'f32' },
          uBlack: { value: 0, type: 'f32' },
          uGamma: { value: 1, type: 'f32' },
          uWhite: { value: 1, type: 'f32' },
        },
      },
    })
    this.mesh = quad(this.shader)
  }

  draw(below: RenderTexture, mask: RenderTexture | null, a: Adjust, target: RenderTexture) {
    const r = this.shader.resources
    r.uBelow = below.source
    r.uMask = (mask ?? below).source
    const u = r.adjust.uniforms
    u.uMasked = mask ? 1 : 0
    u.uHue = a.hue
    u.uSaturation = a.saturation
    u.uBrightness = a.brightness
    u.uBlack = a.black
    u.uGamma = a.gamma
    u.uWhite = a.white
    this.mesh.scale.set(target.width, target.height)
    this.renderer.render({ container: this.mesh, target, clear: true, clearColor: [0, 0, 0, 0] })
  }
}
