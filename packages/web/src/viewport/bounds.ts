import * as THREE from 'three'
import type { Model } from '@tenon/core'
import { worldAABB } from '@tenon/core'

// World-space bounds of all boards, used to frame the camera on a view preset. The
// per-board world AABB is the one true core implementation (chunk 9 §1a) — exact for
// v1's 90° boards. Empty model → a sensible default volume so the grid isn't framed
// from infinity.
export function modelBounds(model: Model | null): { center: THREE.Vector3; radius: number } {
  if (!model || model.boards.length === 0) {
    return { center: new THREE.Vector3(0, 6, 0), radius: 18 }
  }
  const box = new THREE.Box3()
  for (const b of model.boards) {
    const { min, max } = worldAABB(b)
    box.expandByPoint(new THREE.Vector3(min[0], min[1], min[2]))
    box.expandByPoint(new THREE.Vector3(max[0], max[1], max[2]))
  }
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 6)
  return { center, radius }
}
