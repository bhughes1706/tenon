// §2.1 — canonical unit is decimal inches. UI displays fractional inches
// (nearest 1/precision, reduced) and accepts 3/4, 1-3/8, 1.375, 35mm on input.

const MM_PER_INCH = 25.4

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Format a decimal-inch value as a reduced fractional string, e.g.
// 1.375 → "1 3/8", 0.75 → "3/4", 2 → "2", -0.5 → "-1/2".
export function formatInches(value: number, precision = 16): string {
  if (!Number.isFinite(value)) return '0'
  const sign = value < 0 ? '-' : ''
  const v = Math.abs(value)
  let whole = Math.floor(v)
  let num = Math.round((v - whole) * precision)
  let den = precision

  if (num === den) {
    whole += 1
    num = 0
  }
  if (num === 0) return `${sign}${whole}`

  const g = gcd(num, den)
  num /= g
  den /= g

  return whole === 0 ? `${sign}${num}/${den}` : `${sign}${whole} ${num}/${den}`
}

// Same as formatInches but appends the inch mark — for read-only display.
export function formatInchesMark(value: number, precision = 16): string {
  return `${formatInches(value, precision)}"`
}

// Parse a user-entered length into decimal inches. Accepts:
//   3/4 · 1-3/8 · 1 3/8 · 1.375 · .5 · 35mm · 12"  (and negatives)
// Returns null on anything unparseable so callers can reject the edit.
export function parseInches(raw: string): number | null {
  let s = raw.trim().replace(/["']/g, '').trim()
  if (!s) return null

  // Millimetres → inches.
  const mm = s.match(/^(-?\d*\.?\d+)\s*mm$/i)
  if (mm) {
    const n = parseFloat(mm[1])
    return Number.isNaN(n) ? null : n / MM_PER_INCH
  }

  let sign = 1
  if (s[0] === '-') {
    sign = -1
    s = s.slice(1).trim()
  } else if (s[0] === '+') {
    s = s.slice(1).trim()
  }

  // Mixed number: "1-3/8" or "1 3/8".
  let m = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/)
  if (m) {
    const den = Number(m[3])
    if (den === 0) return null
    return sign * (Number(m[1]) + Number(m[2]) / den)
  }

  // Bare fraction: "3/4".
  m = s.match(/^(\d+)\/(\d+)$/)
  if (m) {
    const den = Number(m[2])
    if (den === 0) return null
    return sign * (Number(m[1]) / den)
  }

  // Decimal or integer: "1.375", ".5", "12".
  if (/^\d*\.?\d+$/.test(s)) {
    const n = parseFloat(s)
    return Number.isNaN(n) ? null : sign * n
  }

  return null
}
