import { useEffect, useState } from 'react'
import type { EdgeProfile, ProfileSegment } from '@tenon/core'
import { makeEdgeProfileId } from '@tenon/core'
import type { Edge, Face } from '../viewport/arrisPick.js'

// The compound bit's cross-section as a segment path (§3.5 chunk 17.1), parsed from the
// bit row's `profile_geom` JSON by the server.
export interface ProfileGeom {
  start: [number, number]
  segments: ProfileSegment[]
}

// §3.5 / §9 — a router bit store row. Mirrors speciesApi's Species, but the store takes
// WRITES from the designer (users curate their own inventory), so the cache is
// invalidated by addBit/updateBit rather than being read-only for the session.
export interface Bit {
  id: string
  name: string
  profile: EdgeProfile['profile']
  radius: number | null
  angle_deg: number | null
  cut_width: number | null
  cut_depth: number | null
  shank: string | null
  brand: string | null
  notes: string | null
  // Present (non-null) only for `profile === 'compound'` bits (§3.5 chunk 17.1).
  profile_geom: ProfileGeom | null
}

let cache: Bit[] | null = null
let inflight: Promise<Bit[]> | null = null
const listeners = new Set<(bits: Bit[]) => void>()

export function getBits(): Promise<Bit[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch('/api/bits')
      .then((res) => {
        if (!res.ok) throw new Error(`bits: ${res.status}`)
        return res.json() as Promise<Bit[]>
      })
      .then((rows) => {
        cache = rows
        return rows
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

// Synchronous read of the already-fetched bit list (empty before the first load). The
// router panel warms this via useBits; the viewport paint handler reads it without awaiting.
export function peekBits(): Bit[] {
  return cache ?? []
}

function bust(rows: Bit[]): void {
  cache = rows
  for (const l of listeners) l(rows)
}

export async function addBit(bit: Bit): Promise<Bit> {
  const res = await fetch('/api/bits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bit),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `bits: ${res.status}`)
  const created = (await res.json()) as Bit
  bust([...(cache ?? []), created])
  return created
}

export async function updateBit(id: string, patch: Partial<Bit>): Promise<Bit> {
  const res = await fetch(`/api/bits/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`bits: ${res.status}`)
  const updated = (await res.json()) as Bit
  bust((cache ?? []).map((b) => (b.id === id ? updated : b)))
  return updated
}

// Live bit list — re-renders on addBit/updateBit (unlike useSpecies, which is static).
export function useBits(): Bit[] {
  const [bits, setBits] = useState<Bit[]>(cache ?? [])
  useEffect(() => {
    listeners.add(setBits)
    getBits()
      .then(setBits)
      .catch(() => {})
    return () => {
      listeners.delete(setBits)
    }
  }, [])
  return bits
}

// §3.5 bit → EdgeProfile mapping (in the router panel, NOT core — the store is inventory,
// not a geometry dependency). Fills an edge profile's dimension fields from the picked
// bit; `rabbetDepth` is the one parameter the router panel lets the user tune (real
// rabbeting bits cut a fixed width but shops vary depth per application).
export function bitToEdgeProfile(bit: Bit, edge: Edge, face: Face, rabbetDepth?: number): EdgeProfile {
  const base = { id: makeEdgeProfileId(), edge, face, bit_id: bit.id } as const
  switch (bit.profile) {
    case 'roundover':
    case 'cove':
    case 'ogee':
      return { ...base, profile: bit.profile, radius: bit.radius ?? 0.25 }
    case 'chamfer':
      return { ...base, profile: 'chamfer', width: bit.cut_width ?? 0.25 }
    case 'rabbet': {
      const cap = bit.cut_depth ?? 0.5
      // Default depth: half the bit's capacity, snapped to 1/16", clamped to the cap.
      const dflt = Math.min(cap, Math.round((cap / 2) / (1 / 16)) * (1 / 16))
      return { ...base, profile: 'rabbet', width: bit.cut_width ?? 0.375, depth: rabbetDepth ?? dflt }
    }
    case 'compound': {
      // Denormalize the bit's whole cross-section onto the edge, plus its name as the
      // display label (the cut list + inspector then need no bit lookup). A compound bit
      // with no geometry falls back to a tiny straight chamfer so nothing carves wrong.
      const geom = bit.profile_geom
      if (!geom) return { ...base, profile: 'chamfer', width: 0.0625 }
      return { ...base, profile: 'compound', label: bit.name, start: geom.start, segments: geom.segments }
    }
  }
}
