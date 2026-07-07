import { useEffect, useState } from 'react'
import { makeBoardId, type Board } from '@tenon/core'
import { useModelStore } from '../lib/modelStore.js'
import { useSpecies } from '../lib/speciesApi.js'
import { InchInput } from './InchInput.js'
import { Button, DialogShell, FormRow, Select, TextInput } from './kit.js'

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
      panel_fit: null,
    }
    void useModelStore.getState().addBoard(board)
    useModelStore.getState().requestView('iso')
    onClose()
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Add Board"
      width={400}
      top="20%"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'BUTTON') submit()
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Add Board</Button>
        </>
      }
    >
      <FormRow label="Name" labelWidth={70}>
        <TextInput
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Board"
          style={{ flex: 1 }}
        />
      </FormRow>

      <FormRow label="Size" labelWidth={70} title="length × width × thickness">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
          <InchInput value={l} onCommit={setL} precision={precision} positive style={{ width: 60 }} />
          <span style={{ color: 'var(--text-faint)' }}>×</span>
          <InchInput value={w} onCommit={setW} precision={precision} positive style={{ width: 60 }} />
          <span style={{ color: 'var(--text-faint)' }}>×</span>
          <InchInput value={t} onCommit={setT} precision={precision} positive style={{ width: 60 }} />
        </div>
      </FormRow>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'calc(-1 * var(--sp-3))' }}>
        <span style={{ width: 70, flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>length × width × thickness</span>
      </div>

      <FormRow label="Species" labelWidth={70}>
        <Select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} style={{ flex: 1 }}>
          {species.length === 0 && <option value={speciesId}>{speciesId}</option>}
          {species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.common_name}
            </option>
          ))}
        </Select>
      </FormRow>
    </DialogShell>
  )
}
