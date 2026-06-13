// §20.3 — reads --vp-* CSS vars and applies them to the three.js scene.
// Scene type is unknown until chunk 7 wires the live viewport.
export interface ViewportScene {
  background: { set(color: string): void }
  gridMajor: { material: { color: { set(color: string): void } } }
  gridMinor: { material: { color: { set(color: string): void } } }
  selectionOutline: { color: { set(color: string): void } }
  hoverMaterial: { color: { set(color: string): void } }
  collisionMaterial: { color: { set(color: string): void } }
  jointHighlight: { color: { set(color: string): void } }
  ghostMaterial: { color: { set(color: string): void } }
  measureLine: { color: { set(color: string): void } }
}

export function syncViewportTheme(scene?: ViewportScene): void {
  if (!scene) return
  const s = getComputedStyle(document.documentElement)
  const get = (v: string) => s.getPropertyValue(v).trim()

  scene.background.set(get('--vp-bg'))
  scene.gridMajor.material.color.set(get('--vp-grid-major'))
  scene.gridMinor.material.color.set(get('--vp-grid-minor'))
  scene.selectionOutline.color.set(get('--vp-selection'))
  scene.hoverMaterial.color.set(get('--vp-hover'))
  scene.collisionMaterial.color.set(get('--vp-collision'))
  scene.jointHighlight.color.set(get('--vp-joint-hi'))
  scene.ghostMaterial.color.set(get('--vp-ghost'))
  scene.measureLine.color.set(get('--vp-measure'))
}
