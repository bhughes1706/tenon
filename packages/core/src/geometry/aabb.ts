// Pure analytic box geometry (§6 step 4, §4.2 step 3). No THREE, no Manifold —
// isomorphic, runs identically in the browser worker, the PWA, and the Node server.
//
// The one true world-AABB implementation: chunk 8 had a copy in web's collision.ts
// and another in viewport/bounds.ts. Both now call this (§1a of docs/chunk9-design.md).
//
// worldAABB is EXACT for 90°-multiple rotations (§12): the AABB equals the board's true
// footprint. For an off-axis board it is *conservative* (over-reports) — so the exact
// paths don't use it there: collision goes through obbOverlap (SAT, exact at any angle)
// and joint preconditions/carving through pairFrame (exact whenever the two boards are
// square TO EACH OTHER, at any assembly orientation). See §Angle readiness.

import type { Board } from '../board.js'

export type Vec3 = [number, number, number]

export interface AABB {
  min: Vec3
  max: Vec3
}

// Oriented bounding box. Carried on BoardSolid (eval) purely as angle-readiness
// insurance: a future OBB/CSG narrowphase has its inputs with zero call-site churn.
// For a 90° board it coincides with the AABB. (§Angle readiness)
export interface OBB {
  center: Vec3
  axes: [Vec3, Vec3, Vec3] // world-space unit axes for the board's local x/y/z
  halfExtents: Vec3
}

const deg2rad = (d: number): number => (d * Math.PI) / 180

// Row-major 3×3 rotation matrix for an Euler-XYZ angle triple, in DEGREES.
// MUST match three.js `new THREE.Euler(rx,ry,rz,'XYZ')` (and an R3F
// `<group rotation={[rx,ry,rz]}>`), which the viewport, gizmo, and snapping all use.
// Derived from three.js Matrix4.makeRotationFromEuler order 'XYZ'.
export function eulerXYZToMat3(rxDeg: number, ryDeg: number, rzDeg: number): number[][] {
  const c1 = Math.cos(deg2rad(rxDeg)), s1 = Math.sin(deg2rad(rxDeg))
  const c2 = Math.cos(deg2rad(ryDeg)), s2 = Math.sin(deg2rad(ryDeg))
  const c3 = Math.cos(deg2rad(rzDeg)), s3 = Math.sin(deg2rad(rzDeg))
  return [
    [c2 * c3, -c2 * s3, s2],
    [c1 * s3 + c3 * s1 * s2, c1 * c3 - s1 * s2 * s3, -c2 * s1],
    [s1 * s3 - c1 * c3 * s2, c3 * s1 + c1 * s2 * s3, c1 * c2],
  ]
}

export function applyMat3(m: number[][], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
}

// Rotation matrices are orthonormal, so the inverse is the transpose.
export function transpose(m: number[][]): number[][] {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ]
}

export function matMul(a: number[][], b: number[][]): number[][] {
  const out: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
    }
  }
  return out
}

const IDENTITY3: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

// True when `m` is a signed permutation matrix (each row/col has exactly one entry of
// magnitude ~1, the rest ~0) — the matrix generalization of "a multiple of 90°". Two
// boards whose RELATIVE rotation (Ra^T·Rb) is a signed permutation are square to each
// other regardless of their shared orientation in world space (§Angle readiness).
export function isSignedPermutation(m: number[][], tol = 1e-6): boolean {
  for (let i = 0; i < 3; i++) {
    let nonZero = 0
    for (let j = 0; j < 3; j++) {
      const v = Math.abs(m[i][j])
      if (v > tol && Math.abs(v - 1) > tol) return false // not ~0 and not ~1
      if (v > tol) nonZero++
    }
    if (nonZero !== 1) return false
  }
  return true
}

export function worldOBB(board: Board): OBB {
  const [rx, ry, rz] = board.transform.rot
  const m = eulerXYZToMat3(rx, ry, rz)
  // Columns of the rotation matrix are the world directions of local x/y/z.
  const axes: [Vec3, Vec3, Vec3] = [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ]
  return {
    center: [...board.transform.pos] as Vec3,
    axes,
    halfExtents: [board.dims.l / 2, board.dims.w / 2, board.dims.t / 2],
  }
}

