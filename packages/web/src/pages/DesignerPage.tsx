import { useSearchParams } from 'react-router-dom'
import { DesignerShell } from '../ui/DesignerShell.js'
import { RenderShell } from '../ui/RenderShell.js'

// Thin route wrapper — DesignerShell reads :modelId from the router and owns the
// viewport, chrome, and command wiring (chunk 7). With ?render=<view> the page
// becomes the chrome-less RenderShell that render_view screenshots (§11.3).
export function DesignerPage() {
  const [params] = useSearchParams()
  return params.has('render') ? <RenderShell /> : <DesignerShell />
}
