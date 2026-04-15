import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TREATMENTS } from '../treatments'
import type { TreatmentValues, TreatmentDef } from '../treatments'

interface GaussianSplatViewerProps {
  url: string
  theme?: 'light' | 'dark'
  activeTreatment: string
  treatmentValues: TreatmentValues
}

interface ParsedPoints {
  positions: Float32Array
  colors: Float32Array | null
  count: number
}

// ── .splat parser (32 bytes per gaussian) ──
function parseSplat(buffer: ArrayBuffer): ParsedPoints {
  const data = new DataView(buffer)
  const count = Math.floor(buffer.byteLength / 32)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const o = i * 32
    positions[i * 3]     =  data.getFloat32(o, true)
    positions[i * 3 + 1] = -data.getFloat32(o + 4, true)
    positions[i * 3 + 2] = -data.getFloat32(o + 8, true)
    colors[i * 3]     = data.getUint8(o + 24) / 255
    colors[i * 3 + 1] = data.getUint8(o + 25) / 255
    colors[i * 3 + 2] = data.getUint8(o + 26) / 255
  }
  return { positions, colors, count }
}

// ── .ply parser ──
function parsePly(buffer: ArrayBuffer): ParsedPoints {
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()

  const marker = new TextEncoder().encode('end_header')
  let headerEnd = -1
  for (let i = 0; i < Math.min(bytes.length, 20000); i++) {
    let match = true
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) { match = false; break }
    }
    if (match) {
      headerEnd = i + marker.length
      if (bytes[headerEnd] === 0x0A) headerEnd++
      else if (bytes[headerEnd] === 0x0D && bytes[headerEnd + 1] === 0x0A) headerEnd += 2
      break
    }
  }
  if (headerEnd === -1) throw new Error('No end_header found in PLY')

  const headerText = decoder.decode(bytes.slice(0, headerEnd))
  const lines = headerText.split('\n').map(l => l.trim())

  let vertexCount = 0
  const properties: { name: string; type: string }[] = []
  let format = ''

  for (const line of lines) {
    if (line.startsWith('format ')) format = line
    else if (line.startsWith('element vertex ')) vertexCount = parseInt(line.split(' ')[2])
    else if (line.startsWith('property ')) {
      const parts = line.split(' ')
      properties.push({ type: parts[1], name: parts[2] })
    }
  }

  if (vertexCount === 0) throw new Error('No vertices found in PLY')

  const typeSize: Record<string, number> = {
    float: 4, double: 8, int: 4, uint: 4, short: 2, ushort: 2, char: 1, uchar: 1,
    float32: 4, float64: 8, int32: 4, uint32: 4, int16: 2, uint16: 2, int8: 1, uint8: 1,
  }

  let stride = 0
  const offsets: Record<string, { offset: number; type: string }> = {}
  for (const prop of properties) {
    offsets[prop.name] = { offset: stride, type: prop.type }
    stride += typeSize[prop.type] ?? 4
  }

  const isBinary = format.includes('binary')
  const isLittleEndian = format.includes('little_endian')

  const positions = new Float32Array(vertexCount * 3)
  const hasColors = 'red' in offsets && 'green' in offsets && 'blue' in offsets
  const colors = hasColors ? new Float32Array(vertexCount * 3) : null

  if (isBinary) {
    const dataLength = buffer.byteLength - headerEnd
    const data = new DataView(buffer, headerEnd, dataLength)
    const xOff = offsets['x']?.offset ?? 0
    const yOff = offsets['y']?.offset ?? 4
    const zOff = offsets['z']?.offset ?? 8
    const rOff = offsets['red']?.offset
    const gOff = offsets['green']?.offset
    const bOff = offsets['blue']?.offset
    const colorIsUchar = offsets['red']?.type === 'uchar'
    const safeCount = Math.min(vertexCount, Math.floor(dataLength / stride))

    for (let i = 0; i < safeCount; i++) {
      const base = i * stride
      positions[i * 3]     =  data.getFloat32(base + xOff, isLittleEndian)
      positions[i * 3 + 1] = -data.getFloat32(base + yOff, isLittleEndian)
      positions[i * 3 + 2] = -data.getFloat32(base + zOff, isLittleEndian)

      if (colors && rOff !== undefined && gOff !== undefined && bOff !== undefined) {
        if (colorIsUchar) {
          colors[i * 3]     = data.getUint8(base + rOff) / 255
          colors[i * 3 + 1] = data.getUint8(base + gOff) / 255
          colors[i * 3 + 2] = data.getUint8(base + bOff) / 255
        } else {
          colors[i * 3]     = data.getFloat32(base + rOff, isLittleEndian)
          colors[i * 3 + 1] = data.getFloat32(base + gOff, isLittleEndian)
          colors[i * 3 + 2] = data.getFloat32(base + bOff, isLittleEndian)
        }
      }
    }
  } else {
    const dataText = decoder.decode(bytes.slice(headerEnd))
    const dataLines = dataText.trim().split('\n')
    const xIdx = properties.findIndex(p => p.name === 'x')
    const yIdx = properties.findIndex(p => p.name === 'y')
    const zIdx = properties.findIndex(p => p.name === 'z')
    const rIdx = properties.findIndex(p => p.name === 'red')
    const gIdx = properties.findIndex(p => p.name === 'green')
    const bIdx = properties.findIndex(p => p.name === 'blue')

    for (let i = 0; i < Math.min(vertexCount, dataLines.length); i++) {
      const vals = dataLines[i].trim().split(/\s+/)
      positions[i * 3]     =  parseFloat(vals[xIdx])
      positions[i * 3 + 1] = -parseFloat(vals[yIdx])
      positions[i * 3 + 2] = -parseFloat(vals[zIdx])
      if (colors && rIdx >= 0) {
        colors[i * 3]     = parseFloat(vals[rIdx]) / 255
        colors[i * 3 + 1] = parseFloat(vals[gIdx]) / 255
        colors[i * 3 + 2] = parseFloat(vals[bIdx]) / 255
      }
    }
  }

  return { positions, colors, count: vertexCount }
}

