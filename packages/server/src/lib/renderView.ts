// render_view (§11.3) — Puppeteer screenshots of the server's OWN built SPA in
// render mode (`/designer/:id?render=<view>`), so the PNG is pixel-identical to
// what the PWA shows: same R3F scene components, same worker-carved joinery,
// zero duplicate render code. Cost ~1–2 s per render — irrelevant at this usage
// level (§11.3); the REST route carries its own 10/min cap (§16.6).
//
// The browser is a lazy singleton (relaunched if it dies) and renders are
// serialized through a promise queue — one page at a time keeps the software-GL
// footprint bounded on the mini PC.
import puppeteer, { type Browser } from 'puppeteer'

export const RENDER_VIEWS = ['iso', 'front', 'top', 'right'] as const
export type RenderView = (typeof RENDER_VIEWS)[number]

export interface RenderOpts {
  modelId: string
  view: RenderView
  highlight?: string[]
  width?: number
}

let browser: Browser | null = null
let queue: Promise<unknown> = Promise.resolve()

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser
  browser = await puppeteer.launch({
    headless: true,
    args: [
      // No GPU on the mini PC — software WebGL, same recipe as the chunk-7/9
      // headless verification (`--use-angle=swiftshader`).
      '--use-angle=swiftshader',
      '--disable-gpu',
      // Running under systemd as a plain user; Chromium's user-ns sandbox is
      // unavailable there. The only page ever loaded is our own localhost SPA.
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  })
  return browser
}

// Optional warm-up (e.g. at server start) so the first render doesn't pay the
// browser launch. Never required — renderModelView launches on demand.
export async function warmRenderer(): Promise<void> {
  await getBrowser()
}

export function renderModelView(opts: RenderOpts): Promise<Buffer> {
  // Serialize: each render waits for the previous one (failures don't poison the queue).
  const job = queue.then(() => doRender(opts))
  queue = job.catch(() => {})
  return job
}

async function doRender({ modelId, view, highlight, width = 900 }: RenderOpts): Promise<Buffer> {
  const port = Number(process.env.PORT ?? 3000)
  const b = await getBrowser()
  const page = await b.newPage()
  try {
    await page.setViewport({ width, height: Math.round(width * 0.75), deviceScaleFactor: 1 })
    const params = new URLSearchParams({ render: view })
    if (highlight?.length) params.set('hl', highlight.join(','))
    // The server serves its own built web/ dir (SPA fallback) — in dev with no
    // built web this 200s with index.html missing → the wait below times out
    // with a teaching error instead of a blank PNG.
    await page.goto(`http://127.0.0.1:${port}/designer/${modelId}?${params.toString()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    // RenderShell (web) flips this after the model loads, every board's carved
    // mesh has landed, and two rAFs have drawn the frame.
    await page
      .waitForFunction('window.__tenonRenderReady === true', { timeout: 20_000 })
      .catch(() => {
        throw new Error(
          'render page never became ready — is the built web bundle deployed next to the server (dist/web)?',
        )
      })
    const canvas = await page.$('canvas')
    if (!canvas) throw new Error('viewport canvas not found on the render page')
    const png = await canvas.screenshot({ type: 'png' })
    return Buffer.from(png)
  } finally {
    await page.close().catch(() => {})
  }
}
