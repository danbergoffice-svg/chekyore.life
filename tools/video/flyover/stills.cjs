// Кадры-пробы ролика до полного рендера: node stills.cjs [t1,t2,…] [подкадров] → stills/t-XX.XX.jpg
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, 'stills')
fs.mkdirSync(OUT, { recursive: true })
const times = (process.argv[2] || '0,2.5,10,23,34,47,54,60.1,60.7,61.2,63').split(',').map(Number)
const sub = process.argv[3] || '4'
;(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport: { width: 540, height: 960 } })
  p.on('pageerror', (e) => console.log('ОШИБКА', e.message))
  p.on('console', (m) => m.type() === 'error' && console.log('консоль', m.text()))
  await p.goto(`http://localhost:5174/tools/video/flyover/film.html?sub=${sub}`)
  await p.waitForSelector('body[data-ready="1"]', { timeout: 300000, state: 'attached' })
  console.log(await p.evaluate(() => JSON.stringify(window.info)))
  console.log('ниже из-за заголовков:', await p.evaluate(() => JSON.stringify(window.caps)))
  for (const t of times) {
    const t0 = Date.now()
    const url = await p.evaluate((tt) => window.seek(tt), t)
    const file = path.join(OUT, `t-${t.toFixed(2)}.jpg`)
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    console.log(t, `${Date.now() - t0} мс`)
  }
  await b.close()
})()
