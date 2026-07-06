import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { X, ArrowLeftRight } from 'lucide-react'
import {
  makeJointId, recomputeWarnings, worldAABB, checkJointPrecondition, JOINT_PARAM_SCHEMAS,
} from '@tenon/core'
import type { Board, Model, JointType, Op, Warning } from '@tenon/core'
import { useModelStore } from '../lib/modelStore.js'
import {
  availableJointTypes, defaultJointType, JOINT_TYPE_LABELS, JOINT_ROLE_HINTS,
} from '../lib/jointTypes.js'
import { JointParamsForm } from './JointParamsForm.js'
import { speciesColor } from '../lib/speciesColors.js'
// Static import is safe here: JointDialog lives in the code-split designer chunk
// (imported from DesignerShell), which already carries THREE — the main
// jobs/photos bundle is untouched. The worker still spawns lazily on first carve.
import { carve, type CarvedBoard } from '../lib/geometryClient.js'

// §19.2 joint dialog: type picker pre-filtered by live preconditions, per-type param
// form, and a mini-viewport live preview (owner's pick over an in-scene ghost) that
// carves a candidate two-board model through the SAME worker pipeline as the real
// viewport — the preview is byte-identical to what committing would produce.

const PREVIEW_JOINT_ID = 'jnt_PREVIEW000'

// Analytic codes are the server/store's business; the preview only reports joint
// GEOMETRY lint (thin tenon, near-through …). A raw a/b collision is expected here —
// resolving it is the whole point.
const ANALYTIC_CODES = new Set(['UNRESOLVED_COLLISION', 'JOINT_PRECONDITION_FAILED'])

interface Preview {
  boards: CarvedBoard[]
  warnings: Warning[]
}

function disposePreview(p: Preview | null): void {
  if (!p) return
  for (const b of p.boards) {
    b.geometry.dispose()
    b.highlight?.dispose()
  }
}

