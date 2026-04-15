import { UploadZone } from './UploadZone'
import { FileList, type LoadedFile } from './FileList'
import { TreatmentControls } from './TreatmentControls'
import { TreatmentSelector } from './TreatmentSelector'
import { TREATMENTS } from '../treatments'
import type { TreatmentValues, ViewerType } from '../treatments'

interface SidebarProps {
  files: LoadedFile[]
  activeFileId: string | null
  onSelectFile: (id: string) => void
  onFileSelected: (file: File) => void
  onDeleteFile?: (file: LoadedFile) => void
  uploading?: boolean
  activeTreatment: string
  treatmentValues: TreatmentValues
  viewerType: ViewerType | null
  onSelectTreatment: (id: string) => void
  onTreatmentValueChange: (key: string, value: number | string | boolean) => void
}

export function Sidebar({
  files, activeFileId, onSelectFile, onFileSelected, onDeleteFile, uploading,
  activeTreatment, treatmentValues, viewerType, onSelectTreatment, onTreatmentValueChange,
}: SidebarProps) {
  const treatment = TREATMENTS[activeTreatment]

  return (
    <aside className="sidebar">
      <div className="sidebar__section">
        <UploadZone onFileSelected={onFileSelected} uploading={uploading} />
      </div>

      <div className="sidebar__files">
        <div className="sidebar__section-title">Models</div>
        <FileList files={files} activeFileId={activeFileId} onSelect={onSelectFile} onDelete={onDeleteFile} />
      </div>

      <div className="sidebar__section sidebar__section--treatment">
        <div className="sidebar__section-title">Treatment</div>
        <TreatmentSelector
          activeTreatment={activeTreatment}
          viewerType={viewerType}
          onSelect={onSelectTreatment}
        />
        {treatment && (
          <TreatmentControls
            treatment={treatment}
            values={treatmentValues}
            onChange={onTreatmentValueChange}
          />
        )}
      </div>
    </aside>
  )
}
