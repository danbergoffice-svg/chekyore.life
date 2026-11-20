// «Жизнь дня» (docs/TZ_daily.md): после первой жизни в меню карточка; жизнь дня начинается без барабана, после смерти -
// место в таблице дня, ник, таблица; в меню - «твоё место». Сервер (/api/daily, /api/nick) подменён здесь же.
// Для скорости: защита выключена, год - 1 с (подмена /flags.json). Нужен npx vite --port 5174.
const { chromium } = require('playwright')
const dir = process.env.SHOTS || 'shots'
const W = Number(process.env.W || 390)
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 })
  await ctx.route(/\/flags\.json/, async (r) => {
    const f = await (await r.fetch()).json()
    r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1, daily_share: 1, auto_spin_share: 0, ab_buckets: { a: 1 } } })
  })
  // Сервер жизни дня: 14 «чужих» итогов, свой - после /api/daily/result.
  const rows = Array.from({ length: 14 }, (_, i) => ({ nick: i % 4 === 2 ? null : ['Makuska', 'Leyla', 'tom_h', 'Ana_Z', 'kerem', 'Ali_K', 'Sofi', 'Bao'][i % 8] + (i > 7 ? i : ''), country: 'MX', age: 70 - i * 5, kids: (i * 7) % 5, prof: null }))
  let mine = null
  const board = (date) => {
    const all = [...rows, ...(mine ? [{ ...mine, me: true }] : [])].sort((a, b) => b.age - a.age || b.kids - a.kids).map((r, i) => ({ ...r, place: i + 1 }))
    return { date, n: all.length, top: all.slice(0, 10), me: all.find((r) => r.me) ?? null }
  }
  let nick = null
  await ctx.route(/\/api\/(daily|nick|events|time|players)/, async (r) => {
    const url = new URL(r.request().url())
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
  const play = async (until, ms = 300000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await until()) return true
      if (await p.$('.dream-modal')) {
        for (const inp of await p.$$('.dream-modal input')) await inp.fill('10').catch(() => {})
        const pick = await p.$('.dream-pick button, .dream-order-btns button')
        if (pick) await pick.click({ timeout: 500 }).catch(() => {})
        await p.click('.dream-modal .primary:not([disabled])', { timeout: 800 }).catch(() => {})
        continue
      }
      if (await p.$('.modal')) {
        if (await p.$('.outcome')) {
          await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {})
          continue
        }
        const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary, .modal .primary')
        if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {})
        continue
      }
      await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {})
      await p.waitForTimeout(20)
    }
    return false
  }
  const dead = async () => !!(await p.$('.summary, .early-death'))
  await p.goto('http://localhost:5174/?ab=a&tour=wall&goalat=0')
  await p.waitForSelector('.menu .slot-machine')
  console.log('0) новичок - карточки жизни дня нет:', !(await p.$('.daily-card')))
  // 1. Первая жизнь до смерти.
  await p.click('.spin-button')
  await p.click('.spin-result .primary')
  await p.waitForSelector('.reveal')
  await p.click('.reveal .primary')
  await play(dead)
  console.log('1) первая жизнь прожита')
  // 2. Меню: карточка жизни дня.
  await p.click('text=Меню').catch(() => {})
  await p.goto('http://localhost:5174/?ab=a&tour=wall&goalat=0')
  await p.waitForSelector('.daily-card', { timeout: 15000 })
  const card = await p.$('.daily-card')
  await card.scrollIntoViewIfNeeded()
  console.log('2) карточка в меню:', (await card.innerText()).replace(/\n+/g, ' | '))
  await card.screenshot({ path: `${dir}/daily-card.png` })
  await p.screenshot({ path: `${dir}/daily-menu.png`, fullPage: true })
  // 3. Жизнь дня: без барабана, сразу знакомство с семьёй.
  await p.click('.daily-play')
  await p.waitForSelector('.reveal', { timeout: 20000 })
  const who = await p.$eval('.reveal', (e) => e.innerText.slice(0, 120)).catch(() => '')
  console.log('3) жизнь дня началась:', who.replace(/\n+/g, ' | '))
  await p.click('.reveal .primary')
  await play(dead)
  for (let i = 0; i < 3 && !(await p.$('.daily-result')); i++) await p.waitForTimeout(500)
  const res = await p.$('.daily-result')
  console.log('4) итог жизни дня на прощании:', res ? (await res.innerText()).replace(/\n+/g, ' | ').slice(0, 400) : 'НЕТ')
  if (res) {
    await res.scrollIntoViewIfNeeded()
    await res.screenshot({ path: `${dir}/daily-result.png` })
    await p.fill('#daily-nick-in', 'fuck').catch(() => {})
    await p.click('.daily-nick .primary').catch(() => {})
    await p.fill('#daily-nick-in', 'Тест_игрок').catch(() => {})
    await p.click('.daily-nick .primary').catch(() => {})
    await p.waitForTimeout(800)
    console.log('5) после ника - форма скрыта:', !(await p.$('.daily-nick')), '; моя строка:', await p.$eval('.daily-row.me', (e) => e.innerText.replace(/\n+/g, ' ')).catch(() => 'НЕТ'))
    await (await p.$('.daily-result')).screenshot({ path: `${dir}/daily-result-nick.png` })
  }
  // 6. Меню: «твоё место» вместо кнопки, повторно не начать.
  await p.goto('http://localhost:5174/?ab=a&tour=wall&goalat=0')
  await p.waitForSelector('.daily-card', { timeout: 15000 })
  console.log('6) карточка после игры:', (await p.$eval('.daily-card', (e) => e.innerText)).replace(/\n+/g, ' | '), '; кнопки нет:', !(await p.$('.daily-play')))
  await (await p.$('.daily-card')).screenshot({ path: `${dir}/daily-card-done.png` })
  // Страница не шире экрана.
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  console.log('нет горизонтальной прокрутки:', !wide)
  console.log('ошибки страницы:', errs.length ? errs.join(' | ') : 'нет')
  await b.close()
})()
