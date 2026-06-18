// Inch-fraction formatting for machining notes (§7.6). Mirrors web/src/lib/fraction.ts
// `formatInches`, but renders mixed numbers with a hyphen ("1-1/4") to match the spec's
// note examples ("tenon 3/8 × 3 × 1-1/4"). Lives in core so the note strings are
// identical whether the cut list is generated on the server (REST/MCP) or in the browser.

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// 0.375 → "3/8", 1.25 → "1-1/4", 3 → "3", 0.5 → "1/2", 0 → "0".
export function fmtFraction(value: number, precision = 16): string {
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
  if (num === 0) return whole === 0 ? '0' : `${sign}${whole}`

  const g = gcd(num, den)
  num /= g
  den /= g

  return whole === 0 ? `${sign}${num}/${den}` : `${sign}${whole}-${num}/${den}`
}
