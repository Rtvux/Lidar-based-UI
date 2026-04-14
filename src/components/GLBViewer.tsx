import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

interface GLBViewerProps {
  url: string
  theme?: 'light' | 'dark'
}

const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aRandom;
  attribute vec3 aNormal;
  varying float vRandom;

  void main() {
    vRandom = aRandom;

    float breathPhase = uTime * 1.0 + aRandom * 6.2831;
    float breathAmount = sin(breathPhase) * 0.002;

    vec3 displaced = position + aNormal * breathAmount;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float sizeVariation = 0.7 + 0.5 * aRandom;
    gl_PointSize = uSize * sizeVariation * uPixelRatio * (1.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 0.5, 5.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColorInner;
  uniform vec3 uColorOuter;
  uniform float uOpacity;
  varying float vRandom;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.45) discard;

    float dot = smoothstep(0.45, 0.25, dist);
    vec3 color = uColorInner;
    float pulse = 0.95 + 0.05 * sin(uTime * 1.0 + vRandom * 6.2831);

    gl_FragColor = vec4(color, dot * uOpacity * pulse);
  }
`

/**
 * Loads a GLB/GLTF file, samples particles from its mesh surfaces,
 * and renders them with the same blue particle shader.
 */
export function GLBViewer({ url, theme = 'dark' }: GLBViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  useEffect(() => {
    if (!url || !containerRef.current) return

    cleanupRef.current?.()

    const container = containerRef.current
    container.querySelector('canvas')?.remove()
    container.querySelector('[data-status]')?.remove()

    let disposed = false

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    renderer.domElement.style.display = 'block'
    container.insertBefore(renderer.domElement, container.firstChild)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      50, container.clientWidth / container.clientHeight, 0.01, 1000
    )
    camera.position.set(0, 1, 3)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.8
    controls.zoomSpeed = 1.2
    controls.enablePan = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.8

    const status = document.createElement('div')
    status.setAttribute('data-status', '')
    status.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#67e8f9;font:18px system-ui;z-index:1;pointer-events:none'
    status.textContent = 'Loading model...'
    container.appendChild(status)

    const uniforms = {
      uTime: { value: 0 },
      uSize: { value: 6.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColorInner: { value: new THREE.Color('#7dd3fc') },
      uColorOuter: { value: new THREE.Color('#38bdf8') },
      uOpacity: { value: 0.4 },
    }

    // Detect format and load meshes
    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? ''

    function processLoadedMeshes(meshes: THREE.Mesh[]) {
      if (disposed) return
      if (meshes.length === 0) {
        status.textContent = 'Error: No meshes found in model'
        return
      }

      status.textContent = `Sampling particles from ${meshes.length} mesh(es)...`

      const TARGET_PARTICLES = 15000
      const particlesPerMesh = Math.ceil(TARGET_PARTICLES / meshes.length)

      const allPositions: number[] = []
      const allNormals: number[] = []
      const allRandoms: number[] = []

      const tempPos = new THREE.Vector3()
      const tempNorm = new THREE.Vector3()

      for (const mesh of meshes) {
        if (!mesh.geometry.getAttribute('normal')) {
          mesh.geometry.computeVertexNormals()
        }
        // Ensure geometry has index for sampler
        if (!mesh.geometry.index) {
          const posAttr = mesh.geometry.getAttribute('position')
          const indices = []
          for (let i = 0; i < posAttr.count; i++) indices.push(i)
          mesh.geometry.setIndex(indices)
        }

        try {
          const sampler = new MeshSurfaceSampler(mesh).build()
          for (let i = 0; i < particlesPerMesh; i++) {
            sampler.sample(tempPos, tempNorm)
            allPositions.push(tempPos.x, tempPos.y, tempPos.z)
            allNormals.push(tempNorm.x, tempNorm.y, tempNorm.z)
            allRandoms.push(Math.random())
          }
        } catch (e) {
          console.warn('[Model] Sampler failed for mesh, using vertices directly', e)
          const posAttr = mesh.geometry.getAttribute('position')
          const normAttr = mesh.geometry.getAttribute('normal')
          const step = Math.max(1, Math.floor(posAttr.count / particlesPerMesh))
          for (let i = 0; i < posAttr.count; i += step) {
            allPositions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
            if (normAttr) {
              allNormals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i))
            } else {
              allNormals.push(0, 1, 0)
            }
            allRandoms.push(Math.random())
          }
        }
      }

      const count = allPositions.length / 3
      if (disposed) return

      // === 1. Translucent blue skin (the actual mesh) ===
      for (const mesh of meshes) {
        // Fresnel/edge-glow material — transparent at center, visible at edges
        const skinMat = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
              vViewDir = normalize(-mvPos.xyz);
              gl_Position = projectionMatrix * mvPos;
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main() {
              // Fresnel: stronger at edges (where normal is perpendicular to view)
              float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
              fresnel = pow(fresnel, 2.0);

              vec3 edgeColor = vec3(0.22, 0.52, 0.92);   // bright blue at edges
              vec3 faceColor = vec3(0.08, 0.16, 0.32);    // dark blue on flat faces

              vec3 color = mix(faceColor, edgeColor, fresnel);
              float alpha = mix(0.05, 0.4, fresnel);       // nearly invisible face-on, visible at edges

              gl_FragColor = vec4(color, alpha);
            }
          `,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        const skinMesh = new THREE.Mesh(mesh.geometry.clone(), skinMat)
        scene.add(skinMesh)

        // Wireframe overlay at edges for extra structure definition
        const wireMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#1d4ed8'),
          wireframe: true,
          transparent: true,
          opacity: 0.06,
        })
        const wireMesh = new THREE.Mesh(mesh.geometry.clone(), wireMat)
        scene.add(wireMesh)
      }

      // Subtle ambient — fresnel shader is self-lit, this is just for the wireframe
      const ambLight = new THREE.AmbientLight(0x334466, 0.3)
      scene.add(ambLight)

      // === 2. Fine particles on top ===
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3))
      geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(allNormals, 3))
      geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(allRandoms, 1))

      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })

      const points = new THREE.Points(geometry, material)
      scene.add(points)

      geometry.computeBoundingBox()
      const box = geometry.boundingBox!
      const center = new THREE.Vector3()
      box.getCenter(center)
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z)

      controls.target.copy(center)
      camera.position.set(center.x, center.y + maxDim * 0.3, center.z + maxDim * 1.5)
      camera.lookAt(center)
      camera.near = maxDim * 0.001
      camera.far = maxDim * 100
      camera.updateProjectionMatrix()
      controls.update()

      status.style.display = 'none'
      console.log(`[Model] ${count.toLocaleString()} particles + translucent skin, format: ${ext}, size: ${maxDim.toFixed(2)}`)
    }

    function collectMeshes(object: THREE.Object3D): THREE.Mesh[] {
      const meshes: THREE.Mesh[] = []
      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.updateMatrixWorld(true)
          const geom = mesh.geometry.clone()
          geom.applyMatrix4(mesh.matrixWorld)
          meshes.push(new THREE.Mesh(geom, new THREE.MeshBasicMaterial()))
        }
      })
      return meshes
    }

    if (ext === 'obj') {
      // OBJ loader
      const loader = new OBJLoader()
      loader.load(
        url,
        (obj) => processLoadedMeshes(collectMeshes(obj)),
        (p) => { if (p.total > 0) status.textContent = `Downloading... ${Math.round(p.loaded/p.total*100)}%` },
        (e) => { status.textContent = `Error: ${e instanceof Error ? e.message : e}` }
      )
    } else if (ext === 'stl') {
      // STL loader — returns a single BufferGeometry
      const loader = new STLLoader()
      loader.load(
        url,
        (geometry) => {
          geometry.computeVertexNormals()
          const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
          processLoadedMeshes([mesh])
        },
        (p) => { if (p.total > 0) status.textContent = `Downloading... ${Math.round(p.loaded/p.total*100)}%` },
        (e) => { status.textContent = `Error: ${e instanceof Error ? e.message : e}` }
      )
    } else {
      // GLB/GLTF loader (default)
      const loader = new GLTFLoader()
      loader.load(
        url,
        (gltf) => processLoadedMeshes(collectMeshes(gltf.scene)),
        (p) => { if (p.total > 0) status.textContent = `Downloading... ${Math.round(p.loaded/p.total*100)}%` },
        (error) => {
          status.textContent = `Error: ${error instanceof Error ? error.message : error}`
          console.error('[Model] Load error:', error)
        }
      )
    }

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
      container.querySelector('canvas')?.remove()
      container.querySelector('[data-status]')?.remove()
    }

    return () => { cleanupRef.current?.() }
  }, [url])

  // React to theme changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    }
  }, [theme])

  return <div ref={containerRef} className="viewer-container" />
}
