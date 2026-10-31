// Превью «скина» поверх настоящей игры: node tools/mockups/skin-capture.cjs [skin.css] → out/skin-{name}-*.png
// Можно несколько css подряд (скин + вариант барабана), имя снимков — по последнему; STOP=spun — только меню и барабан.
// Без аргумента — снимки текущего дизайна. Нужен npx vite --port 5174.
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const DIR = __dirname
const skins = process.argv.slice(2)
const skin = skins[skins.length - 1]
const name = skin ? path.basename(skin, '.css') : 'now'
const theme = process.env.THEME || 'dark'
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', reducedMotion: 'reduce', colorScheme: theme })
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, (r) => r.abort())
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, year_sec_child: 2, year_sec: 2 } }) })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const css = skins.map((f) => fs.readFileSync(path.resolve(f), 'utf8')).join('\n')
  const addSkin = async () => { if (css) { await p.addStyleTag({ content: css }); await p.evaluate(() => document.documentElement.classList.add('skin')) } }
  await p.addInitScript(() => { localStorage.setItem('thousands.lang', 'ru') })
  await p.goto('http://localhost:5174/?ab=a')
  await p.waitForSelector('.menu .slot-machine')
  await addSkin()
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(800)
  // Барабан крупно: с запасом под арку сверху, рычаг справа и лоток снизу.
  const drumShot = async (n) => {
    const r = await p.$eval('.slot-machine', (e) => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
    await p.waitForTimeout(150)
    const y = Math.max(0, r.y - 74)
    await p.screenshot({ path: path.join(DIR, 'out', `skin-${name}-${n}.png`), clip: { x: 0, y, width: 390, height: Math.min(844 - y, r.h + 74 + 40) } })
  }
  const shot = (n, full) => p.screenshot({ path: path.join(DIR, 'out', `skin-${name}-${n}.png`), fullPage: !!full })
  await shot('menu')
  await drumShot('drum')
  await shot('menu-full', true)
  await p.click('.lever')
  await p.waitForSelector('.spin-result', { timeout: 15000 })
  await p.waitForTimeout(500)
  await shot('spun')
  await drumShot('drum-spun')
  if (process.env.STOP === 'spun') { console.log(name, 'ошибки:', errs.slice(0, 3)); await b.close(); return }
  await p.click('.spin-result .primary')
  await p.waitForSelector('.reveal')
  await p.waitForTimeout(400)
  await shot('reveal')
  await p.click('.reveal .primary')
  // До первого события с выбором.
  const t0 = Date.now()
  while (Date.now() - t0 < 60000 && !(await p.$('.modal .choices'))) await p.waitForTimeout(100)
  await p.waitForTimeout(600)
  await p.hover('.choices .choice').catch(() => {})
  await p.waitForTimeout(200)
  await shot('event')
  const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary')
  if (opts.length) await opts[0].click()
  await p.waitForTimeout(400)
  if (await p.$('.outcome')) { await shot('outcome'); await p.click('.outcome .primary').catch(() => {}) }
  await p.waitForTimeout(2500)
  if (!(await p.$('.modal'))) await shot('life')
  // Меню с карточкой «Продолжить».
  await p.locator('.hero-bar .link', { hasText: /Меню/ }).first().click().catch(() => {})
  await p.waitForSelector('.menu .slot-machine', { timeout: 5000 }).catch(() => {})
  if (css) await p.evaluate(() => document.documentElement.classList.add('skin'))
  await p.waitForTimeout(600)
  await p.evaluate(() => (document.scrollingElement || document.body).scrollTo(0, 99999))
  await p.waitForTimeout(300)
  await shot('menu-bottom')
  console.log(name, 'ошибки:', errs.slice(0, 3))
  await b.close()
})()
