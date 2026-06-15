// Manifold carved solid → render-ready EvalMesh (docs/chunk9-design.md §2e).
//
// We DE-INDEX into per-face flat normals: every triangle gets its own three verts
// carrying the triangle's geometric normal. Rationale:
//   • v1 boards are planar solids (boxes + box cutters), so a per-face normal is the
//     physically exact normal — flat shading is correct, not an approximation.
//   • manifold-3d's vertex-normal channel (calculateNormals/getMesh normalIdx) shifted
//     numProp/channel layout between kernel builds (3.5.1 put normals at channel 6, not
//     the requested 3). De-indexing sidesteps that entirely — version-proof and
//     deterministic (so the §6.1 idempotence invariant holds).
//   • plain getMesh() returns merged verts (a cube → 16 shared verts), which would
//     smooth box corners under any shared-vertex normal scheme; de-indexing avoids it.
//
// Per-triangle provenance maps each output face → a CutFeature via the mesh run table
// (runOriginalID/runIndex). Stored now, consumed by chunk 11's face-pick UI.
import type { Mesh } from 'manifold-3d'
import type { EvalMesh, CutFeature } from './types.js'

export function toEvalMesh(
  mesh: Mesh,
  idToFeature: Map<number, number>, // manifold originalID → index into `features`
  features: CutFeature[],
): EvalMesh {
  const { numProp, vertProperties, triVerts } = mesh
  const triCount = triVerts.length / 3
  const positions = new Float32Array(triCount * 9)
  const normals = new Float32Array(triCount * 9)
  const provenance = new Uint16Array(triCount)

  // Per-triangle feature lookup from the run table. Runs are contiguous and sorted
  // (run r covers triVerts[runIndex[r] .. runIndex[r+1])); a linear scan is trivial
  // at a few runs per board. Missing run data → everything is the base feature.
  const { runIndex, runOriginalID } = mesh
  const triFeature = (tri: number): number => {
    if (!runIndex || !runOriginalID) return 0
    const corner = tri * 3
    for (let r = 0; r < runOriginalID.length; r++) {
      if (corner >= runIndex[r] && corner < runIndex[r + 1]) {
        return idToFeature.get(runOriginalID[r]) ?? 0
      }
    }
    return 0
  }

  const px = (v: number, c: number): number => vertProperties[v * numProp + c]
  for (let tri = 0; tri < triCount; tri++) {
    const i0 = triVerts[tri * 3]
    const i1 = triVerts[tri * 3 + 1]
    const i2 = triVerts[tri * 3 + 2]
    const ax = px(i0, 0), ay = px(i0, 1), az = px(i0, 2)
    const bx = px(i1, 0), by = px(i1, 1), bz = px(i1, 2)
    const cx = px(i2, 0), cy = px(i2, 1), cz = px(i2, 2)
    // Face normal = normalize((b-a) × (c-a)). triVerts are CCW from outside, so this
    // points outward.
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len

    const o = tri * 9
    positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz
    positions[o + 6] = cx; positions[o + 7] = cy; positions[o + 8] = cz
    for (let k = 0; k < 3; k++) {
      normals[o + k * 3] = nx
      normals[o + k * 3 + 1] = ny
      normals[o + k * 3 + 2] = nz
    }
    provenance[tri] = triFeature(tri)
  }

  return { positions, normals, provenance, features }
}
