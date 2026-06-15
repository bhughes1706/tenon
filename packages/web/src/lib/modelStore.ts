import { create } from 'zustand'
import type { Model, Op, OpResult, Warning, Board } from '@tenon/core'
import { makeBoardId, makeGroupId } from '@tenon/core'
import { fetchModel, applyModelOps } from './modelApi.js'
import { applyOpsLocal, invertOps } from './clientOps.js'
// Collision lint is now core (chunk 9): the same analytic pass runs here for instant
// optimistic feedback and on the server, which returns the authoritative warnings in
// OpResult.warnings — adopted on the ok branch below (no flicker, identical code).
import { recomputeWarnings } from '@tenon/core'
import type { ViewportScene } from './syncViewportTheme.js'
import type { CommandContext } from './registry.js'
// Type-only — the value (THREE) never lands in this module's bundle. Carved
// geometries are built in geometryClient, which the store reaches only via a
// dynamic import() inside evaluateGeometry (keeps THREE + the worker out of the
// main jobs/photos bundle).
import type { BufferGeometry } from 'three'

export type ViewportMode = 'select' | 'add' | 'measure'
export type GizmoMode = 'translate' | 'rotate'
export type DesignerPanel = 'outliner' | 'lint' | 'cutlist' | null
export type ViewPreset = 'iso' | 'front' | 'top'

interface UndoEntry {
  forward: Op[]
  inverse: Op[]
}

interface ModelState {
  modelId: string | null
  model: Model | null
  loading: boolean
  saving: boolean
  error: string | null
  toast: string | null

  selection: string[]
  hovered: string | null
  mode: ViewportMode
  gizmoMode: GizmoMode
  panel: DesignerPanel
  warnings: Warning[]
  // Worker-carved board geometries (chunk 9 §5). Boards absent from the map fall
  // back to a flat <boxGeometry> in the viewport while the worker computes.
  meshes: Map<string, BufferGeometry>
  snapGrid: number // inches; 0 = off (§20.5)
  scene: ViewportScene | null
  addDialogOpen: boolean
  // Which hit target the right-click context menu is filtered for (§19.3). Set on
  // right-button pointerdown just before the native contextmenu opens the menu.
  menuTarget: CommandContext | null

  // A view-preset request the Viewport consumes to move the camera. The counter
  // lets the same preset re-fire (e.g. clicking "iso" twice to re-frame).
  viewRequest: { view: ViewPreset; n: number }

  undoStack: UndoEntry[]
  redoStack: UndoEntry[]

  // Actions
  load: (id: string) => Promise<void>
  dispatch: (ops: Op[]) => Promise<boolean>
  undo: () => Promise<void>
  redo: () => Promise<void>

  // Re-run the geometry worker for the current model and adopt the carved meshes.
  // Called by the viewport on every model change; latest-wins, dispose-on-replace.
  evaluateGeometry: () => Promise<void>

  addBoard: (board: Board) => Promise<void>
  removeSelected: () => Promise<void>
  duplicateSelected: () => Promise<void>
  groupSelected: () => Promise<void>
  ungroup: (groupId: string) => Promise<void>

  setSelection: (ids: string[]) => void
  toggleSelection: (id: string, additive: boolean) => void
  clearSelection: () => void
  setHovered: (id: string | null) => void
  setMode: (mode: ViewportMode) => void
  setGizmoMode: (mode: GizmoMode) => void
  setPanel: (panel: DesignerPanel) => void
  togglePanel: (panel: Exclude<DesignerPanel, null>) => void
  requestView: (view: ViewPreset) => void
  setSnapGrid: (grid: number) => void
  setScene: (scene: ViewportScene | null) => void
  openAddDialog: () => void
  closeAddDialog: () => void
  setMenuTarget: (target: CommandContext | null) => void
  dismissToast: () => void
  connectEvents: () => () => void
}

// Monotonic guard so a slow eval that resolves after a newer one started is dropped
// (the geometry worker also coalesces, but an already-sent eval still resolves stale).
let evalSeq = 0

// Free every geometry in a map (dispose-on-replace, §4). Safe because the store is a
// singleton — this is NOT a React effect cleanup, so it dodges the StrictMode trap
// (handoff #12): we only ever dispose geometries that are being replaced or dropped.
function disposeMeshes(meshes: Map<string, BufferGeometry>, keep?: Map<string, BufferGeometry>) {
  for (const [id, g] of meshes) {
    if (!keep || keep.get(id) !== g) g.dispose()
  }
}