function parseFile(buffer: ArrayBuffer, url: string): ParsedPoints {
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)))
  if (header.startsWith('ply')) return parsePly(buffer)
  const ext = url.split('.').pop()?.toLowerCase()
  if (ext === 'ply') return parsePly(buffer)
  return parseSplat(buffer)
}

export function GaussianSplatViewer({ url, theme = 'dark', activeTreatment, treatmentValues }: GaussianSplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const parsedRef = useRef<ParsedPoints | null>(null)
  const treatmentObjectsRef = useRef<THREE.Object3D[]>([])
  const uniformsListRef = useRef<Record<string, THREE.IUniform>[]>([])
  const bboxRef = useRef<THREE.Box3>(new THREE.Box3())
  const loadedRef = useRef(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const originalPointsRef = useRef<THREE.Points | null>(null)

  // Initial load
  useEffect(() => {
    if (!url || !containerRef.current) return
    cleanupRef.current?.()

    const container = containerRef.current
    container.querySelector('canvas')?.remove()
    container.querySelector('[data-status]')?.remove()

    let disposed = false
    loadedRef.current = false
    treatmentObjectsRef.current = []
    uniformsListRef.current = []
    originalPointsRef.current = null

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    renderer.domElement.style.display = 'block'
    container.insertBefore(renderer.domElement, container.firstChild)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.set(0, 1, 5)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true

    const status = document.createElement('div')
    status.setAttribute('data-status', '')
    status.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#67e8f9;font:18px system-ui;z-index:1;pointer-events:none'
    status.textContent = 'Loading...'
    container.appendChild(status)

    async function loadFile() {
      try {
        status.textContent = 'Downloading...'
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()
        if (disposed) return

        status.textContent = 'Parsing...'
        const parsed = parseFile(buffer, url)
        if (disposed) return

        parsedRef.current = parsed

        // Bounding box
        const bbox = new THREE.Box3()
        for (let i = 0; i < parsed.count; i++) {
          bbox.expandByPoint(new THREE.Vector3(
            parsed.positions[i * 3],
            parsed.positions[i * 3 + 1],
            parsed.positions[i * 3 + 2]
          ))
        }
        bboxRef.current = bbox

        const center = new THREE.Vector3()
        bbox.getCenter(center)
        const size = new THREE.Vector3()
        bbox.getSize(size)
        const sceneSize = Math.max(size.x, size.y, size.z)

        // Original colors points (hidden by default)
        if (parsed.colors) {
          const origGeom = new THREE.BufferGeometry()
          origGeom.setAttribute('position', new THREE.BufferAttribute(parsed.positions.slice(), 3))
          origGeom.setAttribute('color', new THREE.BufferAttribute(parsed.colors, 3))
          const origMat = new THREE.PointsMaterial({
            size: 0.008 * sceneSize,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
          })
          const origPoints = new THREE.Points(origGeom, origMat)
          origPoints.visible = false
          scene.add(origPoints)
          originalPointsRef.current = origPoints
        }

        // Camera
        const camDist = sceneSize * 0.6
        controls.target.copy(center)
        camera.position.set(center.x, center.y + camDist * 0.2, center.z + camDist)
        camera.lookAt(center)
        camera.near = sceneSize * 0.001
        camera.far = sceneSize * 10
        camera.updateProjectionMatrix()
        controls.update()

        loadedRef.current = true
        status.style.display = 'none'

        // Apply initial treatment
        applyTreatment(TREATMENTS[activeTreatment], treatmentValues)
      } catch (err) {
        status.textContent = `Error: ${err instanceof Error ? err.message : err}`
        console.error('[GS] Load error:', err)
      }
    }

    function applyTreatment(treatment: TreatmentDef, values: TreatmentValues) {
      if (!sceneRef.current || !parsedRef.current) return
      const s = sceneRef.current
      const parsed = parsedRef.current

      // Remove old
      for (const obj of treatmentObjectsRef.current) {
        s.remove(obj)
        ;(obj as THREE.Points).geometry?.dispose?.()
        const mat = (obj as THREE.Points).material as THREE.Material | undefined
        mat?.dispose?.()
      }
      treatmentObjectsRef.current = []
      uniformsListRef.current = []

      if (!treatment.pointsVertexShader || !treatment.pointsFragmentShader) return

      const extras = {
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        boundingBox: { min: bboxRef.current.min.clone(), max: bboxRef.current.max.clone() },
      }

      // Build geometry
      const randoms = new Float32Array(parsed.count)
      for (let i = 0; i < parsed.count; i++) randoms[i] = Math.random()

      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(parsed.positions.slice(), 3))
      g.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

      // Some treatments expect aNormal — fill with zeros for point clouds
      const zeroNormals = new Float32Array(parsed.count * 3)
      g.setAttribute('aNormal', new THREE.BufferAttribute(zeroNormals, 3))

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

    loadFile()

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

  // Theme
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    }
  }, [theme])

  // Original view toggle
  useEffect(() => {
    if (originalPointsRef.current) originalPointsRef.current.visible = showOriginal
    for (const obj of treatmentObjectsRef.current) {
      obj.visible = !showOriginal
    }
  }, [showOriginal])

  // Treatment change — rebuild
  useEffect(() => {
    if (!loadedRef.current || !sceneRef.current || !parsedRef.current) return
    const treatment = TREATMENTS[activeTreatment]
    if (!treatment) return

    const scene = sceneRef.current
    const parsed = parsedRef.current

    // Remove old
    for (const obj of treatmentObjectsRef.current) {
      scene.remove(obj)
      ;(obj as THREE.Points).geometry?.dispose?.()
      const mat = (obj as THREE.Points).material as THREE.Material | undefined
      mat?.dispose?.()
    }
    treatmentObjectsRef.current = []
    uniformsListRef.current = []

    if (!treatment.pointsVertexShader || !treatment.pointsFragmentShader) return

    const extras = {
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      boundingBox: { min: bboxRef.current.min.clone(), max: bboxRef.current.max.clone() },
    }

    const randoms = new Float32Array(parsed.count)
    for (let i = 0; i < parsed.count; i++) randoms[i] = Math.random()

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(parsed.positions.slice(), 3))
    g.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))
    const zeroNormals = new Float32Array(parsed.count * 3)
    g.setAttribute('aNormal', new THREE.BufferAttribute(zeroNormals, 3))

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
    points.visible = !showOriginal
    scene.add(points)
    treatmentObjectsRef.current.push(points)
    uniformsListRef.current.push(uniforms)
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

  return (
    <div ref={containerRef} className="viewer-container">
      {parsedRef.current?.colors && (
        <div className="view-toggle">
          <button
            className={`view-toggle__btn ${!showOriginal ? 'view-toggle__btn--active' : ''}`}
            onClick={() => setShowOriginal(false)}
          >
            Treated
          </button>
          <button
            className={`view-toggle__btn ${showOriginal ? 'view-toggle__btn--active' : ''}`}
            onClick={() => setShowOriginal(true)}
          >
            Original
          </button>
        </div>
      )}
    </div>
  )
}
