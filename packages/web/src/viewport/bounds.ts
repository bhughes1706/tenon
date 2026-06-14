import * as THREE from 'three'
import type { Model } from '@tenon/core'

const deg2rad = (d: number) => (d * Math.PI) / 180

// World-space bounds of all boards (corners transformed by each board's pose),
// used to frame the camera on a view preset. Empty model → a sensible default
// volume so the grid isn't framed from infinity.
export function modelBounds(model: Model | null): { center: THREE.Vector3; radius: number } {
  if (!model || model.boards.length === 0) {
    return { center: new THREE.Vector3(0, 6, 0), radius: 18 }
  }
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (const b of model.boards) {
    const [px, py, pz] = b.transform.pos
    const [rx, ry, rz] = b.transform.rot
    q.setFromEuler(e.set(deg2rad(rx), deg2rad(ry), deg2rad(rz), 'XYZ'))
    const hl = b.dims.l / 2
    const hw = b.dims.w / 2
    const ht = b.dims.t / 2
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          v.set(sx * hl, sy * hw, sz * ht).applyQuaternion(q)
          box.expandByPoint(v.set(v.x + px, v.y + py, v.z + pz))
        }
  }
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 6)
  return { center, radius }
}
