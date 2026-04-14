import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

interface GaussianSplatViewerProps {
  url: string
  theme?: 'light' | 'dark'
}

interface ParsedPoints {
  positions: Float32Array
  colors: Float32Array | null  // RGB [0-1] per vertex, null if no colors
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

// ── .ply parser (text header + binary vertex data) ──
function parsePly(buffer: ArrayBuffer): ParsedPoints {
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()

  // Find "end_header\n" in raw bytes
  const marker = new TextEncoder().encode('end_header')
  let headerEnd = -1
  for (let i = 0; i < Math.min(bytes.length, 20000); i++) {
    let match = true
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) { match = false; break }
    }
    if (match) {
      // Skip past "end_header" + the newline after it
      headerEnd = i + marker.length
      if (bytes[headerEnd] === 0x0A) headerEnd++ // LF
      else if (bytes[headerEnd] === 0x0D && bytes[headerEnd + 1] === 0x0A) headerEnd += 2 // CRLF
      break
    }
  }

  if (headerEnd === -1) throw new Error('No end_header found in PLY')

  const headerText = decoder.decode(bytes.slice(0, headerEnd))
  const lines = headerText.split('\n').map(l => l.trim())

  // Parse header
  let vertexCount = 0
  const properties: { name: string; type: string }[] = []
  let format = ''

  for (const line of lines) {
    if (line.startsWith('format ')) {
      format = line
    } else if (line.startsWith('element vertex ')) {
      vertexCount = parseInt(line.split(' ')[2])
    } else if (line.startsWith('property ')) {
      const parts = line.split(' ')
      properties.push({ type: parts[1], name: parts[2] })
    }
  }

  if (vertexCount === 0) throw new Error('No vertices found in PLY')

  // Type sizes
  const typeSize: Record<string, number> = {
    float: 4, double: 8, int: 4, uint: 4,
    short: 2, ushort: 2, char: 1, uchar: 1,
    float32: 4, float64: 8, int32: 4, uint32: 4,
    int16: 2, uint16: 2, int8: 1, uint8: 1,
  }

  // Calculate vertex stride and offsets
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

  console.log(`[GS] PLY: ${vertexCount} vertices, stride=${stride}, headerEnd=${headerEnd}, hasColors=${hasColors}`)

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

// ── Detect format and parse ──
function parseFile(buffer: ArrayBuffer, url: string): ParsedPoints {
  // Check if it's a PLY by looking at the first bytes
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)))

  if (header.startsWith('ply')) {
    console.log('[GS] Detected PLY format')
    return parsePly(buffer)
  }

  // Check file extension as fallback
  const ext = url.split('.').pop()?.toLowerCase()
  if (ext === 'ply') {
    return parsePly(buffer)
  }

  // Default: .splat format
  console.log('[GS] Parsing as .splat format')
  return parseSplat(buffer)
}

// ── Shaders — clinical particle dots ──
const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aRandom;
  varying float vRandom;

  void main() {
    vRandom = aRandom;

    float breathPhase = uTime * 1.0 + aRandom * 6.2831;
    float breathAmount = sin(breathPhase) * 0.001;

    vec3 displaced = position + normalize(position) * breathAmount;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float sizeVariation = 0.7 + 0.5 * aRandom;
    gl_PointSize = uSize * sizeVariation * uPixelRatio * (1.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 10.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColorInner;
  uniform float uOpacity;
  varying float vRandom;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.45) discard;

    float dot = smoothstep(0.45, 0.25, dist);
    float pulse = 0.95 + 0.05 * sin(uTime * 1.0 + vRandom * 6.2831);

    gl_FragColor = vec4(uColorInner, dot * uOpacity * pulse);
  }