// Camera framing for the pair — once per dialog open (not per param change, which
// would fight the user's orbiting).
function PreviewCamera({ a, b }: { a: Board; b: Board }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    const boxA = worldAABB(a)
    const boxB = worldAABB(b)
    const min = boxA.min.map((v, i) => Math.min(v, boxB.min[i]))
    const max = boxA.max.map((v, i) => Math.max(v, boxB.max[i]))
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
    const radius = Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, 1)
    const fov = (camera.fov * Math.PI) / 180
    const dist = radius / Math.sin(Math.min(fov / 2, Math.PI / 2 - 0.01))
    const dir = new THREE.Vector3(1, 0.8, 1).normalize()
    camera.position.copy(center.clone().add(dir.multiplyScalar(dist)))
    camera.near = Math.max(dist / 100, 0.01)
    camera.far = dist * 10 + 100
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(center)
      controls.update()
    } else {
      camera.lookAt(center)
    }
    // Frame on open / role swap only.
  }, [a.id, b.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const deg2rad = (d: number) => (d * Math.PI) / 180

function PreviewBoard({ board, carved, jointColor }: { board: Board; carved: CarvedBoard | undefined; jointColor: string }) {
  const color = useMemo(() => speciesColor(board.species), [board.species])
  const [px, py, pz] = board.transform.pos
  const [rx, ry, rz] = board.transform.rot
  if (!carved) return null
  return (
    <group position={[px, py, pz]} rotation={[deg2rad(rx), deg2rad(ry), deg2rad(rz)]}>
      <mesh geometry={carved.geometry}>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
      </mesh>
      {carved.highlight && (
        <mesh geometry={carved.highlight}>
          <meshStandardMaterial
            color={jointColor}
            emissive={jointColor}
            emissiveIntensity={0.25}
            roughness={0.6}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}
    </group>
  )
}

function JointDialogBody({ model, initialA, initialB, precision, onClose }: {
  model: Model
  initialA: string
  initialB: string
  precision: number
  onClose: () => void
}) {
  const dispatch = useModelStore((s) => s.dispatch)
  const storeWarnings = useModelStore((s) => s.warnings)

  const [pair, setPair] = useState({ a: initialA, b: initialB })
  const a = model.boards.find((x) => x.id === pair.a)
  const b = model.boards.find((x) => x.id === pair.b)

  const options = useMemo(() => (a && b ? availableJointTypes(a, b) : []), [a, b])
  const [type, setType] = useState<JointType | null>(() => defaultJointType(options))
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // A swap can invalidate the chosen type — fall back to the best passing one.
  useEffect(() => {
    if (type && options.find((o) => o.type === type)?.ok) return
    setType(defaultJointType(options))
  }, [options]) // eslint-disable-line react-hooks/exhaustive-deps

  // Params can break the precondition (e.g. housing depth deeper than the overlap) —
  // surface the same teaching reason the server's hard gate would return.
  const paramPrecond = useMemo(
    () => (a && b && type ? checkJointPrecondition(type, a, b, params) : null),
    [a, b, type, params],
  )

  // ── Live preview: carve a candidate two-board model through the shared worker ──
  const [preview, setPreview] = useState<Preview | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    if (!a || !b || !type || (paramPrecond && !paramPrecond.ok)) {
      disposePreview(previewRef.current)
      previewRef.current = null
      setPreview(null)
      return
    }
    const candidate: Model = {
      id: model.id,
      rev: 0,
      doc_version: 1,
      name: 'joint-preview',
      units: 'in',
      boards: [a, b],
      joints: [{ id: PREVIEW_JOINT_ID, type, a: a.id, b: b.id, enabled: true, params } as Model['joints'][number]],
      groups: [],
      meta: model.meta,
    }
    let cancelled = false
    const t = setTimeout(() => {
      void carve(candidate).then((r) => {
        if (cancelled || !r) return // superseded by a newer param change
        disposePreview(previewRef.current)
        const next: Preview = {
          boards: r.boards,
          warnings: r.warnings.filter((w) => !ANALYTIC_CODES.has(w.code)),
        }
        previewRef.current = next
        setPreview(next)
      })
    }, 150) // debounce param bursts
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // paramsKey stands in for params (stable string identity).
  }, [a, b, type, paramsKey, paramPrecond?.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dispose whatever preview is live when the dialog unmounts.
  useEffect(() => () => {
    disposePreview(previewRef.current)
    previewRef.current = null
  }, [])

  // Does the pending joint clear the pair's UNRESOLVED_COLLISION? (The §13 lint-driven
  // flow's payoff line.) Cheap analytic pass over the full model + pending joint.
  const resolvesCollision = useMemo(() => {
    if (!a || !b || !type) return false
    const hadCollision = storeWarnings.some(
      (w) => w.code === 'UNRESOLVED_COLLISION' && w.boards?.includes(a.id) && w.boards?.includes(b.id),
    )
    if (!hadCollision) return false
    const candidate: Model = {
      ...model,
      joints: [...model.joints, { id: PREVIEW_JOINT_ID, type, a: a.id, b: b.id, enabled: true, params } as Model['joints'][number]],
    }
    return !recomputeWarnings(candidate).some(
      (w) => w.code === 'UNRESOLVED_COLLISION' && w.boards?.includes(a.id) && w.boards?.includes(b.id),
    )
  }, [a, b, type, paramsKey, model, storeWarnings]) // eslint-disable-line react-hooks/exhaustive-deps

  const jointColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--vp-joint-hi').trim() || '#c27d18',
    [],
  )
  const bg = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--vp-bg').trim() || '#1a1612',
    [],
  )

  if (!a || !b) return null // a board vanished mid-dialog (remote edit) — shell closes us
  const roles = type ? JOINT_ROLE_HINTS[type] : null

  const add = async () => {
    if (!type || saving) return
    setSaving(true)
    setError(null)
    // Parse through the per-type schema so static defaults (snap_to_tool …) are
    // materialized identically to the server's OpSchema parse — otherwise the
    // optimistic model would silently lack them until the next refetch (gotcha #10).
    const parsed = JOINT_PARAM_SCHEMAS[type].safeParse(params)
    if (!parsed.success) {
      setSaving(false)
      setError(parsed.error.issues.map((i) => i.message).join('; '))
      return
    }
    const id = makeJointId()
    const op = { op: 'add_joint', joint: { id, type, a: a.id, b: b.id, enabled: true, params: parsed.data } } as unknown as Op
    const ok = await dispatch([op])
    setSaving(false)
    if (ok) {
      useModelStore.getState().setSelectedJoint(id)
      onClose()
    } else {
      // The server's teaching rejection (or network failure) landed in store.error.
      setError(useModelStore.getState().error ?? 'edit rejected')
    }
  }

  const typeBtn = (o: (typeof options)[number]) => {
    const active = o.type === type
    return (
      <button
        key={o.type}
        disabled={!o.ok}
        title={o.reason}
        onClick={() => {
          setType(o.type)
          setParams({})
          setError(null)
        }}
        style={{
          padding: '3px var(--sp-2)',
          borderRadius: 'var(--radius-s)',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
          background: active ? 'var(--accent-subtle)' : 'var(--surface-sunken)',
          color: !o.ok ? 'var(--text-faint)' : active ? 'var(--accent)' : 'var(--text)',
          cursor: o.ok ? 'pointer' : 'not-allowed',
          fontSize: 'var(--text-xs)',
          fontFamily: 'inherit',
          textDecoration: o.deferred ? 'line-through' : undefined,
        }}
      >
        {JOINT_TYPE_LABELS[o.type]}
      </button>
    )
  }

  const failedSelected = type ? options.find((o) => o.type === type && !o.ok) : null

  return (
    <>
      {/* a ⇄ b roles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--text-sm)' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <b>a</b> {a.name}
          {roles && <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}> — {roles.a}</span>}
        </span>
        <button
          onClick={() => setPair({ a: pair.b, b: pair.a })}
          title="Swap roles (a receives, b inserts)"
          style={{
            border: '1px solid var(--border)', background: 'var(--surface-sunken)', cursor: 'pointer',
            borderRadius: 'var(--radius-s)', color: 'var(--text-muted)', width: 26, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <ArrowLeftRight size={12} />
        </button>
        <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <b>b</b> {b.name}
          {roles && <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}> — {roles.b}</span>}
        </span>
      </div>

      {/* Type picker — precondition-filtered with teaching reasons on hover */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
        {options.map(typeBtn)}
      </div>
      {failedSelected?.reason && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warn)' }}>{failedSelected.reason}</div>
      )}
      {!type && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warn)' }}>
          No joint type fits this pair — the boards may not touch. Hover a type for why.
        </div>
      )}

      {/* Mini-viewport live preview */}
      <div style={{
        height: 200, borderRadius: 'var(--radius-m)', overflow: 'hidden',
        border: '1px solid var(--border)', background: bg, position: 'relative',
      }}>
        {preview && type ? (
          <Canvas dpr={[1, 2]} camera={{ fov: 35, position: [12, 10, 12] }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 14, 8]} intensity={0.9} />
            <directionalLight position={[-8, 6, -10]} intensity={0.3} />
            <PreviewBoard board={a} carved={preview.boards.find((x) => x.id === a.id)} jointColor={jointColor} />
            <PreviewBoard board={b} carved={preview.boards.find((x) => x.id === b.id)} jointColor={jointColor} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
            <PreviewCamera a={a} b={b} />
          </Canvas>
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-faint)', fontSize: 'var(--text-xs)',
          }}>
            {type ? 'Carving preview…' : 'Pick a joint type'}
          </div>
        )}
      </div>

      {/* Resolve-flow payoff + joint geometry lint from the preview carve */}
      {resolvesCollision && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ok)' }}>
          ✓ Resolves the collision between {a.name} and {b.name}
        </div>
      )}
      {preview?.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--warn)' }}>
          <b>{w.code}</b> — {w.msg}
        </div>
      ))}
      {paramPrecond && !paramPrecond.ok && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warn)' }}>{paramPrecond.reason}</div>
      )}

      {/* Per-type params */}
      {type && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <JointParamsForm
            type={type}
            params={params}
            precision={precision}
            onPatch={(patch) => setParams((p) => ({ ...p, ...patch }))}
          />
        </div>
      )}

      {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
        <button onClick={onClose} style={{
          padding: '4px var(--sp-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-s)',
          background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 'var(--text-sm)', fontFamily: 'inherit',
        }}>Cancel</button>
        <button
          onClick={() => void add()}
          disabled={!type || saving || (paramPrecond !== null && !paramPrecond.ok)}
          style={{
            padding: '4px var(--sp-4)', border: 'none', borderRadius: 'var(--radius-s)',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            cursor: !type || saving ? 'default' : 'pointer',
            opacity: !type || saving || (paramPrecond !== null && !paramPrecond.ok) ? 0.5 : 1,
            fontSize: 'var(--text-sm)', fontFamily: 'inherit', fontWeight: 600,
          }}
        >{saving ? 'Adding…' : 'Add joint'}</button>
      </div>
    </>
  )
}

export function JointDialog({ precision }: { precision: number }) {
  const pair = useModelStore((s) => s.jointDialog)
  const model = useModelStore((s) => s.model)
  const close = useModelStore((s) => s.closeJointDialog)
  const open = !!pair && !!model

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && close()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
        <Dialog.Content
          aria-label="Add joint"
          style={{
            position: 'fixed', top: '8%', left: '50%', transform: 'translateX(-50%)',
            width: 420, maxHeight: '84dvh', overflowY: 'auto',
            background: 'var(--surface-overlay)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-l)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            zIndex: 201, padding: 'var(--sp-5)',
            display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Dialog.Title style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Add Joint
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          {pair && model && (
            <JointDialogBody
              // Remount per pair so all local state (type/params/preview) resets.
              key={`${pair.a}:${pair.b}`}
              model={model}
              initialA={pair.a}
              initialB={pair.b}
              precision={precision}
              onClose={close}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
