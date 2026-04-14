import { GaussianSplatViewer } from './GaussianSplatViewer'
import { GLBViewer } from './GLBViewer'
import type { LoadedFile } from './FileList'

interface ViewerPanelProps {
  activeFile: LoadedFile | null
  theme: 'light' | 'dark'
}

export function ViewerPanel({ activeFile, theme }: ViewerPanelProps) {
  if (!activeFile) {
    return (
      <div className="viewer-panel">
        <div className="viewer-panel__empty">
          <div className="viewer-panel__empty-title">No model loaded</div>
          <div className="viewer-panel__empty-hint">Upload a file or select one from the sidebar</div>
        </div>
      </div>
    )
  }

  return (
    <div className="viewer-panel">
      {activeFile.type === 'pointcloud' ? (
        <GaussianSplatViewer url={activeFile.url} theme={theme} />
      ) : (
        <GLBViewer url={activeFile.url} theme={theme} />
      )}
    </div>
  )
}
