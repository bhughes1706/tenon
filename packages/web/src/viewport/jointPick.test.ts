import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { pickJoint, extractJointFaces } from './jointPick.js'
import type { CutFeature } from '@tenon/core/eval'

// Synthetic carved-board geometry: 3 de-indexed triangles whose provenance maps to
// base (0) / a mortise belonging to jnt_A (1) / an edge groove with no jointId (2) —
// the exact userData contract geometryClient.buildBoard writes.
function makeGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array([
    // tri 0 (base)
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    // tri 1 (mortise wall, jnt_A)
    2, 0, 0, 3, 0, 0, 2, 1, 0,
    // tri 2 (groove — board feature, no jointId)
    4, 0, 0, 5, 0, 0, 4, 1, 0,
  ])
  const normals = new Float32Array(27).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0))
  const features: CutFeature[] = [
    { id: 0, kind: 'base' },
    { id: 1, kind: 'mortise', jointId: 'jnt_A' },
    { id: 2, kind: 'dado' },
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
  g.userData.provenance = new Uint16Array([0, 1, 2])
  g.userData.features = features
  return g
}

describe('pickJoint', () => {
  it('resolves a joint-cut face to its jointId', () => {
    expect(pickJoint(makeGeometry(), 1)).toBe('jnt_A')
  })

  it('returns null for base and board-feature (groove) faces', () => {
    const g = makeGeometry()
    expect(pickJoint(g, 0)).toBeNull()
    expect(pickJoint(g, 2)).toBeNull()
  })

  it('returns null for out-of-range or missing faceIndex', () => {
    const g = makeGeometry()
    expect(pickJoint(g, 99)).toBeNull()
    expect(pickJoint(g, -1)).toBeNull()
    expect(pickJoint(g, null)).toBeNull()
    expect(pickJoint(g, undefined)).toBeNull()
  })

  it('returns null on the box fallback (no provenance userData)', () => {
    expect(pickJoint(new THREE.BoxGeometry(1, 1, 1), 0)).toBeNull()
  })
})

describe('extractJointFaces', () => {
  it('extracts exactly the selected joint’s triangles', () => {
    const sub = extractJointFaces(makeGeometry(), 'jnt_A')
    expect(sub).not.toBeNull()
    const pos = sub!.getAttribute('position')
    expect(pos.count).toBe(3) // one triangle
    // Triangle 1's first vertex is (2,0,0)
    expect(pos.getX(0)).toBe(2)
  })

  it('returns null when the board has no faces for that joint', () => {
    expect(extractJointFaces(makeGeometry(), 'jnt_OTHER')).toBeNull()
  })

  it('returns null on geometry without provenance', () => {
    expect(extractJointFaces(new THREE.BoxGeometry(1, 1, 1), 'jnt_A')).toBeNull()
  })
})
