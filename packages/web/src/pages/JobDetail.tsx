import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Clock, FileText, Image } from 'lucide-react'
import {
  getJob, updateJob, getHardware, createHardware, deleteHardware, createNote, createTimeLog,
  STATUS_LABELS, PAYMENT_LABELS,
} from '../lib/jobsApi.js'
import type { Job, JobDetail as JobDetailType, Hardware, Note, TimeLog, JobStatus, PaymentStatus, LaborCategory } from '../lib/jobsApi.js'

type Tab = 'overview' | 'photos' | 'hardware' | 'feed'

const STATUS_OPTIONS: JobStatus[] = ['lead', 'bid', 'accepted', 'in_progress', 'delivered', 'paid', 'archived']
const PAYMENT_OPTIONS: PaymentStatus[] = ['unpaid', 'deposit_received', 'paid_in_full']
const CATEGORIES: LaborCategory[] = ['design', 'milling', 'joinery', 'assembly', 'finishing', 'install', 'other']

function Isec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: 'var(--sp-2)',
      }}>{label}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: JobStatus }) {
  const colors: Record<JobStatus, string> = {
    lead: 'var(--text-faint)', bid: 'var(--info)', accepted: 'var(--accent)',
    in_progress: 'var(--warn)', delivered: 'var(--ok)', paid: 'var(--ok)', archived: 'var(--text-faint)',
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 var(--sp-2)',
      borderRadius: 9, fontSize: 'var(--text-xs)', fontWeight: 500,
      background: 'var(--surface-sunken)', color: colors[status],
      border: `1px solid ${colors[status]}`, opacity: 0.9,
    }}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ job, onUpdate }: { job: JobDetailType; onUpdate: (j: Job) => void }) {
  const patch = async (data: Parameters<typeof updateJob>[1]) => {
    const updated = await updateJob(job.id, data)
    onUpdate(updated)
  }

  return (
    <>
      <Isec label="Status">
        <Field label="Pipeline">
          <select
            value={job.status}
            onChange={e => void patch({ status: e.target.value as JobStatus })}
            style={{
              background: 'var(--surface-sunken)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-s)', padding: '3px var(--sp-2)',
              fontSize: 'var(--text-sm)', color: 'var(--text)', fontFamily: 'inherit',
            }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Payment">
          <select
            value={job.payment_status}
            onChange={e => void patch({ payment_status: e.target.value as PaymentStatus })}
            style={{
              background: 'var(--surface-sunken)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-s)', padding: '3px var(--sp-2)',
              fontSize: 'var(--text-sm)', color: 'var(--text)', fontFamily: 'inherit',
            }}
          >
            {PAYMENT_OPTIONS.map(s => <option key={s} value={s}>{PAYMENT_LABELS[s]}</option>)}
          </select>
        </Field>
        {job.deposit_pct != null && (
          <Field label="Deposit">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {job.deposit_pct}%
              {job.deposit_paid_at
                ? ` · received ${new Date(job.deposit_paid_at).toLocaleDateString()}`
                : ' · not yet received'}
            </span>
          </Field>
        )}
      </Isec>

      <Isec label="Details">
        <Field label="Due date">
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {job.due_date ? new Date(job.due_date).toLocaleDateString() : '—'}
          </span>
        </Field>
        <Field label="Created">
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {new Date(job.created_at).toLocaleDateString()}
          </span>
        </Field>
      </Isec>

      <Isec label="Models">
        {job.models.length === 0 ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>No models attached</div>
        ) : job.models.map(m => (
          <Link key={m.id} to={`/designer/${m.id}`} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
            fontSize: 'var(--text-sm)', color: 'var(--accent)', textDecoration: 'none',
            marginBottom: 'var(--sp-1)',
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'monospace' }}>◧</span>
            {m.name}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>rev {m.rev}</span>
          </Link>
        ))}
      </Isec>
    </>
  )
}

