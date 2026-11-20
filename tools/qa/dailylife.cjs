// «Жизнь дня» (docs/TZ_daily.md): новичку карточки нет; у вернувшегося - карточка в меню, жизнь дня начинается без
// барабана, после смерти - место в таблице дня, ник, таблица; в меню - «твоё место», повторно не начать.
// Сервер (/api/daily, /api/nick) подменён здесь же. Чтобы не проживать первую жизнь, во второй части daily_min_lives = 0.
// Нужен npx vite --port 5174. Запуск: node tools/qa/dailylife.cjs  (W=360 - узкий экран)
const { chromium } = require('playwright')
const dir = process.env.SHOTS || 'shots'
const W = Number(process.env.W || 390)
const URL = 'http://localhost:5174/?ab=a&tour=wall&goalat=0'
;(async () => {
  const b = await chromium.launch()
  const context = async (minLives) => {
    const ctx = await b.newContext({ viewport: { width: W, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 })
    await ctx.route(/\/flags\.json/, async (r) => {
      const f = await (await r.fetch()).json()
      r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 0.3, year_sec: 0.3, year_sec_child_quiet: 0.3, kids_share: 0, daily_share: 1, daily_min_lives: minLives, auto_spin_share: 0, ab_buckets: { a: 1 } } })
    })
    return ctx
  }
  // 0. Новичок с настоящим порогом (одна законченная жизнь) карточки не видит.
  {
    const ctx = await context(1)
    const p = await ctx.newPage()
    await p.goto(URL)
    await p.waitForSelector('.menu .slot-machine')
    await p.waitForTimeout(1500)
    console.log('0) новичок - карточки жизни дня нет:', !(await p.$('.daily-card')))
    await ctx.close()
  }
  const ctx = await context(0)
  // Сервер жизни дня: 14 «чужих» итогов, свой - после /api/daily/result.
  const rows = Array.from({ length: 14 }, (_, i) => ({ nick: i % 4 === 2 ? null : ['Makuska', 'Leyla', 'tom_h', 'Ana_Z', 'kerem', 'Ali_K', 'Sofi', 'Bao'][i % 8] + (i > 7 ? i : ''), country: 'MX', age: 70 - i * 5, kids: (i * 7) % 5, prof: null }))
  let mine = null
  const board = (date) => {
    const all = [...rows, ...(mine ? [{ ...mine, me: true }] : [])].sort((a, b) => b.age - a.age || b.kids - a.kids).map((r, i) => ({ ...r, place: i + 1 }))
    return { date, n: all.length, top: all.slice(0, 10), me: all.find((r) => r.me) ?? null }
  }
  let nick = null
  await ctx.route(/\/api\/(daily|nick|events|time|players)/, async (r) => {
    const url = new globalThis.URL(r.request().url())
    if (url.pathname === '/api/daily') return r.fulfill({ json: { ok: true, board: board(url.searchParams.get('date')) } })
    if (url.pathname === '/api/daily/result') {
      const body = r.request().postDataJSON()
      mine = { nick, country: 'TR', age: body.age, kids: body.kids, prof: body.prof }
      console.log('   итог ушёл на сервер:', JSON.stringify({ date: body.date, age: body.age, kids: body.kids, birth: body.birth }))
      return r.fulfill({ json: { ok: true, board: board(body.date) } })
    }
    if (url.pathname === '/api/nick') {
      nick = r.request().postDataJSON().nick
      if (mine) mine.nick = nick
      return r.fulfill({ json: { ok: true } })
    }
    if (url.pathname === '/api/players') return r.fulfill({ json: { ok: true, n: 2480 } })
    if (url.pathname === '/api/time') return r.fulfill({ status: 200, headers: { date: new Date().toUTCString() }, body: '' })
    return r.fulfill({ json: { ok: true } })
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  // Автоигрок: проходит обучение, выбирает первый вариант, закрывает итог; одно и то же окно 6 раз подряд - Escape.
  const play = async (until, ms = 900000) => {
    const t0 = Date.now()
    let same = 0
    let prev = ''
    while (Date.now() - t0 < ms) {
      if (await until()) return true
      if (await p.$('.tour-btns')) {
        await p.click('.tour-btns button', { timeout: 500 }).catch(() => {})
        continue
      }
      if (await p.$('.dream-modal')) {
        for (const inp of await p.$$('.dream-modal input')) await inp.fill('10').catch(() => {})
        const pick = await p.$('.dream-pick button, .dream-order-btns button')
        if (pick) await pick.click({ timeout: 500 }).catch(() => {})
        await p.click('.dream-modal .primary:not([disabled])', { timeout: 800 }).catch(() => {})
        continue
      }
      const modal = await p.$('.modal')
      if (modal) {
        const text = (await modal.innerText().catch(() => '')).slice(0, 80)
        same = text === prev ? same + 1 : 0
        prev = text
        if (same >= 6) {
          await p.keyboard.press('Escape')
          same = 0
          continue
        }
        if (await p.$('.outcome')) {
          await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {})
          continue
        }
        // Сначала варианты события, потом главная кнопка окна, и только потом любая (не справка «i»).
        let opts = await p.$$('.choices .choice:not([disabled]), .choices .primary')
        if (!opts.length) opts = await p.$$('.modal .primary:not([disabled])')
        if (!opts.length) opts = await p.$$('.modal-body button:not([disabled]):not(.ev-info)')
        if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {})
        continue
      }
      await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {})
      await p.waitForTimeout(20)
    }
    return false
  }
  const dead = async () => !!(await p.$('.summary, .early-death'))
  // 1. Меню: карточка жизни дня.
  await p.goto(URL)
  await p.waitForSelector('.daily-card', { timeout: 15000 })
  if (await p.$('.sheet-done')) await p.click('.sheet-done').catch(() => {})
  const card = await p.$('.daily-card')
  await card.scrollIntoViewIfNeeded()
  console.log('1) карточка в меню:', (await card.innerText()).replace(/\n+/g, ' | '))
  await card.screenshot({ path: `${dir}/daily-card.png` })
  await p.screenshot({ path: `${dir}/daily-menu.png`, fullPage: true })
  // 2. Жизнь дня: без барабана, сразу знакомство с семьёй.
  await p.click('.daily-play')
  await p.waitForSelector('.reveal', { timeout: 20000 })
  console.log('2) жизнь дня началась:', (await p.$eval('.reveal', (e) => e.innerText.slice(0, 140)).catch(() => '')).replace(/\n+/g, ' | '))
  await p.click('.reveal .primary')
  console.log('   прожита:', await play(dead))
  for (let i = 0; i < 6 && !(await p.$('.daily-result')); i++) await p.waitForTimeout(500)
  const res = await p.$('.daily-result')
  console.log('3) итог жизни дня на прощании:', res ? (await res.innerText()).replace(/\n+/g, ' | ').slice(0, 400) : 'НЕТ')
  if (res) {
    await res.scrollIntoViewIfNeeded()
    await res.screenshot({ path: `${dir}/daily-result.png` })
    await p.fill('#daily-nick-in', 'ab')
    await p.click('.daily-nick .primary')
    console.log('4) короткий ник - ошибка:', await p.$eval('.daily-nick .error', (e) => e.innerText).catch(() => 'НЕТ'))
    await p.fill('#daily-nick-in', 'Тест_игрок')
    await p.click('.daily-nick .primary')
    await p.waitForTimeout(800)
    console.log('   после ника - форма скрыта:', !(await p.$('.daily-nick')), '; моя строка:', await p.$eval('.daily-row.me', (e) => e.innerText.replace(/\n+/g, ' ')).catch(() => 'НЕТ'))
    await (await p.$('.daily-result')).screenshot({ path: `${dir}/daily-result-nick.png` })
  }
  // 5. Меню: «твоё место» вместо кнопки, повторно не начать.
  await p.goto(URL)
  await p.waitForSelector('.daily-card', { timeout: 15000 })
  console.log('5) карточка после игры:', (await p.$eval('.daily-card', (e) => e.innerText)).replace(/\n+/g, ' | '), '; кнопки нет:', !(await p.$('.daily-play')))
  await (await p.$('.daily-card')).screenshot({ path: `${dir}/daily-card-done.png` })
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  console.log('нет горизонтальной прокрутки:', !wide)
  console.log('ошибки страницы:', errs.length ? errs.join(' | ') : 'нет')
  await b.close()
})()
