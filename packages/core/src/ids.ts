import { nanoid } from 'nanoid'
import { z } from 'zod'

const SUFFIX_LEN = 10

const make = (prefix: string) => `${prefix}${nanoid(SUFFIX_LEN)}`

// §2.3 — prefixed nanoid (10 chars). Schemas validate the prefix but not the
// suffix length: the spec's own examples use semantic ids ('brd_stile'), and
// hand-written template models may too. nanoid alphabet = [A-Za-z0-9_-].
export const idSchema = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}[A-Za-z0-9_-]+$`), `must be an id starting with '${prefix}'`)

export const makeBoardId = () => make('brd_')
export const makeJointId = () => make('jnt_')
export const makeModelId = () => make('mdl_')
export const makeJobId = () => make('job_')
export const makeClientId = () => make('cli_')
export const makePhotoId = () => make('pht_')
export const makeBidId = () => make('bid_')
export const makeTimeLogId = () => make('tlg_')
export const makeNoteId = () => make('nte_')
export const makeEdgeGrooveId = () => make('egv_')
export const makeEdgeProfileId = () => make('epf_')
export const makeGroupId = () => make('grp_')
export const makeHardwareId = () => make('hdw_')

// Species ids are semantic slugs (spc_red_oak), not nanoid — created manually.
