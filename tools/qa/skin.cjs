// Оформление «Карта пути» на всех экранах: меню, барабан, знакомство, событие, вкладки жизни, итоги, мемориал,
// награды, настройки, «Об игре», панель даров. Снимки – в $SHOTS (по умолчанию shots/skin-*.png). Нужен npx vite --port 5174.
const { chromium } = require('playwright')
const dir = process.env.SHOTS || 'shots'
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', reducedMotion: 'reduce', colorScheme: process.env.THEME || 'dark' })
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1 } }) })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  // Тексты без пола героя (режим разработки, src/i18n): {g:…} взял бы мужскую форму.
  const noSex = new Set()
  p.on('console', (m) => { const x = m.text().match(/без пола героя: (\S+)/); if (x) noSex.add(x[1]) })
  const shot = (n, full) => p.screenshot({ path: `${dir}/skin-${n}.png`, fullPage: !!full })
  await p.goto('http://localhost:5174/?ab=a')
  await p.waitForSelector('.menu .slot-machine')
  await p.waitForTimeout(700)
  await shot('menu')
  await p.click('.lever'); await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 20000 }); await p.waitForTimeout(400)
  await shot('spun')
  await p.click('.spin-result .primary'); await p.waitForSelector('.reveal'); await shot('reveal')
  await p.click('.reveal .primary')
  let ev = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 300000) {
    if (await p.$('.summary, .early-death')) break
    if (await p.$('.dream-modal')) {
      if (!(await p.$('.dream-shot-done'))) { await shot('dream'); await p.evaluate(() => document.body.classList.add('dream-shot-done')) }
      for (const inp of await p.$$('.dream-modal input')) await inp.fill('10').catch(() => {})
      const pick = await p.$('.dream-pick button, .dream-order-btns button'); if (pick) await pick.click({ timeout: 500 }).catch(() => {})
      await p.click('.dream-modal .primary:not([disabled])', { timeout: 800 }).catch(() => {}); continue
    }
    if (await p.$('.modal')) {
      if (await p.$('.outcome')) { if (ev === 1) await shot('outcome'); await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue }
      if (ev === 0) { await p.waitForTimeout(300); await shot('event') }
      ev++
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary, .modal .primary')
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {}); continue
    }
    if (ev === 3) {
      ev++
      await p.click('.speed .chip:nth-child(1)').catch(() => {})
      await shot('life')
      for (const [i, n] of [[2, 'hero'], [3, 'people'], [4, 'diary']]) { await p.click(`.tabs .tab:nth-child(${i})`).catch(() => {}); await p.waitForTimeout(300); await shot(n) }
      await p.click('.tabs .tab:nth-child(1)').catch(() => {})
    }
    if (await p.$('.death, .screen.dead')) { await shot('death'); await p.click('.screen .primary', { timeout: 500 }).catch(() => {}) }
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {})
    await p.waitForTimeout(20)
  }
  for (let i = 0; i < 5 && !(await p.$('.summary')); i++) { await p.click('.screen .primary').catch(() => {}); await p.waitForTimeout(300) }
  await p.waitForTimeout(500)
  await shot('summary')
  await shot('summary-full', true)
  await p.locator('.summary button', { hasText: /Родиться снова/ }).first().click()
  await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(500)
  await shot('menu-return')
  if (await p.$('.gifts-btn')) { await p.click('.gifts-btn'); await p.waitForSelector('.sheet'); await p.waitForTimeout(300); await shot('gifts'); await p.click('.sheet-done') }
  for (const [label, n] of [[/Мемориал/, 'memorial'], [/Награды/, 'awards'], [/Настройки/, 'settings'], [/Об игре/, 'about']]) {
    await p.locator('.menu-nav .link', { hasText: label }).first().click()
    await p.waitForTimeout(500)
    await shot(n)
    await p.goto('http://localhost:5174/?ab=a')
    await p.waitForSelector('.menu .slot-machine')
    await p.waitForTimeout(800)
    if (await p.$('.sheet')) await p.click('.sheet-done')
  }
  console.log('без пола героя:', [...noSex])
  console.log({ errors: errs.slice(0, 5) })
  await b.close()
})()
