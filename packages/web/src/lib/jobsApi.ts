export type JobStatus = 'lead' | 'bid' | 'accepted' | 'in_progress' | 'delivered' | 'paid' | 'archived'
export type PaymentStatus = 'unpaid' | 'deposit_received' | 'paid_in_full'
export type LaborCategory = 'design' | 'milling' | 'joinery' | 'assembly' | 'finishing' | 'install' | 'other'
export type HardwareUnit = 'ea' | 'pair' | 'set' | 'box' | 'ft'

export interface Job {
  id: string
  title: string
  client_id: string | null
  status: JobStatus
  deposit_pct: number | null
  deposit_paid_at: string | null
  payment_status: PaymentStatus
  due_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  job_id: string
  body: string
  created_at: string
}

export interface TimeLog {
  id: string
  job_id: string
  minutes: number
  category: LaborCategory | null
  note: string | null
  logged_at: string
}

export interface Photo {
  id: string
  job_id: string
  path: string
  thumb_path: string | null
  caption: string | null
  taken_at: string | null
  uploaded_at: string
  exif: string | null
}

export interface Hardware {
  id: string
  job_id: string
  model_id: string | null
  item: string
  qty: number
  unit: HardwareUnit
  unit_cost: number | null
  supplier: string | null
  notes: string | null
}

export interface ModelMeta {
  id: string
  job_id: string | null
  name: string
  rev: number
  thumbnail: string | null
  created_at: string
  updated_at: string
}

// Server spreads job fields then overwrites `notes` with the notes array
export interface JobDetail extends Omit<Job, 'notes'> {
  notes: Note[]
  time_logs: TimeLog[]
  photos: Photo[]
  models: ModelMeta[]
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const getJobs = (status?: JobStatus) =>
  apiFetch<Job[]>(`/api/jobs${status ? `?status=${status}` : ''}`)

export const getJob = (id: string) =>
  apiFetch<JobDetail>(`/api/jobs/${id}`)

export const createJob = (data: { title: string; client_id?: string; status?: JobStatus; due_date?: string; deposit_pct?: number }) =>
  apiFetch<Job>('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })

export const updateJob = (id: string, patch: Partial<Omit<Job, 'id' | 'created_at' | 'updated_at'>>) =>
  apiFetch<Job>(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })

export const getHardware = (jobId: string) =>
  apiFetch<Hardware[]>(`/api/jobs/${jobId}/hardware`)

export const createHardware = (jobId: string, data: Partial<Hardware>) =>
  apiFetch<Hardware>(`/api/jobs/${jobId}/hardware`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })

export const updateHardware = (id: string, patch: Partial<Hardware>) =>
  apiFetch<Hardware>(`/api/hardware/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })

export const deleteHardware = (id: string) =>
  apiFetch<void>(`/api/hardware/${id}`, { method: 'DELETE' })

export const createNote = (jobId: string, body: string) =>
  apiFetch<Note>('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, body }) })

export const createTimeLog = (jobId: string, data: { minutes: number; category?: LaborCategory; note?: string }) =>
  apiFetch<TimeLog>('/api/time_logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, ...data }) })

export const getModels = (jobId?: string) =>
  apiFetch<ModelMeta[]>(`/api/models${jobId ? `?job_id=${jobId}` : ''}`)

export const createModel = (data: { name: string; job_id?: string }) =>
  apiFetch<ModelMeta>('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })

// `job_id: null` explicitly clears the assignment; omitting the key leaves it untouched.
export const updateModelMeta = (id: string, patch: { name?: string; job_id?: string | null }) =>
  apiFetch<ModelMeta>(`/api/models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })

export const deleteModel = (id: string) =>
  apiFetch<void>(`/api/models/${id}`, { method: 'DELETE' })

export const STATUS_LABELS: Record<JobStatus, string> = {
  lead: 'Lead', bid: 'Bid', accepted: 'Accepted',
  in_progress: 'In Progress', delivered: 'Delivered', paid: 'Paid', archived: 'Archived',
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid', deposit_received: 'Deposit received', paid_in_full: 'Paid in full',
}
