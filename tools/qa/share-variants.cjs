// Пять вариантов карточки «Поделиться» (tools/share-variants.html) → $SHOTS/share-v{1..5}-{n}.png и лист share-variants.png.
// Нужен npx vite --port 5174.
const { chromium } = require('playwright')
const fs = require('fs')
const dir = process.env.SHOTS || 'shots'
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`http://localhost:5174/tools/share-variants.html?${process.argv[2] || 'seed=100&n=2&lang=ru'}`)
  await p.waitForSelector('body[data-ready="1"]', { timeout: 180000 })
  const cs = await p.$$('canvas')
  let i = 0
  for (const c of cs) {
    const data = await c.evaluate((el) => el.toDataURL('image/png'))
    fs.writeFileSync(`${dir}/share-v${(i % 5) + 1}-${Math.floor(i / 5) + 1}.png`, Buffer.from(data.split(',')[1], 'base64'))
    i++
  }
  console.log('карточек:', cs.length, { errors: errs.slice(0, 5) })
  await b.close()
})()
