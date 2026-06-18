# Chunk 10 — Cut list (design + results)

**Status:** COMPLETE (2026-06-17). Scope chosen by the owner: **minimal engine** — §7 rules
(rough stock, board feet / ft², waste, species cost, machining notes, grouping). Panels are
treated as single solid boards; **glue-up strip math + panel movement auto-sizing are
deferred** (spec §15 / a later chunk). The **MCP `get_cutlist` tool is deferred** to the MCP
model-tools chunk (alongside `get_model`/`apply_model_ops`, which are not registered yet).

Spec authority: §7 (cut list), §3.1 (board/qty/kind/glue_up), §3.4 (edge grooves), §8
(species), §20.5 (waste-factor settings).

---

## Architecture (the load-bearing decision)

`generateCutlist(model, opts)` lives in **base `@tenon/core`** (`src/cutlist/`), **not**
`@tenon/core/eval`. The server's cut-list route must run it, and the server bundle has a hard
**§6 invariant: 0 manifold refs** (CI greps `dist/index.js`). So the engine — and machining
notes — are computed with **pure board-dim + joint-param math, no Manifold, no geometry
overlap**. Verified post-implementation: `grep -ci manifold packages/server/dist/index.js` → 0.

One consequence: the **same function runs in two places**:
- **Web panel** (`CutlistPanel` in `DesignerShell.tsx`) computes it **client-side, live** on
  the optimistic model via `useMemo` — instant updates during edits (same pattern as live lint).
- **Server route** `GET /api/models/:id/cutlist` runs it for MCP/bids/headless, loading species
  (cost + kind) from the `species` table and waste factors / fraction precision from `settings`.

## Files

