import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { makeBoardId, type Board } from '@tenon/core'
import { useModelStore } from '../lib/modelStore.js'
import { useSpecies } from '../lib/speciesApi.js'
import { InchInput } from './InchInput.js'

// §19.2 — Add Board is numeric-first: dims + species (defaulting to last-used),
// then the board is placed at the origin (snapping/ghost placement is chunk 8).
export function AddBoardDialog({
  open,
  onClose,
  defaultSpecies,
  precision,
}: {
  open: boolean
  onClose: () => void
  defaultSpecies: string
  precision: number
}) {
  const species = useSpecies()
  const [name, setName] = useState('')
  const [l, setL] = useState(24)
  const [w, setW] = useState(5.5)
  const [t, setT] = useState(0.75)
  const [speciesId, setSpeciesId] = useState(defaultSpecies)

  // Reset to defaults each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName('')
      setSpeciesId(defaultSpecies)
    }
  }, [open, defaultSpecies])

  const submit = () => {
    const board: Board = {
      id: makeBoardId(),
      name: name.trim() || 'Board',
      kind: 'board',
      dims: { l, w, t },
      species: speciesId,
      grain: 'x',
      transform: { pos: [0, w / 2, 0], rot: [0, 0, 0] },
      qty: 1,
      tags: [],
      locked: false,
      glue_up: null,
      edge_grooves: [],
    }
    void useModelStore.getState().addBoard(board)
    useModelStore.getState().requestView('iso')
    onClose()
  }

  const labelStyle = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 70 } as const

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
        />
        <Dialog.Content
          aria-label="Add board"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'BUTTON') submit()
          }}
          style={{
            position: 'fixed',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 360,
            background: 'var(--surface-overlay)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-l)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            zIndex: 201,
            padding: 'var(--sp-6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
            <Dialog.Title style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Add Board
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <label style={labelStyle}>Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Board"
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
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <label style={labelStyle}>Size</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <InchInput value={l} onCommit={setL} precision={precision} positive style={{ width: 56 }} />
                <span style={{ color: 'var(--text-faint)' }}>×</span>
                <InchInput value={w} onCommit={setW} precision={precision} positive style={{ width: 56 }} />
                <span style={{ color: 'var(--text-faint)' }}>×</span>
                <InchInput value={t} onCommit={setT} precision={precision} positive style={{ width: 56 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <span style={labelStyle} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>length × width × thickness</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <label style={labelStyle}>Species</label>
              <select
                value={speciesId}
                onChange={(e) => setSpeciesId(e.target.value)}
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
                {species.length === 0 && <option value={speciesId}>{speciesId}</option>}
                {species.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.common_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-6)' }}>
            <button
              onClick={onClose}
              style={{
                height: 'var(--btn-height-comfortable)',
                padding: '0 var(--sp-4)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-s)',
                background: 'var(--surface)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              style={{
                height: 'var(--btn-height-comfortable)',
                padding: '0 var(--sp-4)',
                border: 'none',
                borderRadius: 'var(--radius-s)',
                background: 'var(--accent)',
                color: 'var(--text-on-accent)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              Add Board
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
