# Tenon — Technical Specification v0.4

Working title: **Tenon** (placeholder — rename at will). Parametric woodworking design and job management application for Canterbury Woodworking. Single user. Self-hosted.

---

## 1. System overview

| Component | Technology | Host |
|---|---|---|
| Client | React 18 + TypeScript PWA, react-three-fiber, Zustand | Served from mini PC, installed on phone + shop PC |
| Geometry kernel | Manifold (`manifold-3d` WASM) inside a web worker (client) and Node (server) | Isomorphic package |
| Server | Node 22 + Express, SQLite (WAL mode) | Mini PC (`mini-canterbury`), Tailscale |
| MCP server | `@modelcontextprotocol/sdk`, Streamable HTTP transport, same Node process | Same, `/mcp` route — **Funnel-exposed, bearer-token auth required** (see §16.6) |
| Photos | Filesystem + SQLite metadata, `sharp` thumbnails | Mini PC |
| TLS | `tailscale cert` (secure context required for PWA install, camera, service worker) | Tailscale HTTPS |

### Monorepo layout (pnpm workspaces)

```
tenon/
  packages/
    core/      # shared types, op definitions, validators, geometry evaluator, joint library
    server/    # Express API + MCP server + SQLite + photo pipeline
    web/       # React PWA
  data/        # sqlite db, photos/  (gitignored, backed up)
```

`core` is the load-bearing package: it must run identically in the browser worker and in Node. No DOM, no Node-only APIs in `core`.

---

## 2. Conventions

### 2.1 Units
- Canonical unit: **decimal inches** (float64) everywhere — storage, ops, geometry, API.
- UI displays fractional inches (nearest 1/64, reduced). Input accepts `3/4`, `1-3/8`, `1.375`, `35mm` (converted on entry).
- Snap grid: 1/16" default, 1/32" fine (modifier key), off available.
- Angles: degrees.

### 2.2 Coordinate system
- World: right-handed, **Y-up** (three.js native). Ground plane = XZ.
- Board local frame: **X = length, Y = width, Z = thickness**. Origin at the board's geometric center.
- Grain runs along local X by default (`grain: "x"`); override to `"y"` for cross-grain stock (rare) — affects texture mapping and movement lint only.
- Transforms: `pos: [x,y,z]` inches; `rot: [rx,ry,rz]` Euler XYZ, degrees. Human- and Claude-readable; converted to quaternions internally for rendering. Rotation snaps: 90°/45°/15°.

### 2.3 IDs
Prefixed nanoid (10 chars): `brd_`, `jnt_`, `mdl_`, `job_`, `cli_`, `pht_`, `bid_`, `spc_`, `tlg_` (time log), `nte_` (note).

