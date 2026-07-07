// Web glue for the §7 cut list. The engine itself is core's generateCutlist (WASM-free,
// so it runs live in the browser on the optimistic model — same fn the server route uses).
// Here we only (a) adapt the cached species list + settings into CutlistOpts and (b)
// serialize a result to CSV (§7.7). The on-screen table lives in DesignerShell's CutlistPanel.

import { fmtFraction, SETTINGS_DEFAULTS, type CutlistOpts, type CutlistResult, type CutlistSpecies } from '@tenon/core'
import type { Species } from './speciesApi.js'
import type { Settings } from './api.js'

export function buildCutlistOpts(species: Species[], settings: Settings | null): CutlistOpts {
  const map: Record<string, CutlistSpecies> = {}
  for (const s of species) {
    map[s.id] = {
      kind: s.kind === 'sheet' ? 'sheet' : 'solid',
      cost_bf: s.cost_bf,
      common_name: s.common_name,
      shrink_tan_pct: s.shrink_tan_pct ?? undefined,
    }
  }
  return {
    species: map,
    wasteFactorSolid: settings?.waste_factor_solid ?? SETTINGS_DEFAULTS.waste_factor_solid,
    wasteFactorSheet: settings?.waste_factor_sheet ?? SETTINGS_DEFAULTS.waste_factor_sheet,
    fractionPrecision: settings?.fraction_precision ?? SETTINGS_DEFAULTS.fraction_precision,
  }
}

const csvEscape = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvRow = (cells: (string | number)[]): string => cells.map(csvEscape).join(',')

// CSV with two blocks: the cut-list rows, then the per-species materials summary (§7.7).
// Dims are fractional inches at the given precision to match the on-screen table.
export function cutlistToCsv(result: CutlistResult, precision = 16): string {
  const fr = (n: number) => fmtFraction(n, precision)
  const lines: string[] = []

  lines.push(csvRow(['Qty', 'Finished (L×W×T)', 'Rough (L×W×T)', 'Stock', 'Species', 'Bd.Ft', 'Area ft²', 'Notes']))
  for (const r of result.rows) {
    lines.push(
      csvRow([
        r.qty,
        `${fr(r.finished.l)} × ${fr(r.finished.w)} × ${fr(r.finished.t)}`,
        r.kind === 'sheet' ? '—' : `${fr(r.rough.l)} × ${fr(r.rough.w)} × ${fr(r.rough.t)}`,
        r.kind === 'sheet' ? 'sheet' : r.thicknessLabel,
        r.speciesName,
        r.kind === 'sheet' ? '' : r.boardFeet,
        r.kind === 'sheet' ? r.areaFt2 : '',
        r.notes.join('; '),
      ]),
    )
  }

  lines.push('')
  lines.push(csvRow(['Species', 'Net', 'Waste', 'Purchase', 'Unit cost', 'Cost']))
  for (const m of result.materials) {
    const net = m.kind === 'sheet' ? `${m.netAreaFt2} ft²` : `${m.netBoardFeet} bf`
    const purchase = m.kind === 'sheet' ? `${m.sheets} sheet(s)` : `${m.grossBoardFeet} bf`
    const unit = m.kind === 'sheet' ? `$${m.costPerUnit}/sheet` : `$${m.costPerUnit}/bf`
    lines.push(csvRow([m.speciesName, net, `${Math.round(m.wasteFactor * 100)}%`, purchase, unit, `$${m.cost.toFixed(2)}`]))
  }
  lines.push(csvRow(['Total', '', '', '', '', `$${result.totalCost.toFixed(2)}`]))

  return lines.join('\n')
}

const htmlEscape = (v: string | number): string =>
  String(v).replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

// Standalone printable HTML document for the cut list (§7.7).
export function cutlistToHtml(result: CutlistResult, modelName: string, precision = 16): string {
  const fr = (n: number) => fmtFraction(n, precision)
  const rows = result.rows
    .map((r) => {
      const sizeOf = r.kind === 'sheet' ? `${fr(r.finished.l)} × ${fr(r.finished.w)}` : `${fr(r.rough.l)} × ${fr(r.rough.w)} × ${fr(r.rough.t)}`
      const amount = r.kind === 'sheet' ? `${r.areaFt2} ft²` : `${r.boardFeet} bf`
      return `<tr><td class="n">${r.qty}</td><td>${htmlEscape(`${fr(r.finished.l)} × ${fr(r.finished.w)} × ${fr(r.finished.t)}`)}</td>` +
        `<td>${htmlEscape(sizeOf)}</td><td>${htmlEscape(r.kind === 'sheet' ? 'sheet' : r.thicknessLabel)}</td>` +
        `<td>${htmlEscape(r.speciesName)}</td><td class="n">${amount}</td><td>${htmlEscape(r.notes.join('; '))}</td></tr>`
    })
    .join('')
  const mats = result.materials
    .map((m) => {
      const net = m.kind === 'sheet' ? `${m.netAreaFt2} ft²` : `${m.netBoardFeet} bf`
      const purchase = m.kind === 'sheet' ? `${m.sheets} sheet(s)` : `${m.grossBoardFeet} bf`
      return `<tr><td>${htmlEscape(m.speciesName)}</td><td class="n">${net}</td><td class="n">${Math.round(m.wasteFactor * 100)}%</td>` +
        `<td class="n">${purchase}</td><td class="n">$${m.cost.toFixed(2)}</td></tr>`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cut list — ${htmlEscape(modelName)}</title>
<style>
  body { font: 13px/1.4 -apple-system, system-ui, sans-serif; margin: 32px; color: #111; }
  h1 { font-size: 18px; } h2 { font-size: 14px; margin-top: 24px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f3f3f3; } td.n { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 600; }
</style></head><body>
<h1>Cut list — ${htmlEscape(modelName)}</h1>
<table><thead><tr><th>Qty</th><th>Finished (L×W×T)</th><th>Rough</th><th>Stock</th><th>Species</th><th>Amount</th><th>Notes</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>Materials</h2>
<table><thead><tr><th>Species</th><th>Net</th><th>Waste</th><th>Purchase</th><th>Cost</th></tr></thead>
<tbody>${mats}</tbody>
<tfoot><tr><td colspan="4">Total</td><td class="n">$${result.totalCost.toFixed(2)}</td></tr></tfoot></table>
</body></html>`
}

// Open a printable window and invoke the browser print dialog (DOM side-effect).
export function printCutlist(result: CutlistResult, modelName: string, precision = 16): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(cutlistToHtml(result, modelName, precision))
  win.document.close()
  win.focus()
  win.print()
}

// Trigger a browser download of the CSV (DOM side-effect; not unit-tested).
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