// World axis-aligned bounding box of a board. Standard AABB-of-OBB: along each
// world axis the half-extent is the sum of the box's projected half-extents.
export function worldAABB(board: Board): AABB {
  const { center, axes, halfExtents } = worldOBB(board)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < 3; i++) {
    const r =
      Math.abs(axes[0][i]) * halfExtents[0] +
      Math.abs(axes[1][i]) * halfExtents[1] +
      Math.abs(axes[2][i]) * halfExtents[2]
    min[i] = center[i] - r
    max[i] = center[i] + r
  }
  return { min, max }
}

// True when every rotation angle is a multiple of 90° (within tol). Only then is
// the analytic AABB narrowphase exact (§1d). Off-axis boards still get a result,
// but callers treat it as conservative.
export function isAxisAligned(board: Board, tol = 1e-6): boolean {
  return board.transform.rot.every((deg) => {
    const m = ((deg % 90) + 90) % 90
    return m <= tol || 90 - m <= tol
  })
}

export function aabbVolume(b: AABB): number {
  return Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[1] - b.min[1]) * Math.max(0, b.max[2] - b.min[2])
}

// Volume of the intersection box (0 if they don't overlap on every axis).
export function intersectVolume(a: AABB, b: AABB): number {
  let vol = 1
  for (let i = 0; i < 3; i++) {
    const o = Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])
    if (o <= 0) return 0
    vol *= o
  }
  return vol
}

// The intersection box of two AABBs, or null if they have a true gap on any axis.
// Flush contact (zero overlap on one axis) returns a degenerate (zero-extent) box —
// callers that need genuine penetration must check the box's extents, not just null.
// v1 body is AABB-intersection; swappable to OBB-clip later (§Angle readiness).
export function overlapRegion(a: AABB, b: AABB): AABB | null {
  const min: Vec3 = [0, 0, 0]
  const max: Vec3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(a.min[i], b.min[i])
    const hi = Math.min(a.max[i], b.max[i])
    if (hi < lo) return null // a real gap on this axis
    min[i] = lo
    max[i] = hi
  }
  return { min, max }
}

// Convert a box expressed in one frame (origin `framePos`, orientation `frameRot`) into
// another frame (origin `targetPos`, orientation `targetRot`). The general primitive
// behind worldBoxToLocal and pairFrame: EXACT whenever `targetRot^T · frameRot` is a
// signed permutation (the box's true shape is axis-aligned in the target frame), a safe
// conservative (over-approximating) bound otherwise — the standard 8-corner AABB
// re-projection (§Angle readiness).
export function reframeBox(
  box: AABB,
  framePos: Vec3,
  frameRot: number[][],
  targetPos: Vec3,
  targetRot: number[][],
): AABB {
  const compose = matMul(transpose(targetRot), frameRot) // frame-local coord → target-local coord
  const targetRotT = transpose(targetRot)
  const originOffset = applyMat3(targetRotT, [
    framePos[0] - targetPos[0],
    framePos[1] - targetPos[1],
    framePos[2] - targetPos[2],
  ])
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const cx of [box.min[0], box.max[0]])
    for (const cy of [box.min[1], box.max[1]])
      for (const cz of [box.min[2], box.max[2]]) {
        const rotated = applyMat3(compose, [cx, cy, cz])
        for (let i = 0; i < 3; i++) {
          const v = rotated[i] + originOffset[i]
          if (v < min[i]) min[i] = v
          if (v > max[i]) max[i] = v
        }
      }
  return { min, max }
}

// Re-express a world-space axis-aligned box in a board's LOCAL frame (origin at the
// board centre, axes = the board's local x/y/z). EXACT for 90° boards: an axis-aligned
// world box maps to an axis-aligned local box, so the 8-corner AABB is the true box.
// Used by JointFns to turn a world overlap region into a local-frame cutter — the
// carve runs in board-local space so the chunk 7/8 gizmo/snapping path is untouched
// (docs/chunk9-design.md §5, gotcha #5). Off-axis boards get a conservative box.
export function worldBoxToLocal(board: Board, world: AABB): AABB {
  const rot = eulerXYZToMat3(...board.transform.rot)
  return reframeBox(world, [0, 0, 0], IDENTITY3, board.transform.pos, rot)
}

// True when board b's rotation RELATIVE TO board a is a 90°-multiple — the generalization
// of isAxisAligned() from "aligned to WORLD" to "aligned to each other". A two-board joint
// stays carve-exact under this weaker condition even when the pair (or the whole assembly)
// is rotated to an arbitrary angle in world space; only a genuine compound-angle pair
// (not square to each other) fails it (§Angle readiness).
export function isMutuallyAligned(a: Board, b: Board, tol = 1e-6): boolean {
  const Ra = eulerXYZToMat3(...a.transform.rot)
  const Rb = eulerXYZToMat3(...b.transform.rot)
  return isSignedPermutation(matMul(transpose(Ra), Rb), tol)
}

