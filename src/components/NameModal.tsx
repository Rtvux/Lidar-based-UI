import { useState, useRef, useEffect } from 'react'

interface NameModalProps {
  defaultName: string
  extension: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function NameModal({ defaultName, extension, onConfirm, onCancel }: NameModalProps) {
  const [value, setValue] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = () => {
    const name = value.trim() || defaultName
    onConfirm(name)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">Name your model</div>
        <div className="modal__body">
          <div className="modal__field">
            <input
              ref={inputRef}
              className="modal__input"
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
              placeholder="e.g. Human Body Scan"
            />
            <span className="modal__ext">.{extension}</span>
          </div>
          <div className="modal__hint">Give this model a descriptive name</div>
        </div>
        <div className="modal__footer">
          <button className="modal__btn modal__btn--secondary" onClick={onCancel}>Cancel</button>
          <button className="modal__btn modal__btn--primary" onClick={handleSubmit}>Upload</button>
        </div>
      </div>
    </div>
  )
}
