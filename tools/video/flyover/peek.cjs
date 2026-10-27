const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 1 })
  await p.goto('http://localhost:5174/tools/video/flyover/landing.html'); await p.waitForSelector('body[data-ready="1"]', { timeout: 60000, state: 'attached' })
  const ys = process.argv.slice(3).map(Number)
  for (const y of ys) await p.screenshot({ path: `${process.argv[2]}/peek-${y}.png`, clip: { x: 0, y, width: 640, height: 1400 }, fullPage: true })
  await b.close()
})()
