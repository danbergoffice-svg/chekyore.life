// Дописывает в layers/layers.json положения заголовков (без пересъёмки слоёв).
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 640, height: 1000 }, deviceScaleFactor: 1 })
  await p.goto('http://localhost:5174/tools/video/flyover/landing.html')
  await p.waitForSelector('body[data-ready="1"]', { timeout: 90000, state: 'attached' })
  const lay = await p.evaluate(() => window.layout)
  const file = path.join(__dirname, 'layers', 'layers.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (lay.height !== data.height) throw new Error(`страница изменилась: ${lay.height} ≠ ${data.height}`)
  data.layout.heads = lay.heads
  fs.writeFileSync(file, JSON.stringify(data, null, 1))
  console.log(lay.heads.length, 'заголовков', JSON.stringify(lay.heads.slice(0, 5)))
  await b.close()
})()