export const useModelStore = create<ModelState>((set, get) => {
  // Shared optimistic-apply + post + reconcile. Does not touch undo/redo stacks.
  async function applyAndPost(ops: Op[]): Promise<boolean> {
    const { modelId, model } = get()
    if (!modelId || !model) return false
    const before = model
    const optimistic = applyOpsLocal(before, ops)
    // Instant optimistic lint via the core analytic pass — no server round-trip
    // (§6 step 4). Replaced by the server's authoritative result.warnings on ok.
    set({ model: optimistic, warnings: recomputeWarnings(optimistic), saving: true, error: null })

    let result: OpResult
    try {
      result = await applyModelOps(modelId, before.rev, ops)
    } catch (e) {
      // Network failure — roll back to server truth, drop history (it may be stale).
      const fresh = await fetchModel(modelId).catch(() => before)
      set({
        model: fresh,
        warnings: recomputeWarnings(fresh),
        saving: false,
        error: e instanceof Error ? e.message : 'request failed',
        undoStack: [],
        redoStack: [],
      })
      return false
    }

    if (result.ok) {
      // ok implies the server applied against our rev, so rev === optimistic.rev.
      // The mismatch branch is a safety net for an unexpected server contract change.
      if (result.rev !== optimistic.rev) {
        const fresh = await fetchModel(modelId).catch(() => optimistic)
        set({ model: fresh, warnings: recomputeWarnings(fresh), saving: false })
      } else {
        // Geometry is identical to the optimistic model (same rev — §3.2). Only adopt
        // the server's authoritative warnings; leaving `model` unchanged means the
        // viewport useEffect([model]) does NOT re-trigger a redundant worker carve.
        set({ warnings: result.warnings, saving: false })
      }
      return true
    }

    // Rejected (rev conflict or validation) — resync to server, clear history.
    const fresh = await fetchModel(modelId).catch(() => before)
    set({
      model: fresh,
      warnings: recomputeWarnings(fresh),
      saving: false,
      error: result.errors.join('; ') || 'edit rejected',
      undoStack: [],
      redoStack: [],
    })
    return false
  }

  return {
    modelId: null,
    model: null,
    loading: false,
    saving: false,
    error: null,
    toast: null,
    selection: [],
    hovered: null,
    mode: 'select',
    gizmoMode: 'translate',
    panel: null,
    warnings: [],
    meshes: new Map(),
    snapGrid: 0.0625,
    scene: null,
    addDialogOpen: false,
    menuTarget: null,
    viewRequest: { view: 'iso', n: 0 },
    undoStack: [],
    redoStack: [],

    async load(id) {
      // Bump the eval guard so an in-flight eval for the previous model can't land
      // its meshes after this load, and free the previous model's geometries.
      evalSeq++
      disposeMeshes(get().meshes)
      set({
        modelId: id,
        loading: true,
        error: null,
        selection: [],
        hovered: null,
        undoStack: [],
        redoStack: [],
        warnings: [],
        meshes: new Map(),
      })
      try {
        const model = await fetchModel(id)
        set({ model, warnings: recomputeWarnings(model), loading: false })
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : 'failed to load model' })
      }
    },

    async dispatch(ops) {
      const before = get().model
      if (!before) return false
      const inverse = invertOps(ops, before)
      const ok = await applyAndPost(ops)
      if (ok && inverse.length > 0) {
        set((s) => ({ undoStack: [...s.undoStack, { forward: ops, inverse }], redoStack: [] }))
      }
      return ok
    },

    async undo() {
      const { undoStack } = get()
      const entry = undoStack[undoStack.length - 1]
      if (!entry) return
      const ok = await applyAndPost(entry.inverse)
      if (ok) {
        set((s) => ({
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, entry],
        }))
      }
    },

    async redo() {
      const { redoStack } = get()
      const entry = redoStack[redoStack.length - 1]
      if (!entry) return
      const ok = await applyAndPost(entry.forward)
      if (ok) {
        set((s) => ({
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, entry],
        }))
      }
    },

    async evaluateGeometry() {
      const model = get().model
      if (!model) return
      const seq = ++evalSeq
      const { carve } = await import('./geometryClient.js')
      const result = await carve(model)
      if (!result) return // superseded by the worker's coalescing, or eval failed
      const next = new Map<string, BufferGeometry>()
      for (const b of result.boards) next.set(b.id, b.geometry)
      // A newer evaluateGeometry started while we awaited → our meshes are stale.
      if (seq !== evalSeq) {
        disposeMeshes(next)
        return
      }
      const prev = get().meshes
      set({ meshes: next })
      disposeMeshes(prev, next) // free the geometries we just replaced
    },

    async addBoard(board) {
      const ok = await get().dispatch([{ op: 'add_board', board }])
      if (ok && board.id) set({ selection: [board.id], mode: 'select' })
    },

    async removeSelected() {
      const { selection } = get()
      if (selection.length === 0) return
      const ops: Op[] = selection.map((id) => ({ op: 'remove_board', id }))
      const ok = await get().dispatch(ops)
      if (ok) set({ selection: [] })
    },

    // Duplicate via add_board (not the non-invertible duplicate_board op) with
    // explicit ids so undo/redo stay deterministic. Copies land offset so they
    // don't sit perfectly inside the originals.
    async duplicateSelected() {
      const { selection, model } = get()
      if (!model || selection.length === 0) return
      const OFFSET: [number, number, number] = [2, 0, 2]
      const ops: Op[] = []
      const newIds: string[] = []
      for (const id of selection) {
        const src = model.boards.find((b) => b.id === id)
        if (!src) continue
        const newId = makeBoardId()
        newIds.push(newId)
        const board: Board = {
          ...JSON.parse(JSON.stringify(src)),
          id: newId,
          name: `${src.name} copy`,
          locked: false,
          transform: {
            pos: [
              src.transform.pos[0] + OFFSET[0],
              src.transform.pos[1] + OFFSET[1],
              src.transform.pos[2] + OFFSET[2],
            ],
            rot: src.transform.rot,
          },
        }
        ops.push({ op: 'add_board', board })
      }
      if (ops.length === 0) return
      const ok = await get().dispatch(ops)
      if (ok) set({ selection: newIds })
    },

    // Group the current selection. Explicit id keeps the group invertible (§4.1).
    async groupSelected() {
      const { selection } = get()
      if (selection.length < 2) return
      await get().dispatch([{ op: 'group', member_ids: selection, id: makeGroupId() }])
    },

    async ungroup(groupId) {
      await get().dispatch([{ op: 'ungroup', group_id: groupId }])
    },

    setSelection: (ids) => set({ selection: ids }),
    toggleSelection: (id, additive) =>
      set((s) => {
        if (!additive) return { selection: [id] }
        return s.selection.includes(id)
          ? { selection: s.selection.filter((x) => x !== id) }
          : { selection: [...s.selection, id] }
      }),
    clearSelection: () => set({ selection: [] }),
    setHovered: (id) => set({ hovered: id }),
    setMode: (mode) => set({ mode }),
    setGizmoMode: (gizmoMode) => set({ gizmoMode }),
    setPanel: (panel) => set({ panel }),
    togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
    requestView: (view) => set((s) => ({ viewRequest: { view, n: s.viewRequest.n + 1 } })),
    setSnapGrid: (snapGrid) => set({ snapGrid }),
    setScene: (scene) => set({ scene }),
    openAddDialog: () => set({ addDialogOpen: true, mode: 'add' }),
    closeAddDialog: () => set((s) => ({ addDialogOpen: false, mode: s.mode === 'add' ? 'select' : s.mode })),
    setMenuTarget: (menuTarget) => set({ menuTarget }),
    dismissToast: () => set({ toast: null }),

    // Subscribe to server model_changed events. A change we did not originate
    // (rev ahead of ours) refetches and clears local undo history (§3.3).
    connectEvents() {
      const es = new EventSource('/api/events')
      const onModelChanged = (ev: MessageEvent) => {
        const { modelId, model } = get()
        if (!modelId || !model) return
        let data: { id?: string; rev?: number }
        try {
          data = JSON.parse(ev.data)
        } catch {
          return
        }
        if (data.id !== modelId) return
        if (typeof data.rev === 'number' && data.rev === model.rev) return // our own write
        if (get().saving) return // our write is mid-flight; its echo will match
        fetchModel(modelId)
          .then((fresh) =>
            set({
              model: fresh,
              warnings: recomputeWarnings(fresh),
              undoStack: [],
              redoStack: [],
              toast: 'Model updated externally — undo history cleared',
            }),
          )
          .catch(() => {})
      }
      es.addEventListener('model_changed', onModelChanged as EventListener)
      return () => {
        es.removeEventListener('model_changed', onModelChanged as EventListener)
        es.close()
      }
    },
  }
})
