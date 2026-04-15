import { TREATMENT_LIST } from '../treatments'
import type { ViewerType } from '../treatments'

interface TreatmentSelectorProps {
  activeTreatment: string
  viewerType: ViewerType | null
  onSelect: (treatmentId: string) => void
}

export function TreatmentSelector({ activeTreatment, viewerType, onSelect }: TreatmentSelectorProps) {
  return (
    <div className="treatment-selector">
      {TREATMENT_LIST.map(t => {
        const compatible = !viewerType || t.supportedViewers.includes(viewerType)
        const active = t.id === activeTreatment
        return (
          <button
            key={t.id}
            className={`treatment-selector__btn ${active ? 'treatment-selector__btn--active' : ''} ${!compatible ? 'treatment-selector__btn--disabled' : ''}`}
            onClick={() => compatible && onSelect(t.id)}
            disabled={!compatible}
            title={compatible ? t.description : `${t.name} is only available for ${t.supportedViewers.join(' or ')} files`}
          >
            {t.name}
          </button>
        )
      })}
    </div>
  )
}