// ── Photos tab ───────────────────────────────────────────────────────────────
function PhotosTabImpl({ jobId, photos }: { jobId: string; photos: JobDetailType['photos'] }) {
  if (photos.length === 0) {
    return (
      <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
        No photos yet. Upload from the mobile Capture tab or via MCP.
      </div>
    )
  }
  return (
    <div style={{ padding: 'var(--sp-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--sp-2)' }}>
      {photos.map(p => (
        <div key={p.id} style={{
          aspectRatio: '1', borderRadius: 'var(--radius-m)',
          border: '1px solid var(--border)', overflow: 'hidden',
          background: 'var(--surface-sunken)',
        }}>
          <img
            src={`/api/photos/${p.id}/thumb`}
            alt={p.caption ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        </div>
      ))}
    </div>
  )
}

// ── Hardware tab ─────────────────────────────────────────────────────────────
function HardwareTab({ jobId, items, onRefresh }: { jobId: string; items: Hardware[]; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [qty, setQty] = useState('1')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItem.trim()) return
    await createHardware(jobId, { item: newItem.trim(), qty: parseFloat(qty) || 1 })
    setNewItem(''); setQty('1'); setAdding(false)
    onRefresh()
  }

  const totalCost = items.reduce((sum, h) => sum + (h.qty * (h.unit_cost ?? 0)), 0)

  return (
    <div style={{ padding: 'var(--sp-4)' }}>
      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px 28px',
        gap: 'var(--sp-2)', padding: '0 var(--sp-2)', marginBottom: 4,
        fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--text-faint)',
      }}>
        <span>Item</span><span>Qty</span><span>Unit</span><span style={{ textAlign: 'right' }}>Cost</span><span />
      </div>

      {items.length === 0 && !adding && (
        <div style={{ padding: 'var(--sp-4)', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No hardware logged</div>
      )}

      {items.map(h => (
        <div key={h.id} style={{
          display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px 28px',
          alignItems: 'center', gap: 'var(--sp-2)',
          height: 'var(--row-height-comfortable)',
          borderBottom: '1px solid var(--border)',
          padding: '0 var(--sp-2)',
          fontSize: 'var(--text-sm)',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.item}</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>{h.qty}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{h.unit}</span>
          <span style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {h.unit_cost != null ? `$${(h.qty * h.unit_cost).toFixed(2)}` : '—'}
          </span>
          <button
            onClick={async () => { await deleteHardware(h.id); onRefresh() }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={add} style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', alignItems: 'center' }}>
          <input autoFocus value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Item description"
            style={{ flex: 1, background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--radius-s)', padding: '4px var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text)' }} />
          <input value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" type="number" min="0.01" step="any"
            style={{ width: 60, background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--radius-s)', padding: '4px var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text)', textAlign: 'right' }} />
          <button type="submit" style={{ padding: '0 var(--sp-3)', height: 28, border: 'none', borderRadius: 'var(--radius-s)', background: 'var(--accent)', color: 'var(--text-on-accent)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>Add</button>
          <button type="button" onClick={() => setAdding(false)} style={{ padding: '0 var(--sp-2)', height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius-s)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>Cancel</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--accent)', fontSize: 'var(--text-sm)',
        }}>
          <Plus size={14} /> Add item
        </button>
      )}

      {items.length > 0 && (
        <div style={{
          marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--border)',
          fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right',
        }}>
          Total est. cost: <strong style={{ color: 'var(--text)' }}>${totalCost.toFixed(2)}</strong>
        </div>
      )}
    </div>
  )
}

// ── Time & Notes feed ────────────────────────────────────────────────────────
type FeedItem = ({ _type: 'note' } & Note) | ({ _type: 'timelog' } & TimeLog)

function FeedTab({ jobId, notes, timeLogs, onRefresh }: {
  jobId: string; notes: Note[]; timeLogs: TimeLog[]; onRefresh: () => void
}) {
  const [noteText, setNoteText] = useState('')
  const [minutes, setMinutes] = useState('')
  const [category, setCategory] = useState<LaborCategory>('design')
  const [showLogTime, setShowLogTime] = useState(false)

  const feed: FeedItem[] = [
    ...notes.map(n => ({ _type: 'note' as const, ...n })),
    ...timeLogs.map(t => ({ _type: 'timelog' as const, ...t })),
  ].sort((a, b) => {
    const aDate = a._type === 'note' ? a.created_at : a.logged_at
    const bDate = b._type === 'note' ? b.created_at : b.logged_at
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteText.trim()) return
    await createNote(jobId, noteText.trim())
    setNoteText('')
    onRefresh()
  }

  const logTime = async (e: React.FormEvent) => {
    e.preventDefault()
    const mins = parseInt(minutes)
    if (!mins || mins <= 0) return
    await createTimeLog(jobId, { minutes: mins, category })
    setMinutes(''); setShowLogTime(false)
    onRefresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Quick actions */}
      <div style={{
        padding: 'var(--sp-3) var(--sp-4)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 'var(--sp-2)',
      }}>
        <button onClick={() => setShowLogTime(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-1)',
          padding: '0 var(--sp-3)', height: 28,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-s)',
          background: showLogTime ? 'var(--accent-subtle)' : 'transparent',
          color: showLogTime ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer', fontSize: 'var(--text-sm)',
        }}>
          <Clock size={13} /> Log time
        </button>
      </div>

      {showLogTime && (
        <form onSubmit={logTime} style={{
          display: 'flex', gap: 'var(--sp-2)', alignItems: 'center',
          padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)',
        }}>
          <input value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="Minutes" type="number" min="1"
            style={{ width: 80, background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--radius-s)', padding: '4px var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text)' }} />
          <select value={category} onChange={e => setCategory(e.target.value as LaborCategory)}
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--radius-s)', padding: '4px var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text)', fontFamily: 'inherit' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" style={{ padding: '0 var(--sp-3)', height: 28, border: 'none', borderRadius: 'var(--radius-s)', background: 'var(--accent)', color: 'var(--text-on-accent)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>Log</button>
        </form>
      )}

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-3) var(--sp-4)' }}>
        {feed.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--sp-6)' }}>
            No entries yet
          </div>
        )}
        {feed.map(item => (
          <div key={`${item._type}-${item.id}`} style={{
            display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)',
          }}>
            <div style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-faint)' }}>
              {item._type === 'note' ? <FileText size={13} /> : <Clock size={13} />}
            </div>
            <div style={{ flex: 1 }}>
              {item._type === 'note' ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.5 }}>{item.body}</div>
              ) : (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                  <strong>{item.minutes}m</strong>
                  {item.category && <span style={{ color: 'var(--text-muted)' }}> · {item.category}</span>}
                  {item.note && <span style={{ color: 'var(--text-muted)' }}> — {item.note}</span>}
                </div>
              )}
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>
                {new Date(item._type === 'note' ? item.created_at : item.logged_at).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add note */}
      <form onSubmit={addNote} style={{
        borderTop: '1px solid var(--border)',
        padding: 'var(--sp-3) var(--sp-4)',
        display: 'flex', gap: 'var(--sp-2)',
      }}>
        <input
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Add a note…"
          style={{
            flex: 1, background: 'var(--surface-sunken)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-s)',
            padding: 'var(--sp-2) var(--sp-3)', fontSize: 'var(--text-sm)',
            color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button type="submit" disabled={!noteText.trim()} style={{
          padding: '0 var(--sp-3)', height: 32, border: 'none',
          borderRadius: 'var(--radius-s)', background: 'var(--accent)',
          color: 'var(--text-on-accent)', cursor: 'pointer',
          fontSize: 'var(--text-sm)', opacity: !noteText.trim() ? 0.5 : 1,
        }}>Post</button>
      </form>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobDetailType | null>(null)
  const [hardware, setHardware] = useState<Hardware[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [j, hw] = await Promise.all([getJob(id), getHardware(id)])
      setJob(j)
      setHardware(hw)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load job')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview',  label: 'Overview' },
    { id: 'photos',    label: `Photos${job ? ` (${job.photos.length})` : ''}` },
    { id: 'hardware',  label: `Hardware${hardware.length ? ` (${hardware.length})` : ''}` },
    { id: 'feed',      label: 'Time & Notes' },
  ]

  if (loading) return <div style={{ padding: 'var(--sp-8)', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Loading…</div>
  if (error || !job) return <div style={{ padding: 'var(--sp-8)', color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{error ?? 'Job not found'}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        padding: '0 var(--sp-6)', height: 56,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <Link to="/jobs" style={{ color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0, flex: 1 }}>
          {job.title}
        </h1>
        <StatusBadge status={job.status} />
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
        padding: '0 var(--sp-6)',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '0 var(--sp-3)', height: 40, border: 'none',
            background: 'transparent', cursor: 'pointer',
            fontSize: 'var(--text-sm)', fontFamily: 'inherit',
            color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: tab === t.id ? 600 : 400,
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            transition: `color var(--dur-fast) var(--ease-out)`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'overview'  && <OverviewTab job={job} onUpdate={updated => setJob(prev => {
          if (!prev) return prev
          // Omit `notes` from the Job update to avoid overwriting the Note[] array
          const { notes: _n, ...rest } = updated
          return { ...prev, ...rest }
        })} />}
        {tab === 'photos'    && <PhotosTabImpl jobId={job.id} photos={job.photos} />}
        {tab === 'hardware'  && <HardwareTab jobId={job.id} items={hardware} onRefresh={() => void getHardware(job.id).then(setHardware)} />}
        {tab === 'feed'      && <FeedTab jobId={job.id} notes={job.notes} timeLogs={job.time_logs} onRefresh={load} />}
      </div>
    </div>
  )
}
