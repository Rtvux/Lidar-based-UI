import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ViewerPanel } from './components/ViewerPanel'
import type { LoadedFile } from './components/FileList'
import { uploadModel, listModels, deleteModel } from './lib/supabase'
import './App.css'

const LIDAR_EXTS = ['obj', 'stl', 'glb', 'gltf']
const PC_EXTS = ['splat', 'ply', 'ksplat', 'spz', 'sog']
const ALL_EXTS = [...LIDAR_EXTS, ...PC_EXTS]

function extToType(ext: string): 'lidar' | 'pointcloud' {
  return LIDAR_EXTS.includes(ext) ? 'lidar' : 'pointcloud'
}

function cleanName(filename: string): string {
  // Remove timestamp prefix if present (e.g. "1234567890_model.obj" → "model")
  return filename
    .replace(/^\d+_/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark'
  })
  const [files, setFiles] = useState<LoadedFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
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

  // Load existing files from Supabase on mount
  useEffect(() => {
    listModels().then(remoteFiles => {
      const loaded: LoadedFile[] = remoteFiles.map(f => {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
        return {
          id: f.name,
          name: cleanName(f.name),
          url: f.url,
          type: extToType(ext),
          extension: ext,
          storagePath: f.name,
        }
      }).filter(f => ALL_EXTS.includes(f.extension))

      setFiles(loaded)
      if (loaded.length > 0) {
        setActiveFileId(loaded[0].id)
      }
    }).catch(err => {
      console.error('Failed to load models from Supabase:', err)
    })
  }, [])

  // Handle file upload → Supabase
  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALL_EXTS.includes(ext)) {
      alert('Supported formats: .obj, .stl, .glb, .splat, .ply')
      return
    }

    const defaultName = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
    const userInput = prompt('Name this model:', defaultName)
    if (userInput === null) return // cancelled
    const modelName = userInput.trim() || defaultName

    setUploading(true)
    try {
      const { publicUrl, storagePath } = await uploadModel(file)

      const newFile: LoadedFile = {
        id: crypto.randomUUID(),
        name: modelName,
        url: publicUrl,
        type: extToType(ext),
        extension: ext,
        storagePath,
      }

      setFiles(prev => [newFile, ...prev])
      setActiveFileId(newFile.id)
    } catch (err) {
      console.error('Upload failed:', err)
      alert(`Upload failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setUploading(false)
    }
  }, [])

  // Handle file delete from Supabase
  const handleDelete = useCallback(async (file: LoadedFile) => {
    if (!confirm(`Delete "${file.name}"?`)) return

    if (file.storagePath) {
      try {
        await deleteModel(file.storagePath)
      } catch (err) {
        console.error('Delete failed:', err)
        alert(`Delete failed: ${err instanceof Error ? err.message : err}`)
        return
      }
    }

    setFiles(prev => prev.filter(f => f.id !== file.id))
    if (activeFileId === file.id) {
      const remaining = files.filter(f => f.id !== file.id)
      setActiveFileId(remaining.length > 0 ? remaining[0].id : null)
    }
  }, [activeFileId, files])

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
          onDeleteFile={handleDelete}
          uploading={uploading}
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
