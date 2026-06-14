import * as THREE from 'three'
import type { ViewportScene } from '../lib/syncViewportTheme.js'

// All theme-driven WebGL objects live here so syncViewportTheme (§20.3) can recolor
// them from one place. Wood/species colors are NOT here — they are physical and
// never themed. Only UI overlays respond to light/dark.

const GRID_EXTENT = 48 // inches each direction from origin (8 ft span)
const GRID_MINOR = 2 // minor line every 2"
const GRID_MAJOR = 12 // major line every 12" (1 ft)

function gridGeometry(extent: number, step: number, skipMultipleOf: number | null): THREE.BufferGeometry {
  const pts: number[] = []
  for (let i = -extent; i <= extent; i += step) {
    if (skipMultipleOf !== null && Math.abs(i % skipMultipleOf) < 1e-6) continue
    pts.push(i, 0, -extent, i, 0, extent) // line parallel to Z at x=i
    pts.push(-extent, 0, i, extent, 0, i) // line parallel to X at z=i
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

export interface ViewportResources {
  background: THREE.Color
  gridMajor: THREE.LineSegments
  gridMinor: THREE.LineSegments
  selectionMat: THREE.LineBasicMaterial
  hoverMat: THREE.LineBasicMaterial
  measureMat: THREE.LineBasicMaterial
  collisionMat: THREE.MeshStandardMaterial
  jointMat: THREE.MeshStandardMaterial
  ghostMat: THREE.MeshStandardMaterial
  scene: ViewportScene
  dispose: () => void
}

export function createViewportResources(): ViewportResources {
  const majorMat = new THREE.LineBasicMaterial({ transparent: true })
  const minorMat = new THREE.LineBasicMaterial({ transparent: true })
  const majorGeo = gridGeometry(GRID_EXTENT, GRID_MAJOR, null)
  const minorGeo = gridGeometry(GRID_EXTENT, GRID_MINOR, GRID_MAJOR)
  const gridMajor = new THREE.LineSegments(majorGeo, majorMat)
  const gridMinor = new THREE.LineSegments(minorGeo, minorMat)
  // Grid is decoration: never pickable, never occluding the depth pre-pass.
  gridMajor.raycast = () => {}
  gridMinor.raycast = () => {}

  const selectionMat = new THREE.LineBasicMaterial()
  const hoverMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 })
  const measureMat = new THREE.LineBasicMaterial()
  const collisionMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })
  const jointMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.6 })
  const ghostMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 })
  const background = new THREE.Color('#f4f1ec')

  // The ViewportScene shape (syncViewportTheme.ts) wants objects exposing
  // `.color.set` / `.material.color.set`; a THREE.Color satisfies `{ set }`.
  const scene: ViewportScene = {
    background,
    gridMajor: { material: { color: majorMat.color } },
    gridMinor: { material: { color: minorMat.color } },
    selectionOutline: { color: selectionMat.color },
    hoverMaterial: { color: hoverMat.color },
    collisionMaterial: { color: collisionMat.color },
    jointHighlight: { color: jointMat.color },
    ghostMaterial: { color: ghostMat.color },
    measureLine: { color: measureMat.color },
  }

  return {
    background,
    gridMajor,
    gridMinor,
    selectionMat,
    hoverMat,
    measureMat,
    collisionMat,
    jointMat,
    ghostMat,
    scene,
    // Not called in normal operation — GPU cleanup relies on WebGL context teardown
    // when the Canvas unmounts (see Viewport.tsx effect comment). Kept for parity
    // with the resource-ownership pattern so future callers have the option.
    dispose() {
      majorGeo.dispose()
      minorGeo.dispose()
      for (const m of [majorMat, minorMat, selectionMat, hoverMat, measureMat, collisionMat, jointMat, ghostMat]) {
        m.dispose()
      }
    },
  }
}
