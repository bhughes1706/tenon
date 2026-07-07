import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { getJobs } from '../lib/jobsApi.js'
import type { Job } from '../lib/jobsApi.js'

// Model → job assignment lives on the `models` row (job_id), separate from the
// doc ops pipeline — see modelService.ts updateModelMeta. Standalone models
// (job_id: null, "library" models) are the common case, so this is opt-in from
// the designer topbar menu rather than required at creation time.
export function AssignJobDialog({
  open,
  onClose,
  onAssign,
}: {
  open: boolean
  onClose: () => void
  onAssign: (jobId: string) => void
}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getJobs()
      .then(setJobs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load jobs'))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
        <Dialog.Content
          aria-label="Assign to job"
          style={{
            position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: 360, maxHeight: '55vh', display: 'flex', flexDirection: 'column',
            background: 'var(--surface-overlay)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-l)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            zIndex: 201, padding: 'var(--sp-6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
            <Dialog.Title style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Assign to job
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
            {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{error}</div>}
            {!loading && !error && jobs.length === 0 && (
              <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No jobs yet.</div>
            )}
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => onAssign(j.id)}
                style={{
                  textAlign: 'left', padding: 'var(--sp-2) var(--sp-3)',
                  border: 'none', borderRadius: 'var(--radius-s)', background: 'transparent',
                  color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-sunken)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {j.title}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
