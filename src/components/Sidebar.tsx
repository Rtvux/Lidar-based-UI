import { UploadZone } from './UploadZone'
import { FileList, type LoadedFile } from './FileList'
import { TreatmentControls } from './TreatmentControls'

interface SidebarProps {
  files: LoadedFile[]
  activeFileId: string | null
  onSelectFile: (id: string) => void
  onFileSelected: (file: File) => void
}

export function Sidebar({ files, activeFileId, onSelectFile, onFileSelected }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__section">
        <UploadZone onFileSelected={onFileSelected} />
      </div>

      <div className="sidebar__files">
        <div className="sidebar__section-title">Models</div>
        <FileList files={files} activeFileId={activeFileId} onSelect={onSelectFile} />
      </div>

      <div className="sidebar__section">
        <div className="sidebar__section-title">Treatment</div>
        <TreatmentControls />
      </div>
    </aside>
  )
}
