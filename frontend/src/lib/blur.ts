import { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, type Renderer } from 'pixi.js'
import { quad, vertex } from './blend'

// One direction of a gaussian blur over premultiplied colors. Edges clamp, or
// wrap in tile mode.
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
uniform sampler2D uSource;
uniform vec2 uStep;
uniform float uSigma;
uniform float uWrap;
uniform float uHalf;

vec4 at(vec2 uv) {
  uv = uWrap > 0.5 ? fract(uv) : clamp(uv, uHalf, 1.0 - uHalf);
  return texture(uSource, uv);
}

void main() {
  if (uSigma < 0.01) {
    color = at(vUV);
    return;
  }
  int r = min(int(ceil(uSigma * 3.0)), 96);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -96; i <= 96; i++) {
    if (i < -r || i > r) continue;
    float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    sum += at(vUV + uStep * float(i)) * w;
    total += w;
  }
  color = sum / total;
}
`

export class BlurPass {
  private mesh: Mesh<MeshGeometry, Shader>
  private shader: Shader
  private scratch: RenderTexture | null = null

  constructor(private renderer: Renderer) {
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'pasteup-blur' }),
      resources: {
        uSource: Texture.EMPTY.source,
        blur: {
          uStep: { value: [0, 0], type: 'vec2<f32>' },
          uSigma: { value: 0, type: 'f32' },
          uWrap: { value: 0, type: 'f32' },
          uHalf: { value: 0, type: 'f32' },
        },
      },
    })
    this.mesh = quad(this.shader)
  }

  // Blurs rt in place, sigma in texels across and down.
  draw(rt: RenderTexture, x: number, y: number, wrap: { x: boolean; y: boolean }) {
    const size = rt.width
    if (this.scratch?.width !== size) {
      this.scratch?.destroy(true)
      this.scratch = RenderTexture.create({ width: size, height: size, scaleMode: 'nearest' })
    }
    this.pass(rt, this.scratch, [1 / size, 0], x, wrap.x)
    this.pass(this.scratch, rt, [0, 1 / size], y, wrap.y)
  }

  private pass(from: RenderTexture, to: RenderTexture, step: [number, number], sigma: number, wrap: boolean) {
    const r = this.shader.resources
    r.uSource = from.source
    const u = r.blur.uniforms
    u.uStep = step
    u.uSigma = sigma
    u.uWrap = wrap ? 1 : 0
    u.uHalf = 0.5 / to.width
    this.mesh.scale.set(to.width, to.height)
    this.renderer.render({ container: this.mesh, target: to, clear: true, clearColor: [0, 0, 0, 0] })
  }
}