**Core (new, WASM-free):**
- `src/cutlist/format.ts` — `fmtFraction(value, precision)` → `"3/8"`, `"1-1/4"` (hyphenated
  mixed numbers to match the spec's note examples; mirrors web `fraction.ts` formatInches).
- `src/cutlist/rough.ts` — `roughThickness(finishedT)` (§7.2 quarter table, nominal inches),
  `quarterLabel`, `LENGTH_ALLOWANCE` (1"), `WIDTH_ALLOWANCE` (1/4").
- `src/cutlist/notes.ts` — `machiningNotes(model, precision) → Map<boardId, string[]>`.
- `src/cutlist/cutlist.ts` — `generateCutlist` + the `CutlistRow`/`CutlistMaterial`/
  `CutlistResult`/`CutlistOpts`/`CutlistSpecies` types.
- `src/cutlist/index.ts` — barrel; re-exported from `src/index.ts`.
- Tests: `__tests__/{format,notes,cutlist}.test.ts` (4 + 8 + 8 = **20**).

**Server:** `routes/models.ts` — replaced the 501 stub; added `loadCutlistOpts()` (species
table + settings → `CutlistOpts`).

**Web:**
- `lib/cutlist.ts` — `buildCutlistOpts(species, settings)`, `cutlistToCsv`, `cutlistToHtml`,
  `downloadCsv`, `printCutlist` (CSV + printable HTML, §7.7).
- `ui/DesignerShell.tsx` — `CutlistPanel` replaces the placeholder; the existing
  `toggle_cutlist` command / left-rail `≣` button already opened the panel (no command change).
- Tests: `lib/cutlist.test.ts` (**7**): opts mapping, CSV (incl. inch-mark escaping), HTML.

---

## Engine rules (as implemented)

1. **Finished dims** straight from `board.dims` (§7.1; lengths already include integral tenons).
2. **Rough allowances** (§7.2): solids → `l+1"`, `w+1/4"`, `t` → next quarter
   (`≤13/16→4/4`, `≤1-1/16→5/4`, `≤1-5/16→6/4`, `≤1-13/16→8/4`, else `12/4`), returned in
   **nominal inches** (4/4 = 1.0", the unit bf is priced in). Sheets get **no** allowance
   (the 10% waste factor covers offcuts) and **no** thickness rounding.
3. **Grouping** (§7.3): boards merge when `species + kind + finished dims + machining-note set`
   match; `qty` sums (respects `board.qty`). `boardIds[]` is kept per row (selection hook for ch.11).
4. **Amount** (§7.4): solids → `boardFeet = ceil((roughT × roughW × roughL)/144 × qty)`
   (**"rounded up per row"** read literally = whole bf per row — conservative for purchasing,
   tunable). Sheets → `areaFt2 = (l×w)/144 × qty` (2 dp).
5. **Materials summary** (§7.5): per species, `net` → `× (1+waste)` → `gross` (`ceil`),
   `× cost_bf` → cost. Waste = `waste_factor_solid` (0.20) / `waste_factor_sheet` (0.10).
   Sheets: `gross ft² ÷ sheetAreaFt2 → ceil → sheets`, `× $/sheet`.
6. **Machining notes** (§7.6): derived per joint from type + params + board dims —
   `mortise/tenon` (M&T), `rabbet w×d`, `dado w×d` / `stopped dado`, `half-lap`, `bridle
   slot`/`bridle tenon`, butt fasteners (`drill 3/8 dowel ×N`, `screw ×N`, …), and board-level
   `groove w×d, edge` for `edge_grooves`. Box/dovetail/miter emit a bare type label (not carved).
   Duplicate notes on a board collapse to `note ×N` (a rail tenoned on both ends → `×2`).

## Known approximations / deferrals (documented on purpose)

- **Machining-note dimensions are param/dim-derived, not carve-exact.** Values the actual carve
  takes from the world overlap (tenon **length**, fastener **count**) are approximated:
  tenon length = mortised member thickness for a through tenon (else `depth`); fastener count =
  `params.count ?? 2`. Shop-accurate, not identical to the Manifold cut. **If a JointFn default
  in `src/eval/joints/*` changes, update the matching branch in `notes.ts`** (it duplicates the
  default formulas to stay WASM-free — cross-referenced in comments).
- **Sheet cost assumes a default sheet size** `sheetAreaFt2 = 32` (a 4×8). Board dims don't carry
  the parent sheet size and species rows have only free-text notes ("per sheet 5×5"); sheet cost
  is therefore an **estimate**. Structured sheet sizes → future.
- **Panels = single solid board.** No glue-up strip math, no `WIDE_PANEL_NO_GLUEUP`, no movement
  gap (spec §15 — deferred by scope).
- **No `get_cutlist` MCP tool** yet (deferred with the other model MCP tools).
- **No server route test.** The server has no route/integration test harness (only `bearerAuth`
  + `processPhoto` unit tests). The engine is unit-tested in core; the route is thin glue and was
  verified by a live curl smoke test (below). A route harness is a separate, future addition.

---

## Verification (2026-06-17)

```
core:   140 pass (+1 perf.bench skipped)   # +20 cutlist (format 4, notes 8, cutlist 8)
web:     77 pass                            # +7 cutlist.test.ts
server:  16 pass
server bundle manifold refs: 0             # §6 invariant holds — engine is WASM-free
web main index bundle: 0 manifold / 0 BufferGeometry
```

**Live end-to-end** (`node dist/index.js` on a fresh DATA_DIR → create model → ops → GET
cutlist): a stile + rail with an M&T, 4 identical walnut legs, and a baltic-birch sheet returned:
legs merged to one row (qty 4, 8/4, 4 bf), sheet → 3 ft² → 1 sheet, notes
`mortise 1/4 × 2-1/4, through` / `tenon 1/4 × 2-1/4 × 1-1/2`, per-species waste + cost,
**total $146.50**. Math reconciled by hand (see commit).

## Where the next chunk hooks in

- **Bids (handoff chunk 13 / spec §16):** consume `CutlistResult.materials[].cost` + the rows;
  the per-species net/gross/cost rollup is the materials half of the bid.
- **Joint dialog / lint (chunk 11):** `CutlistRow.boardIds` is the click-to-select hook;
  machining notes already render per row.
- **Glue-up + panel movement (spec §15):** add to `cutlist.ts` (panel → strips) + emit the
  movement note; the rough/grouping/materials pipeline is unchanged.
