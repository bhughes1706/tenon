import { nanoid } from 'nanoid'

const SUFFIX_LEN = 10

const make = (prefix: string) => `${prefix}${nanoid(SUFFIX_LEN)}`

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
export const makeGroupId = () => make('grp_')
export const makeHardwareId = () => make('hw__')

// Species IDs are semantic slugs (spc_red_oak), not nanoid — created manually.
