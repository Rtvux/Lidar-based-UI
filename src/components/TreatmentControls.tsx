import type { TreatmentDef, TreatmentValues, TreatmentControlDef } from '../treatments'

interface TreatmentControlsProps {
  treatment: TreatmentDef
  values: TreatmentValues
  onChange: (key: string, value: number | string | boolean) => void
}

function ControlRow({ control, value, onChange }: {
  control: TreatmentControlDef
  value: number | string | boolean
  onChange: (v: number | string | boolean) => void
}) {
  if (control.type === 'slider') {
    const num = Number(value)
    return (
      <div className="treatment__row">
        <span className="treatment__label">{control.label}</span>
        <div className="treatment__slider-wrap">
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={num}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="treatment__slider"
          />
          <span className="treatment__value">{num.toFixed(control.step < 1 ? 2 : 0)}</span>
        </div>
      </div>
    )
  }

  if (control.type === 'color') {
    return (
      <div className="treatment__row">
        <span className="treatment__label">{control.label}</span>
        <input
          type="color"
          value={String(value)}
          onChange={e => onChange(e.target.value)}
          className="treatment__color"
        />
      </div>
    )
  }

  if (control.type === 'toggle') {
    const enabled = Boolean(value)
    return (
      <div className="treatment__row">
        <span className="treatment__label">{control.label}</span>
        <button
          className={`treatment__toggle ${enabled ? 'treatment__toggle--on' : ''}`}
          onClick={() => onChange(!enabled)}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
    )
  }

  if (control.type === 'select') {
    return (
      <div className="treatment__row">
        <span className="treatment__label">{control.label}</span>
        <select
          className="treatment__select"
          value={String(value)}
          onChange={e => onChange(e.target.value)}
        >
          {control.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    )
  }

  return null
}

export function TreatmentControls({ treatment, values, onChange }: TreatmentControlsProps) {
  return (
    <div className="treatment">
      {treatment.controls.map(c => (
        <ControlRow
          key={c.key}
          control={c}
          value={values[c.key] ?? getDefault(c)}
          onChange={(v) => onChange(c.key, v)}
        />
      ))}
    </div>
  )
}

function getDefault(c: TreatmentControlDef): number | string | boolean {
  if (c.type === 'slider') return c.defaultValue
  if (c.type === 'color') return c.defaultColor
  if (c.type === 'toggle') return c.defaultEnabled
  if (c.type === 'select') return c.defaultOption
  return ''
}
