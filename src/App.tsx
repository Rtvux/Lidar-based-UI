import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ViewerPanel } from './components/ViewerPanel'
import type { LoadedFile } from './components/FileList'
import './App.css'

const DEMO_FILES: LoadedFile[] = [
  { id: 'demo-lidar-1', name: 'LiDAR Scan 1', url: '/lidar_model/model.obj', type: 'lidar', extension: 'obj' },
  { id: 'demo-lidar-2', name: 'LiDAR Scan 2', url: '/lidar_model2/model.obj', type: 'lidar', extension: 'obj' },
  { id: 'demo-lidar-3', name: 'LiDAR Scan 3', url: '/lidar_model3/model.obj', type: 'lidar', extension: 'obj' },
  { id: 'demo-splat', name: 'Demo Splat', url: '/model.splat', type: 'pointcloud', extension: 'splat' },
]

const LIDAR_EXTS = ['obj', 'stl', 'glb', 'gltf']
const PC_EXTS = ['splat', 'ply', 'ksplat', 'spz', 'sog']

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark'
  })
  const [files, setFiles] = useState<LoadedFile[]>(DEMO_FILES)
  const [activeFileId, setActiveFileId] = useState<string | null>('demo-lidar-3')
  const [isDragging, setIsDragging] = useState(false)
  const dragCountRef = useRef(0)

  const activeFile = files.find(f => f.id === activeFileId) ?? null

  // Theme sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  // Handle file upload
  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (![...LIDAR_EXTS, ...PC_EXTS].includes(ext)) {
      alert('Supported formats: .obj, .stl, .glb, .splat, .ply')
      return
    }

    const newFile: LoadedFile = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
      type: LIDAR_EXTS.includes(ext) ? 'lidar' : 'pointcloud',
      extension: ext,
    }

    setFiles(prev => [...prev, newFile])
    setActiveFileId(newFile.id)
  }, [])

  // Window-level drag-drop
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => { e.preventDefault(); dragCountRef.current++; setIsDragging(true) }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); dragCountRef.current--; if (dragCountRef.current <= 0) { dragCountRef.current = 0; setIsDragging(false) } }
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); dragCountRef.current = 0; setIsDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) handleFile(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleFile])

  return (
    <div className="app-layout">
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <div className="app-body">
        <Sidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={setActiveFileId}
          onFileSelected={handleFile}
        />
        <ViewerPanel activeFile={activeFile} theme={theme} />
      </div>

      <footer className="app-footer">
        Scroll to zoom &middot; Drag to orbit &middot; Right-drag to pan
      </footer>

      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay__text">Drop file to load</div>
        </div>
      )}
    </div>
  )
}

export default App
