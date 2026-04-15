import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { TREATMENTS } from '../treatments'
import type { TreatmentValues, TreatmentDef } from '../treatments'

interface GLBViewerProps {
  url: string
  theme?: 'light' | 'dark'
  activeTreatment: string
  treatmentValues: TreatmentValues
}

/**
 * Adds per-vertex barycentric coordinates (for wireframe shader).
 * Requires non-indexed geometry.
 */
function addBarycentric(geometry: THREE.BufferGeometry) {
  let geom = geometry
  if (geom.index) geom = geom.toNonIndexed()
  const count = geom.getAttribute('position').count
  const bary = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 3) {
    bary[i * 3] = 1; bary[i * 3 + 1] = 0; bary[i * 3 + 2] = 0
    bary[(i + 1) * 3] = 0; bary[(i + 1) * 3 + 1] = 1; bary[(i + 1) * 3 + 2] = 0
    bary[(i + 2) * 3] = 0; bary[(i + 2) * 3 + 1] = 0; bary[(i + 2) * 3 + 2] = 1
  }
  geom.setAttribute('aBarycentric', new THREE.BufferAttribute(bary, 3))
  return geom
}

export function GLBViewer({ url, theme = 'dark', activeTreatment, treatmentValues }: GLBViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshesRef = useRef<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]>([])
  const sampledDataRef = useRef<{
    positions: Float32Array
    normals: Float32Array
    randoms: Float32Array
    count: number
  } | null>(null)
  const treatmentObjectsRef = useRef<THREE.Object3D[]>([])
  const uniformsListRef = useRef<Record<string, THREE.IUniform>[]>([])
  const bboxRef = useRef<THREE.Box3>(new THREE.Box3())
  const loadedRef = useRef(false)

  // Initial scene setup + model load
  useEffect(() => {
    if (!url || !containerRef.current) return

    cleanupRef.current?.()

    const container = containerRef.current
    container.querySelector('canvas')?.remove()
    container.querySelector('[data-status]')?.remove()

    let disposed = false
    loadedRef.current = false
    meshesRef.current = []
    sampledDataRef.current = null
    treatmentObjectsRef.current = []
    uniformsListRef.current = []

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    renderer.domElement.style.display = 'block'
    container.insertBefore(renderer.domElement, container.firstChild)
    rendererRef.current = renderer

    // Enable standard derivatives (for anti-aliased wireframe)
    const gl = renderer.getContext()
    if (gl instanceof WebGLRenderingContext) {
      gl.getExtension('OES_standard_derivatives')
    }

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 1000)
    camera.position.set(0, 1, 3)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.8

    const status = document.createElement('div')
    status.setAttribute('data-status', '')
    status.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#67e8f9;font:18px system-ui;z-index:1;pointer-events:none'
    status.textContent = 'Loading model...'
    container.appendChild(status)

    // Load model and extract meshes
    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? ''

    function collectMeshesFromObject(object: THREE.Object3D) {
      const data: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = []
      object.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.updateMatrixWorld(true)
          const geom = mesh.geometry.clone()
          geom.applyMatrix4(mesh.matrixWorld)
          if (!geom.getAttribute('normal')) geom.computeVertexNormals()
          data.push({ geometry: geom, matrix: mesh.matrixWorld.clone() })
        }
      })
      return data
    }

    function onMeshesLoaded() {
      if (disposed) return
      status.textContent = 'Processing...'

      // Compute bounding box across all meshes
      const bbox = new THREE.Box3()
      for (const m of meshesRef.current) {
        bbox.expandByObject(new THREE.Mesh(m.geometry))
      }
      bboxRef.current = bbox

      // Sample particles (for treatments that need them)
      const TARGET = 15000
      const meshes = meshesRef.current
      const per = Math.ceil(TARGET / Math.max(meshes.length, 1))
      const positions: number[] = []
      const normals: number[] = []
      const randoms: number[] = []
      const tempPos = new THREE.Vector3()
      const tempNorm = new THREE.Vector3()

      for (const { geometry } of meshes) {
        let geom = geometry
        if (!geom.index) {
          const indices = []
          for (let i = 0; i < geom.getAttribute('position').count; i++) indices.push(i)
          geom = geom.clone()
          geom.setIndex(indices)
        }
        const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial())
        try {
          const sampler = new MeshSurfaceSampler(mesh).build()
          for (let i = 0; i < per; i++) {
            sampler.sample(tempPos, tempNorm)
            positions.push(tempPos.x, tempPos.y, tempPos.z)
            normals.push(tempNorm.x, tempNorm.y, tempNorm.z)
            randoms.push(Math.random())
          }
        } catch {
          const posAttr = geom.getAttribute('position')
          const normAttr = geom.getAttribute('normal')
          const step = Math.max(1, Math.floor(posAttr.count / per))
          for (let i = 0; i < posAttr.count; i += step) {
            positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
            if (normAttr) normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i))
            else normals.push(0, 1, 0)
            randoms.push(Math.random())
          }
        }
      }

      sampledDataRef.current = {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        randoms: new Float32Array(randoms),
        count: positions.length / 3,
      }

      // Center camera
      const center = new THREE.Vector3()
      bbox.getCenter(center)
      const size = new THREE.Vector3()
      bbox.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z)

      controls.target.copy(center)
      camera.position.set(center.x, center.y + maxDim * 0.3, center.z + maxDim * 1.5)
      camera.lookAt(center)
      camera.near = maxDim * 0.001
      camera.far = maxDim * 100
      camera.updateProjectionMatrix()
      controls.update()

      // Subtle light for any shaders that use it
      const ambLight = new THREE.AmbientLight(0x334466, 0.3)
      scene.add(ambLight)

      loadedRef.current = true
      status.style.display = 'none'

      // Apply the initial treatment
      applyCurrentTreatment()
    }

    function applyCurrentTreatment() {
      if (!loadedRef.current || disposed) return
      const treatment = TREATMENTS[activeTreatment]
      if (!treatment) return
      applyTreatmentToScene(treatment, treatmentValues)
    }

    function applyTreatmentToScene(treatment: TreatmentDef, values: TreatmentValues) {
      if (!sceneRef.current) return
      const s = sceneRef.current

      // Remove previous treatment objects
      for (const obj of treatmentObjectsRef.current) {
        s.remove(obj)
        ;(obj as THREE.Points | THREE.Mesh).geometry?.dispose?.()
        const mat = (obj as THREE.Points | THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat?.dispose?.()
      }
      treatmentObjectsRef.current = []
      uniformsListRef.current = []

      const extras = {
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        boundingBox: { min: bboxRef.current.min.clone(), max: bboxRef.current.max.clone() },
      }

      // Mesh treatment
      if (treatment.needsMeshGeometry && treatment.meshVertexShader && treatment.meshFragmentShader) {
        for (const { geometry } of meshesRef.current) {
          // Add barycentric for x-ray
          let geom = geometry
          if (treatment.id === 'xray') {
            geom = addBarycentric(geometry.clone())
          }

          const uniforms = treatment.buildUniforms(values, extras)
          const material = new THREE.ShaderMaterial({
            vertexShader: treatment.meshVertexShader,
            fragmentShader: treatment.meshFragmentShader,
            uniforms,
            transparent: treatment.materialOptions?.transparent ?? true,
            depthWrite: treatment.materialOptions?.depthWrite ?? false,
            blending: treatment.materialOptions?.blending ?? THREE.NormalBlending,
            side: treatment.materialOptions?.side ?? THREE.DoubleSide,
            })
          const mesh = new THREE.Mesh(geom, material)
          s.add(mesh)
          treatmentObjectsRef.current.push(mesh)
          uniformsListRef.current.push(uniforms)
        }
      }

      // Points treatment
      if (treatment.needsSampledPoints && treatment.pointsVertexShader && treatment.pointsFragmentShader && sampledDataRef.current) {
        const d = sampledDataRef.current
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3))
        g.setAttribute('aNormal', new THREE.BufferAttribute(d.normals, 3))
        g.setAttribute('aRandom', new THREE.BufferAttribute(d.randoms, 1))

        const uniforms = treatment.buildUniforms(values, extras)
        const material = new THREE.ShaderMaterial({
          vertexShader: treatment.pointsVertexShader,
          fragmentShader: treatment.pointsFragmentShader,
          uniforms,
          transparent: true,
          depthWrite: false,
          blending: treatment.materialOptions?.blending ?? THREE.NormalBlending,
        })
        const points = new THREE.Points(g, material)
        s.add(points)
        treatmentObjectsRef.current.push(points)
        uniformsListRef.current.push(uniforms)
      }
    }

    // Load file based on extension
    if (ext === 'obj') {
      new OBJLoader().load(url, (obj) => {
        if (disposed) return
        meshesRef.current = collectMeshesFromObject(obj)
        onMeshesLoaded()
      }, undefined, (e) => { status.textContent = `Error: ${e instanceof Error ? e.message : e}` })
    } else if (ext === 'stl') {
      new STLLoader().load(url, (geom) => {
        if (disposed) return
        geom.computeVertexNormals()
        meshesRef.current = [{ geometry: geom, matrix: new THREE.Matrix4() }]
        onMeshesLoaded()
      }, undefined, (e) => { status.textContent = `Error: ${e instanceof Error ? e.message : e}` })
    } else {
      new GLTFLoader().load(url, (gltf) => {
        if (disposed) return
        meshesRef.current = collectMeshesFromObject(gltf.scene)
        onMeshesLoaded()
      }, undefined, (e) => { status.textContent = `Error: ${e instanceof Error ? e.message : e}` })
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
      const t = clock.getElapsedTime()
      for (const uniforms of uniformsListRef.current) {
        if (uniforms.uTime) uniforms.uTime.value = t
      }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Theme change
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    }
  }, [theme])

  // Treatment change — rebuild materials
  useEffect(() => {
    if (!loadedRef.current || !sceneRef.current) return
    const treatment = TREATMENTS[activeTreatment]
    if (!treatment) return

    const scene = sceneRef.current

    // Dispose existing treatment objects
    for (const obj of treatmentObjectsRef.current) {
      scene.remove(obj)
      ;(obj as THREE.Points | THREE.Mesh).geometry?.dispose?.()
      const mat = (obj as THREE.Points | THREE.Mesh).material as THREE.Material | undefined
      mat?.dispose?.()
    }
    treatmentObjectsRef.current = []
    uniformsListRef.current = []

    const extras = {
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      boundingBox: { min: bboxRef.current.min.clone(), max: bboxRef.current.max.clone() },
    }

    // Mesh treatment
    if (treatment.needsMeshGeometry && treatment.meshVertexShader && treatment.meshFragmentShader) {
      for (const { geometry } of meshesRef.current) {
        let geom = geometry
        if (treatment.id === 'xray') {
          geom = addBarycentric(geometry.clone())
        }

        const uniforms = treatment.buildUniforms(treatmentValues, extras)
        const material = new THREE.ShaderMaterial({
          vertexShader: treatment.meshVertexShader,
          fragmentShader: treatment.meshFragmentShader,
          uniforms,
          transparent: treatment.materialOptions?.transparent ?? true,
          depthWrite: treatment.materialOptions?.depthWrite ?? false,
          blending: treatment.materialOptions?.blending ?? THREE.NormalBlending,
          side: treatment.materialOptions?.side ?? THREE.DoubleSide,
        })
        const mesh = new THREE.Mesh(geom, material)
        scene.add(mesh)
        treatmentObjectsRef.current.push(mesh)
        uniformsListRef.current.push(uniforms)
      }
    }

    if (treatment.needsSampledPoints && treatment.pointsVertexShader && treatment.pointsFragmentShader && sampledDataRef.current) {
      const d = sampledDataRef.current
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3))
      g.setAttribute('aNormal', new THREE.BufferAttribute(d.normals, 3))
      g.setAttribute('aRandom', new THREE.BufferAttribute(d.randoms, 1))

      const uniforms = treatment.buildUniforms(treatmentValues, extras)
      const material = new THREE.ShaderMaterial({
        vertexShader: treatment.pointsVertexShader,
        fragmentShader: treatment.pointsFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: treatment.materialOptions?.blending ?? THREE.NormalBlending,
      })
      const points = new THREE.Points(g, material)
      scene.add(points)
      treatmentObjectsRef.current.push(points)
      uniformsListRef.current.push(uniforms)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTreatment])

  // Values change — update uniforms in place
  useEffect(() => {
    if (!loadedRef.current) return
    const treatment = TREATMENTS[activeTreatment]
    if (!treatment) return

    const extras = {
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      boundingBox: { min: bboxRef.current.min.clone(), max: bboxRef.current.max.clone() },
    }
    const newUniforms = treatment.buildUniforms(treatmentValues, extras)

    for (const uniforms of uniformsListRef.current) {
      for (const key of Object.keys(newUniforms)) {
        if (uniforms[key]) {
          const existing = uniforms[key].value
          const incoming = newUniforms[key].value
          if (existing instanceof THREE.Color && incoming instanceof THREE.Color) {
            existing.copy(incoming)
          } else {
            uniforms[key].value = incoming
          }
        }
      }
    }
  }, [treatmentValues, activeTreatment])

  return <div ref={containerRef} className="viewer-container" />
}