### 2.4 The core modeling convention — overlap = engagement
Boards are modeled at **physical size** (a tenoned rail's length includes its tenons) and positioned **overlapping** their mates. A joint is a typed relationship that *resolves* an overlap into joinery:

- M&T: rail end penetrates the stile by tenon length → joint carves mortise from stile, shoulders/cheeks from rail.
- Half-lap: two boards cross → each loses half its thickness in the overlap region.
- Dado: shelf end sits inside the case side by dado depth → side gets the dado, shelf is untouched (or rabbeted, per params).

Consequences:
1. Shoulder-to-shoulder distances are *derived*, never entered.
2. Any board-board intersection **without** a governing joint is an **unresolved collision** — surfaced as lint. This is the primary design-completeness signal.
3. Moving a board automatically re-derives its joints (or invalidates them, with a warning, if the overlap no longer satisfies the joint's requirements).

---

## 3. Model document

One model per design. Attached to a job (`job_id`) or standalone (library/template).

```jsonc
{
  "id": "mdl_x7Kq2mPv01",
  "rev": 42,                      // optimistic concurrency, see §3.3
  "doc_version": 1,               // document format version — independent of DB schema, see §16.1
  "name": "Hall table",
  "units": "in",                  // fixed "in" for v1; field reserved
  "boards": [ Board, ... ],
  "joints": [ Joint, ... ],
  "groups": [ { "id": "grp_..", "name": "left leg assembly", "members": ["brd_..", ...] } ],
  "meta": { "notes": "", "created_at": "...", "updated_at": "..." }
}
```

### 3.1 Board

```jsonc
{
  "id": "brd_a1B2c3D4e5",
  "name": "left front leg",
  "kind": "board",                          // "board" | "sheet" | "panel"
  "dims": { "l": 29.25, "w": 1.75, "t": 1.75 },
  "species": "spc_red_oak",
  "grain": "x",                             // "x" | "y"
  "transform": { "pos": [0, 14.625, 0], "rot": [0, 0, 90] },
  "qty": 1,                                 // render once; cut list multiplies (see note)
  "tags": ["leg"],
  "locked": false,
  "glue_up": null,                          // null | { max_strip_width: 5.5, strips: 3 } — see note
  "edge_grooves": []                        // [ EdgeGroove, ... ] — board-level features, see §3.4
}
```

Notes:
- `kind:"sheet"` switches cut-list math to square feet and disables grain-direction lint.
- `kind:"panel"` is a glued-up solid-wood panel. The cut list emits individual strips when `glue_up` is set: `strips` × `(w / strips)` width each, +1/8" width allowance per glue line, alternating-grain-orientation note. Without `glue_up`, a panel is modeled as a single board (acceptable for species where wide stock is available, e.g. soft maple).
- `glue_up.max_strip_width` defaults to 5.5" — override per species or preference. The cut list rejects a panel whose width exceeds `max_strip_width` without `glue_up` set (`WIDE_PANEL_NO_GLUEUP` warning). This triggers on nearly every tabletop and door panel.
- `qty` is a v1 simplification for identical loose parts **not** participating in distinct joints (e.g., 40 identical slats). Boards that participate in joints are individually instanced. Revisit if it causes friction.
- `dims` are **finished** dimensions. Rough-stock allowances are computed at cut-list time (§7).

### 3.4 Edge grooves (board-level features)

Not all machining relationships are two-board joints. An edge groove on a stile or rail receives a floating panel but does not "consume" the panel as a joint partner — the panel is sized to float, not to lock. Edge grooves are board-level features applied before joint evaluation.

```jsonc
{
  "id": "egv_k1L2m3N4p5",
  "edge": "bottom",                         // "top" | "bottom" | "left" | "right" (board-local)
  "depth": 0.375,                           // default t_board / 3
  "width": 0.25,                            // default 1/4" (standard slot cutter)
  "offset": 0,                              // from center of edge, default 0 (centered)
  "stopped": false,                         // true for haunched panel slots
  "stop_near": null, "stop_far": null       // distance from ends when stopped
}
```

The `mortise_tenon` joint's `haunch` param references `haunch_depth` = the governing `edge_groove.depth` on the stile — this is now a live derivation, not a magic number. Panel auto-sizing: opening width/height + 2 × groove depth − movement gap. Movement gap = `panel.dims.w_or_h × species.shrink_tan_pct × 0.6` (60% of tangential, flat-sawn estimate). Emitted as a cut-list note; the movement lint becomes sizing math rather than just a warning.

### 3.2 Joint

```jsonc
{
  "id": "jnt_f6G7h8J9k0",
  "type": "mortise_tenon",
  "a": "brd_stile",        // role per type table below (a = receives, b = inserts, where applicable)
  "b": "brd_rail",
  "params": { ... },        // type-specific, §5
  "enabled": true
}
```

The joint's *location* is never stored — it is derived from the spatial relationship of `a` and `b` at evaluation time. Storing geometry-derived values would violate the parametric principle (§2.4).

### 3.3 Concurrency
Two writers exist: the PWA and Claude (MCP). Every mutating call carries `expected_rev`; the server rejects with `409 { current_rev }` on mismatch. The losing client refetches and replays or surfaces the conflict. Single user — this is a safety net, not a CRDT problem. PWA also subscribes to model-changed events via SSE (`/api/events`) so Claude's edits appear live in the viewport.

**Undo stack rule:** a remote op received via SSE (i.e. applied by Claude, not the local PWA session) **invalidates the local undo stack** — the client clears it and shows a toast ("Model updated externally — undo history cleared"). Attempting to invert a local op against state that has since been mutated remotely produces incorrect geometry; clearing is crude but correct. CRDT-shaped undo-across-writers is explicitly out of scope.

---

## 4. Ops API (the parametric edit channel)

All mutations — from the PWA UI and from Claude — flow through one validated op pipeline in `core`. The UI never mutates state directly; it emits ops. Undo/redo = inverse-op stack on the client.

### 4.1 Op set (v1)

| Op | Payload | Notes |
|---|---|---|
| `add_board` | `board` (id optional, server assigns) | |
| `update_board` | `id`, `patch` (dims/species/name/tags/transform/grain) | |
| `transform_board` | `id`, `pos?`, `rot?` | Hot path, separated for undo granularity |
| `duplicate_board` | `id`, `offset: [x,y,z]`, `mirror?: "x"\|"y"\|"z"` | Mirror for left/right parts |
| `remove_board` | `id` | Cascades: removes joints referencing it (returned in result) |
| `add_joint` | `joint` | |
| `update_joint` | `id`, `patch` (params/enabled) | |
| `remove_joint` | `id` | |
| `group` / `ungroup` | member ids / group id | Groups move as a unit in UI; no geometric meaning |
| `set_model_meta` | `patch` (name/notes) | |

### 4.2 Validation pipeline (every op, both clients)

1. **Schema** — zod schemas in `core`, shared verbatim with MCP tool input schemas.
2. **Referential integrity** — ids exist; joint `a ≠ b`.
3. **Joint validation** — type-specific geometric preconditions (§5 per-type "requires" row). Failure → op rejected with a machine-readable reason (Claude can self-correct).
4. **Evaluation** — geometry recomputed for affected boards (§6); returns updated meshes + warnings.

Response shape (shared by REST and MCP):

```jsonc
{
  "ok": true,
  "rev": 43,
  "applied": ["op result ids..."],
  "warnings": [ { "code": "UNRESOLVED_COLLISION", "boards": ["brd_a","brd_b"], "msg": "..." } ],
  "errors": []                    // non-empty only when ok:false; nothing applied (ops are transactional per call)
}
```

---

## 5. Joint library

Each joint type is a pure function in `core`:

```ts
type JointFn = (a: BoardSolid, b: BoardSolid, params: P, ctx: EvalCtx) =>
  { cuttersA: Manifold[]; cuttersB: Manifold[];   // solids subtracted from each board
    cutlist: CutlistAnnotation[];                  // e.g. machining notes
    warnings: Warning[] }
```

Shared validation: required overlap region must exist between `a` and `b`; boards must be (for v1) **axis-aligned to each other** — i.e., relative rotation in multiples of 90°. Compound-angle joinery is explicitly out of scope for v1 (see §12).

Defaults below assume `t_b` = thickness of board b, etc. All params optional; defaults produce shop-sensible joints.

### 5.1 `butt`
- Roles: `a` face receives `b` end/edge.
- Requires: face-to-face contact (overlap depth ≈ 0; tolerance 1/64), no penetration.
- Params: `fastener: "none"|"screw"|"dowel"|"domino"|"pocket_screw"` (default `"none"`), `count` (default auto: 1 per 3" of joint width, min 2), `dia` (dowel, default 3/8).
- Geometry: no cuts; fastener markers rendered as ghost cylinders; dowels emit drilling notes to cut list.

### 5.2 `rabbet`
- Roles: `a` gets the rabbet along the contacted edge; `b` seats into it.
- Requires: `b` overlaps `a`'s edge region.
- Params: `depth` (default `t_a/2`), `width` (default `t_b`).
- Cutters: one prism from `a`. Cutlist note: "rabbet ⟨w⟩×⟨d⟩, ⟨edge⟩".

### 5.3 `dado` (cross-grain housing) / `groove` (with-grain) — single type `housing`
- Roles: `a` (case side) houses the end/edge of `b` (shelf/panel).
- Requires: `b` penetrates `a`'s face by `depth`.
- Params: `depth` (default `t_a/3`), `fit_allowance` (default 0 — dadoes cut to fit), `stopped: bool` (default false), `stop_offset` (default 3/4), `shoulder: bool` (rabbeted shelf end so dado width < `t_b`; default false), `shoulder_depth`.
- Orientation (dado vs groove) derived from `a`'s grain axis vs cut direction — affects naming + machining note only.
- Cutters: channel from `a`; if `shoulder`, rabbets from `b`.

### 5.4 `half_lap`
- Roles: symmetric; `a` is the board whose material remains on top (derived from world Y of the overlap; override `on_top: "a"|"b"`).
- Requires: boards cross or end-lap with overlap in both plan dimensions.
- Params: `split` (default 0.5 — fraction of the overlap height removed from `a`), `variant: "cross"|"end"|"tee"` (derived, not stored — listed for machining notes).
- Cutters: complementary prisms.

### 5.5 `bridle` (open mortise & tenon)
- Roles: `a` slotted (open mortise), `b` tenoned.
- Requires: end-to-end or tee overlap, full-width engagement.
- Params: `tenon_fraction` (default 1/3), `snap_to_tool: bool` (default true — round tenon thickness to nearest 1/8).
- Cutters: open slot from `a`, two cheeks from `b`.

### 5.6 `mortise_tenon` — flagship
- Roles: `a` mortised, `b` tenoned. Engagement = overlap depth of `b`'s end into `a`.
- Requires: end of `b` inside `a`; engagement ≥ 1/2".
- Params:

| Param | Default | Notes |
|---|---|---|
| `thickness_fraction` | 1/3 of `t_b` | `snap_to_tool` rounds to nearest 1/16 (chisel/router-bit sizes) |
| `thickness` | — | absolute override |
| `through` | derived | true if engagement ≥ `t_a` (minus 1/64 tol) |
| `depth` | engagement | blind: capped at `t_a − 1/4` with warning |
| `width_shoulders` | `[3/8, 3/8]` | top/bottom shoulders along `b`'s width |
| `haunch` | `"none"` | `"square"` \| `"sloped"`; `haunch_depth` default groove depth, `haunch_len` default 1/3 tenon width |
| `wedged` | false | through only; `wedge_kerfs: 2`, kerf stops 1/2 from shoulder, mortise flared 1/8 per side on exit face |
| `drawbore` | false | `pin_dia: 3/8`, `offset: 1/16`; emits drilling note, ghost pin |
| `twin` | false | two tenons across `b`'s width (wide rails) |

- Cutters: mortise pocket (flared if wedged) from `a`; shoulder/cheek prisms (and haunch relief) from `b`.
- Warnings: cheek wall of `a` < 1/4 (`THIN_MORTISE_WALL`); tenon thickness < 1/4 (`THIN_TENON`); blind depth within 1/8 of through (`NEAR_THROUGH`).

### 5.7 `box_joint` (phase 3, after the above ship)
- Params: `pin_width` (default `t` of thinner board, snapped 1/4–3/4), `start: "pin"|"socket"` on `a`.
- Solver: integer pin count fitted to joint width; remainder distributed to end pins; warning if end pin < 1/2 × pin width.

### 5.8 `dovetail` (last)
- Params: `slope` (`"1:8"` hardwood default, `"1:6"`, custom), `pins` (`"auto"` — solver targets tail width ≈ 2× pin width), `half_pin_width` (default 1/2 tail width), `variant: "through"|"half_blind"`, `lap` (half-blind, default `t_a/4` ... wait `t_a*3/4` remaining — default lap = 1/4 of `t_a`... use: lap thickness default `t_a/4`).
- Defer until M&T, housing, laps are stable. The spacing solver and half-blind lap geometry are the two hard parts; both are pure functions, unit-testable without UI.

### 5.9 `miter` (v1.5)
- 45° end miters on axis-aligned frames only (the 90°-relative-rotation rule holds; the miter is in the cut, not the placement). Params: `spline: bool`, `spline_t`, `spline_depth`.

---

## 6. Geometry evaluator

```
evaluate(model) → { boards: Map<id, { mesh, cuts: CutFeature[] }>, warnings: Warning[] }
```

Pipeline:
1. Base solid per board: axis-aligned box `l×w×t`, transformed to world.
2. For each enabled joint: run its `JointFn` → collect cutters per board, annotations, warnings.
3. Per board: `base.subtract(union(cutters))` — one batched boolean per board (Manifold handles coplanar faces; still, inset cutter faces that *should* be flush... no: cutters are exact; rely on Manifold's robustness, this is its design center).
4. Collision lint: pairwise broadphase (AABB), narrowphase via Manifold intersection volume; any pair with intersection volume > ε (1e-6 in³) not governed by a joint → `UNRESOLVED_COLLISION`.
5. Output meshes (indexed, with face provenance: which cut produced which face — enables click-a-face → highlight the joint).

Performance contract: ≤ 100 boards, ≤ 200 joints, full re-evaluate < 250 ms on a phone; incremental (dirty-board) re-evaluate < 50 ms. Memoize per-board on hash(board, governing joints, mates' transforms). Runs in a dedicated web worker; main thread receives transferable mesh buffers.

Same evaluator runs in Node for: server-side op validation, thumbnail/`render_view` generation, cut-list generation for bids without a client open.

### 6.1 Joint function test invariants

Golden tests (snapshot volumes + bounding boxes + vertex counts per joint type) catch kernel drift on `manifold-3d` upgrades. Property-based tests catch wrong-by-construction joints — these run in CI against every joint function:

- **Containment**: every cutter solid is fully contained within the bounding box of its target board (cutters that extend outside corrupt adjacent boards).
- **Volume**: volume removed from each board equals the analytic expectation for the joint type and params (e.g. M&T mortise = `thickness × width × depth`; tolerance ±0.001 in³).
- **Complement**: for symmetric joints (half-lap), `volume_removed_a + volume_removed_b = total_overlap_volume` within tolerance.
- **Idempotence**: evaluating the same model twice produces bit-identical meshes.
- **Manifold validity**: Manifold's `.status()` returns `Manifold` (not `Error`) for every output solid.

These are pure-function tests against `core` — no UI, no worker, no browser.

---

## 7. Cut list

`generateCutlist(model, opts) → CutlistRow[]`

1. **Finished dims** from board defs (lengths include integral tenons — by §2.4 the board *is* the physical stick).
2. **Rough allowances** (defaults, per-row overridable): length +1", width +1/4", thickness → next standard rough stock (finished ≤ 13/16 → 4/4; ≤ 1-1/16 → 5/4; ≤ 1-5/16 → 6/4; ≤ 1-13/16 → 8/4; else 12/4).
3. **Grouping**: identical (finished dims, species, machining-note set) rows merge with qty.
4. **Board feet**: rough dims, `(t × w × l) / 144`, rounded up per row; sheet goods in ft².
5. **Waste factor**: solid 20% default, sheet 10% (per-species override).
6. **Machining notes** column: aggregated joint annotations ("tenon 3/8 × 3 × 1-1/4, both ends", "dado 3/4 × 1/4, 2x", "drill 3/8 dowel × 4").
7. Output: in-app table, printable HTML, CSV export.
8. Stock-layout optimization (cutting diagrams / bin packing): **deferred to v2** — OpenCutList-class feature, large and separable.

---

## 8. Species database

```sql
CREATE TABLE species (
  id TEXT PRIMARY KEY,            -- spc_red_oak
  common_name TEXT NOT NULL,
  botanical TEXT,
  kind TEXT NOT NULL DEFAULT 'solid',     -- solid | sheet
  density_lb_ft3 REAL,
  janka_lbf INTEGER,
  shrink_tan_pct REAL,            -- green→OD tangential
  shrink_rad_pct REAL,
  cost_bf REAL NOT NULL,          -- user-maintained, $/bf ($/sheet for sheet goods)
  thicknesses TEXT NOT NULL,      -- JSON: ["4/4","5/4","8/4"]
  texture TEXT,                   -- texture asset id
  notes TEXT
);
```

Seed set: red oak, white oak, hard maple, soft maple, black cherry, black walnut, ash, poplar, eastern white pine, southern yellow pine, hickory, sapele, western red cedar; sheet: baltic-birch 1/2 & 3/4, MDF 3/4.

Derived: weight rollup (density × volume), cost rollup (§7), movement lint — flat-sawn movement coefficient from tangential shrinkage; warn when a captured panel's cross-grain span × coefficient exceeds the joint's allowance (`PANEL_MOVEMENT`), and when face-glued species differ in movement class by >1 step (`MOVEMENT_MISMATCH`). Textures: seamless per-species albedo, UV-mapped along the grain axis; ship flat colors first, textures are a polish pass.

---

## 9. Storage schema (beyond `species`)

```sql
CREATE TABLE clients  (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT, notes TEXT, created_at TEXT);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lead',   -- lead|bid|accepted|in_progress|delivered|paid|archived
  deposit_pct REAL,                      -- e.g. 50.0; NULL = not yet agreed
  deposit_paid_at TEXT,                  -- ISO timestamp; NULL = not yet received
  payment_status TEXT DEFAULT 'unpaid',  -- unpaid|deposit_received|paid_in_full
  due_date TEXT, notes TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE models (
  id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id),  -- NULL = standalone/library
  name TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,                     -- JSON model document (§3)
  thumbnail TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE model_snapshots (            -- safety net: snapshot every 25 revs + on demand
  model_id TEXT, rev INTEGER, doc TEXT, created_at TEXT, PRIMARY KEY (model_id, rev)
);
CREATE TABLE photos (
  id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id),
  path TEXT NOT NULL, thumb_path TEXT, caption TEXT,
  taken_at TEXT, uploaded_at TEXT, exif TEXT               -- JSON
);
CREATE TABLE time_logs (
  id TEXT PRIMARY KEY, job_id TEXT, minutes INTEGER,
  category TEXT,   -- enum shared with bid labor categories: design|milling|joinery|assembly|finishing|install|other
  note TEXT, logged_at TEXT
);
CREATE TABLE notes (id TEXT PRIMARY KEY, job_id TEXT, body TEXT, created_at TEXT);
CREATE TABLE hardware (
  id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id),
  model_id TEXT REFERENCES models(id),   -- NULL = job-level (not tied to a specific model)
  item TEXT NOT NULL,                    -- e.g. "3/8 brass knobs", "full-ext drawer slides 18\""
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'ea',                -- ea | pair | set | box | ft
  unit_cost REAL,                        -- NULL = to be quoted
  supplier TEXT,
  notes TEXT
);
-- bids, bid_line_items: phase-4 spec addendum. Labor line items use the same category enum as time_logs.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,   -- e.g. "theme", "density", "default_species", "snap_grid", "labor_rate"
  value TEXT NOT NULL     -- JSON scalar or object; parsed on read
);
-- Seed rows inserted by migration: theme="system", density="comfortable", snap_grid=0.0625,
-- fraction_precision=16, default_species="spc_red_oak", waste_factor_solid=0.20,
-- waste_factor_sheet=0.10, labor_rate=null, viewport_shadows=true
```

Photos on disk: `data/photos/{job_id}/{photo_id}.jpg` + `_thumb.webp` (sharp, 512px). EXIF `DateTimeOriginal` → `taken_at` (job timeline ordering).

Backups: nightly cron — `sqlite3 .backup` + `rsync` of `data/photos` to a second disk/NAS. One line in the deploy doc, non-optional.

---

## 10. REST API (PWA ↔ server)

`/api/*`, JSON. `tailscale serve` (tailnet-only) for all REST routes — Tailscale membership is the auth boundary for the PWA. `/mcp` is separately Funnel-exposed with bearer auth (§16.6).

| Route | Methods |
|---|---|
| `/api/jobs`, `/api/jobs/:id` | GET, POST, PATCH |
| `/api/clients`, `/api/clients/:id` | GET, POST, PATCH |
| `/api/models`, `/api/models/:id` | GET, POST, PATCH (meta only) |
| `/api/models/:id/ops` | POST `{ expected_rev, ops: Op[] }` → §4.2 response |
| `/api/models/:id/cutlist` | GET |
| `/api/jobs/:id/photos` | GET, POST (multipart) |
| `/api/photos/:id`, `/:id/thumb` | GET (static), DELETE |
| `/api/jobs/:id/hardware`, `/api/hardware/:id` | GET, POST, PATCH, DELETE |
| `/api/settings` | GET (all keys), PATCH (key/value pairs) |
| `/api/species`, `/api/species/:id` | GET, POST, PATCH |
| `/api/time_logs`, `/api/notes` | GET, POST |
| `/api/events` | GET (SSE: `model_changed`, `photo_added`, `job_changed`) |

---

## 11. MCP server

Same process, `https://mini-canterbury.<tailnet>.ts.net/mcp` (Streamable HTTP) — the Fuel deployment pattern. Tool input schemas are the zod schemas from `core` (single source of truth). All write tools return the §4.2 response shape so Claude gets warnings/errors it can act on.

### 11.1 Day-one stub (ships in phase 1)
`list_jobs`, `get_job`, `create_job`, `update_job`, `log_note`, `log_time`, `get_photos`, `upload_photo`.

### 11.2 Full surface

| Tool | Params (sketch) | Returns |
|---|---|---|
| `list_jobs` | `status?` | id, title, status, client, due, counts |
| `get_job` | `job_id` | job + notes + time summary + photo index + model ids |
| `create_job` | `title, client_name?, status?, due?, notes?` | job (client matched-or-created by name) |
| `update_job` | `job_id, patch` | job |
| `log_note` / `log_time` | `job_id, body` / `job_id, minutes, category?, note?` | row |
| `get_photos` | `job_id, since?, limit=6` | **image content blocks** (thumbs) + metadata; `get_photo(photo_id)` for full res |
| `upload_photo` | `job_id, image (base64), caption?` | photo row |
| `list_models` | `job_id?` | id, name, rev, board/joint counts |
| `get_model` | `model_id` | model document (§3) |
| `create_model` | `name, job_id?` | model |
| `apply_model_ops` | `model_id, expected_rev, ops: Op[]` | §4.2 response |
| `get_cutlist` | `model_id` | rows + bf/cost totals |
| `render_view` | `model_id, view: "iso"\|"front"\|"top"\|"right", highlight?: ids` | **image content block** (PNG) |
| `get_species` / `update_species_cost` | — / `species_id, cost_bf` | rows |
| `validate_model` | `model_id` | warnings only (lint pass without edits) |
| `export_print_model` | `model_id, scale: number, mode: "merged"\|"parts", printer?: "fdm"\|"resin"` | download URL + thin-feature warnings + slicer notes summary |

### 11.3 `render_view` implementation
Server route `GET /render?model=:id&view=iso&w=900` serves a minimal page that loads the model, renders with the same R3F scene components, and signals ready; Puppeteer (installed on the mini PC) screenshots it. Pros: pixel-identical to the PWA, zero duplicate render code. Cost: ~1–2 s per render, irrelevant at this usage level. Fallback if Puppeteer misbehaves on the mini PC: `three` + `headless-gl` in Node (more brittle; second choice).

### 11.4 The edit loop this enables
1. Claude `get_model` → reasons over JSON (boards, joints, dims).
2. `apply_model_ops` with small validated ops; rejection reasons are machine-readable → self-correct.
3. `render_view` → visually verify.
4. `get_cutlist` → confirm material consequences.

Design rule for every tool: **errors must teach** — a failed op returns what was wrong and what valid ranges/ids were, so the loop converges without a human in the middle.

---

## 12. Explicit non-goals (v1)

- Compound-angle joinery (relative rotations limited to 90° multiples; miters via §5.9 cut-level handling).
- Curved/shaped parts, turnings, sculpted work. Boards are prisms. (Tier-1 profiles/revolves are a phase-3.5 addition, not v1.)
- Constraint solver / mate-driven assembly (placement-driven only; snapping assists, never solves).
- Stock-layout cutting diagrams — deferred to v2 (OpenCutList-class feature, large and separable).
- CNC export (STEP/DXF) — permanently out per requirements.
- Multi-user, auth, sharing.
- Profile modeling (ogees, roundovers) — machining notes on the cut list, not geometry.
- **Invoicing and payment processing** — QuickBooks-shaped problem, poor build ROI. `deposit_pct` / `payment_status` on the `jobs` table (§9) covers operational tracking; full AR is an explicit non-goal.
- **Dimensioned shop drawings** — `render_view` produces pictures; auto-dimension placement on orthographic views is a hard layout problem. The cut list + machining notes carry shop-floor information in v1. Dimensioned DXF/PDF drawings are a **v2 candidate** — all the underlying data exists in the model, the feature is separable.

**v2 candidate list** (decisions made, scope fenced): dimensioned shop drawings, stock-layout / cutting diagrams, multi-piece glue-up form design, estimate-vs-actual calibration report (hours bid vs logged by category), shop-stock inventory layer on species.

---

## 13. PWA structure

Routes: `/designer/:modelId`, `/models`, `/jobs`, `/jobs/:id`, `/species`, `/settings`.

Designer components: `Viewport` (R3F canvas, orbit + transform gizmo, face-click → joint highlight), `BoardPanel` (dims/species/transform, fractional inputs), `JointDialog` (type picker filtered by what the current overlap supports, params form with live preview), `LintPanel` (warnings incl. unresolved collisions, click-to-frame), `CutlistPanel`, `OutlinerPanel` (boards/groups tree).

Workers: `geometry.worker.ts` (evaluator; transferable buffers). State: Zustand store holding the model doc + derived meshes; ops dispatched through `core` validators; undo stack of inverse ops.

Designer UX priorities (in order): numeric-first board creation → drag with snapping (face/edge/end magnetism between boards) → overlap → "resolve as joint…" affordance on collision lint. The lint-driven flow *is* the joint UX.

---

## 14. Phase plan with acceptance criteria

| Phase | Scope | Done when |
|---|---|---|
| **1. Foundation** (~1–2 wk-ends) | Monorepo, `core` types + zod schemas, SQLite migrations (all tables incl. `settings`, `hardware`), Express skeleton, MCP stub (§11.1) with bearer auth, deploy on mini PC + TLS, design token foundation + theme switching | Claude can create a job, log a note, upload + view a photo from chat; PWA shell installs on phone; dark/light/system theme works on all surfaces |
| **2. Assembly** (~2–3) | Command registry + palette, viewport with token-synced theme, board CRUD, transforms + snapping, species rendering (flat colors), groups, collision lint, panel/glue-up handling, manual cut list | A bookcase modeled on the shop PC in < 15 min; ⌘K palette reaches any action; cut list correctly handles a glued-up panel top |
| **3. Joints** (~4–8, incremental) | Evaluator + edge groove pipeline + Manifold worker; ship order: housing → rabbet → half-lap → butt → bridle → **M&T** → box → dovetail; joint dialog + lint resolve flow; `apply_model_ops`, `get_model`, `render_view`, `get_cutlist` live | A frame-and-panel door modeled with through-wedged M&T and floating panel (auto-sized via edge_groove + movement math); Claude builds a sawhorse model from chat alone and verifies via `render_view` |
| **4. Bids** (~2–3) | Bid entities + engine (materials + hardware from cut list × waste × cost + labor categories + overhead + margin), estimate-vs-actual tracking, printable bid, `estimate_bid` tool | A real Canterbury bid produced end-to-end and sent to a client; actual hours vs bid hours visible per category |
| **5. Co-designer polish** | Error-message quality pass on op rejections, model templates, wood textures, panel-movement lint, shop-mode density, settings screen full implementation | Conversational modeling of a new piece requires no PWA touch-ups; shop mode usable standing at the bench |

Phase ordering risk (restated): phase 3 is the long pole at ~10× the rest. Phases 1–2 are deliberately self-contained so the project has standing value even if 3 stretches.

---

## 15. Work breakdown × model assignment

### Model lineup
- **Claude Fable 5** — top tier, novel derivation, cross-cutting architecture review
- **Claude Opus 4.8** — complex multi-file and numerical implementation
- **Claude Sonnet 4.6** — workhorse for well-specified build-out
- **Claude Haiku 4.5** — bulk mechanical output, test fixtures, boilerplate

### Tiering principle
The spec is the lever: the more precisely a chunk is already specified, the lower the tier needed. Default low, escalate on failure — not the reverse.

Working pattern: plan high, execute low. For each Fable-tagged chunk, run a design session in chat producing a written mini-spec, then hand implementation to Opus/Sonnet in Claude Code with that spec as context. Keep the spec in the repo so every Claude Code session loads it as ground truth; update when reality diverges (a stale spec degrades lower-tier output). Escalation rule: two failed attempts at a tier → move up one, with the failure transcript as context.

### Ordered chunks

| # | Chunk | Depends on | Model | Why |
|---|---|---|---|---|
| 1 | Monorepo scaffold, tooling, systemd + Tailscale TLS deploy | — | Sonnet 4.6 | Mechanical, fully specified |
| 2 | `core` types + zod schemas + op validators: Board (incl. `glue_up`, `edge_grooves`), Joint, Op set, `Command`/`CommandRegistry` contract, Hardware, Settings | 1 | Sonnet 4.6 build, **Fable 5 review** | Everything downstream imports this — one strong review pass is load-bearing |
| 3 | SQLite migrations (`001_init` — all tables incl. `settings` seed rows, `hardware`, deposit fields), Express REST skeleton, SSE | 2 | Sonnet 4.6 | CRUD against §9–10 verbatim |
| 4 | MCP stub (jobs/notes/photos) + photo pipeline (sharp, EXIF) + bearer token auth middleware + rate limiting (§16.6) | 3 | Sonnet 4.6 | Fuel pattern + security additions |
| 5 | **Design token foundation**: CSS custom properties §20 layer 1+2, Tailwind v4 `@theme` block, Radix primitives install, `syncViewportTheme()` stub, `/api/settings`, theme switching (system/light/dark), density setting read | 3 | Sonnet 4.6 | Must exist before any UI component; theme-correct from day one |
| 6 | PWA shell + **command registry** implementation + **command palette** (⌘K) + jobs UI (pipeline board, job detail with hardware/time-logs/notes/photos, deposit/payment status) + phone tab shell | 4, 5 | Sonnet 4.6; Haiku 4.5 for component boilerplate | Registry first within this chunk — all subsequent UI interactions register into it |
| 7 | Viewport: R3F scene, orbit, board render (§20 `--vp-*` tokens via `syncViewportTheme`), transform gizmo, Select/Add/Measure modes registered in command registry | 2, 5 | **Opus 4.8** | 3D + token bridge is where Sonnet-tier output gets subtly wrong |
| 8 | Snapping (face/edge magnetism) + collision broadphase + outliner panel + context menu registered in command registry | 7 | **Opus 4.8** | Snapping is the UX make-or-break; iterative, judgment-heavy |
| 9 | Evaluator core + Manifold worker plumbing + face provenance + **edge groove pipeline** (§3.4 board-level feature step, runs before joint cutters) + property-based invariants (§6.1) | 2 | **Fable 5 design session → Opus 4.8 implement** | Architectural heart; edge groove step is load-bearing for frame-and-panel |
| 10 | Simple joints: housing, rabbet, half-lap, butt + unit tests + property-based test suite (§6.1) | 9 | Opus 4.8; Haiku 4.5 test fixtures | Pure functions, moderate geometry |
| 11 | Joint dialog + lint-resolve flow + live preview (uses `--vp-joint-highlight`, `--vp-ghost` tokens) | 8, 10 | Opus 4.8 | UI↔worker wiring with preview state |
| 12 | **Mortise & tenon** (full §5.6 param set incl. haunch derivation from `edge_grooves`) | 10 | **Fable 5 derivation → Opus 4.8 implement** | Haunch/wedge-flare/drawbore interactions; haunch now references live groove data |
| 13 | `apply_model_ops`, `get_model`, `validate_model` MCP + "errors must teach" pass | 9, 4 | Opus 4.8; **Fable 5 error-quality pass** | Rejection messages determine whether the Claude edit loop converges |
| 14 | `render_view` (Puppeteer) + thumbnails | 7 | Sonnet 4.6 | Glue code |
| 15 | Cut list engine + **glue_up strip math** + **panel auto-sizing** (§3.4 movement gap) + printable/CSV | 10 | Sonnet 4.6 | §7 rules exact; panel math is new v0.3 addition |
| 16 | Bid engine + **hardware line items** + estimate-vs-actual category rollup + printable bid | 15 | Sonnet 4.6 | Arithmetic + templating; hardware table now feeds bid |
| 16.5 | **3D print export**: scale validator, `@jscadui/3mf-export` serializer, merged + parts modes, embedded slicer notes, `export_print_model` MCP tool, `/api/models/:id/export` route (§21) | 9 | Sonnet 4.6 | Fully specified; pure output formatting over existing Manifold solids |
| 17 | Profiles (presets + SVG import) + turnings (revolve) | 9 | Opus 4.8 | Tessellation tolerances, 1:1 template output |
| 18 | Box joint + dovetail spacing solver | 10 | **Fable 5 solver math → Opus 4.8 implement** | Two derivation problems first |
| 19 | Polish: wood textures, movement lint, **shop-mode density** (§19), settings screen full UI, model templates | 12+ | Sonnet 4.6 / Haiku 4.5 | Incremental; shop-mode sizing validated at bench |

Fable 5 touches six chunks (2-review, 9, 12, 13-pass, 18, and the §20 token system design session before chunk 5). Phase-1 survival milestone lands at chunk 4; design token foundation at chunk 5 before any component is rendered; command registry at chunk 6 before any interaction is wired.

---

## 16. Operations

### 16.1 Versioning — three surfaces

| Surface | Mechanism | Notes |
|---|---|---|
| App release | Git tag (`v0.3.0`), trunk-based, no long-lived branches | Version baked into build, shown in PWA footer + `/healthz` |
| DB schema | `PRAGMA user_version` integer, bumped per migration file | See §16.2 |
| Model document format | `doc_version` field inside the JSON blob | The easy one to forget — and the dangerous one |

The third surface is the trap: model documents are JSON inside SQLite, so SQL schema migrations never touch their internals. When the board/joint format evolves (it will — `profile` in phase 3.5, joint param changes in M&T iterations), that is a *document* migration chain, entirely separate from SQL. Pattern: **migrate-on-read with write-back** — the server reads a doc, upgrades it in memory to current `doc_version`, and writes it back. Plus a `pnpm migrate-docs` batch command for eager runs before a release. `model_snapshots` rows stay immutable at their original `doc_version` and migrate only on restore.

MCP tool contracts get **additive-only evolution**: new optional params yes, repurposed params never. Claude does not pin tool versions.

### 16.2 Schema migrations

Forward-only numbered SQL files (`migrations/001_init.sql`, `002_add_bids.sql`, …) executed by a ~40-line runner in `server` on boot:

1. Read `PRAGMA user_version`.
2. For each pending file (in order): execute inside a transaction, then `PRAGMA user_version = N`.
3. Any failure rolls back the transaction; the runner exits non-zero and systemd holds the previous release.

Before applying any migration: `VACUUM INTO data/pre-migrate-<timestamp>.db` — automatic pre-migration snapshot. Rollback = stop service, swap `current` symlink to previous release, restore DB file if needed, restart. Tested-by-construction; down-migration scripts are not written because they never get run.

SQLite DDL note: anything beyond `ADD COLUMN` / `DROP COLUMN` requires the create-new-table → copy → drop → rename dance. Write it in the migration file explicitly — do not rely on `ALTER TABLE` to do more than it can.

### 16.3 Deployment

```
releases/
  20260611T210000/     # unpacked tarball
  20260528T143000/     # previous (keep last 5)
current -> releases/20260611T210000   # symlink
```

Deploy script (runs from dev machine over Tailscale SSH):

```
pnpm test && pnpm typecheck          # gate — nothing ships red
pnpm build                           # web bundle + server
tar czf tenon.tar.gz dist/
ssh mini-canterbury "mkdir -p ~/releases/<ts>"
scp tenon.tar.gz mini-canterbury:~/releases/<ts>/
ssh mini-canterbury "
  cd ~/releases/<ts> && tar xzf tenon.tar.gz
  ln -sfn ~/releases/<ts> ~/current
  systemctl restart tenon
"
```

Rollback: `ln -sfn ~/releases/<prev> ~/current && systemctl restart tenon` — plus DB restore if a migration ran.

systemd unit essentials:

```ini
[Service]
ExecStart=/home/brian/.volta/bin/node /home/brian/current/server/index.js
Restart=always
After=network-online.target tailscaled.service
EnvironmentFile=/etc/tenon/env    # DATA_DIR, PORT, MCP_BEARER_TOKEN
```

Node pinned via volta (`.node-version` committed). pnpm lockfile committed. `manifold-3d` and Puppeteer pinned exactly (see §16.5).

Docker: not at the start. The genuine argument for it is Puppeteer's Chromium dependency tree plus `sharp`'s native bindings — on Ubuntu both are an `apt` one-liner. Trigger condition for containerizing: the first time a system update breaks `render_view`.

CI: GitHub Actions on push — typecheck, unit tests, geometry golden tests, build check. Deploy stays a manual script; CD adds ceremony with no payoff at n=1.

### 16.4 Backups — the section that actually matters

| Tier | Mechanism | Cadence |
|---|---|---|
| Continuous | **Litestream** replicating the SQLite WAL to a second target (Pi 5 on tailnet) | Near-zero RPO, set-and-forget |
| Nightly | `VACUUM INTO` snapshot + `rsync data/photos/` to Pi 5 | Cron: 7 daily / 4 weekly / 12 monthly retention |
| Offsite | restic → B2 (db snapshots + photos) | Weekly; job photos and bids are Canterbury business records |

Litestream is strongly recommended — purpose-built continuous SQLite replication, trivial config, single-command restore. The Pi 5 already on the tailnet running Grafana is the natural second-disk target; no new hardware.

Two non-negotiables: WAL-mode databases are **never raw-copied while hot** (`VACUUM INTO` or the backup API only); and a **quarterly restore drill** onto the dev machine — an untested backup is a hypothesis.

Photos are the growth vector. Monitor free space via the `/healthz` endpoint and the Grafana alert already running on the Pi.

### 16.5 Dependency policy

Monthly manual update pass. One exception with a hard rule: **`manifold-3d` upgrades only happen against the geometry golden-test suite** — snapshot volumes, bounding boxes, and vertex counts of every joint type's reference output. A kernel version bump that silently changes boolean output corrupts work product rather than crashing; it will not be caught by any application-level test. The golden tests are the canary. No merge without a passing golden run.

### 16.6 MCP security

Claude.ai's MCP client connects from Anthropic infrastructure — outside the tailnet. `/mcp` must therefore be exposed via **Tailscale Funnel** (public internet endpoint), which means Tailscale membership is not the auth mechanism for this route. The PWA and REST API stay on `tailscale serve` (tailnet-only) and are unaffected.

Security requirements for `/mcp`:

- **Bearer token auth**: all requests require `Authorization: Bearer <token>`; 401 on mismatch. Token is a 32-byte hex random (`openssl rand -hex 32`), stored in `/etc/tenon/env` as `MCP_BEARER_TOKEN`, passed to Claude.ai's connector config as the auth header. Rotate by updating the env file and restarting; update the connector config at the same time.
- **Rate limiting**: 60 requests/minute per IP (express-rate-limit); `render_view` calls additionally capped at 10/minute (Puppeteer cost).
- **Request size cap**: 1 MB body limit on `/mcp` (image uploads via `upload_photo` are base64 ~750 KB for a 500 KB JPEG — this is the ceiling, not headroom).
- **Write audit log**: every mutating MCP tool call (tool name, op summary, timestamp) appended to `data/mcp-audit.log` via pino — doubles as a "what did Claude change" trail.
- **No Funnel for REST**: if Claude ever needs to call REST directly, route it through MCP tools instead. The REST surface stays tailnet-only.

Verify the Fuel MCP server has equivalent protections; if it does not, treat this section as a remediation item for both services.

---

## 17. Open questions (decide during phase 1, none block the start)

1. **Tenon-in-length convention** (§2.4) vs shoulder-to-shoulder entry: the convention is internally consistent, but verify it feels right after modeling the first real piece — it is the one decision expensive to reverse.
2. `qty` on boards (§3.1) vs always-instancing — decide after the bookcase test.
3. Snapping behavior depth (magnetic faces vs grid-only) — prototype in phase 2.
4. Texture sourcing (CC0 sets vs photographed shop stock) — polish-phase decision.
5. **Labor category enum alignment**: the `time_logs.category` and bid labor category must be the same enum from day one for the estimate-vs-actual report to work. Proposed values: `design | milling | joinery | assembly | finishing | install | other`. Confirm before writing migration 001.
6. **Shop stock concept**: `species.cost_bf` is a market price. On-hand rough lumber has a sunk cost and an opportunity cost that differ from current pricing — relevant when bidding against inventory already in the rack. Flag as v2; decide whether to model it as a per-board override or a parallel `stock` table.
7. **Shop-mode density** (§19): design the larger hit-target / larger text variant now in spec, or validate against first bench use first? Recommendation: spec the breakpoints now (comfortable = 40px row height, 14px base; shop = 52px row, 17px base), implement as a CSS class swap on `<html>`, validate at bench. Add to chunk 19.

---

## 18. Project risk

The effort total is 15–25 weekends of focused work. Weekend availability is about to be substantially restructured by the arrival of a newborn, compounded by the active 19-window trim project and ongoing renovation queue.

**Survival milestone**: chunk 4 (jobs / photos / MCP) is a complete, useful product even if nothing else ships for a year. It should land before availability drops. This is the schedule gate everything else is planned around.

**Degraded-but-valuable fallback**: the genuinely differentiated work in this system is the parametric joint engine plus the Claude edit loop. The 3D modeling itself is replaceable by SketchUp; the cut-list and costing layer is replaceable by OpenCutList. If phase 3 stalls, the viable fallback architecture is: *Tenon = jobs/bids/photos/MCP app, SketchUp = modeler*. The MCP tools that operate on model data (`get_cutlist`, `estimate_bid`, `get_photos`) remain fully functional without the internal geometry engine. Knowing the retreat position in advance is what prevents a stall from becoming abandonment — the documented failure mode of attempt one.

---

## 19. UI architecture

### 19.1 Interaction model — the command registry

Every user action is a registered command. The registry is a map from command id to descriptor:

```ts
interface Command<Id extends string, Ctx> {
  id: Id
  label: string                       // shown in palette, tooltips, context menu
  icon?: string                       // Lucide icon name
  shortcut?: string                   // e.g. "B", "Cmd+K", "Ctrl+Z"
  when?: (ctx: Ctx) => boolean        // palette/toolbar filter; hides if false
  run: (ctx: Ctx) => void | Promise<void>
}

class CommandRegistry {
  register<Id>(cmd: Command<Id, AppCtx>): void
  execute(id: string, ctx: AppCtx): void
  filtered(ctx: AppCtx): Command[]    // for palette / context menu
}
```

Every UI surface — toolbar, context menu, keyboard handler, command palette — is a renderer over `registry.filtered(ctx)`. Nothing binds behavior to a button directly. Consequences: keyboard shortcuts are a table; the palette is free; menus reconfigure without touching logic; user-remappable shortcuts are a settings screen, not a refactor (v2). Commands ultimately emit ops: `command → op(s) → validation → evaluate` — the same chokepoint as the data layer.

### 19.2 Modes — three, not a palette

| Mode | Shortcut | Behavior |
|---|---|---|
| **Select** | `V` / `Esc` | Click board → select; drag gizmo to move; all contextual actions hang off selection |
| **Add board** | `B` | Numeric-first dialog (dims + species defaulting to last-used) → ghost placed with snapping; `Enter` repeats |
| **Measure** | `M` | Point-to-point and face-to-face readouts, fractional display |

Transform is not a mode — the gizmo lives on the selection (`G`/`R` toggle translate/rotate, `X`/`Y`/`Z` constrain, typed digit = exact offset). Joint creation is not a mode — it is contextual: select two overlapping boards → `J` (or tap the lint badge) → joint dialog pre-filtered to types whose `requires` predicate the current overlap satisfies, with live ghost preview. The lint-driven flow is the primary joint path: place boards → collision badge → "resolve as joint…". A tool palette with fifteen modes is the failure pattern of hobby CAD.

**Command palette** (`Cmd/Ctrl+K`): fuzzy search over the full registry — modeling commands, jobs-side actions, view presets, settings. For a single-user power-user tool, this surface beats deep menus permanently.

### 19.3 Designer layout (desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│ ◧ Hall table ▾   ↶ ↷   [iso][↑][→][front]    ⌘K        ⚙ ☾   │  top bar 40px
├────┬────────────────────────────────────────────┬───────────────┤
│    │                                            │  INSPECTOR    │
│ V  │                                            │  (context)    │
│ B  │                                            │               │
│ M  │              3D VIEWPORT                   │  board sel:   │
│────│                                            │  dims/species │
│ ⊞  │                                            │  transform    │
│ ⚠2 │                                            │               │
│ ≣  │                                            │  joint sel:   │
│    │                                            │  type/params  │
│    │                                            │  live preview │
│    │                                            │               │
│    │                                            │  no sel:      │
│    │                                            │  model summary│
│    │                                            │  + outliner   │
├────┴────────────────────────────────────────────┴───────────────┤
│  snap 1/16" ▾  │  grid ✓  │  14 boards · 9 joints  │  ⚠ 2 lint │  status 28px
└─────────────────────────────────────────────────────────────────┘
```

**Left rail** (48px, icons only): three mode buttons + three panel toggles — Outliner `⊞`, Lint `⚠` with live count badge, Cut list `≣`. Panels open as overlay drawers docked left (not permanent splits — viewport real estate is primary).

**Right inspector** (300px, collapsible `` ` ``): contextual to selection state:
- Board selected → dims (fractional inputs), species picker, transform (pos/rot), tags, lock toggle.
- Joint selected (or face-clicked via provenance) → joint type label, params form, live preview mini-viewport.
- Multi-select → aggregate stats (total board feet, weight), bulk species/tag actions.
- Nothing selected → model name, board/joint counts, warnings summary, outliner tree.

One inspector that changes meaning beats three competing permanent panels.

**Status bar**: snap setting (click cycles: 1/16 → 1/32 → off), board/joint counts, lint count (click opens lint panel). Error feedback appears as a toast anchored to the status bar, not a modal.

**No menubar.** Every menubar item would be a registry entry reachable via palette or keyboard shortcut; the bar adds chrome with no information density gain for a single-user tool.

**Right-click context menu**: registry-filtered by hit target:
- Board: Duplicate · Mirror (X/Y/Z) · Isolate · Join with… · Delete
- Joint: Edit params · Disable · Delete
- Empty space: Paste · Add board · View preset submenu

### 19.4 Phone — review + light-edit shell

Phone is explicitly not the primary modeling surface. Priority order: capture photos → review lint/dims → tweak a joint param → check cut list. Not: build an assembly from scratch.

**Bottom tab bar** (always visible): Jobs · Models · Capture · Settings. Capture gets its own tab because it is the highest-frequency phone action.

**Designer on phone**: stripped viewport (orbit only, no gizmo translate), bottom sheet replacing the inspector (states: peek 72px showing board name + lint count → half-screen params → full-screen params). Long-press = context menu. Mode bar collapses to a single `+` FAB (opens Add Board sheet). Lint badges tap to inline resolve sheet.

**Shell switching**: the router detects `window.innerWidth < 768` at load and persists the choice; a "Switch to desktop view" link in settings overrides for tablets. Same routes, two layout shells.

### 19.5 Jobs-side layout

Left nav (desktop): pipeline status filter (All / Lead / Bid / In Progress / Delivered / Paid), client list. Job detail: tabbed (Overview · Model · Photos · Hardware · Time & Notes · Bid). Overview shows status, deposit status, due date, quick-log time button. Hardware tab is an editable line-item table with supplier, unit, cost, totals. Time & Notes tab is a combined chronological feed of time entries and notes — one scrollable record of work.

Phone jobs side: same tab bar, job detail as a full-screen card stack.

---

## 20. Design tokens

### 20.1 Three-layer architecture

All tokens are CSS custom properties. Components reference **only Layer 2**. Layer 1 and Layer 3 are never referenced by components directly.

**Layer 1 — primitives** (raw values, no semantic meaning):
```css
/* Grays */
--gray-0: #ffffff;  --gray-50: #f9f8f6;  --gray-100: #f0ede8;
--gray-200: #e0dbd3; --gray-300: #c8c2b8; --gray-400: #a09890;
--gray-500: #787068; --gray-600: #5a5248; --gray-700: #3d3830;
--gray-800: #28231e; --gray-900: #1a1612; --gray-950: #100e0b;

/* Brand warm */
--oak-100: #f5e6cc;  --oak-300: #c8914a;  --oak-500: #9a6420;
--oak-700: #5c3a0e;

/* Semantic primitives */
--red-500: #d63b2f;    --amber-500: #c27d18;
--green-500: #2e7d52;  --blue-500: #2563a8;

/* Spacing (4px base) */
--sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;  --sp-4: 16px;
--sp-6: 24px; --sp-8: 32px; --sp-12: 48px;

/* Type scale */
--text-xs: 11px;  --text-sm: 13px;  --text-base: 14px;
--text-md: 16px;  --text-lg: 18px;  --text-xl: 22px;

/* Radii */
--radius-s: 4px;  --radius-m: 6px;  --radius-l: 10px;

/* Motion */
--dur-fast: 80ms;  --dur-base: 160ms;  --ease-out: cubic-bezier(0.2,0,0,1);
```

**Layer 2 — semantic aliases** (the theme; remapped per `data-theme`):
```css
[data-theme="light"] {
  /* Surfaces */
  --surface:           var(--gray-0);
  --surface-raised:    var(--gray-0);
  --surface-sunken:    var(--gray-50);
  --surface-overlay:   var(--gray-0);

  /* Text */
  --text:              var(--gray-900);
  --text-muted:        var(--gray-600);
  --text-faint:        var(--gray-400);
  --text-on-accent:    var(--gray-0);

  /* Borders */
  --border:            var(--gray-200);
  --border-strong:     var(--gray-300);

  /* Accent + states */
  --accent:            var(--oak-500);
  --accent-subtle:     var(--oak-100);
  --danger:            var(--red-500);
  --warn:              var(--amber-500);
  --ok:                var(--green-500);
  --info:              var(--blue-500);
  --focus-ring:        var(--oak-300);

  /* Viewport overlays — UI only; wood is never themed */
  --vp-bg:             #f4f1ec;
  --vp-grid-major:     rgba(0,0,0,0.12);
  --vp-grid-minor:     rgba(0,0,0,0.05);
  --vp-selection:      #2563a8;
  --vp-hover:          rgba(37,99,168,0.35);
  --vp-collision:      #d63b2f;
  --vp-joint-hi:       #c27d18;
  --vp-ghost:          rgba(37,99,168,0.18);
  --vp-measure:        #2e7d52;
}

[data-theme="dark"] {
  --surface:           var(--gray-900);
  --surface-raised:    var(--gray-800);
  --surface-sunken:    var(--gray-950);
  --surface-overlay:   var(--gray-800);
  --text:              var(--gray-50);
  --text-muted:        var(--gray-400);
  --text-faint:        var(--gray-600);
  --text-on-accent:    var(--gray-0);
  --border:            var(--gray-700);
  --border-strong:     var(--gray-600);
  --accent:            var(--oak-300);
  --accent-subtle:     rgba(155,100,50,0.18);
  --danger:            #e05a50;
  --warn:              #d4943a;
  --ok:                #4caf7d;
  --info:              #4d8fd4;
  --focus-ring:        var(--oak-300);
  --vp-bg:             #1c1a17;
  --vp-grid-major:     rgba(255,255,255,0.10);
  --vp-grid-minor:     rgba(255,255,255,0.04);
  --vp-selection:      #4d8fd4;
  --vp-hover:          rgba(77,143,212,0.30);
  --vp-collision:      #e05a50;
  --vp-joint-hi:       #d4943a;
  --vp-ghost:          rgba(77,143,212,0.15);
  --vp-measure:        #4caf7d;
}
```

**Layer 3 — component tokens** (sparingly, only where an override knob is needed):
```css
--inspector-width: 300px;
--rail-width: 48px;
--status-height: 28px;
--topbar-height: 40px;
--btn-height-comfortable: 32px;
--btn-height-shop: 44px;     /* shop density mode */
--text-base-comfortable: var(--text-base);   /* 14px */
--text-base-shop: var(--text-md);            /* 16px */
--row-height-comfortable: 40px;
--row-height-shop: 52px;
```

### 20.2 Theming mechanics

`data-theme` on `<html>` remaps Layer 2 only. Theme setting values: `"system" | "light" | "dark"`. System mode adds a `matchMedia('(prefers-color-scheme: dark)')` listener and updates `data-theme` on change. Because components only consume Layer 2, any future theme (high-contrast, sepia, a Canterbury-green brand variant) is one CSS override block.

Density mode adds `data-density="comfortable | shop"` on `<html>`. Shop mode bumps text, hit targets, and row heights via Layer 3 overrides — no component changes required.

### 20.3 The viewport bridge

three.js does not read CSS. `syncViewportTheme()` runs on load and on any theme or density change:

```ts
function syncViewportTheme(scene: ThreeScene) {
  const s = getComputedStyle(document.documentElement)
  const get = (v: string) => s.getPropertyValue(v).trim()

  scene.background.set(get('--vp-bg'))
  gridMajor.material.color.set(get('--vp-grid-major'))
  gridMinor.material.color.set(get('--vp-grid-minor'))
  selectionOutline.color.set(get('--vp-selection'))
  hoverMaterial.color.set(get('--vp-hover'))
  collisionMaterial.color.set(get('--vp-collision'))
  jointHighlight.color.set(get('--vp-joint-hi'))
  ghostMaterial.color.set(get('--vp-ghost'))
  measureLine.color.set(get('--vp-measure'))
}
```

One token file drives DOM and WebGL. Toggle dark mode — the viewport follows in the same frame. Wood textures and species colors are physical and **never themed**; only UI overlay materials respond to `syncViewportTheme`.

Viewport background note: dark mode `--vp-bg` is warm near-black (`#1c1a17`) not pure black — pure black destroys depth perception on dark walnut and ebony renders. Light mode `--vp-bg` is warm off-white (`#f4f1ec`), not pure white — pure white blows out pale maple and birch.

### 20.4 Implementation stack

- **Tailwind v4** — CSS-first config; `@theme` block defines Layer 1 primitives as Tailwind design tokens, so utility classes and custom properties share one source of truth. No JS config file.
- **Radix UI primitives** — Dialog, Popover, DropdownMenu, ContextMenu, Slider, Select, Checkbox, Tooltip. Keyboard navigation, focus management, and ARIA handled by the library; zero styling opinions. Styled entirely via Layer 2 custom properties.
- **Lucide React** — icon set; consistent 1.5px stroke weight.
- **Thin shared component set** in `packages/web/src/ui/`: `Button`, `Field` (fractional-inch input with unit parsing), `Inspector` (context-switching right panel), `Sheet` (bottom drawer for mobile), `CommandPalette` (Radix Dialog + registry filter + fuzzy match). No third-party component library to skin or fight.

### 20.5 Settings surface

All settings stored server-side (`settings` table, §9) with `localStorage` mirror — phone and shop PC must agree without an explicit sync action.

| Key | Type | Default | Note |
|---|---|---|---|
| `theme` | `system\|light\|dark` | `system` | `data-theme` on `<html>` |
| `density` | `comfortable\|shop` | `comfortable` | `data-density` on `<html>` |
| `fraction_precision` | `16\|32\|64` | `16` | Denominator for fractional display |
| `snap_grid` | `0.0625\|0.03125\|0` | `0.0625` | 1/16, 1/32, off |
| `default_species` | species id | `spc_red_oak` | Pre-fills Add Board dialog |
| `viewport_shadows` | bool | `true` | Off = integrated-GPU escape hatch |
| `waste_factor_solid` | float | `0.20` | Cut list default |
| `waste_factor_sheet` | float | `0.10` | Cut list default |
| `labor_rate` | float\|null | `null` | $/hr; null = not set, bid engine prompts |
| `default_deposit_pct` | float\|null | `50.0` | Pre-fills new bid |

Settings screen route: `/settings`. Sections: Appearance (theme, density) · Designer (fraction precision, snap, default species, shadows) · Business (labor rate, waste factors, default deposit). Keyboard remaps: listed as v2 (registry makes it trivial; defer until the command set is stable).

---

## 21. 3D print export

### 21.1 Purpose

Scaled physical mockups for client presentations and design validation. A 1:12 merged model of a hall table fits a standard FDM bed, prints in ~30 minutes, and communicates proportion to a client more directly than any render. A 1:4 parts kit shows joinery geometry and can be assembled.

### 21.2 Format decision: 3MF only, no STL

STL is explicitly discouraged by the `manifold-3d` package authors: it is lossy (topology not preserved, re-imported mesh may not be manifold), inefficient, and unitless. 3MF was designed from the start for manifold meshes representing solid objects, carries units and scale natively, and is accepted by every modern slicer (PrusaSlicer, Orca, Bambu Studio, Cura, Chitubox). 3MF is the only output format.

### 21.3 Export modes

**Merged** (`mode: "merged"`): all board solids after joint evaluation unioned into a single object. `Manifold.union(allSolids)`. Prints as one piece. Shows overall proportion and the exterior appearance of joints (through tenons, box joint fingers) but not hidden interior joinery. Recommended scale: 1:12. No thin-feature risk — internal voids are merged away.

**Parts kit** (`mode: "parts"`): each board exported as a separate mesh item within a single 3MF file. Shows all joinery geometry including mortise pockets and tenon geometry. Slicers read multi-part 3MF natively and can arrange parts on the plate automatically. Thin-feature validation required before export (see §21.5). Recommended scale: 1:4 or larger.

### 21.4 Scale reference

All boards are stored in decimal inches. Export applies a uniform scale factor (`scale_factor = 25.4 / ratio`, converting inches → mm at the target ratio) before serialization. 3MF embeds the unit as millimeters natively.

| Scale | 3/4" board (mm) | 1/4" tenon (mm) | FDM verdict | Resin verdict |
|---|---|---|---|---|
| 1:12 | 1.6 | 0.5 | Merged only | Parts marginal |
| 1:8 | 2.4 | 0.8 | Merged only | Parts marginal |
| 1:6 | 3.2 | 1.1 | Merged only | Parts marginal |
| 1:4 | 4.8 | 1.6 | Parts OK (tight) | Parts solid |
| 1:3 | 6.4 | 2.1 | Parts solid | Parts solid |

### 21.5 Thin-feature validation

```ts
// Runs in core — pure function, no IO
function validateForPrint(
  model: ModelDoc,
  solids: Map<string, Manifold>,
  scale: number,
  printer: "fdm" | "resin"
): { ok: boolean; warnings: ThinFeatureWarning[] }

interface ThinFeatureWarning {
  board_id: string
  board_name: string
  feature: string          // e.g. "tenon cheek", "mortise wall"
  thickness_mm: number
  min_wall_mm: number      // 1.2 FDM / 0.5 resin
}
```

Minimum wall thicknesses: FDM 1.2mm (2 × 0.4mm perimeters), resin 0.5mm. Features checked: tenon thickness × scale, tenon cheek wall (stock − tenon thickness) × scale, mortise side wall × scale, dado depth × scale. Derived from joint params in `core` — no mesh measurement required, which makes this fast and exact.

Validation runs server-side on every export request. Response includes warnings even when `ok: true` (marginal features) so the user can decide. The export UI shows warnings before download with a suggested minimum scale.

### 21.6 Library

`@jscadui/3mf-export` (npm, MIT, actively maintained). Accepts mesh data and produces a ZIP-based 3MF; uses `fflate` for compression. Runs in both browser and Node — consistent with the `core`/isomorphic pattern. The `three-3mf-exporter` package is an alternative when exporting directly from the three.js scene (client-side only), and supports embedded Bambu/Prusa print-settings metadata — worth using if the export UI moves to a client-side download rather than a server route, because the metadata replaces the slicer-notes text file entirely.

Serialization pipeline (server route, also callable from `core` in the browser worker for client-side download):

```ts
import { serialize3MF } from '@jscadui/3mf-export'

function exportModel(model: ModelDoc, solids: Map<string, Manifold>, opts: ExportOpts): Uint8Array {
  const scaleFactor = 25.4 / opts.ratio           // inches → mm

  const meshes = opts.mode === 'merged'
    ? [{ name: model.name, mesh: scaledMesh(Manifold.union([...solids.values()]), scaleFactor) }]
    : [...solids.entries()].map(([id, solid]) => ({
        name: model.boards.find(b => b.id === id)!.name,
        mesh: scaledMesh(solid, scaleFactor)
      }))

  return serialize3MF({ unit: 'millimeter', meshes, slicerNotes: buildSlicerNotes(model, opts) })
}
```

`getMesh()` returns `{ vertProperties: Float32Array, triVerts: Uint32Array }` — standard indexed triangle format mapping directly to 3MF's `<vertices>` / `<triangles>` XML elements.

### 21.7 Slicer notes

Embedded as a `<metadata name="slicernotes">` element in the 3MF XML — surfaces in slicer UIs that show model metadata (Bambu Studio, PrusaSlicer). Content:

```
Tenon export — [model name]
Scale: 1:[ratio] | Mode: merged/parts | Generated: [date]
Printer type: FDM / Resin

Recommended settings (FDM):
  Layer height:  0.15mm (merged) / 0.10mm (parts)
  Infill:        15% (merged) / 30% (parts)
  Supports:      [yes/no — derived from worst overhang angle across all meshes]
  Est. volume:   [total cm³ from Manifold.volume() × scale³]

Thin feature warnings: [count or "none"]
  [list if any]
```

Overhang detection: iterate face normals from `getMesh()`, flag any face whose Y-component (world up) < cos(45°). Approximate but sufficient for support guidance.

### 21.8 REST route and MCP tool

**REST**: `GET /api/models/:id/export?scale=12&mode=merged&printer=fdm`
- Runs evaluator (already available in Node)
- Runs `validateForPrint`
- Runs serializer
- Returns `Content-Type: model/3mf`, `Content-Disposition: attachment; filename="[model]-1-[scale].3mf"`
- On thin-feature warnings: still returns the file; includes `X-Tenon-Warnings: [JSON array]` header so the UI can surface them after download

**MCP tool** `export_print_model`:
- Params: `model_id`, `scale` (number, e.g. 12 for 1:12), `mode` (`"merged"` | `"parts"`), `printer` (`"fdm"` | `"resin"`, default `"fdm"`)
- Returns: `{ download_url, scale, mode, volume_cm3, thin_feature_warnings[], slicer_notes_summary }`
- Natural end-of-session tool: Claude reviews a model via `render_view`, makes any final edits, then calls `export_print_model` to produce a file ready for the slicer — entire design-to-printable loop without leaving chat

### 21.9 Export UI

A modal accessible from the cut list panel (share icon) and from the model's `⋯` menu:

```
┌─ Export for 3D Printing ───────────────────────────────┐
│                                                         │
│  Scale       [1:12 ▾]   custom: [   ]                  │
│  Mode        ● Merged (one piece)                       │
│              ○ Parts kit (individual boards)            │
│  Printer     ● FDM  ○ Resin                             │
│                                                         │
│  ⚠ 2 thin features at this scale                       │
│    • left tenon cheek: 0.8mm (min 1.2mm)               │
│    • right tenon cheek: 0.8mm (min 1.2mm)              │
│    Suggested minimum scale for parts: 1:4               │
│                                                         │
│  Est. print volume: 4.2 cm³                             │
│                                                         │
│           [Cancel]  [Download 3MF]                      │
└─────────────────────────────────────────────────────────┘
```

Warnings update live on scale/mode/printer change (client-side `validateForPrint` in the geometry worker — no server round-trip for validation, only for the actual file download).

### 21.10 Effort

~1–2 weekends. No new geometry kernel work — the evaluator already produces the solids. The entire feature is output formatting, validation math against joint params, and one new UI modal. Chunk 16.5 in §15.
