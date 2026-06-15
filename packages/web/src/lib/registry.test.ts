import { describe, it, expect } from 'vitest'
import { CommandRegistry, type AppCtx, type Command } from './registry.js'

function makeCtx(over: Partial<AppCtx> = {}): AppCtx {
  return {
    navigate: () => {},
    settings: null,
    updateSettings: () => {},
    selection: [],
    mode: 'select',
    scene: null,
    ...over,
  }
}

function cmd(over: Partial<Command>): Command {
  return { id: 'test', label: 'Test', run: () => {}, ...over }
}

describe('CommandRegistry.forContext', () => {
  it('returns a board-tagged command for the board target', () => {
    const reg = new CommandRegistry()
    reg.register(cmd({ id: 'board_cmd', contexts: ['board'] }))
    const results = reg.forContext('board', makeCtx())
    expect(results.map((c) => c.id)).toContain('board_cmd')
  })

  it('excludes a board-tagged command for the empty target', () => {
    const reg = new CommandRegistry()
    reg.register(cmd({ id: 'board_cmd', contexts: ['board'] }))
    const results = reg.forContext('empty', makeCtx())
    expect(results.map((c) => c.id)).not.toContain('board_cmd')
  })

  it('excludes a command whose when predicate returns false', () => {
    const reg = new CommandRegistry()
    reg.register(cmd({ id: 'guarded', contexts: ['board'], when: () => false }))
    const results = reg.forContext('board', makeCtx())
    expect(results.map((c) => c.id)).not.toContain('guarded')
  })

  it('excludes a palette-only command (no contexts) from all targets', () => {
    const reg = new CommandRegistry()
    reg.register(cmd({ id: 'palette_only', contexts: undefined }))
    expect(reg.forContext('board', makeCtx()).map((c) => c.id)).not.toContain('palette_only')
    expect(reg.forContext('multi', makeCtx()).map((c) => c.id)).not.toContain('palette_only')
    expect(reg.forContext('empty', makeCtx()).map((c) => c.id)).not.toContain('palette_only')
  })
})
