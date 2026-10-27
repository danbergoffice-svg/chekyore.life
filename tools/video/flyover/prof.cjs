// Замер времени кадра по частям: node prof.cjs [подкадров]
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport: { width: 540, height: 960 } })
  p.on('pageerror', (e) => console.log('ОШИБКА', e.message))
  await p.goto(`http://localhost:5174/tools/video/flyover/film.html?prof=1&sub=${process.argv[2] || 1}`)
  await p.waitForSelector('body[data-ready="1"]', { timeout: 300000, state: 'attached' })
  for (const t of [5, 5.02, 30, 63]) {
    const t0 = Date.now()
    const r = await p.evaluate((tt) => { const a = performance.now(); const u = window.seek(tt); return { all: performance.now() - a, gl: window.prof.gl, len: u.length } }, t)
    console.log(t, JSON.stringify(r), 'round', Date.now() - t0)
  }
  await b.close()
})()
