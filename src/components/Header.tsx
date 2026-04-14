import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__title">LiDAR Viewer</div>
      <div className="app-header__callout">
        Upload LiDAR scans or 3D models to visualize as interactive particle renders
      </div>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  )
}
