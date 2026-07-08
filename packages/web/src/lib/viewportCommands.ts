import { registry, type AppCtx } from './registry.js'
import { useModelStore } from './modelStore.js'

// §19.1 — real implementations for the viewport/modeling commands. registry.ts
// registers inert stubs at module load; importing this module (from main.tsx)
// overwrites them by id with store-backed behavior. Designer-only commands gate
// on ctx.scene, which is non-null only while the viewport is mounted.
const inDesigner = (ctx: AppCtx) => ctx.scene !== null

export function registerViewportCommands(): void {
  const store = () => useModelStore.getState()

  // Modes (§19.2). Add Board also serves the empty-space context menu.
  registry.register({ id: 'select', label: 'Select Tool', icon: 'MousePointer2', shortcut: 'V', group: 'Tools', when: inDesigner, run: () => store().setMode('select') })
  registry.register({ id: 'add_board', label: 'Add Board', icon: 'Plus', shortcut: 'B', group: 'Tools', contexts: ['empty'], when: inDesigner, run: () => store().openAddDialog() })
  registry.register({ id: 'measure', label: 'Measure', icon: 'Ruler', shortcut: 'M', group: 'Tools', when: inDesigner, run: () => store().setMode('measure') })
  // Router mode (§3.5): the one modal tool — an edge profile has no second board to
  // select against, so it needs a paint mode. Opens the bit-store panel + arms arris paint.
  registry.register({ id: 'router', label: 'Router / Edge Profiles', icon: 'Spline', shortcut: 'E', group: 'Tools', when: inDesigner, run: () => store().setMode('router') })

  // Edit
  registry.register({ id: 'undo', label: 'Undo', icon: 'Undo2', shortcut: '⌘Z', group: 'Edit', when: inDesigner, run: () => void store().undo() })
  registry.register({ id: 'redo', label: 'Redo', icon: 'Redo2', shortcut: '⌘⇧Z', group: 'Edit', when: inDesigner, run: () => void store().redo() })
  registry.register({
    id: 'delete_selection',
    label: 'Delete',
    icon: 'Trash2',
    shortcut: '⌫',
    group: 'Edit',
    contexts: ['board', 'multi'],
    when: (ctx) => inDesigner(ctx) && ctx.selection.length > 0,
    run: () => void store().removeSelected(),
  })

  registry.register({
    id: 'duplicate',
    label: 'Duplicate',
    icon: 'Copy',
    shortcut: '⌘D',
    group: 'Edit',
    contexts: ['board', 'multi'],
    when: (ctx) => inDesigner(ctx) && ctx.selection.length > 0,
    run: () => void store().duplicateSelected(),
  })

  registry.register({
    id: 'group_selection',
    label: 'Group',
    icon: 'Group',
    shortcut: '⌘G',
    group: 'Edit',
    contexts: ['multi'],
    when: (ctx) => inDesigner(ctx) && ctx.selection.length >= 2,
    run: () => void store().groupSelected(),
  })

  // Joint creation is contextual on two selected boards (§19.2): J / palette /
  // context menu all open the JointDialog on the selected pair.
  registry.register({
    id: 'joint',
    label: 'Add Joint…',
    icon: 'Link',
    shortcut: 'J',
    group: 'Tools',
    contexts: ['multi'],
    when: (ctx) => inDesigner(ctx) && ctx.selection.length === 2,
    run: () => {
      const s = store()
      if (s.selection.length === 2) s.openJointDialog(s.selection[0], s.selection[1])
    },
  })

  // Joint context-menu entries (§19.3 "Joint: … Disable · Delete") — fire on a
  // right-clicked joint face (menuTarget 'joint', selectedJointId set by the pick).
  // "Edit params" needs no entry: the inspector is already showing the selection.
  registry.register({
    id: 'joint_toggle_enabled',
    label: 'Disable / Enable Joint',
    icon: 'Link2Off',
    group: 'Edit',
    contexts: ['joint'],
    when: inDesigner,
    run: () => {
      const s = store()
      if (s.selectedJointId) void s.toggleJointEnabled(s.selectedJointId)
    },
  })
  registry.register({
    id: 'joint_delete',
    label: 'Delete Joint',
    icon: 'Trash2',
    shortcut: '⌫',
    group: 'Edit',
    contexts: ['joint'],
    when: inDesigner,
    run: () => void store().removeSelectedJoint(),
  })

  // Panels (§19.3)
  registry.register({ id: 'toggle_outliner', label: 'Toggle Outliner', icon: 'Layers', group: 'View', when: inDesigner, run: () => store().togglePanel('outliner') })
  registry.register({ id: 'toggle_lint', label: 'Toggle Lint Panel', icon: 'AlertTriangle', group: 'View', when: inDesigner, run: () => store().togglePanel('lint') })
  registry.register({ id: 'toggle_cutlist', label: 'Toggle Cut List', icon: 'List', group: 'View', when: inDesigner, run: () => store().togglePanel('cutlist') })

  // View presets (§19.3). Tagged 'empty' so they form the empty-space menu's View submenu.
  registry.register({ id: 'view_iso', label: 'Isometric View', icon: 'Box', group: 'View', contexts: ['empty'], when: inDesigner, run: () => store().requestView('iso') })
  registry.register({ id: 'view_front', label: 'Front View', icon: 'Square', group: 'View', contexts: ['empty'], when: inDesigner, run: () => store().requestView('front') })
  registry.register({ id: 'view_top', label: 'Top View', icon: 'Square', group: 'View', contexts: ['empty'], when: inDesigner, run: () => store().requestView('top') })
  registry.register({ id: 'view_right', label: 'Right View', icon: 'Square', group: 'View', contexts: ['empty'], when: inDesigner, run: () => store().requestView('right') })

  // Joint visualization (chunk 9 bonus stage). Explode cycles assembled → half → full
  // → assembled so it's reachable from the palette without a slider.
  registry.register({ id: 'toggle_isolate', label: 'Toggle Isolate Selected', icon: 'Focus', group: 'View', when: inDesigner, run: () => store().toggleIsolate() })
  registry.register({ id: 'toggle_joint_highlight', label: 'Toggle Joint Highlight', icon: 'Highlighter', group: 'View', when: inDesigner, run: () => store().toggleHighlightJoints() })
  registry.register({
    id: 'explode',
    label: 'Explode View',
    icon: 'Boxes',
    group: 'View',
    when: inDesigner,
    run: () => {
      const e = store().exploded
      store().setExploded(e === 0 ? 0.5 : e < 1 ? 1 : 0)
    },
  })
}

registerViewportCommands()
