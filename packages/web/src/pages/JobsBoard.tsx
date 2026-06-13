import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import { getJobs, createJob, STATUS_LABELS, PAYMENT_LABELS } from '../lib/jobsApi.js'
import type { Job, JobStatus } from '../lib/jobsApi.js'

const STATUS_FILTERS: Array<{ value: JobStatus | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'lead',        label: 'Lead' },
  { value: 'bid',         label: 'Bid' },
  { value: 'accepted',    label: 'Accepted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'delivered',   label: 'Delivered' },
  { value: 'paid',        label: 'Paid' },
]

const STATUS_COLORS: Record<JobStatus, string> = {
  lead:        'var(--text-faint)',
  bid:         'var(--info)',
  accepted:    'var(--accent)',
  in_progress: 'var(--warn)',
  delivered:   'var(--ok)',
  paid:        'var(--ok)',
  archived:    'var(--text-faint)',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function NewJobDialog({ onCreated, onCancel }: { onCreated: (j: Job) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const job = await createJob({ title: title.trim() })
      onCreated(job)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create job')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-l)',
        padding: 'var(--sp-6)',
        width: 360, display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text)' }}>New Job</div>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Job title…"
          style={{
            background: 'var(--surface-sunken)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-s)', padding: 'var(--sp-2) var(--sp-3)',
            fontSize: 'var(--text-sm)', color: 'var(--text)', outline: 'none', width: '100%',
          }}
        />
        {err && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{
            padding: '0 var(--sp-4)', height: 32,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-s)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 'var(--text-sm)',
          }}>Cancel</button>
          <button type="submit" disabled={busy || !title.trim()} style={{
            padding: '0 var(--sp-4)', height: 32,
            border: 'none', borderRadius: 'var(--radius-s)',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            cursor: busy ? 'wait' : 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
            opacity: !title.trim() ? 0.5 : 1,
          }}>Create</button>
        </div>
      </form>
    </div>
  )
}

export function JobsBoard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1')

  const activeStatus = (searchParams.get('status') ?? 'all') as JobStatus | 'all'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getJobs(activeStatus === 'all' ? undefined : activeStatus)
      setJobs(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [activeStatus])

  useEffect(() => { void load() }, [load])

  // Open new-job dialog when ?new=1 in URL (triggered by ⌘K "New Job" command)
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowNew(true)
  }, [searchParams])

  const setStatus = (s: JobStatus | 'all') => {
    const p = new URLSearchParams(searchParams)
    if (s === 'all') p.delete('status'); else p.set('status', s)
    setSearchParams(p)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left sidebar — status filter */}
      <aside style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface-raised)',
        display: 'flex', flexDirection: 'column',
        padding: 'var(--sp-4) 0',
      }}>
        <div style={{
          padding: '0 var(--sp-4)', marginBottom: 'var(--sp-2)',
          fontSize: 'var(--text-xs)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)',
        }}>Status</div>
        {STATUS_FILTERS.map(({ value, label }) => (
          <button key={value} onClick={() => setStatus(value)} style={{
            display: 'flex', alignItems: 'center',
            padding: '0 var(--sp-4)', height: 'var(--row-height-comfortable)',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            background: activeStatus === value ? 'var(--accent-subtle)' : 'transparent',
            color: activeStatus === value ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: activeStatus === value ? 600 : 400,
            fontSize: 'var(--text-sm)', fontFamily: 'inherit',
            transition: `background var(--dur-fast) var(--ease-out)`,
          }}>
            {label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 var(--sp-6)', height: 56,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <h1 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {activeStatus === 'all' ? 'All Jobs' : STATUS_LABELS[activeStatus as JobStatus]}
          </h1>
          <button onClick={() => setShowNew(true)} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-1)',
            padding: '0 var(--sp-3)', height: 32,
            border: 'none', borderRadius: 'var(--radius-s)',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
          }}>
            <Plus size={14} /> New Job
          </button>
        </div>

        {/* Job list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: 'var(--sp-4) var(--sp-6)', color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
              {error}
            </div>
          )}
          {!loading && !error && jobs.length === 0 && (
            <div style={{ padding: 'var(--sp-12)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
              No jobs yet —{' '}
              <button onClick={() => setShowNew(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>
                create one
              </button>
            </div>
          )}
          {jobs.map(job => (
            <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 120px 32px',
                alignItems: 'center',
                height: 'var(--row-height-comfortable)',
                padding: '0 var(--sp-6)',
                gap: 'var(--sp-4)',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: `background var(--dur-fast) var(--ease-out)`,
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sunken)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.title}
                </span>
                <span style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                  color: STATUS_COLORS[job.status],
                  textTransform: 'capitalize',
                }}>
                  {STATUS_LABELS[job.status]}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                  {job.due_date ? `Due ${formatDate(job.due_date)}` : '—'}
                </span>
                <ChevronRight size={14} color="var(--text-faint)" />
              </div>
            </Link>
          ))}
        </div>
      </main>

      {showNew && (
        <NewJobDialog
          onCreated={job => { setShowNew(false); setJobs(prev => [job, ...prev]) }}
          onCancel={() => {
            setShowNew(false)
            const p = new URLSearchParams(searchParams)
            p.delete('new')
            setSearchParams(p)
          }}
        />
      )}
    </div>
  )
}
