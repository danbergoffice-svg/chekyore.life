// Снимки макетов: node tools/mockups/render.cjs [имя…] → tools/mockups/out/*.png
const { chromium } = require('playwright')
const path = require('path')
const DIR = __dirname
const url = (f, q = '') => `file://${path.join(DIR, f)}${q}`
const PHONE = [
  ['main-a', 'main-a.html', '', 390, 844],
  ['main-a-360', 'main-a.html', '', 360, 640],
  ['main-a-light', 'main-a.html', '?theme=light', 390, 844],
  ['main-a-sheet', 'main-a.html', '?sheet=1', 390, 844],
  ['main-b', 'main-b.html', '', 390, 844],
  ['main-b-360', 'main-b.html', '', 360, 640],
  ['main-b-light', 'main-b.html', '?theme=light', 390, 844],
]
const CARDS = [
  ['card-a', 'card-a.html'],
  ['card-b', 'card-b.html'],
]
;(async () => {
  const only = process.argv.slice(2)
  const want = (n) => !only.length || only.some((o) => n.startsWith(o))
  const b = await chromium.launch()
  for (const [name, file, q, w, h] of PHONE) {
    if (!want(name)) continue
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    await p.goto(url(file, q))
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(200)
    await p.screenshot({ path: path.join(DIR, 'out', `${name}.png`) })
    // Помещается ли «Крути» на первом экране.
    const cta = await p.$('.cta, .primary')
    const box = cta && (await cta.boundingBox())
    if (box && !q.includes('sheet')) console.log(name, `${w}×${h}`, 'кнопка до', Math.round(box.y + box.height), box.y + box.height <= h ? 'видно' : 'НЕ ВИДНО')
    await p.close()
  }
  for (const [name, file] of CARDS) {
    if (!want(name)) continue
    for (const [suffix, dsf] of [['', 1], ['-preview', 0.5]]) {
      const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: dsf })
      await p.goto(url(file))
      await p.evaluate(() => document.fonts.ready)
      await p.waitForTimeout(200)
      await p.screenshot({ path: path.join(DIR, 'out', `${name}${suffix}.png`) })
      await p.close()
    }
    console.log(name, 'готово')
  }
  await b.close()
})()
