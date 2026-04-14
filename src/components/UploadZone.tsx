import { useRef, useState, useCallback, type DragEvent } from 'react'

interface UploadZoneProps {
  onFileSelected: (file: File) => void
  uploading?: boolean
}

const ACCEPT = '.obj,.stl,.glb,.gltf,.splat,.ply,.ksplat,.spz,.sog'
const FORMATS = ['.obj', '.stl', '.glb', '.splat', '.ply']

export function UploadZone({ onFileSelected, uploading }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileSelected(file)
  }, [onFileSelected])

  return (
    <div
      className={`upload-zone ${dragOver ? 'upload-zone--dragover' : ''} ${uploading ? 'upload-zone--uploading' : ''}`}
      onClick={() => !uploading && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f) }}
      />
      {uploading ? (
        <>
          <div className="upload-zone__spinner" />
          <div className="upload-zone__text">Uploading...</div>
        </>
      ) : (
        <>
          <svg className="upload-zone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div className="upload-zone__text">Drop files here or browse</div>
          <div className="upload-zone__formats">
            {FORMATS.map(f => <span key={f} className="upload-zone__badge">{f}</span>)}
          </div>
        </>
      )}
    </div>
  )
}
