// Pure analytic box geometry (§6 step 4, §4.2 step 3). No THREE, no Manifold —
// isomorphic, runs identically in the browser worker, the PWA, and the Node server.
//
// The one true world-AABB implementation: chunk 8 had a copy in web's collision.ts
// and another in viewport/bounds.ts. Both now call this (§1a of docs/chunk9-design.md).
//
// EXACT for v1's 90°-multiple rotations (§12): a board's world AABB equals its true
// footprint, so AABB-overlap volume = true intersection volume. For an off-axis board
// the AABB is *conservative* (may over-report) — collision/preconditions call
// isAxisAligned() and warn rather than assert (angle-readiness insurance, §1d).

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

// Re-express a world-space axis-aligned box in a board's LOCAL frame (origin at the
// board centre, axes = the board's local x/y/z). EXACT for 90° boards: an axis-aligned
// world box maps to an axis-aligned local box, so the 8-corner AABB is the true box.
// Used by JointFns to turn a world overlap region into a local-frame cutter — the
// carve runs in board-local space so the chunk 7/8 gizmo/snapping path is untouched
// (docs/chunk9-design.md §5, gotcha #5). Off-axis boards get a conservative box.
export function worldBoxToLocal(board: Board, world: AABB): AABB {
  const [px, py, pz] = board.transform.pos
  const [rx, ry, rz] = board.transform.rot
  const inv = transpose(eulerXYZToMat3(rx, ry, rz)) // inverse rotation (orthonormal)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const sx of [world.min[0], world.max[0]])
    for (const sy of [world.min[1], world.max[1]])
      for (const sz of [world.min[2], world.max[2]]) {
        const local = applyMat3(inv, [sx - px, sy - py, sz - pz])
        for (let i = 0; i < 3; i++) {
          if (local[i] < min[i]) min[i] = local[i]
          if (local[i] > max[i]) max[i] = local[i]
        }
      }
  return { min, max }
}

export const extent = (b: AABB): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
export const center = (b: AABB): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
]
