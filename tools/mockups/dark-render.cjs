// Снимки «тёмной летописи»: node tools/mockups/dark-render.cjs → tools/mockups/out/dark-v{1,2,3}-{menu,event}.png и лист dark-all.png
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const DIR = __dirname
const NAMES = { 1: '1 · Сажа и золото', 2: '2 · Лазурит', 3: '3 · Кожаный переплёт' }
;(async () => {
  const b = await chromium.launch()
  const shots = []
  for (const v of [1, 2, 3]) for (const screen of ['menu', 'event']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    await p.goto(`file://${path.join(DIR, 'dark.html')}?v=${v}&screen=${screen}`)
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(300)
    const h = await p.evaluate(() => Math.max(...[...document.querySelectorAll('.page:not([hidden]) > *')].map((e) => e.getBoundingClientRect().bottom)))
    const file = `dark-v${v}-${screen}.png`
    await p.screenshot({ path: path.join(DIR, 'out', file) })
    shots.push([file, `${NAMES[v]} — ${screen === 'menu' ? 'меню' : 'событие'}`])
    console.log(v, screen, 'низ содержимого', Math.round(h), h > 844 ? 'НЕ ВЛЕЗАЕТ' : '')
    await p.close()
  }
  const html = `<body style="margin:0;background:#111;color:#eee;font:22px sans-serif;display:flex;gap:28px;padding:28px;flex-wrap:wrap;width:2560px">${shots.map(([f, t]) => `<figure style="margin:0"><figcaption style="padding:0 0 10px">${t}</figcaption><img src="file://${path.join(DIR, 'out', f)}" style="width:390px;border-radius:14px"></figure>`).join('')}</body>`
  fs.writeFileSync(path.join(DIR, 'out', 'dark-all.html'), html)
  const p = await b.newPage({ viewport: { width: 2620, height: 950 } })
  await p.goto(`file://${path.join(DIR, 'out', 'dark-all.html')}`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: path.join(DIR, 'out', 'dark-all.png'), fullPage: true })
  await b.close()
})()
