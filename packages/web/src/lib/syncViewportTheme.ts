// §20.3 — reads --vp-* CSS vars and applies them to the three.js scene.
// Scene type is unknown until chunk 7 wires the live viewport.
export interface ViewportScene {
  background: { set(color: string): void }
  gridMajor: { material: { color: { set(color: string): void } } }
  gridMinor: { material: { color: { set(color: string): void } } }
  selectionOutline: { color: { set(color: string): void } }
  hoverMaterial: { color: { set(color: string): void } }
  collisionMaterial: { color: { set(color: string): void } }
  jointHighlight: { color: { set(color: string): void }; emissive: { set(color: string): void } }

  measureLine: { color: { set(color: string): void } }
  snapLine: { color: { set(color: string): void } }
}

// The live scene registered by the Viewport. applyTheme() (theme.ts) calls
// syncViewportTheme() with no argument on every theme/density change; routing it
// through this module-level handle lets the WebGL scene follow CSS in the same
// frame without theme.ts knowing the viewport exists.
let activeScene: ViewportScene | undefined

export function setViewportScene(scene: ViewportScene | undefined): void {
  activeScene = scene
  if (scene) syncViewportTheme(scene)
}

export function syncViewportTheme(scene?: ViewportScene): void {
  const target = scene ?? activeScene
  if (!target) return
  const s = getComputedStyle(document.documentElement)
  const get = (v: string) => s.getPropertyValue(v).trim()

  target.background.set(get('--vp-bg'))
  target.gridMajor.material.color.set(get('--vp-grid-major'))
  target.gridMinor.material.color.set(get('--vp-grid-minor'))
  target.selectionOutline.color.set(get('--vp-selection'))
  target.hoverMaterial.color.set(get('--vp-hover'))
  target.collisionMaterial.color.set(get('--vp-collision'))
  target.jointHighlight.color.set(get('--vp-joint-hi'))
  target.jointHighlight.emissive.set(get('--vp-joint-hi'))

  target.measureLine.color.set(get('--vp-measure'))
  target.snapLine.color.set(get('--vp-snap'))
}
