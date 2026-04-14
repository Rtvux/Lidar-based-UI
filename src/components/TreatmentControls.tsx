export function TreatmentControls() {
  return (
    <div className="treatment">
      <div className="treatment__row">
        <span className="treatment__label">Particle Size</span>
        <input type="range" min="1" max="100" defaultValue="50" className="treatment__slider" disabled />
      </div>
      <div className="treatment__row">
        <span className="treatment__label">Color</span>
        <input type="color" defaultValue="#1539F5" className="treatment__color" disabled />
      </div>
      <div className="treatment__row">
        <span className="treatment__label">Opacity</span>
        <input type="range" min="0" max="100" defaultValue="70" className="treatment__slider" disabled />
      </div>
      <div className="treatment__row">
        <span className="treatment__label">Animation</span>
        <button className="treatment__toggle" disabled>Off</button>
      </div>
      <div className="treatment__hint">Coming soon</div>
    </div>
  )
}
