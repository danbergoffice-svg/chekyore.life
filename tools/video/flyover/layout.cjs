// Проверка раскладки страницы ролика: наложения разделов и высота.
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 900 } })
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await p.goto('http://localhost:5174/tools/video/flyover/landing.html'); await p.waitForSelector('body[data-ready="1"]', { timeout: 60000, state: 'attached' })
  console.log(JSON.stringify(await p.evaluate(() => window.layout)), errs)
  await b.close()
})()
