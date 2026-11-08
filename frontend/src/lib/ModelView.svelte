<script lang="ts">
  import { onMount } from 'svelte'
  import * as THREE from 'three'
  import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
  import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
  import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
  import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
  import { Orbit } from './orbit'
  import Slider from './Slider.svelte'
  import { app, type Channel } from './state.svelte'

  // The model with the texture as it is being painted. The source gives the
  // finished channels; it is asked again once the texture changed.
  let { source }: { source: () => Partial<Record<Channel, HTMLCanvasElement>> } = $props()

  let el: HTMLDivElement
  let renderer: THREE.WebGLRenderer
  let camera: THREE.PerspectiveCamera
  let orbit: Orbit
  const scene = new THREE.Scene()
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
  let mesh: THREE.Mesh | null = null
  const ambient = new THREE.AmbientLight(0xffffff, 1.2)
  const headlight = new THREE.DirectionalLight(0xffffff, 2.2)
  let lit = $state(true)
  // Bloom around glowing parts, as texxer does it: only what passes 1 blooms, and
  // glowing texels are lit 2.5 times over.
  let bloomStrength = $state(0.1)
  let post: EffectComposer
  let bloom: UnrealBloomPass
  let ready = false
  let needs = true

  // Godot's nearest_mipmap: crisp texels near, no shimmer far.
  function texture(canvas: HTMLCanvasElement, color: boolean) {
    const t = new THREE.CanvasTexture(canvas)
    t.flipY = false
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestMipmapNearestFilter
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
    return t
  }

  function build() {
    if (mesh) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      mesh = null
    }
    const l = app.layout
    if (!l?.positions?.length) return
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(l.positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(l.uvs, 2))
    geometry.computeVertexNormals()
    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    geometry.computeBoundingBox()
    orbit.frame(geometry.boundingBox!)
    orbit.update(0, true)
    needs = true
  }

  export function frame() {
    if (mesh?.geometry.boundingBox) orbit.frame(mesh.geometry.boundingBox)
    needs = true
  }

  let pending = 0
  function retexture() {
    clearTimeout(pending)
    // Painting changes the texture all the time; a few updates a second are enough here.
    pending = window.setTimeout(() => {
      const flat = source()
      material.map?.dispose()
      material.emissiveMap?.dispose()
      material.map = flat.color ? texture(flat.color, true) : null
      material.emissiveMap = flat.emission ? texture(flat.emission, true) : null
      material.emissive.set(flat.emission ? 0xffffff : 0x000000)
      material.emissiveIntensity = 2.5
      material.needsUpdate = true
      needs = true
    }, 120)
  }

  $effect(() => {
    void app.revision
    void app.bakeAO
    if (ready) retexture()
  })

  $effect(() => {
    void app.layout
    if (ready) build()
  })

  $effect(() => {
    const strength = bloomStrength
    if (!bloom) return
    bloom.enabled = strength > 0
    bloom.strength = strength
    needs = true
  })

  $effect(() => {
    ambient.intensity = lit ? 1.2 : 3.2
    headlight.intensity = lit ? 2.2 : 0
    needs = true
  })

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    // On the scene, not as the clear color, so the output pass brings it out as it is.
    scene.background = new THREE.Color(0x131312)
    el.appendChild(renderer.domElement)
    camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
    // The light comes from the camera, so every side can be seen.
    camera.add(headlight)
    headlight.position.set(0.3, 0.6, 1)
    scene.add(camera, ambient)
    post = new EffectComposer(renderer)
    post.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), bloomStrength, 0.4, 1)
    post.addPass(bloom)
    post.addPass(new OutputPass())

    const ray = new THREE.Raycaster()
    orbit = new Orbit(camera, renderer.domElement, (x, y) => {
      if (!mesh) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera)
      return ray.intersectObject(mesh)[0]?.point
    })

    let sized = false
    if (import.meta.env.DEV) Object.assign(window, { orbit })
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      post.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      // The first real size frames the model again, now that the lens is known.
      if (!sized) {
        sized = true
        frame()
        orbit.update(0, true)
      }
      needs = true
    })
    resize.observe(el)

    let last = performance.now()
    let frameId = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (orbit.update(dt) || needs) {
        post.render()
        needs = false
      }
      frameId = requestAnimationFrame(tick)
    }
    ready = true
    build()
    retexture()
    frameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frameId)
      resize.disconnect()
      orbit.dispose()
      post.dispose()
      renderer.dispose()
    }
  })
</script>

<div class="view3d" role="presentation" bind:this={el} onpointerenter={() => (app.focus = 'refs')}>
  {#if !app.layout?.positions?.length}
    <div class="empty">open a model (⌘O) or sync one from Blender to see it here</div>
  {/if}
  <div class="bar">
    <div class="bloom"><Slider compact bind:value={bloomStrength} label="bloom" min={0} max={1.5} step={0.05} scale={100} title="How strongly glowing parts bloom; 0 is off" /></div>
    <button class="text-button" title="Light from the camera, or the texture flat as it is" onclick={() => (lit = !lit)}>{lit ? 'lit' : 'flat'}</button>
    <button class="text-button" title="Frame the model (⌘0)" onclick={frame}>frame</button>
  </div>
</div>

<style>
  .view3d {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .view3d :global(canvas) {
    display: block;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--dim);
    pointer-events: none;
  }
  .bar {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bloom {
    margin-right: 6px;
  }
</style>
