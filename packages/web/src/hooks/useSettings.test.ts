import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSettings } from './useSettings.js'

// Mock the theme module — tested separately in theme.test.ts
vi.mock('../lib/theme.js', () => ({
  applyTheme: vi.fn(),
  listenSystemTheme: vi.fn(),
  persistThemeLocally: vi.fn(),
  parseStoredTheme: (v: string | null) => (v === 'light' || v === 'dark' || v === 'system' ? v : 'system'),
  parseStoredDensity: (v: string | null) => (v === 'comfortable' || v === 'shop' ? v : 'comfortable'),
}))

// Mock the API module
vi.mock('../lib/api.js', () => ({
  getSettings: vi.fn(),
  patchSettings: vi.fn(),
}))

import { getSettings, patchSettings } from '../lib/api.js'
const mockGetSettings = vi.mocked(getSettings)
const mockPatchSettings = vi.mocked(patchSettings)

const defaultSettings = {
  theme: 'system' as const,
  density: 'comfortable' as const,
  fraction_precision: 16 as const,
  snap_grid: 0.0625 as const,
  default_species: 'walnut',
  viewport_shadows: true,
  waste_factor_solid: 1.15,
  waste_factor_sheet: 1.1,
  labor_rate: null,
  default_deposit_pct: null,
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('initial load', () => {
  it('starts as loading=true with null settings', () => {
    mockGetSettings.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useSettings())
    expect(result.current.loading).toBe(true)
    expect(result.current.settings).toBeNull()
  })

  it('populates settings and clears loading after fetch', async () => {
    mockGetSettings.mockResolvedValue(defaultSettings)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.settings).toEqual(defaultSettings)
    expect(result.current.error).toBeNull()
  })

  it('seeds from localStorage immediately before fetch resolves', async () => {
    localStorage.setItem('tenon:settings', JSON.stringify({ theme: 'dark', density: 'shop' }))
    let resolve!: (v: typeof defaultSettings) => void
    mockGetSettings.mockReturnValue(new Promise(r => { resolve = r }))

    const { result } = renderHook(() => useSettings())
    // localStorage seed should be visible immediately (synchronously after mount)
    expect(result.current.settings?.theme).toBe('dark')
    expect(result.current.settings?.density).toBe('shop')

    // Resolve the fetch; server data takes over
    await act(async () => resolve(defaultSettings))
    expect(result.current.settings).toEqual(defaultSettings)
  })

  it('sets error when fetch fails', async () => {
    mockGetSettings.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('network error')
    expect(result.current.settings).toBeNull()
  })
})

describe('update()', () => {
  it('applies optimistic update immediately then reconciles to server response', async () => {
    mockGetSettings.mockResolvedValue(defaultSettings)
    const serverResponse = { ...defaultSettings, theme: 'dark' as const }
    mockPatchSettings.mockResolvedValue(serverResponse)

    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.update({ theme: 'dark' }))
    expect(result.current.settings?.theme).toBe('dark')
    expect(mockPatchSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('reverts to previous state when patchSettings fails', async () => {
    mockGetSettings.mockResolvedValue(defaultSettings)
    mockPatchSettings.mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.update({ theme: 'dark' }))

    // Should be reverted back to the pre-update value
    expect(result.current.settings?.theme).toBe('system')
    expect(result.current.error).toBe('server error')
  })

  it('clears a previous error on the next successful update', async () => {
    mockGetSettings.mockResolvedValue(defaultSettings)
    mockPatchSettings
      .mockRejectedValueOnce(new Error('first error'))
      .mockResolvedValue({ ...defaultSettings, theme: 'dark' as const })

    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.update({ theme: 'dark' }))
    expect(result.current.error).toBe('first error')

    await act(async () => result.current.update({ theme: 'dark' }))
    expect(result.current.error).toBeNull()
  })
})

describe('race condition', () => {
  it('ignores an initial fetch that completes after the hook unmounts', async () => {
    let resolve!: (v: typeof defaultSettings) => void
    mockGetSettings.mockReturnValue(new Promise(r => { resolve = r }))

    const { result, unmount } = renderHook(() => useSettings())
    unmount()

    // Resolve after unmount — should not trigger a state update warning
    await act(async () => resolve(defaultSettings))
    // Settings remain null because the hook was cancelled
    expect(result.current.settings).toBeNull()
  })
})
