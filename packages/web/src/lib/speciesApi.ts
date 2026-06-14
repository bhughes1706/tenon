import { useEffect, useState } from 'react'

export interface Species {
  id: string
  common_name: string
  botanical: string | null
  kind: 'solid' | 'sheet'
  cost_bf: number
  thicknesses: string[]
}

let cache: Species[] | null = null
let inflight: Promise<Species[]> | null = null

export function getSpecies(): Promise<Species[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch('/api/species')
      .then((res) => {
        if (!res.ok) throw new Error(`species: ${res.status}`)
        return res.json() as Promise<Species[]>
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

// Small shared hook — the species list is static for a session, so one cached
// fetch backs the Add Board dialog and the Inspector species picker.
export function useSpecies(): Species[] {
  const [species, setSpecies] = useState<Species[]>(cache ?? [])
  useEffect(() => {
    let cancelled = false
    getSpecies()
      .then((rows) => {
        if (!cancelled) setSpecies(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return species
}
