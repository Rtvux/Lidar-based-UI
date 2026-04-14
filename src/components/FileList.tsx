export interface LoadedFile {
  id: string
  name: string
  url: string
  type: 'lidar' | 'pointcloud'
  extension: string
  storagePath?: string  // Supabase storage filename, for deletion
}

interface FileListProps {
  files: LoadedFile[]
  activeFileId: string | null
  onSelect: (id: string) => void
  onDelete?: (file: LoadedFile) => void
}

function FileRow({ file, isActive, onSelect, onDelete }: {
  file: LoadedFile
  isActive: boolean
  onSelect: () => void
  onDelete?: () => void
}) {
  return (
    <div className={`file-item ${isActive ? 'file-item--active' : ''}`}>
      <button className="file-item__btn" onClick={onSelect}>
        <span className={`file-item__dot file-item__dot--${file.type}`} />
        <span className="file-item__name">{file.name}</span>
        <span className="file-item__ext">{file.extension}</span>
      </button>
      {onDelete && (
        <button
          className="file-item__delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete model"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      )}
    </div>
  )
}

export function FileList({ files, activeFileId, onSelect, onDelete }: FileListProps) {
  const lidarFiles = files.filter(f => f.type === 'lidar')
  const pointcloudFiles = files.filter(f => f.type === 'pointcloud')

  if (files.length === 0) {
    return <div className="file-list__empty">No files loaded</div>
  }

  return (
    <div>
      {lidarFiles.length > 0 && (
        <div className="file-list__group">
          <div className="file-list__label">LiDAR Scans</div>
          {lidarFiles.map(f => (
            <FileRow
              key={f.id}
              file={f}
              isActive={f.id === activeFileId}
              onSelect={() => onSelect(f.id)}
              onDelete={onDelete ? () => onDelete(f) : undefined}
            />
          ))}
        </div>
      )}
      {pointcloudFiles.length > 0 && (
        <div className="file-list__group">
          <div className="file-list__label">Point Clouds</div>
          {pointcloudFiles.map(f => (
            <FileRow
              key={f.id}
              file={f}
              isActive={f.id === activeFileId}
              onSelect={() => onSelect(f.id)}
              onDelete={onDelete ? () => onDelete(f) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
