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

  it('chunk 16 box joint: notes the finger count × pin width on both members', () => {
    // W = min(4, 6) = 4; t_thin = min(0.5, 0.5) = 0.5 → p = 1/2, n = 7 (§2 fixture).
    const front = board({ id: 'brd_a', dims: { l: 18, w: 4, t: 0.5 } })
    const side = board({ id: 'brd_b', dims: { l: 12, w: 6, t: 0.5 } })
    const notes = machiningNotes(model([front, side], [joint('box_joint', 'brd_a', 'brd_b')]))
    expect(notes.get('brd_a')).toEqual(['box joint 7 fingers × 1/2'])
    expect(notes.get('brd_b')).toEqual(['box joint 7 fingers × 1/2'])
  })

  it('chunk 16 through dovetail: sockets on a, tails on b (count + mean tail width)', () => {
    // W = 12, t_b = 3/4, through → ℓ = t_a = 3/4, 1:8 → N = 5, T̄ = 1-1/2 (§4 case side).
    const pinBoard = board({ id: 'brd_a', dims: { l: 18, w: 12, t: 0.75 } })
    const tailBoard = board({ id: 'brd_b', dims: { l: 18, w: 12, t: 0.75 } })
    const notes = machiningNotes(model([pinBoard, tailBoard], [joint('dovetail', 'brd_a', 'brd_b')]))
    expect(notes.get('brd_a')).toEqual(['dovetail sockets: 5 tails 1:8'])
    expect(notes.get('brd_b')).toEqual(['dovetail tails: 5 @ 1-1/2'])
  })

  it('chunk 16 half-blind dovetail: the socket note carries the lap', () => {
    // t_a = 3/4 → default lap = t_a/4 = 3/16.
    const front = board({ id: 'brd_a', dims: { l: 18, w: 3, t: 0.75 } })
    const side = board({ id: 'brd_b', dims: { l: 18, w: 3, t: 0.5 } })
    const notes = machiningNotes(model([front, side], [joint('dovetail', 'brd_a', 'brd_b', { variant: 'half_blind' })]))
    expect(notes.get('brd_a')?.[0]).toMatch(/^dovetail sockets: \d+ tails 1:8, half-blind lap 3\/16$/)
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

  it('edge profiles (§3.5): one note per profile type', () => {
    const mk = (profile: Record<string, unknown>) =>
      machiningNotes(model([board({ id: 'brd_a', edge_profiles: [{ id: 'epf_1', edge: 'top', face: 'front', bit_id: null, ...profile }] } as never)])).get('brd_a')
    expect(mk({ profile: 'roundover', radius: 0.25 })).toEqual(['roundover 1/4R'])
    expect(mk({ profile: 'cove', radius: 0.5 })).toEqual(['cove 1/2R'])
    expect(mk({ profile: 'ogee', radius: 0.25 })).toEqual(['ogee 1/4R'])
    expect(mk({ profile: 'chamfer', width: 0.375 })).toEqual(['chamfer 3/8 (45°)'])
    expect(mk({ profile: 'rabbet', width: 0.375, depth: 0.1875 })).toEqual(['rabbet 3/8 × 3/16'])
    // compound uses the bit's label when present
    expect(mk({ profile: 'compound', label: 'Classical', start: [0.4, 0], segments: [{ kind: 'line', to: [0, 0.4] }] }))
      .toEqual(['Classical'])
  })

  it('the same bit run on two arrises collapses to "×2"', () => {
    const b = board({
      id: 'brd_a',
      edge_profiles: [
        { id: 'epf_1', edge: 'top', face: 'front', bit_id: null, profile: 'roundover', radius: 0.25 },
        { id: 'epf_2', edge: 'bottom', face: 'front', bit_id: null, profile: 'roundover', radius: 0.25 },
      ],
    } as never)
    expect(machiningNotes(model([b])).get('brd_a')).toEqual(['roundover 1/4R ×2'])
  })

  it('ignores disabled joints and missing board refs', () => {
    const a = board({ id: 'brd_a', dims: { l: 30, w: 2, t: 1.5 } })
    const b = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const disabled = { ...joint('mortise_tenon', 'brd_a', 'brd_b'), enabled: false } as Joint
    expect(machiningNotes(model([a, b], [disabled])).size).toBe(0)
    expect(machiningNotes(model([a, b], [joint('rabbet', 'brd_a', 'brd_MISSING')])).size).toBe(0)
  })
})
