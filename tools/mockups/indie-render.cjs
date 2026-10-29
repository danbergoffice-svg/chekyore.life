// Снимки инди-макетов: node tools/mockups/indie-render.cjs [a b c] → tools/mockups/out/indie-*.png и общий лист indie-all.png
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const DIR = __dirname
;(async () => {
  const only = process.argv.slice(2)
  const ids = (only.length ? only : ['a', 'b', 'c']).filter((x) => fs.existsSync(path.join(DIR, `indie-${x}.html`)))
  const b = await chromium.launch()
  for (const id of ids) for (const screen of ['menu', 'event']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    await p.goto(`file://${path.join(DIR, `indie-${id}.html`)}?screen=${screen}`)
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(300)
    const h = await p.evaluate(() => document.documentElement.scrollHeight)
    await p.screenshot({ path: path.join(DIR, 'out', `indie-${id}-${screen}.png`) })
    console.log(id, screen, 'высота страницы', h, h > 844 ? '(не влезает в экран)' : '')
    await p.close()
  }
  // Общий лист: все снимки в ряд.
  const files = ['a', 'b', 'c'].flatMap((x) => [`indie-${x}-menu.png`, `indie-${x}-event.png`]).filter((f) => fs.existsSync(path.join(DIR, 'out', f)))
  const titles = { a: 'А · Летопись с миниатюрами', b: 'Б · Пиксельный интерфейс', c: 'В · Стол с предметами' }
  const html = `<body style="margin:0;background:#111;color:#eee;font:22px sans-serif;display:flex;gap:28px;padding:28px;flex-wrap:wrap">${files.map((f) => `<figure style="margin:0"><figcaption style="padding:0 0 10px">${titles[f[6]]} — ${f.includes('menu') ? 'меню' : 'событие'}</figcaption><img src="file://${path.join(DIR, 'out', f)}" style="width:390px;border-radius:14px"></figure>`).join('')}</body>`
  fs.writeFileSync(path.join(DIR, 'out', 'indie-all.html'), html)
  const p = await b.newPage({ viewport: { width: 2620, height: 950 } })
  await p.goto(`file://${path.join(DIR, 'out', 'indie-all.html')}`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: path.join(DIR, 'out', 'indie-all.png'), fullPage: true })
  await b.close()
})()