`

// ── Component ──
export function GaussianSplatViewer({ url, theme = 'dark' }: GaussianSplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const [viewMode, setViewMode] = useState<'particles' | 'original'>('particles')
  const pointsRef = useRef<{ particles: THREE.Points | null; original: THREE.Points | null }>({ particles: null, original: null })

  useEffect(() => {
    if (!url || !containerRef.current) return

    cleanupRef.current?.()

    const container = containerRef.current
    const oldCanvas = container.querySelector('canvas')
    if (oldCanvas) oldCanvas.remove()
    const oldStatus = container.querySelector('[data-status]')
    if (oldStatus) oldStatus.remove()

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
      50, container.clientWidth / container.clientHeight, 0.1, 1000
    )
    camera.position.set(0, 1, 5)
    camera.up.set(0, 1, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.8
    controls.zoomSpeed = 1.2
    controls.panSpeed = 0.8
    controls.enablePan = true

    const status = document.createElement('div')
    status.setAttribute('data-status', '')
    status.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#67e8f9;font:18px system-ui;z-index:1;pointer-events:none'
    status.textContent = 'Loading...'
    container.appendChild(status)

    const uniforms = {
      uTime: { value: 0 },
      uSize: { value: 20.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColorInner: { value: new THREE.Color('#7dd3fc') },
      uOpacity: { value: 0.7 },
    }

    async function loadFile() {
      try {
        status.textContent = 'Downloading...'
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const buffer = await response.arrayBuffer()
        if (disposed) return

        status.textContent = 'Parsing...'
        const { positions, colors, count } = parseFile(buffer, url)

        if (disposed) return

        // Compute bounding box
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        let minZ = Infinity, maxZ = -Infinity
        for (let i = 0; i < count; i++) {
          const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]
          minX = Math.min(minX, x); maxX = Math.max(maxX, x)
          minY = Math.min(minY, y); maxY = Math.max(maxY, y)
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
        }

        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        const cz = (minZ + maxZ) / 2
        const sceneSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ)

        // === Particle view (styled blue dots) ===
        const randoms = new Float32Array(count)
        for (let i = 0; i < count; i++) randoms[i] = Math.random()

        const particleGeom = new THREE.BufferGeometry()
        particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        particleGeom.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

        const adaptiveSize = Math.max(12, Math.min(40, 12 * Math.sqrt(50000 / count)))
        uniforms.uSize.value = adaptiveSize

        const particleMat = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending,
        })

        const particlePoints = new THREE.Points(particleGeom, particleMat)
        scene.add(particlePoints)
        pointsRef.current.particles = particlePoints

        // === Original view (real colors or white) ===
        const origGeom = new THREE.BufferGeometry()
        origGeom.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3))

        let origMat: THREE.PointsMaterial
        if (colors) {
          origGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          origMat = new THREE.PointsMaterial({
            size: adaptiveSize * 0.0004 * sceneSize,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
          })
        } else {
          origMat = new THREE.PointsMaterial({
            color: new THREE.Color('#cccccc'),
            size: adaptiveSize * 0.0004 * sceneSize,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
          })
        }

        const origPoints = new THREE.Points(origGeom, origMat)
        origPoints.visible = false  // hidden by default
        scene.add(origPoints)
        pointsRef.current.original = origPoints

        // Camera
        const camDist = sceneSize * 0.6
        controls.target.set(cx, cy, cz)
        camera.position.set(cx, cy + camDist * 0.2, cz + camDist)
        camera.lookAt(cx, cy, cz)
        controls.update()

        camera.near = sceneSize * 0.001
        camera.far = sceneSize * 10
        camera.updateProjectionMatrix()

        status.style.display = 'none'
        console.log(`[GS] Loaded ${count.toLocaleString()} points, hasColors=${!!colors}, bbox: ${sceneSize.toFixed(2)}`)
      } catch (err) {
        status.textContent = `Error: ${err instanceof Error ? err.message : err}`
        console.error('[GS] Load error:', err)
      }
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

  // Toggle visibility when viewMode changes
  useEffect(() => {
    if (pointsRef.current.particles) {
      pointsRef.current.particles.visible = viewMode === 'particles'
    }
    if (pointsRef.current.original) {
      pointsRef.current.original.visible = viewMode === 'original'
    }
  }, [viewMode])

  // React to theme changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClearColor(theme === 'dark' ? 0x050510 : 0xC8CACF)
    }
  }, [theme])

  return (
    <div ref={containerRef} className="viewer-container">
      <div className="view-toggle">
        <button className={`view-toggle__btn ${viewMode === 'particles' ? 'view-toggle__btn--active' : ''}`} onClick={() => setViewMode('particles')}>
          Particles
        </button>
        <button className={`view-toggle__btn ${viewMode === 'original' ? 'view-toggle__btn--active' : ''}`} onClick={() => setViewMode('original')}>
          Original
        </button>
      </div>
    </div>
  )
}
