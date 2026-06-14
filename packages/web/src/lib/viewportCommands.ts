import { registry, type AppCtx } from './registry.js'
import { useModelStore } from './modelStore.js'

// §19.1 — real implementations for the viewport/modeling commands. registry.ts
// registers inert stubs at module load; importing this module (from main.tsx)
// overwrites them by id with store-backed behavior. Designer-only commands gate
// on ctx.scene, which is non-null only while the viewport is mounted.
const inDesigner = (ctx: AppCtx) => ctx.scene !== null

export function registerViewportCommands(): void {
  const store = () => useModelStore.getState()

  // Modes (§19.2)
  registry.register({ id: 'select', label: 'Select Tool', icon: 'MousePointer2', shortcut: 'V', group: 'Tools', when: inDesigner, run: () => store().setMode('select') })
  registry.register({ id: 'add_board', label: 'Add Board', icon: 'Plus', shortcut: 'B', group: 'Tools', when: inDesigner, run: () => store().openAddDialog() })
  registry.register({ id: 'measure', label: 'Measure', icon: 'Ruler', shortcut: 'M', group: 'Tools', when: inDesigner, run: () => store().setMode('measure') })

  // Edit
  registry.register({ id: 'undo', label: 'Undo', icon: 'Undo2', shortcut: '⌘Z', group: 'Edit', when: inDesigner, run: () => void store().undo() })
  registry.register({ id: 'redo', label: 'Redo', icon: 'Redo2', shortcut: '⌘⇧Z', group: 'Edit', when: inDesigner, run: () => void store().redo() })
  registry.register({
    id: 'delete_selection',
    label: 'Delete Selected',
    icon: 'Trash2',
    shortcut: '⌫',
    group: 'Edit',
    when: (ctx) => inDesigner(ctx) && ctx.selection.length > 0,
    run: () => void store().removeSelected(),
  })

  // Joint creation is contextual on two selected boards (§19.2); the dialog and
  // resolve flow land in chunk 11 — surface a hint until then.
  registry.register({
    id: 'joint',
    label: 'Add Joint…',
    icon: 'Link',
    shortcut: 'J',
    group: 'Tools',
    when: (ctx) => inDesigner(ctx) && ctx.selection.length === 2,
    run: () => useModelStore.setState({ toast: 'Joint dialog arrives in chunk 11' }),
  })

  // Panels (§19.3)
  registry.register({ id: 'toggle_outliner', label: 'Toggle Outliner', icon: 'Layers', group: 'View', when: inDesigner, run: () => store().togglePanel('outliner') })
  registry.register({ id: 'toggle_lint', label: 'Toggle Lint Panel', icon: 'AlertTriangle', group: 'View', when: inDesigner, run: () => store().togglePanel('lint') })
  registry.register({ id: 'toggle_cutlist', label: 'Toggle Cut List', icon: 'List', group: 'View', when: inDesigner, run: () => store().togglePanel('cutlist') })

  // View presets (§19.3)
  registry.register({ id: 'view_iso', label: 'Isometric View', icon: 'Box', group: 'View', when: inDesigner, run: () => store().requestView('iso') })
  registry.register({ id: 'view_front', label: 'Front View', icon: 'Square', group: 'View', when: inDesigner, run: () => store().requestView('front') })
  registry.register({ id: 'view_top', label: 'Top View', icon: 'Square', group: 'View', when: inDesigner, run: () => store().requestView('top') })
}

registerViewportCommands()
