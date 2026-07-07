// §6.1 golden suite — per joint type, snapshot the carved volume + local bounding box +
// triangle count of each board. These catch SILENT manifold-3d output drift on a kernel
// upgrade (§16.5: no manifold-3d bump merges without a deliberate `-u` regenerate here).
// Unlike the property suite (which checks analytic targets), this pins the exact kernel
// tessellation, so a change in triangle count or vertex positions trips it.
import { describe, it, expect } from 'vitest'
import { evaluate } from '../evaluate.js'
import type { JointType } from '../../joint.js'
import type { Board } from '../../board.js'
import { board, jointModel, meshVolume, meshBBox, triCount } from './fixtures.js'

interface Golden {
  name: JointType
  label?: string // distinguishes multiple fixtures of one joint type
  a: Board
  b: Board
  params?: Record<string, unknown>
}

const GOLDENS: Golden[] = [
  {
    name: 'butt',
    a: board({ id: 'brd_a', l: 6, w: 2, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 6, w: 2, t: 0.75, pos: [6, 0, 0] }),
  },
  {
    name: 'housing',
    a: board({ id: 'brd_a', l: 24, w: 12, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 10, w: 12, t: 0.75, pos: [0, 0, 5.125], rot: [0, 90, 0] }),
  },
  {
    name: 'rabbet',
    a: board({ id: 'brd_a', l: 24, w: 6, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 24, w: 3, t: 0.5, pos: [0, 3.0, 0.5], rot: [90, 0, 0] }),
  },
  {
    name: 'half_lap',
    a: board({ id: 'brd_a', l: 12, w: 2, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 12, w: 2, t: 0.75, pos: [0, 0, 0], rot: [0, 0, 90] }),
  },
  {
    name: 'bridle',
    a: board({ id: 'brd_a', l: 6, w: 2, t: 1, pos: [-3, 0, 0] }),
    b: board({ id: 'brd_b', l: 6, w: 2, t: 1, pos: [2.5, 0, 0] }),
  },
  {
    name: 'mortise_tenon',
    a: board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] }),
  },
  // ── chunk 12 (docs/chunk12-design.md): the frustum carves are new kernel surface ──
  {
    name: 'mortise_tenon',
    label: 'mortise_tenon (square haunch, grooved stile)',
    a: board({
      id: 'brd_a', l: 24, w: 2.5, t: 0.75, pos: [0, 0, 0],
      edge_grooves: [{ id: 'egv_panel', edge: 'top', depth: 0.375, width: 0.25, offset: 0 }],
    }),
    b: board({ id: 'brd_b', l: 6, w: 3, t: 0.75, pos: [10.5, 3, 0], rot: [0, 0, 90] }),
    params: { haunch: 'square' },
  },
  {
    name: 'mortise_tenon',
    label: 'mortise_tenon (sloped haunch)',
    a: board({
      id: 'brd_a', l: 24, w: 2.5, t: 0.75, pos: [0, 0, 0],
      edge_grooves: [{ id: 'egv_panel', edge: 'top', depth: 0.375, width: 0.25, offset: 0 }],
    }),
    b: board({ id: 'brd_b', l: 6, w: 3, t: 0.75, pos: [10.5, 3, 0], rot: [0, 0, 90] }),
    params: { haunch: 'sloped' },
  },
  {
    name: 'mortise_tenon',
    label: 'mortise_tenon (wedged twin through)',
    a: board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] }),
    params: { wedged: true, twin: true },
  },
]

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6

describe('joint golden carves (kernel-drift canary)', () => {
  for (const g of GOLDENS) {
    it(`${g.label ?? g.name}`, async () => {
      const { boards } = await evaluate(jointModel(g.a, g.b, g.name, g.params))
      const snap = boards.map(({ id, mesh }) => ({
        id,
        volume: round6(meshVolume(mesh.positions)),
        bbox: meshBBox(mesh),
        tris: triCount(mesh),
      }))
      expect(snap).toMatchSnapshot()
    })
  }
})
