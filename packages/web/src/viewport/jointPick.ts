// Face-pick → joint resolution + selected-joint face extraction (chunk 11).
//
// Carved board geometries arrive from geometryClient with two userData fields set in
// buildBoard (the chunk-9 "chunk-11 contract"):
//   userData.provenance : Uint16Array, one entry per triangle = index into `features`
//   userData.features   : CutFeature[] ({ id, kind, jointId? })
// The geometry is DE-INDEXED triangle soup (mesh.ts), so a raycast's `faceIndex` IS the
// triangle index — no index-buffer translation needed. Feature 0 is always the board
// base; edge grooves carry no jointId; joint cutters do.
//
// Both fns are pure over the BufferGeometry contents. The box fallback (no carve yet)
// has no provenance → pickJoint returns null → callers fall back to board selection.
import * as THREE from 'three'
import type { CutFeature } from '@tenon/core/eval'

function provenanceOf(geometry: THREE.BufferGeometry): { prov: Uint16Array; features: CutFeature[] } | null {
  const prov = geometry.userData.provenance as Uint16Array | undefined
  const features = geometry.userData.features as CutFeature[] | undefined
  if (!prov || !features) return null
  return { prov, features }
}

// Which joint (if any) does the clicked triangle belong to?
export function pickJoint(geometry: THREE.BufferGeometry, faceIndex: number | null | undefined): string | null {
  if (faceIndex == null || faceIndex < 0) return null
  const p = provenanceOf(geometry)
  if (!p || faceIndex >= p.prov.length) return null
  return p.features[p.prov[faceIndex]]?.jointId ?? null
}

// Sub-geometry of just ONE joint's triangles on this board (mortise walls, tenon
// cheeks, shoulders…). Mirrors core's jointFaceMesh (all joints) but filtered to a
// single jointId, and built from the retained BufferGeometry rather than the EvalMesh
// (the store keeps only geometry; userData is the surviving channel). Returns null
// when the board has no faces for that joint — only the joint's a/b boards do.
export function extractJointFaces(geometry: THREE.BufferGeometry, jointId: string): THREE.BufferGeometry | null {
  const p = provenanceOf(geometry)
  if (!p) return null
  const positions = geometry.getAttribute('position')?.array as Float32Array | undefined
  const normals = geometry.getAttribute('normal')?.array as Float32Array | undefined
  if (!positions || !normals) return null

  const wanted = p.features.map((f) => f.jointId === jointId)
  let count = 0
  for (let tri = 0; tri < p.prov.length; tri++) if (wanted[p.prov[tri]]) count++
  if (count === 0) return null

  const outPos = new Float32Array(count * 9)
  const outNorm = new Float32Array(count * 9)
  let o = 0
  for (let tri = 0; tri < p.prov.length; tri++) {
    if (!wanted[p.prov[tri]]) continue
    const src = tri * 9
    outPos.set(positions.subarray(src, src + 9), o)
    outNorm.set(normals.subarray(src, src + 9), o)
    o += 9
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(outPos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3))
  return out
}
