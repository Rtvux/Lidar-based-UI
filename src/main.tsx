import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Set theme before render to prevent flash
document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark')

createRoot(document.getElementById('root')!).render(<App />)
