import type { Settings } from './api.js'
import type { ViewportScene } from './syncViewportTheme.js'

// §19.1 — Every user action is a registered command. UI surfaces are renderers
// over registry.filtered(ctx). Designer-only fields (selection/mode/scene) are
// populated while the viewport is mounted and inert elsewhere; command run()
// implementations read live state from the model store, so these exist mainly
// for `when` predicates (e.g. "join requires two boards selected").
export interface AppCtx {
  navigate: (to: string) => void
  settings: Settings | null
  updateSettings: (patch: Partial<Settings>) => void
  selection: string[]
  mode: 'select' | 'add' | 'measure'
  scene: ViewportScene | null
}

// Right-click hit targets (§19.3). A command tagged with a context appears in the
// context menu for that target; the palette ignores `contexts` entirely. Joint
// targets arrive once joints are clickable (ch.9/11).
export type CommandContext = 'board' | 'multi' | 'empty'

export interface Command {
  id: string
  label: string
  icon?: string        // lucide icon name
  shortcut?: string    // display string, e.g. "B", "⌘K"
  group?: string       // palette section header
  contexts?: CommandContext[] // right-click menu targets this command shows under
  when?: (ctx: AppCtx) => boolean
  run: (ctx: AppCtx) => void | Promise<void>
}

export class CommandRegistry {
  private cmds = new Map<string, Command>()

  register(cmd: Command): void {
    this.cmds.set(cmd.id, cmd)
  }

  execute(id: string, ctx: AppCtx): void {
    this.cmds.get(id)?.run(ctx)
  }

  filtered(ctx: AppCtx, query?: string): Command[] {
    const all = [...this.cmds.values()].filter(c => !c.when || c.when(ctx))
    if (!query?.trim()) return all
    const q = query.toLowerCase()
    return all.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.group?.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    )
  }

  // Curated set for the right-click context menu: commands tagged for this hit
  // target whose `when` predicate also passes (§19.3).
  forContext(target: CommandContext, ctx: AppCtx): Command[] {
    return [...this.cmds.values()].filter(
      c => c.contexts?.includes(target) && (!c.when || c.when(ctx)),
    )
  }
}

export const registry = new CommandRegistry()

// Register all built-in commands once at module load.
// Viewport/selection commands are stubs here — chunk 7 overwrites them.
const navCmd = (id: string, label: string, path: string, icon: string, group = 'Navigate') =>
  registry.register({ id, label, icon, group, run: ctx => ctx.navigate(path) })

navCmd('nav_jobs',     'Jobs',      '/jobs',     'Briefcase')
navCmd('nav_models',   'Models',    '/models',   'Box')
navCmd('nav_settings', 'Settings',  '/settings', 'Settings')

registry.register({
  id: 'new_job',
  label: 'New Job',
  icon: 'Plus',
  shortcut: '',
  group: 'Jobs',
  run: ctx => ctx.navigate('/jobs?new=1'),
})

registry.register({
  id: 'toggle_theme',
  label: 'Toggle Dark / Light Mode',
  icon: 'Moon',
  group: 'Settings',
  run: ctx => {
    const next = ctx.settings?.theme === 'dark' ? 'light' : 'dark'
    ctx.updateSettings({ theme: next })
  },
})

registry.register({
  id: 'toggle_density',
  label: 'Toggle Shop Mode',
  icon: 'Hammer',
  group: 'Settings',
  run: ctx => {
    const next = ctx.settings?.density === 'shop' ? 'comfortable' : 'shop'
    ctx.updateSettings({ density: next })
  },
})

// Viewport / modeling — stubs; chunk 7 registers real implementations
for (const [id, label, icon, shortcut] of [
  ['select',    'Select Tool',   'MousePointer2', 'V'],
  ['add_board', 'Add Board',     'Plus',          'B'],
  ['measure',   'Measure',       'Ruler',         'M'],
  ['undo',      'Undo',          'Undo2',         '⌘Z'],
  ['redo',      'Redo',          'Redo2',         '⌘⇧Z'],
  ['joint',     'Add Joint…',    'Link',          'J'],
] as const) {
  registry.register({ id, label, icon, shortcut, group: id === 'undo' || id === 'redo' ? 'Edit' : 'Tools', run: () => {} })
}

for (const [id, label, icon] of [
  ['toggle_outliner', 'Toggle Outliner',    'Layers'],
  ['toggle_lint',     'Toggle Lint Panel',  'AlertTriangle'],
  ['toggle_cutlist',  'Toggle Cut List',    'List'],
  ['view_iso',        'Isometric View',     'Box'],
  ['view_front',      'Front View',         'Square'],
  ['view_top',        'Top View',           'Square'],
] as const) {
  registry.register({ id, label, icon, group: 'View', run: () => {} })
}
