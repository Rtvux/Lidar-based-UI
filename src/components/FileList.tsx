export interface LoadedFile {
  id: string
  name: string
  url: string
  type: 'lidar' | 'pointcloud'
  extension: string
}

interface FileListProps {
  files: LoadedFile[]
  activeFileId: string | null
  onSelect: (id: string) => void
}

export function FileList({ files, activeFileId, onSelect }: FileListProps) {
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
            <button
              key={f.id}
              className={`file-item ${f.id === activeFileId ? 'file-item--active' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <span className="file-item__dot file-item__dot--lidar" />
              <span className="file-item__name">{f.name}</span>
              <span className="file-item__ext">{f.extension}</span>
            </button>
          ))}
        </div>
      )}
      {pointcloudFiles.length > 0 && (
        <div className="file-list__group">
          <div className="file-list__label">Point Clouds</div>
          {pointcloudFiles.map(f => (
            <button
              key={f.id}
              className={`file-item ${f.id === activeFileId ? 'file-item--active' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <span className="file-item__dot file-item__dot--pointcloud" />
              <span className="file-item__name">{f.name}</span>
              <span className="file-item__ext">{f.extension}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
