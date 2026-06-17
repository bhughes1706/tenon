// jointFaceMesh selector (chunk 9 bonus stage). Pure typed-array filtering — no WASM,
// so we drive it with a hand-built EvalMesh whose triangles carry known provenance.
import { describe, it, expect } from 'vitest'
import { jointFaceMesh } from '../jointFaces.js'
import type { EvalMesh, CutFeature } from '../types.js'

// Build an EvalMesh of `provenance.length` triangles. Triangle i is filled with the
// constant value i across all 9 position/normal floats, so we can assert which
// triangles survived the filter by their value.
function meshOf(provenance: number[], features: CutFeature[]): EvalMesh {
  const triCount = provenance.length
  const positions = new Float32Array(triCount * 9)
  const normals = new Float32Array(triCount * 9)
  for (let tri = 0; tri < triCount; tri++) {
    positions.fill(tri, tri * 9, tri * 9 + 9)
    normals.fill(tri + 100, tri * 9, tri * 9 + 9)
  }
  return { positions, normals, provenance: Uint16Array.from(provenance), features }
}

const FEATURES: CutFeature[] = [
  { id: 0, kind: 'base' }, // board body — never highlighted
  { id: 1, kind: 'mortise', jointId: 'jnt_a' }, // joint cut
  { id: 2, kind: 'groove' }, // board-level edge groove — no jointId, not highlighted
  { id: 3, kind: 'tenon_cheek', jointId: 'jnt_a' }, // joint cut
]

describe('jointFaceMesh', () => {
  it('keeps only triangles whose feature carries a jointId', () => {
    // triangles:        0=base 1=mortise 2=groove 3=tenon 4=base 5=mortise
    const mesh = meshOf([0, 1, 2, 3, 0, 1], FEATURES)
    const out = jointFaceMesh(mesh)
    expect(out).not.toBeNull()
    // triangles 1, 3, 5 are joint faces → 3 triangles × 9 floats.
    expect(out!.positions).toHaveLength(27)
    expect(out!.normals).toHaveLength(27)
    // First float of each surviving triangle === original triangle index.
    expect([out!.positions[0], out!.positions[9], out!.positions[18]]).toEqual([1, 3, 5])
    expect([out!.normals[0], out!.normals[9], out!.normals[18]]).toEqual([101, 103, 105])
  })

  it('returns null when the board has no joint faces', () => {
    const mesh = meshOf([0, 2, 0, 2], FEATURES) // base + edge groove only
    expect(jointFaceMesh(mesh)).toBeNull()
  })

  it('returns null for a feature table with no jointed features', () => {
    const mesh = meshOf([0, 0, 0], [{ id: 0, kind: 'base' }])
    expect(jointFaceMesh(mesh)).toBeNull()
  })
})
