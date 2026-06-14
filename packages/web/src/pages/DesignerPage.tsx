import { DesignerShell } from '../ui/DesignerShell.js'

// Thin route wrapper — DesignerShell reads :modelId from the router and owns the
// viewport, chrome, and command wiring (chunk 7).
export function DesignerPage() {
  return <DesignerShell />
}
