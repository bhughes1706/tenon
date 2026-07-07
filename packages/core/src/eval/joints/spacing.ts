// §5.7 / §5.8 spacing solvers (docs/chunk16-design.md §2 + §4). PURE FUNCTIONS: numbers
// in, layout out. No WASM, no Board, no Manifold — unit-testable without booting the
// evaluator (§5.8 doctrine: "pure functions, unit-testable without UI"). The box_joint /
// dovetail JointFns consume these; preconditions.ts runs the box solver for its width
// reject. Warnings carry the measured numbers but NOT board names (the pure solver has no
// Board); the JointFn / evaluate.ts attach board + joint refs.
import { WarningCode, type Warning } from '../../common.js'

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`

// ── Box joint (§2) ─────────────────────────────────────────────────────────────

export interface BoxLayout {
  n: number // finger count (odd, ≥ 3)
  p: number // nominal pin width
  wEnd: number // width of each end finger (= p + r/2)
  // n+1 station bounds along wAxis, offsets from R.min[wAxis]: [0, wEnd, wEnd+p, …, W].
  stations: number[]
  warnings: Warning[]
}

// Round to the nearest tool increment (1/8" dado/router family).
const snap = (v: number, step: number): number => Math.round(v / step) * step
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

// The odd integer n ≥ 3 minimising |W − n·p|; tie → the smaller n (wider end fingers).
export function boxFingerCount(W: number, p: number): number {
  let best = 3
  let bestDev = Math.abs(W - 3 * p)
  // Ascending odd n; only replace on a STRICTLY smaller deviation so ties keep the
  // smaller n. The minimum of |W − n·p| lies at the odd bracketing W/p, so once n·p
  // passes W + p we are past it (the larger bracketing odd is still included at = W+p).
  for (let n = 5; n * p <= W + p + 1e-9; n += 2) {
    const dev = Math.abs(W - n * p)
    if (dev < bestDev - 1e-12) {
      bestDev = dev
      best = n
    }
  }
  return best
}

// §2 box spacing. `W` = joint width, `tThin` = thinner board's thickness, `pinWidth` =
// explicit override (used verbatim) or undefined (default = snap(tThin,1/8) clamped 1/4–3/4).
export function boxSpacing(
  W: number,
  tThin: number,
  params: { pinWidth?: number } = {},
): BoxLayout {
  const p = params.pinWidth !== undefined ? params.pinWidth : clamp(snap(tThin, 1 / 8), 1 / 4, 3 / 4)
  const n = boxFingerCount(W, p)
  const r = W - n * p
  const wEnd = p + r / 2

  // Stations: [0, wEnd, wEnd+p, …, wEnd+(n−2)p, W]. Interior fingers are exactly p; both
  // end fingers are wEnd, so 2·wEnd + (n−2)·p = W by construction.
  const stations = [0]
  for (let k = 0; k <= n - 2; k++) stations.push(wEnd + k * p)
  stations.push(W)

  const warnings: Warning[] = []
  if (wEnd < p / 2) {
    warnings.push({
      code: WarningCode.BOX_THIN_END_PIN,
      msg: `End fingers are ${fmt(wEnd)} — less than half the ${fmt(p)} pin width. They'll look like an afterthought and chip easily; try pin_width ${fmt(W / n)} or a different board width.`,
    })
  }
  return { n, p, wEnd, stations, warnings }
}

// ── Dovetail (§4) ────────────────────────────────────────────────────────────────

export type DovetailElementKind = 'half_pin' | 'tail' | 'pin'

export interface DovetailElement {
  kind: DovetailElementKind
  // [lo, hi] along wAxis (offsets from R.min[wAxis]) at the baseline station (root)…
  base: [number, number]
  // …and at the far/tip station (show face). The wAxis taper between them is the flare.
  tip: [number, number]
}

export interface DovetailLayout {
  tails: number // N
  meanPin: number // P̄
  meanTail: number // T̄
  meanHalfPin: number // h̄
  f: number // full per-side flare over the engagement (= ℓ · rise/run)
  elements: DovetailElement[] // ordered along wAxis: half_pin, tail, pin, …, tail, half_pin
  degenerate: boolean // T_base ≤ 0 — flare exceeds the tail; the JointFn rejects the carve
  warnings: Warning[]
}

