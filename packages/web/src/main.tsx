import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { initTheme } from './lib/theme.js'
import './lib/viewportCommands.js' // side effect: overwrite command stubs with real impls
import { App } from './router.js'

// Apply theme from localStorage before React renders to avoid FOUC.
initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
