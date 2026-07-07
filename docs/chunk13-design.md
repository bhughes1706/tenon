# Chunk 13 — `apply_model_ops` / `get_model` / `validate_model` MCP + "errors must teach"

**Spec:** §15 row 13 — *"`apply_model_ops`, `get_model`, `validate_model` MCP + 'errors
must teach' pass. Why: rejection messages determine whether the Claude edit loop
converges."* Tagged Opus 4.8 implement + **Fable 5 error-quality pass**.

## What was already done (pulled forward into chunk 11)

The three MCP tools this chunk names — `apply_model_ops`, `get_model`, `validate_model`
(plus `create_model`, `list_models`, `get_cutlist`, `render_view`) — shipped in **chunk 11**
as thin adapters over `lib/modelService.ts`. See the chunk-11 handoff section. They are
tested (`modelService.test.ts`, 11 cases). So the *remaining* deliverable of chunk 13 was
the **error-quality pass** — the Fable-tagged part.

## The pass — make every op rejection teach the caller how to recover

Audience: **Claude editing the model over MCP.** The rejection string is the only thing the
edit loop reads to self-correct, so each one must name the bad value **and** the concrete
recovery, not merely state that something is wrong (§11.4).

Surfaces, and what changed:

1. **Step 1 — schema (zod).** `validators.ts formatIssue(issue, raw)` now special-cases the
   discriminated-union `invalid_union_discriminator` (unknown `op`): it echoes the value the
   caller sent and **lists every valid op**, derived from `OpSchema.options` so the list can
   never drift from the union. Other zod issues keep their path-qualified messages (already
   actionable: id-prefix, enum, unrecognized-key, `dims.l: Number must be greater than 0`).

2. **Step 2 — referential integrity (`checkAndApply`).** This was the terse surface. Every
   "does not exist" now routes through `noBoard/noJoint/noGroup`, which append `known(...)` —
   the ids that **do** exist (capped at 10, else "fetch the model to list their ids"). The
   board variant also teaches the same-batch gotcha: *a board added without an explicit
   `board.id` is server-assigned and invisible to later ops in the batch.* Locked-board,
   duplicate-id, and `transform_board`-needs-pos/rot messages now spell out the fix
   (unlock via `update_board {"locked": false}`, omit the id to auto-assign, etc.).

3. **Step 3 — joint preconditions (`geometry/preconditions.ts`).** **Already teaching** since
   chunk 9 — names both boards, the measured value, the threshold, and the corrective move
   ("Push rail deeper into stile"). Left as the model the other two steps were brought up to.

4. **Rev conflict (`modelService.ts`).** Both the fast pre-check and the CAS-race message now
   say what happened, the current rev, and the recovery ("fetch the model again, reapply,
   retry with expected_rev N"). Kept the `rev conflict` substring the server tests key on.

### Invariants preserved
All existing test substrings were kept (`does not exist`, `is locked`, `already exists`,
`different boards`, `pos or rot`, `rev conflict`, the `ops[i] (op)` prefix) so nothing
regressed; +5 new teaching assertions in `validators.test.ts` (`errors must teach (§11.4)`
block) lock the new behavior. Core stays WASM-free; server bundle still greps 0 manifold.

## Tests
core **191** (+5) · server **27** · web **89** · server dist manifold refs **0**. Rejection
messages were also exercised end-to-end through the built `dist/` (unknown op, missing ref,
locked, a===b, too-far joint) and read correctly.

## Not in scope
Bid engine is **not** chunk 13 (that's §15 row 16 — "Phase 4"). The AGENT_HANDOFF "What is
NOT built" table had drifted and listed bids as 13; corrected in this pass. §15 governs.
