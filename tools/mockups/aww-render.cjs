// Снимки трёх стилей по референсам Awwwards: node tools/mockups/aww-render.cjs → out/aww-{a,b,c}-{menu,event}.png и лист aww-all.png
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const DIR = __dirname
const NAMES = { a: 'A · Золотой фолиант', b: 'Б · Карта пути', c: 'В · Сумерки с огнями' }
;(async () => {
  const b = await chromium.launch()
  const shots = []
  for (const v of ['a', 'b', 'c']) for (const screen of ['menu', 'event']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    await p.goto(`file://${path.join(DIR, 'aww.html')}?v=${v}&screen=${screen}`)
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(300)
    const h = await p.evaluate(() => Math.max(...[...document.querySelectorAll('.page:not([hidden]) *:not(svg *)')].map((e) => e.getBoundingClientRect().bottom)))
    const file = `aww-${v}-${screen}.png`
    await p.screenshot({ path: path.join(DIR, 'out', file) })
    shots.push([file, `${NAMES[v]} — ${screen === 'menu' ? 'меню' : 'событие'}`])
    console.log(v, screen, 'низ содержимого', Math.round(h), h > 844 ? 'НЕ ВЛЕЗАЕТ' : '')
    await p.close()
  }
  const html = `<body style="margin:0;background:#111;color:#eee;font:22px sans-serif;display:flex;gap:28px;padding:28px;flex-wrap:wrap;width:2560px">${shots.map(([f, t]) => `<figure style="margin:0"><figcaption style="padding:0 0 10px">${t}</figcaption><img src="file://${path.join(DIR, 'out', f)}" style="width:390px;border-radius:14px"></figure>`).join('')}</body>`
  fs.writeFileSync(path.join(DIR, 'out', 'aww-all.html'), html)
  const p = await b.newPage({ viewport: { width: 2620, height: 950 } })
  await p.goto(`file://${path.join(DIR, 'out', 'aww-all.html')}`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: path.join(DIR, 'out', 'aww-all.png'), fullPage: true })
  await b.close()
})()
