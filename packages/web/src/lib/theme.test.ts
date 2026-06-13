import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseStoredTheme,
  parseStoredDensity,
  applyTheme,
  initTheme,
  listenSystemTheme,
  persistThemeLocally,
} from './theme.js'

// matchMedia is not implemented in jsdom — provide a minimal mock
function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<() => void> = []
  const mq = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.push(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => {
      const i = listeners.indexOf(fn)
      if (i !== -1) listeners.splice(i, 1)
    }),
    dispatchEvent: vi.fn(),
    _listeners: listeners,
  }
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => mq) })
  return mq
}

describe('parseStoredTheme', () => {
  it('passes through valid values', () => {
    expect(parseStoredTheme('light')).toBe('light')
    expect(parseStoredTheme('dark')).toBe('dark')
    expect(parseStoredTheme('system')).toBe('system')
  })

  it('falls back to system for invalid or missing values', () => {
    expect(parseStoredTheme(null)).toBe('system')
    expect(parseStoredTheme('')).toBe('system')
    expect(parseStoredTheme('purple')).toBe('system')
    expect(parseStoredTheme('DARK')).toBe('system')
  })
})

describe('parseStoredDensity', () => {
  it('passes through valid values', () => {
    expect(parseStoredDensity('comfortable')).toBe('comfortable')
    expect(parseStoredDensity('shop')).toBe('shop')
  })

  it('falls back to comfortable for invalid or missing values', () => {
    expect(parseStoredDensity(null)).toBe('comfortable')
    expect(parseStoredDensity('')).toBe('comfortable')
    expect(parseStoredDensity('large')).toBe('comfortable')
  })
})

describe('applyTheme', () => {
  beforeEach(() => mockMatchMedia(false))

  it('sets data-theme to the resolved value', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('resolves system to dark when OS prefers dark', () => {
    mockMatchMedia(true)
    applyTheme('system')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('resolves system to light when OS prefers light', () => {
    mockMatchMedia(false)
    applyTheme('system')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('sets data-density', () => {
    applyTheme('light', 'shop')
    expect(document.documentElement.getAttribute('data-density')).toBe('shop')
    applyTheme('light', 'comfortable')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })

  it('defaults density to comfortable', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })
})

describe('initTheme', () => {
  beforeEach(() => {
    mockMatchMedia(false)
    localStorage.clear()
  })

  it('applies stored valid theme and density', () => {
    localStorage.setItem('tenon:theme', 'dark')
    localStorage.setItem('tenon:density', 'shop')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-density')).toBe('shop')
  })

  it('falls back to system/comfortable for corrupted localStorage values', () => {
    localStorage.setItem('tenon:theme', 'purple')
    localStorage.setItem('tenon:density', 'huge')
    initTheme()
    // system → light (OS mock returns false for dark)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })

  it('falls back to defaults when localStorage is empty', () => {
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })
})

describe('listenSystemTheme', () => {
  beforeEach(() => {
    // Reset module-level _systemListener between tests so they don't bleed
    mockMatchMedia(false)
    listenSystemTheme('light', 'comfortable')
    vi.clearAllMocks()
  })

  it('attaches a matchMedia listener when theme is system', () => {
    const mq = mockMatchMedia(false)
    listenSystemTheme('system', 'comfortable')
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('does not attach a listener when theme is not system', () => {
    const mq = mockMatchMedia(false)
    listenSystemTheme('light', 'comfortable')
    expect(mq.addEventListener).not.toHaveBeenCalled()
    listenSystemTheme('dark', 'comfortable')
    expect(mq.addEventListener).not.toHaveBeenCalled()
  })

  it('replaces the previous listener instead of stacking', () => {
    const mq = mockMatchMedia(false)
    listenSystemTheme('system', 'comfortable')
    listenSystemTheme('system', 'shop') // second call should replace, not stack
    expect(mq.removeEventListener).toHaveBeenCalledTimes(1)
    expect(mq.addEventListener).toHaveBeenCalledTimes(2)
    expect(mq._listeners.length).toBe(1)
  })

  it('removes the listener when switching away from system', () => {
    const mq = mockMatchMedia(false)
    listenSystemTheme('system', 'comfortable')
    listenSystemTheme('light', 'comfortable')
    expect(mq.removeEventListener).toHaveBeenCalledTimes(1)
    expect(mq._listeners.length).toBe(0)
  })
})

describe('persistThemeLocally', () => {
  beforeEach(() => localStorage.clear())

  it('writes theme and density to localStorage', () => {
    persistThemeLocally('dark', 'shop')
    expect(localStorage.getItem('tenon:theme')).toBe('dark')
    expect(localStorage.getItem('tenon:density')).toBe('shop')
  })
})

describe('initTheme listener lifecycle', () => {
  afterEach(() => localStorage.clear())

  it('installs a system listener when stored theme is system', () => {
    localStorage.setItem('tenon:theme', 'system')
    const mq = mockMatchMedia(false)
    initTheme()
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('does not install a listener when stored theme is light', () => {
    localStorage.setItem('tenon:theme', 'light')
    const mq = mockMatchMedia(false)
    initTheme()
    expect(mq.addEventListener).not.toHaveBeenCalled()
  })
})