export interface DovetailInput {
  W: number
  tB: number // b's thickness (= extent(R)[sAxis]); anchors the tail count
  ell: number // cut depth ℓ (JointFn's depth doctrine result) — flare develops over it
  slope: string // "rise:run", e.g. "1:8"
  pins?: number | 'auto' // full-pin count (schema name) or "auto" (solver targets T ≈ 2P)
  halfPinWidth?: number // explicit h̄; default = T/2 = P
}

const THIN_PIN = 1 / 4 // in — narrowest workable pin/half-pin (§5.8)

// Parse "rise:run" → rise/run. The schema regex guarantees the shape; guard div-by-zero.
function slopeRatio(slope: string): number {
  const [rise, run] = slope.split(':').map(Number)
  return run > 0 ? rise / run : 1 / 8
}

// §4 dovetail spacing. All widths are MID-DEPTH means (ȳ = ℓ/2); per-station flares
// cancel so the width sum holds at every station (docs/chunk16-design.md §4).
export function dovetailSpacing(input: DovetailInput): DovetailLayout {
  const { W, tB, ell, slope } = input
  const f = ell * slopeRatio(slope)
  const hExplicit = input.halfPinWidth !== undefined
  const pins = input.pins ?? 'auto'

  // Tail count N. "auto" anchors on the classic hand-cut proportion T̄* = 2·t_b (tails ≈
  // twice stock thickness). A numeric `pins` is the full-pin count → N = pins + 1.
  let N: number
  if (pins === 'auto') {
    N = hExplicit
      ? Math.max(1, Math.round(((W - 2 * input.halfPinWidth!) / tB + 1) / 3))
      : Math.max(1, Math.round((W / tB - 1) / 3))
  } else {
    N = pins + 1
  }

  // Mean widths from the proportion T̄ = 2P̄ substituted into the width sum.
  let meanPin: number
  let meanHalfPin: number
  if (hExplicit) {
    meanHalfPin = input.halfPinWidth!
    meanPin = (W - 2 * meanHalfPin) / (3 * N - 1)
  } else {
    meanPin = W / (3 * N + 1)
    meanHalfPin = meanPin
  }
  const meanTail = 2 * meanPin

  // Per-station widths. Pins & half-pins are wide at the baseline (root) and narrow at the
  // tip (show face); tails are the complement. Base/tip flares cancel to keep the sum = W.
  const hBase = meanHalfPin + f / 2
  const hTip = meanHalfPin - f / 2
  const tBase = meanTail - f
  const tTip = meanTail + f
  const pBase = meanPin + f
  const pTip = meanPin - f

  const elements: DovetailElement[] = []
  let baseX = 0
  let tipX = 0
  const add = (kind: DovetailElementKind, wBase: number, wTip: number): void => {
    elements.push({ kind, base: [baseX, baseX + wBase], tip: [tipX, tipX + wTip] })
    baseX += wBase
    tipX += wTip
  }
  add('half_pin', hBase, hTip)
  for (let i = 0; i < N; i++) {
    add('tail', tBase, tTip)
    if (i < N - 1) add('pin', pBase, pTip)
  }
  add('half_pin', hBase, hTip)

  const warnings: Warning[] = []
  // A single-tail joint has no full pins — only the two half-pins can be the narrowest.
  const narrowest = N > 1 ? Math.min(pTip, hTip) : hTip
  if (narrowest < THIN_PIN) {
    warnings.push({
      code: WarningCode.DOVETAIL_THIN_PIN,
      msg: `Narrowest pin is ${fmt(narrowest)} — under ${fmt(THIN_PIN)} there's no chisel to chop it and the short grain is fragile; use fewer tails or a shallower slope.`,
    })
  }

  return {
    tails: N,
    meanPin,
    meanTail,
    meanHalfPin,
    f,
    elements,
    // Any station narrowing to zero or less is degenerate, not just the tail's base (§4
    // only calls out T_base ≤ 0, but the same flare that collapses a tail can just as
    // easily collapse a pin/half-pin tip first — a too-steep slope over a shallow N=1
    // layout hits pTip/hTip ≤ 0 while tBase stays positive).
    degenerate: tBase <= 1e-9 || pTip <= 1e-9 || hTip <= 1e-9,
    warnings,
  }
}
