import { Router } from 'express'
import { registerSseClient } from '../sse.js'

const router: Router = Router()

// GET /api/events — SSE stream: model_changed | photo_added | job_changed (§10)
router.get('/', (req, res) => {
  registerSseClient(res)
  // Keep the connection open; cleanup happens on the 'close' event (see sse.ts)
})

export default router
