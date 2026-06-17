// Joint-face selector (chunk 9 bonus stage — joint highlight).
//
// Extracts the triangles of a carved board that belong to a JOINT cut (mortise walls,
// tenon cheeks, shoulders, laps, slots, …) so the viewport can tint just those faces.
// A triangle is a joint face iff its provenance feature carries a `jointId`; feature 0
// (base) and board-level edge grooves (no jointId) are excluded. Returns null when the
// board has no joint faces (a plain or joint-free board), so the caller skips it.
//
// THREE-free: returns plain typed arrays mirroring EvalMesh's de-indexed triangle-soup
// layout (9 position + 9 normal floats per triangle). geometryClient wraps them into a
// BufferGeometry on the main thread — no re-indexing needed.
import type { EvalMesh } from './types.js'

export function jointFaceMesh(
  mesh: EvalMesh,
): { positions: Float32Array; normals: Float32Array } | null {
  const { positions, normals, provenance, features } = mesh
  // provenance stores the index into `features`; mark which features are joint cuts.
  const isJoint = features.map((f) => f.jointId != null)

  let count = 0
  for (let tri = 0; tri < provenance.length; tri++) {
    if (isJoint[provenance[tri]]) count++
  }
  if (count === 0) return null

  const outPos = new Float32Array(count * 9)
  const outNorm = new Float32Array(count * 9)
  let o = 0
  for (let tri = 0; tri < provenance.length; tri++) {
    if (!isJoint[provenance[tri]]) continue
    const src = tri * 9
    outPos.set(positions.subarray(src, src + 9), o)
    outNorm.set(normals.subarray(src, src + 9), o)
    o += 9
  }
  return { positions: outPos, normals: outNorm }
}
