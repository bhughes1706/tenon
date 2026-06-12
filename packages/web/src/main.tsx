import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// Design tokens applied to root element — chunk 5
// Theme is set via data-theme attribute (light | dark | system → resolved)

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
