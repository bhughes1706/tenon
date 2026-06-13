import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { initTheme } from './lib/theme.js'
import { App } from './App.js'

// Apply theme from localStorage before React renders to avoid FOUC.
initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
