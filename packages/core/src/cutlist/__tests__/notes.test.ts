import { describe, it, expect } from 'vitest'
import type { Board, Joint, Model } from '../../index.js'
import { machiningNotes } from '../notes.js'

const board = (over: Partial<Board> & { id: string }): Board =>
  ({
    name: over.id,
    kind: 'board',
    dims: { l: 24, w: 3, t: 0.75 },
    species: 'spc_red_oak',
    grain: 'x',
    transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
    qty: 1,
    tags: [],
    locked: false,
    glue_up: null,
    edge_grooves: [],
    ...over,
  }) as Board

const joint = (type: string, a: string, b: string, params: Record<string, unknown> = {}): Joint =>
  ({ id: `jnt_${type}`, type, a, b, enabled: true, params }) as unknown as Joint

const model = (boards: Board[], joints: Joint[] = []): Model => ({ boards, joints } as unknown as Model)

describe('machiningNotes', () => {
  it('mortise & tenon: through tenon notes on both members', () => {
    const stile = board({ id: 'brd_a', dims: { l: 30, w: 2, t: 1.5 } })
    const rail = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const m = model([stile, rail], [joint('mortise_tenon', 'brd_a', 'brd_b')])
    const notes = machiningNotes(m)
    // thk = 1/3 × 0.75 = 0.25 (snap 1/16); width = 3 − 3/8 − 3/8 = 2.25; through → len = t_a = 1.5
    expect(notes.get('brd_a')).toEqual(['mortise 1/4 × 2-1/4, through'])
    expect(notes.get('brd_b')).toEqual(['tenon 1/4 × 2-1/4 × 1-1/2'])
  })

  it('blind M&T uses the depth param for the tenon length', () => {
    const stile = board({ id: 'brd_a', dims: { l: 30, w: 2, t: 1.5 } })
    const rail = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const m = model([stile, rail], [joint('mortise_tenon', 'brd_a', 'brd_b', { depth: 1 })])
    expect(machiningNotes(m).get('brd_b')).toEqual(['tenon 1/4 × 2-1/4 × 1'])
    expect(machiningNotes(m).get('brd_a')).toEqual(['mortise 1/4 × 2-1/4, 1 deep'])
  })

  it('chunk 12 M&T: haunch (groove-derived depth), wedge, and drawbore notes', () => {
    const stile = board({
      id: 'brd_a',
      dims: { l: 30, w: 2, t: 1.5 },
      edge_grooves: [{ id: 'egv_1', edge: 'top', depth: 0.375, width: 0.25, offset: 0, stopped: false, stop_near: null, stop_far: null }],
    })
    const rail = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const m = model(
      [stile, rail],
      [joint('mortise_tenon', 'brd_a', 'brd_b', { haunch: 'square', haunch_len: 0.75, wedged: true, drawbore: true })],
    )
    const notes = machiningNotes(m)
    // usable width = (3 − 3/8) − 3/4 haunch = 1.875; haunch depth = the stile's groove (3/8).
    expect(notes.get('brd_a')).toEqual([
      'groove 1/4 × 3/8, top',
      'mortise 1/4 × 1-7/8, through',
      'flare mortise exit 1/8 per side for wedges',
      'drill 3/8 drawbore',
    ])
    expect(notes.get('brd_b')).toEqual([
      'tenon 1/4 × 1-7/8 × 1-1/2',
      'square haunch 3/4 × 3/8',
      'saw 2 wedge kerfs, stop 1/2 from shoulder',
      'drill 3/8 drawbore, offset 1/16 toward shoulder',
    ])
  })

  it('chunk 12 M&T: twin splits the usable width into thirds and doubles the notes', () => {
    const stile = board({ id: 'brd_a', dims: { l: 30, w: 2, t: 1.5 } })
    const rail = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const m = model([stile, rail], [joint('mortise_tenon', 'brd_a', 'brd_b', { twin: true })])
    const notes = machiningNotes(m)
    expect(notes.get('brd_a')).toEqual(['mortise 1/4 × 3/4, through ×2'])
    expect(notes.get('brd_b')).toEqual(['tenon 1/4 × 3/4 × 1-1/2 ×2'])
  })

  it('rabbet and dado note the receiving board (a) with width × depth', () => {
    const side = board({ id: 'brd_a', dims: { l: 30, w: 10, t: 0.75 } })
    const back = board({ id: 'brd_b', dims: { l: 30, w: 10, t: 0.5 } })
    const rab = machiningNotes(model([side, back], [joint('rabbet', 'brd_a', 'brd_b')]))
    expect(rab.get('brd_a')).toEqual(['rabbet 1/2 × 3/8']) // width = t_b = 1/2, depth = t_a/2 = 3/8
    const dado = machiningNotes(model([side, back], [joint('housing', 'brd_a', 'brd_b')]))
    expect(dado.get('brd_a')).toEqual(['dado 1/2 × 1/4']) // width = t_b = 1/2, depth = t_a/3 = 1/4
  })

  it('edge grooves are board-level notes', () => {
    const stile = board({
      id: 'brd_a',
      edge_grooves: [{ id: 'egv_1', edge: 'bottom', depth: 0.375, width: 0.25, offset: 0, stopped: false, stop_near: null, stop_far: null }],
    })
    expect(machiningNotes(model([stile])).get('brd_a')).toEqual(['groove 1/4 × 3/8, bottom'])
  })

  it('dowelled butt joint drills both members; duplicates collapse to ×N', () => {
    const a = board({ id: 'brd_a' })
    const b = board({ id: 'brd_b' })
    const notes = machiningNotes(model([a, b], [joint('butt', 'brd_a', 'brd_b', { fastener: 'dowel', dia: 0.375, count: 4 })]))
    expect(notes.get('brd_a')).toEqual(['drill 3/8 dowel ×4'])
    expect(notes.get('brd_b')).toEqual(['drill 3/8 dowel ×4'])
  })

  it('a plain butt joint adds no machining note', () => {
    const a = board({ id: 'brd_a' })
    const b = board({ id: 'brd_b' })
    expect(machiningNotes(model([a, b], [joint('butt', 'brd_a', 'brd_b')])).size).toBe(0)
  })

  it('a rail tenoned on both ends collapses to a single "×2" note', () => {
    const stile1 = board({ id: 'brd_s1', dims: { l: 30, w: 2, t: 1.5 } })
    const stile2 = board({ id: 'brd_s2', dims: { l: 30, w: 2, t: 1.5 } })
    const rail = board({ id: 'brd_r', dims: { l: 20, w: 3, t: 0.75 } })
    const m = model(
      [stile1, stile2, rail],
      [joint('mortise_tenon', 'brd_s1', 'brd_r'), joint('mortise_tenon', 'brd_s2', 'brd_r')],
    )
    expect(machiningNotes(m).get('brd_r')).toEqual(['tenon 1/4 × 2-1/4 × 1-1/2 ×2'])
  })

  it('ignores disabled joints and missing board refs', () => {
    const a = board({ id: 'brd_a', dims: { l: 30, w: 2, t: 1.5 } })
    const b = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const disabled = { ...joint('mortise_tenon', 'brd_a', 'brd_b'), enabled: false } as Joint
    expect(machiningNotes(model([a, b], [disabled])).size).toBe(0)
    expect(machiningNotes(model([a, b], [joint('rabbet', 'brd_a', 'brd_MISSING')])).size).toBe(0)
  })
})
