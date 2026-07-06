import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useModelStore, type ViewPreset } from '../lib/modelStore.js'
import { Viewport } from '../viewport/Viewport.js'

// Headless render mode (§11.3) — `/designer/:id?render=<iso|front|top|right>&hl=<ids>`.
// The server's render_view drives this page with Puppeteer: it renders ONLY the
// Viewport (no chrome, no palette, no SSE, no context menu), loads the model,
// applies the requested view + highlight, and flips window.__tenonRenderReady
// once every board's carved mesh has landed and two frames have drawn — the
// screenshot is then pixel-identical to what the designer shows.

declare global {
  interface Window {
    __tenonRenderReady?: boolean
  }
}

const VALID_VIEWS: readonly string[] = ['iso', 'front', 'top', 'right']

export function RenderShell() {
  const { modelId } = useParams()
  const [params] = useSearchParams()
  const rawView = params.get('render') ?? 'iso'
  const view = (VALID_VIEWS.includes(rawView) ? rawView : 'iso') as ViewPreset
  const hl = params.get('hl')?.split(',').filter(Boolean) ?? []

  const model = useModelStore((s) => s.model)
  const loading = useModelStore((s) => s.loading)
  const meshes = useModelStore((s) => s.meshes)

  useEffect(() => {
    if (!modelId) return
    window.__tenonRenderReady = false
    void useModelStore.getState().load(modelId)
  }, [modelId])

  // Once the model is in: apply highlight (selection outlines) + frame the view.
  // Measure mode so a single-board highlight doesn't summon the transform gizmo
  // into the screenshot (outlines render in every mode; the gizmo only in select).
  useEffect(() => {
    if (!model) return
    const s = useModelStore.getState()
    s.setMode('measure')
    if (hl.length > 0) s.setSelection(hl)
    s.requestView(view)
    // Re-run only when a different model document arrives.
  }, [model?.id, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ready when every board's carved mesh has landed (evaluate() emits a mesh for
  // EVERY board — base solid at minimum), then two rAFs so R3F has drawn it.
  const carvedAll = !!model && !loading && meshes.size >= model.boards.length
  useEffect(() => {
    if (!carvedAll) return
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        window.__tenonRenderReady = true
      })
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [carvedAll])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--vp-bg)' }}>
      <Viewport precision={16} shadows={false} />
    </div>
  )
}