export interface PairFrame {
  aBox: AABB // a's box in its OWN local frame — always exact, trivial
  bBox: AABB // b's box AS SEEN from a's local frame — exact iff `aligned`
  bAxes: [Vec3, Vec3, Vec3] // b's local x/y/z expressed in a's frame
  aligned: boolean
}

// The shared reference frame joint carving computes in: board a's own local frame. b is
// re-expressed relative to it via reframeBox/isSignedPermutation. Callers MUST check
// `aligned` before trusting bBox/bAxes as exact — an unaligned pair's bBox is only a
// conservative bound, safe for nothing but a lint decision (§Angle readiness).
export function pairFrame(a: Board, b: Board): PairFrame {
  const Ra = eulerXYZToMat3(...a.transform.rot)
  const Rb = eulerXYZToMat3(...b.transform.rot)
  const aHalf: Vec3 = [a.dims.l / 2, a.dims.w / 2, a.dims.t / 2]
  const aBox: AABB = { min: [-aHalf[0], -aHalf[1], -aHalf[2]], max: aHalf }
  const bHalf: Vec3 = [b.dims.l / 2, b.dims.w / 2, b.dims.t / 2]
  const bLocal: AABB = { min: [-bHalf[0], -bHalf[1], -bHalf[2]], max: bHalf }
  const bBox = reframeBox(bLocal, b.transform.pos, Rb, a.transform.pos, Ra)
  const Rrel = matMul(transpose(Ra), Rb)
  const bAxes: [Vec3, Vec3, Vec3] = [
    [Rrel[0][0], Rrel[1][0], Rrel[2][0]],
    [Rrel[0][1], Rrel[1][1], Rrel[2][1]],
    [Rrel[0][2], Rrel[1][2], Rrel[2][2]],
  ]
  return { aBox, bBox, bAxes, aligned: isSignedPermutation(Rrel) }
}

// Exact OBB-OBB overlap via the Separating Axis Theorem (15 candidate axes: 3 face
// normals of each box + 9 edge cross-products) — correct for ANY rotation, not just
// 90°-multiples. `depth` is the minimum-overlap SAT axis' penetration; it is NOT a true
// clipped intersection volume (that needs polytope clipping), just enough to rank
// severity. Used by collision (broadphase lint), where — unlike joint carving — there is
// no need for an exact cutter, only an accurate yes/no + rough magnitude.
export interface OBBOverlap {
  intersects: boolean
  depth: number
}

const OBB_DEPTH_EPS = 1e-6 // in — flush contact must not register as overlap

export function obbOverlap(a: OBB, b: OBB): OBBOverlap {
  const dot = (u: Vec3, v: Vec3): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const cross = (u: Vec3, v: Vec3): Vec3 => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]

  const axes: Vec3[] = [...a.axes, ...b.axes]
  for (const ai of a.axes) {
    for (const bj of b.axes) {
      const c = cross(ai, bj)
      const len = Math.hypot(c[0], c[1], c[2])
      if (len > 1e-9) axes.push([c[0] / len, c[1] / len, c[2] / len])
    }
  }

  const d: Vec3 = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]]
  let minOverlap = Infinity
  for (const axis of axes) {
    const distC = Math.abs(dot(d, axis))
    const ra =
      a.halfExtents[0] * Math.abs(dot(a.axes[0], axis)) +
      a.halfExtents[1] * Math.abs(dot(a.axes[1], axis)) +
      a.halfExtents[2] * Math.abs(dot(a.axes[2], axis))
    const rb =
      b.halfExtents[0] * Math.abs(dot(b.axes[0], axis)) +
      b.halfExtents[1] * Math.abs(dot(b.axes[1], axis)) +
      b.halfExtents[2] * Math.abs(dot(b.axes[2], axis))
    const overlap = ra + rb - distC
    if (overlap <= OBB_DEPTH_EPS) return { intersects: false, depth: 0 } // separating axis found
    if (overlap < minOverlap) minOverlap = overlap
  }
  return { intersects: true, depth: minOverlap }
}

export const extent = (b: AABB): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
export const center = (b: AABB): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
]
