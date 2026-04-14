import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { depthToPointCloud } from '../lib/depthToPointCloud'

interface ImageTo3DProps {
  imageUrl: string
}

type Status = 'loading-model' | 'estimating' | 'rendering' | 'done' | 'error'

const statusMessages: Record<Status, string> = {
  'loading-model': 'Downloading depth model (~40MB, cached after first use)...',
  'estimating': 'Running depth estimation...',
  'rendering': 'Generating 3D point cloud...',
  'done': '',
  'error': 'Something went wrong',
}

// ── Same shaders as particle body / splat viewer ──
const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aRandom;
  varying float vRandom;

  void main() {
    vRandom = aRandom;
    float breathPhase = uTime * 1.5 + aRandom * 6.2831;
    float breathAmount = sin(breathPhase) * 0.003;
    float driftX = sin(uTime * 0.5 + aRandom * 17.0) * 0.002;
    float driftY = cos(uTime * 0.4 + aRandom * 13.0) * 0.0015;
    float driftZ = sin(uTime * 0.6 + aRandom * 11.0) * 0.002;
    vec3 displaced = position + normalize(position) * breathAmount + vec3(driftX, driftY, driftZ);
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;
    float sizeVariation = 0.4 + 1.2 * aRandom;
    gl_PointSize = uSize * sizeVariation * uPixelRatio * (1.0 / -mvPos.z);
    gl_PointSize = max(gl_PointSize, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColorInner;
  uniform vec3 uColorOuter;
  uniform float uOpacity;
  varying float vRandom;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;
    float core = exp(-dist * 8.0);
    float halo = exp(-dist * 3.0);
    float glow = core * 0.7 + halo * 0.3;
    vec3 color = mix(uColorInner, uColorOuter, smoothstep(0.0, 0.4, dist));
    float pulse = 0.8 + 0.2 * sin(uTime * 1.8 + vRandom * 6.2831);
    float particleAlpha = 0.5 + 0.5 * vRandom;
    float alpha = glow * uOpacity * pulse * particleAlpha;
    gl_FragColor = vec4(color * (0.9 + 0.1 * core), alpha);
  }
`

// Lazy-load the depth estimation pipeline
let depthPipelinePromise: Promise<unknown> | null = null

async function getDepthPipeline() {
  if (!depthPipelinePromise) {
    depthPipelinePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      return pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
        device: 'webgpu',
      }).catch(() => {
        // Fallback to WASM if WebGPU not available
        console.log('[Depth] WebGPU not available, falling back to WASM')
        return pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
          device: 'wasm',
        })
      })
    })()
  }
  return depthPipelinePromise
}

export function ImageTo3D({ imageUrl }: ImageTo3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState<Status>('loading-model')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!imageUrl || !containerRef.current) return

    cleanupRef.current?.()

    const container = containerRef.current
    const oldCanvas = container.querySelector('canvas')
    if (oldCanvas) oldCanvas.remove()

    let disposed = false

    async function run() {
      try {
        // 1. Load depth model
        setStatus('loading-model')
        const estimator = await getDepthPipeline() as (input: string) => Promise<{ depth: { data: Float32Array, width: number, height: number } }>
        if (disposed) return

        // 2. Run depth estimation
        setStatus('estimating')
        const result = await estimator(imageUrl)
        if (disposed) return

        const depthData = result.depth.data as Float32Array
        const depthW = result.depth.width
        const depthH = result.depth.height

        console.log(`[Depth] Map: ${depthW}×${depthH}, ${depthData.length} values`)

        // 3. Convert to point cloud
        setStatus('rendering')
        const { positions, count } = depthToPointCloud(depthData, depthW, depthH, 250000)
        if (disposed) return

        // 4. Build Three.js scene
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(container.clientWidth, container.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setClearColor(0x050510)
        renderer.domElement.style.display = 'block'
        container.insertBefore(renderer.domElement, container.firstChild)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(
          50, container.clientWidth / container.clientHeight, 0.01, 100
        )

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.08
        controls.rotateSpeed = 0.8
        controls.zoomSpeed = 1.2
        controls.enablePan = true

        // Random seeds
        const randoms = new Float32Array(count)
        for (let i = 0; i < count; i++) randoms[i] = Math.random()

        // Bounding box
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        let minZ = Infinity, maxZ = -Infinity
        for (let i = 0; i < count; i++) {
          const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]
          minX = Math.min(minX, x); maxX = Math.max(maxX, x)
          minY = Math.min(minY, y); maxY = Math.max(maxY, y)
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

        const uniforms = {
          uTime: { value: 0 },
          uSize: { value: 35.0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uColorInner: { value: new THREE.Color('#67e8f9') },
          uColorOuter: { value: new THREE.Color('#0284c7') },
          uOpacity: { value: 0.45 },
        }

        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })

        const points = new THREE.Points(geometry, material)
        scene.add(points)

        // Center camera
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        const cz = (minZ + maxZ) / 2
        const sceneSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ)

        controls.target.set(cx, cy, cz)
        camera.position.set(cx, cy, cz + sceneSize * 1.5)
        camera.lookAt(cx, cy, cz)
        controls.update()

        setStatus('done')
        console.log(`[Depth→3D] Rendered ${count.toLocaleString()} points`)

        // Animate
        const clock = new THREE.Clock()
        const onResize = () => {
          if (disposed) return
          camera.aspect = container.clientWidth / container.clientHeight
          camera.updateProjectionMatrix()
          renderer.setSize(container.clientWidth, container.clientHeight)
        }
        window.addEventListener('resize', onResize)

        let rafId = 0
        function animate() {
          if (disposed) return
          rafId = requestAnimationFrame(animate)
          uniforms.uTime.value = clock.getElapsedTime()
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

        cleanupRef.current = () => {
          disposed = true
          cancelAnimationFrame(rafId)
          window.removeEventListener('resize', onResize)
          controls.dispose()
          renderer.dispose()
          geometry.dispose()
          material.dispose()
          container.querySelector('canvas')?.remove()
        }
      } catch (err) {
        if (!disposed) {
          console.error('[Depth→3D] Error:', err)
          setStatus('error')
          setErrorMsg(err instanceof Error ? err.message : String(err))
        }
      }
    }

    run()

    return () => {
      disposed = true
      cleanupRef.current?.()
    }
  }, [imageUrl])

  return (
    <div ref={containerRef} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      background: '#050510',
    }}>
      {/* Status overlay */}
      {status !== 'done' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color: '#67e8f9', fontFamily: 'system-ui', fontSize: 16,
          textAlign: 'center', zIndex: 1, pointerEvents: 'none',
        }}>
          {status === 'error' ? (
            <div style={{ color: '#f87171' }}>Error: {errorMsg}</div>
          ) : (
            <>
              <div style={{
                width: 40, height: 40, border: '3px solid rgba(103,232,249,0.2)',
                borderTopColor: '#67e8f9', borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              <div>{statusMessages[status]}</div>
            </>
          )}
        </div>
      )}

      {/* Controls hint */}
      {status === 'done' && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          color: '#475569', fontFamily: 'system-ui', fontSize: 12, zIndex: 1,
          pointerEvents: 'none',
        }}>
          Scroll to zoom · Drag to orbit · Right-drag to pan
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
