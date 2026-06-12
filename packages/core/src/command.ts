// §19.1 Command registry contract — interfaces only; implementation lives in web (chunk 6).
// Ctx is the application context type; kept generic here so core stays isomorphic.

export interface Command<Ctx = unknown> {
  id: string
  label: string
  icon?: string                          // Lucide icon name
  shortcut?: string                      // e.g. "B", "Cmd+K", "Ctrl+Z"
  when?: (ctx: Ctx) => boolean           // palette/toolbar filter; hides if false
  run: (ctx: Ctx) => void | Promise<void>
}

export interface CommandRegistry<Ctx = unknown> {
  register(cmd: Command<Ctx>): void
  unregister(id: string): void
  get(id: string): Command<Ctx> | undefined
  filtered(ctx: Ctx): Command<Ctx>[]     // respects when() predicate
  execute(id: string, ctx: Ctx): Promise<void>
}
