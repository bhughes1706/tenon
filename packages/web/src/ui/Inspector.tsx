import { Trash2, Lock, Unlock } from 'lucide-react'
import type { Board, Op } from '@tenon/core'
import { useModelStore } from '../lib/modelStore.js'
import { useSpecies } from '../lib/speciesApi.js'
import { InchInput } from './InchInput.js'

const sectionLabel = {
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-faint)',
  marginBottom: 'var(--sp-2)',
} as const

const fieldLabel = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 64 } as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
      <div style={sectionLabel}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>{children}</div>
    </div>
  )
}

function DegInput({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  return (
    <input
      type="number"
      step={15}
      defaultValue={value}
      key={value}
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        e.stopPropagation()
      }}
      onBlur={(e) => {
        const n = parseFloat(e.target.value)
        if (Number.isFinite(n) && n !== value) onCommit(n)
        else e.target.value = String(value)
      }}
      style={{
        width: 56,
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-s)',
        padding: '3px var(--sp-2)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'inherit',
      }}
    />
  )
}

function BoardInspector({ board, precision }: { board: Board; precision: number }) {
  const species = useSpecies()
  const dispatch = useModelStore((s) => s.dispatch)
  const removeSelected = useModelStore((s) => s.removeSelected)
  const locked = board.locked

  type BoardPatch = Extract<Op, { op: 'update_board' }>['patch']
  const patch = (p: BoardPatch) =>
    void dispatch([{ op: 'update_board', id: board.id, patch: p }])
  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const pos = [...board.transform.pos] as [number, number, number]
    pos[axis] = v
    void dispatch([{ op: 'transform_board', id: board.id, pos }])
  }
  const setRot = (axis: 0 | 1 | 2, v: number) => {
    const rot = [...board.transform.rot] as [number, number, number]
    rot[axis] = v
    void dispatch([{ op: 'transform_board', id: board.id, rot }])
  }

  return (
    <>
      <Section title="Board">
        <input
          key={board.id + board.name}
          defaultValue={board.name}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            e.stopPropagation()
          }}
          onBlur={(e) => {
            if (e.target.value !== board.name) patch({ name: e.target.value })
          }}
          style={{
            width: '100%',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-s)',
            padding: '4px var(--sp-2)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text)',
            fontFamily: 'inherit',
          }}
        />
      </Section>

      <Section title="Dimensions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={fieldLabel}>L × W × T</span>
          <InchInput value={board.dims.l} onCommit={(v) => patch({ dims: { ...board.dims, l: v } })} precision={precision} positive disabled={locked} style={{ width: 52 }} />
          <InchInput value={board.dims.w} onCommit={(v) => patch({ dims: { ...board.dims, w: v } })} precision={precision} positive disabled={locked} style={{ width: 52 }} />
          <InchInput value={board.dims.t} onCommit={(v) => patch({ dims: { ...board.dims, t: v } })} precision={precision} positive disabled={locked} style={{ width: 52 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={fieldLabel}>Species</span>
          <select
            value={board.species}
            disabled={locked}
            onChange={(e) => patch({ species: e.target.value })}
            style={{
              flex: 1,
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-s)',
              padding: '3px var(--sp-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text)',
              fontFamily: 'inherit',
            }}
          >
            {!species.some((s) => s.id === board.species) && <option value={board.species}>{board.species}</option>}
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.common_name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Transform">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={fieldLabel}>Pos</span>
          <InchInput value={board.transform.pos[0]} onCommit={(v) => setPos(0, v)} precision={precision} disabled={locked} style={{ width: 52 }} />
          <InchInput value={board.transform.pos[1]} onCommit={(v) => setPos(1, v)} precision={precision} disabled={locked} style={{ width: 52 }} />
          <InchInput value={board.transform.pos[2]} onCommit={(v) => setPos(2, v)} precision={precision} disabled={locked} style={{ width: 52 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={fieldLabel}>Rot°</span>
          <DegInput value={board.transform.rot[0]} onCommit={(v) => setRot(0, v)} disabled={locked} />
          <DegInput value={board.transform.rot[1]} onCommit={(v) => setRot(1, v)} disabled={locked} />
          <DegInput value={board.transform.rot[2]} onCommit={(v) => setRot(2, v)} disabled={locked} />
        </div>
      </Section>

      <Section title="Actions">
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            onClick={() => patch({ locked: !locked })}
            style={actionBtn(locked)}
            title={locked ? 'Unlock' : 'Lock'}
          >
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
            {locked ? 'Locked' : 'Lock'}
          </button>
          <button onClick={() => void removeSelected()} style={actionBtn(false, true)} title="Delete (⌫)">
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </Section>
    </>
  )
}

function actionBtn(active: boolean, danger = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 'var(--btn-height-comfortable)',
    padding: '0 var(--sp-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-s)',
    background: active ? 'var(--accent-subtle)' : 'var(--surface)',
    color: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
  }
}

export function Inspector({ precision }: { precision: number }) {
  const model = useModelStore((s) => s.model)
  const selection = useModelStore((s) => s.selection)
  const removeSelected = useModelStore((s) => s.removeSelected)

  const selectedBoards = model?.boards.filter((b) => selection.includes(b.id)) ?? []

  if (selectedBoards.length === 1) {
    return <BoardInspector board={selectedBoards[0]} precision={precision} />
  }

  if (selectedBoards.length > 1) {
    return (
      <Section title={`${selectedBoards.length} boards selected`}>
        <button onClick={() => void removeSelected()} style={actionBtn(false, true)}>
          <Trash2 size={13} />
          Delete {selectedBoards.length}
        </button>
      </Section>
    )
  }

  return (
    <Section title="Model">
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{model?.name ?? '—'}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
        {model ? `${model.boards.length} boards · ${model.joints.length} joints` : 'Loading…'}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 'var(--sp-2)' }}>
        Select a board to edit, or press <b>B</b> to add one.
      </div>
    </Section>
  )
}
