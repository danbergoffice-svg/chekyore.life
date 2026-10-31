// Проверки сборки CrazyGames по чек-листу: загрузка до первого gameplayStart (десктоп и телефон), ошибки в консоли,
// экраны на размерах из требований (DPR 1). Нужен npx vite preview --outDir dist-crazygames --port 4174.
const { chromium, devices } = require('playwright')
const dir = process.env.SHOTS || 'shots'
const URL = 'http://localhost:4174/'
async function firstPlay(ctxOpts, label) {
  const b = await chromium.launch()
  const ctx = await b.newContext(ctxOpts)
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  let bytes = 0
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  const t0 = Date.now()
  await p.goto(URL)
  await p.waitForSelector('.lever:not([disabled])', { timeout: 30000 })
  const tMenu = Date.now() - t0
  const before = bytes
  await p.click('.lever')
  await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 30000 })
  await p.waitForTimeout(500)
  console.log(`${label}: до меню ${tMenu} мс, загружено до рычага (gameplayStart) ${(before / 1048576).toFixed(2)} МБ, после прокрутки ${(bytes / 1048576).toFixed(2)} МБ; ошибки: ${errs.length ? errs.slice(0, 3).join(' | ') : 'нет'}`)
  await b.close()
}
;(async () => {
  await firstPlay({ viewport: { width: 1216, height: 684 } }, 'Десктоп')
  await firstPlay({ ...devices['iPhone 13'] }, 'Телефон')
  // GP-01: читаемость на размерах окна, fullscreen, телефона и планшета при DPR 1.
  const sizes = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [1280, 720], [800, 450], [1080, 607]]
  const b = await chromium.launch()
  for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US' })
    const p = await ctx.newPage()
    await p.goto(URL)
    await p.waitForSelector('.lever:not([disabled])', { timeout: 30000 })
    await p.waitForTimeout(600)
    await p.screenshot({ path: `${dir}/cg-${w}x${h}-menu.png` })
    await p.click('.lever'); await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 30000 })
    await p.click('.spin-result .primary'); await p.waitForSelector('.reveal .primary'); await p.click('.reveal .primary')
    const t0 = Date.now()
    while (Date.now() - t0 < 30000 && !(await p.$('.modal .choices'))) await p.waitForTimeout(200)
    await p.waitForTimeout(400)
    await p.screenshot({ path: `${dir}/cg-${w}x${h}-event.png` })
    await ctx.close()
  }
  await b.close()
})()
