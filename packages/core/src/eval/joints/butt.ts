// §5.1 butt — no material is removed. The boards simply meet face-to-face; the joint's
// only job is to MARK the pair as resolved (so the analytic collision pass doesn't flag
// it) and to record a fastener intent. Fastener markers are render-only ghost cylinders
// (chunk 11) and dowels become a drilling cutlist note (chunk 10) — neither subtracts
// geometry, so a butt carves nothing.
import type { JointFn } from '../types.js'

export const butt: JointFn = () => ({ a: [], b: [], warnings: [] })
