// Проверка приёмника, бота, CSV и утренней сводки на локальном SQLite (node:sqlite) вместо D1.
// Запуск: npm run test:worker  (или node tools/qa/worker-test.mjs [готовый dist/_worker.js])
// Сам собирает esbuild-ом worker/index.ts, worker/digest/index.ts и worker/stats.ts во временную папку.
// Цифры сверяются с независимым расчётом на JS по сырым строкам базы и с ручным расчётом для «вчера».
// Всё прогоняется дважды: числа в bind как INTEGER и как REAL (так D1 может передавать числа JS).
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = mkdtempSync(join(tmpdir(), 'thousands-worker-'))
const bundle = async (entry, name) => {
  await build({ entryPoints: [join(root, entry)], bundle: true, format: 'esm', target: 'es2022', outfile: join(out, name), logLevel: 'warning' })
  return join(out, name)
}
const files = {
  worker: process.argv[2] ? resolve(process.argv[2]) : await bundle('worker/index.ts', 'worker.mjs'),
  digest: await bundle('worker/digest/index.ts', 'digest.mjs'),
  stats: await bundle('worker/stats.ts', 'stats.mjs'),
}
let instance = 0
const load = (file) => import(pathToFileURL(file).href + '?i=' + ++instance)
const S = await load(files.stats)

// ---------- проверки ----------
let failed = 0
let passed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else {
    failed++
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''))
  }
}
const same = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `получено ${JSON.stringify(a)}, ожидалось ${JSON.stringify(b)}`)

// ---------- мок D1 на node:sqlite ----------
const sqlLog = []
function makeD1(realBinds) {
  const sql = new DatabaseSync(':memory:')
  // Режим REAL: каждое числовое значение bind оборачивается в CAST(? AS REAL).
  const prep = (q, args) => {
    sqlLog.push(q)
    if (!realBinds) return sql.prepare(q)
    let i = 0
    return sql.prepare(q.replace(/\?(\d*)/g, (m, n) => (typeof args[n ? Number(n) - 1 : i++] === 'number' ? `CAST(${m} AS REAL)` : m)))
  }
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    run: async () => prep(q, args).run(...args),
    all: async () => ({ results: prep(q, args).all(...args) }),
    q,
    args,
  })
  return {
    sql,
    prepare: (q) => stmt(q),
    batch: async (list) => list.map((s) => prep(s.q, s.args).run(...s.args)),
    exec: async (q) => sql.exec(q),
  }
}

// ---------- окружение ----------
const TOKEN = 'TEST_TOKEN_123:SECRET'
const WEBHOOK = 'whsec_Test-42'
const CHAT = '777'
let tgMode = 'ok'
const sent = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (!u.startsWith('https://api.telegram.org/')) throw new Error('неожиданный запрос ' + u)
  if (tgMode === 'throw') throw new TypeError('fetch failed')
  sent.push({ url: u, body: JSON.parse(init.body) })
  return new Response(JSON.stringify({ ok: tgMode === 'ok' }), { status: tgMode === '500' ? 500 : 200 })
}
const logs = []
const origLog = console.log
console.log = (...a) => {
  logs.push(a.join(' '))
  if (!a.join(' ').startsWith('telegram')) origLog(...a)
}
const pending = []
const ctx = { waitUntil: (p) => pending.push(p) }
const settle = async () => {
  const r = await Promise.allSettled(pending.splice(0))
  return r.filter((x) => x.status === 'rejected')
}

const H = 36e5
const now = Date.now()
const T = S.dayOf(now)
const Y = T - 1
const B = T - 2
const at = (day, h, m = 0, s = 0, ms = 0) => S.dayStart(day) + h * H + m * 6e4 + s * 1000 + ms

function seed(db) {
  const ins = db.sql.prepare('INSERT INTO events (ts, player_id, session_id, name, params_json, platform, build) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const ev = (ts, pid, name, params = {}, ctxp = {}) => ins.run(ts, pid, 's-' + pid, name, JSON.stringify({ lang: 'ru', ab: 'a', life_index: 1, mode: 'quick', ...ctxp, ...params }), 'web', 'test')
  // давний игрок: пришёл 10 дней назад, вчера вернулся и начал 4-ю жизнь
  ev(at(T - 10, 9), 'p_old', 'app_open', { referrer: '', life_code: '', load_ms: 900 })
  ev(at(T - 10, 9, 1), 'p_old', 'life_start', { era: 'E01' })
  ev(at(Y, 10), 'p_old', 'app_open', {}, { life_index: 4 })
  ev(at(Y, 10, 1), 'p_old', 'life_start', {}, { life_index: 4 })
  ev(at(Y, 10, 30), 'p_old', 'session_end', { screen: 'life', age: 33, sec_in_session: 1800 }, { life_index: 4 })
  // p1: новый вчера, ровно в 00:00:00.000 по Стамбулу; прожил жизнь и начал вторую
  ev(at(Y, 0), 'p1', 'app_open')
  ev(at(Y, 0, 1), 'p1', 'life_start')
  ev(at(Y, 0, 1, 5), 'p1', 'first_choice', { sec_from_start: 5 })
  for (const [m, age] of [[5, 5], [8, 10], [12, 20]]) ev(at(Y, 0, m), 'p1', 'age_milestone', { age, sec_in_life: m * 60 })
  ev(at(Y, 0, 30), 'p1', 'choice_made', { event_id: 'market_fight', option: 'a', age: 20, success: true })
  // сон о будущем: два неверных ответа «3», один верный
  for (const [sec, ok, value] of [[1, 0, '3'], [2, 0, '3'], [3, 1, '8']]) ev(at(Y, 0, 29, sec), 'p1', 'dream_step', { dream: 'eratosthenes', step: 3, kind: 'number', correct: ok, value })
  // тренировка — не считается
  ev(at(Y, 0, 29, 4), 'p1', 'dream_step', { dream: 'eratosthenes', step: 3, kind: 'number', correct: 1, value: '8', training: 1 })
  ev(at(Y, 0, 30), 'p1', 'life_end', { age: 54, cause: 'old', sec_in_life: 1740, choices: 30 })
  ev(at(Y, 0, 31), 'p1', 'life_start', {}, { life_index: 2 })
  ev(at(Y, 0, 40), 'p1', 'session_end', { screen: 'life', age: 3, sec_in_session: 2400 }, { life_index: 2 })
  // p2: вчера в 01:00 по Стамбулу = позавчера 22:00 UTC — должен попасть во «вчера»
  ev(at(Y, 1), 'p2', 'app_open', {}, { mode: 'full' })
  ev(at(Y, 1, 1), 'p2', 'life_start', {}, { mode: 'full' })
  ev(at(Y, 1, 2), 'p2', 'first_choice', { sec_from_start: 9 }, { mode: 'full' })
  ev(at(Y, 1, 5), 'p2', 'age_milestone', { age: 5, sec_in_life: 200 }, { mode: 'full' })
  ev(at(Y, 1, 7), 'p2', 'session_end', { screen: 'life', age: 12, sec_in_session: 400 }, { mode: 'full' })
  // p3: зашёл в 23:59:59.999, закрыл вкладку ровно в 00:00 сегодня
  ev(at(Y, 23, 59, 59, 999), 'p3', 'app_open')
  ev(at(T, 0), 'p3', 'session_end', { screen: 'menu', age: 0, sec_in_session: 30 })
  // p4: позавчера прожил полную жизнь
  ev(at(B, 12), 'p4', 'app_open', {}, { mode: 'full' })
  ev(at(B, 12, 1), 'p4', 'life_start', {}, { mode: 'full' })
  ev(at(B, 12, 2), 'p4', 'first_choice', { sec_from_start: 3 }, { mode: 'full' })
  for (const age of [5, 10, 15, 20]) ev(at(B, 12, 2 + age), 'p4', 'age_milestone', { age, sec_in_life: age * 30 }, { mode: 'full' })
  ev(at(B, 12, 25), 'p4', 'life_end', { age: 30, cause: 'war', sec_in_life: 600, choices: 10 }, { mode: 'full' })
  ev(at(B, 12, 30), 'p4', 'session_end', { screen: 'death', age: 30, sec_in_session: 900 }, { mode: 'full' })
  ev(at(B, 13), 'p4', 'session_end', {}, { mode: 'full' })
  // p5: позавчера новый, вчера вернулся (D1 для когорты позавчера)
  ev(at(B, 20), 'p5', 'app_open')
  ev(at(Y, 20), 'p5', 'app_open')
  ev(at(Y, 20, 5), 'p5', 'session_end', { screen: 'menu', age: 0, sec_in_session: 300 })
  // p6: пришёл 8 дней назад, вернулся вчера (D7)
  ev(at(T - 8, 15), 'p6', 'app_open')
  ev(at(Y, 15), 'p6', 'app_open')
  // p7: новый сегодня
  ev(at(T, 0, 5), 'p7', 'app_open')
  ev(at(T, 0, 6), 'p7', 'life_start')
  const fb = db.sql.prepare('INSERT INTO feedback (ts, player_id, rating, answers_json, contact, context_json) VALUES (?, ?, ?, ?, ?, ?)')
  fb.run(at(Y, 9), 'p1', 4, JSON.stringify({ liked: 'сцены', change: 'быстрее' }), '', '{}')
  fb.run(at(Y, 18), 'p2', 5, JSON.stringify({ liked: '=SUM(1+1)', change: 'текст с "кавычками"; точкой с запятой,\nзапятой и <тегом> & амперсандом' }), 'a@b.c', '{"era":"E03"}')
  fb.run(at(B, 10), 'p4', 3, JSON.stringify({ liked: 'всё' }), '', '{}')
}

// ---------- независимый расчёт на JS ----------
function rows(db) {
  const ev = db.sql.prepare('SELECT ts, player_id AS pid, name, params_json FROM events').all().map((r) => ({ ...r, p: JSON.parse(r.params_json || '{}') }))
  const fb = db.sql.prepare('SELECT ts, rating, answers_json FROM feedback ORDER BY ts, id').all()
  return { ev, fb }
}
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10)
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
function oracle({ ev, fb }, p, exitsLimit = 5) {
  const inP = ev.filter((e) => e.ts >= p.from && e.ts < p.to)
  const uniq = (f) => new Set(inP.filter(f).map((e) => e.pid).filter((x) => x != null)).size
  const first = (pid) => Math.min(...ev.filter((e) => e.pid === pid).map((e) => e.ts))
  const openedSet = [...new Set(inP.filter((e) => e.name === 'app_open' && e.pid != null).map((e) => e.pid))]
  const newPlayers = openedSet.filter((x) => first(x) >= p.from).length
  const funnel = {
    app_open: uniq((e) => e.name === 'app_open'),
    life_start: uniq((e) => e.name === 'life_start'),
    first_choice: uniq((e) => e.name === 'first_choice'),
    age_20: uniq((e) => e.name === 'age_milestone' && e.p.age === 20),
    life_end: uniq((e) => e.name === 'life_end'),
    second_life: uniq((e) => e.name === 'life_start' && e.p.life_index >= 2),
  }
  const groups = new Map()
  for (const e of inP.filter((e) => e.name === 'session_end')) {
    const k = e.p.screen ?? '(нет)'
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  const exits = [...groups.entries()]
    .map(([screen, list]) => {
      const ages = list.map((e) => e.p.age).filter((x) => x != null)
      const secs = list.map((e) => e.p.sec_in_session).filter((x) => x != null)
      return { screen, n: list.length, avg_age: r1(avg(ages)), avg_session_min: secs.length ? r1(avg(secs) / 60) : null }
    })
    .sort((a, b) => b.n - a.n || (a.screen < b.screen ? -1 : 1))
    .slice(0, exitsLimit)
  const lives = (list, mode) => {
    const ends = list.filter((e) => e.name === 'life_end')
    const m = avg(ends.map((e) => e.p.sec_in_life))
    return { mode, started: list.filter((e) => e.name === 'life_start').length, ended: ends.length, avg_min: m == null ? null : r1(m / 60), avg_age: r1(avg(ends.map((e) => e.p.age))), avg_choices: r1(avg(ends.map((e) => e.p.choices))) }
  }
  const lv = inP.filter((e) => e.name === 'life_start' || e.name === 'life_end')
  const modes = [...new Set(lv.map((e) => e.p.mode ?? '(нет)'))].map((m) => lives(lv.filter((e) => (e.p.mode ?? '(нет)') === m), m)).sort((a, b) => b.started - a.started || (a.mode < b.mode ? -1 : 1))
  const f = fb.filter((x) => x.ts >= p.from && x.ts < p.to)
  return { events: inP.length, opened: openedSet.length, newPlayers, returning: openedSet.length - newPlayers, played: funnel.life_start, funnel, exits, lives: lives(lv, 'все'), modes, feedback: { n: f.length, avg: r1(avg(f.map((x) => x.rating))), lastRating: f.length ? f[f.length - 1].rating : null } }
}
const pick = (s) => ({ events: s.events, opened: s.opened, newPlayers: s.newPlayers, returning: s.returning, played: s.played, funnel: s.funnel, exits: s.exits, lives: s.lives, modes: s.modes, feedback: { n: s.feedback.n, avg: s.feedback.avg, lastRating: s.feedback.last?.rating ?? null } })

// Простой разбор CSV (кавычки, "" внутри, переводы строк в ячейке).
function parseCsv(text, sep) {
  const out = [[]]
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) out[out.length - 1].push(cell), (cell = '')
    else if (c === '\r' && text[i + 1] === '\n') out[out.length - 1].push(cell), (cell = ''), out.push([]), i++
    else cell += c
  }
  if (out[out.length - 1].length === 0 && cell === '') out.pop()
  return out
}

// ---------- прогон ----------
async function suite(realBinds) {
  console.log(`\n=== Режим bind: ${realBinds ? 'REAL' : 'INTEGER'} ===`)
  const mod = await load(files.worker)
  const digest = await load(files.digest)
  const DB = makeD1(realBinds)
  const env = { DB, ADMIN_PASSWORD: 'пароль-pw', TELEGRAM_TOKEN: TOKEN, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_WEBHOOK_SECRET: WEBHOOK, ASSETS: { fetch: async () => new Response('static') } }
  let ip = 0
  const call = (path, init = {}, e = env) => {
    const headers = new Headers(init.headers)
    headers.set('cf-connecting-ip', '10.0.0.' + ++ip)
    return mod.default.fetch(new Request('https://thousands.life' + path, { ...init, headers }), e, ctx)
  }
  const post = (path, body, e) => call(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://thousands.life' }, body: JSON.stringify(body) }, e)
  const auth = { authorization: 'Basic ' + Buffer.from('x:пароль-pw').toString('base64') }

  // 1. Приём событий и отзывов — формат прежний
  let r = await post('/api/events', {
    events: [
      { name: 'app_open', ts: now, player_id: 'api1', session_id: 'sa', platform: 'web', build: 'b', lang: 'ru', life_index: 1, mode: 'quick', referrer: '' },
      { name: 'life_start', ts: now, player_id: 'api1', session_id: 'sa', life_index: 1, mode: 'quick', era: 'E03' },
      { name: 'Bad Name!' },
    ],
  })
  const evRes = await r.json()
  check('/api/events 200 и n=2', r.status === 200 && evRes.n === 2, JSON.stringify(evRes))
  check('/api/events CORS', r.headers.get('access-control-allow-origin') === 'https://thousands.life')
  const idx = DB.sql.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events' ORDER BY name").all().map((x) => x.name)
  same('индексы events (старые + events_ts)', idx, ['events_name_ts', 'events_player', 'events_ts'])
  const plan = DB.sql.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM events WHERE ts >= 1 AND ts < 2").all().map((x) => x.detail).join(' | ')
  check('запрос по периоду идёт по индексу ts', /events_ts/.test(plan), plan)
  seed(DB)

  sent.length = 0
  r = await post('/api/feedback', { rating: 4, answers: { liked: 'сцены', change: 'быстрее' }, contact: '', context: { era: 'E03' }, player_id: 'api1' })
  check('/api/feedback 200', r.status === 200)
  check('нет отклонённых waitUntil после отзыва', (await settle()).length === 0)
  check('отзыв ушёл в Telegram без parse_mode', sent.length === 1 && sent[0].body.chat_id === CHAT && !sent[0].body.parse_mode && /быстрее/.test(sent[0].body.text), JSON.stringify(sent[0]?.body))

  // Сбой Telegram не роняет приём
  for (const mode of ['throw', '500']) {
    tgMode = mode
    r = await post('/api/feedback', { rating: 2, answers: { liked: 'x' }, player_id: 'api2' })
    const rej = await settle()
    check(`Telegram ${mode}: /api/feedback всё равно 200`, r.status === 200 && rej.length === 0, `status ${r.status}, rejected ${rej.length}`)
    r = await post('/api/events', { events: [{ name: 'tab_open', player_id: 'api2', tab: 'x' }] })
    check(`Telegram ${mode}: /api/events 200`, r.status === 200)
  }
  tgMode = 'ok'
  // уберём служебные отзывы/события api2, чтобы не мешали ручным ожиданиям
  DB.sql.exec("DELETE FROM feedback WHERE player_id='api2'; DELETE FROM events WHERE player_id='api2'")

  r = await call('/api/time', { method: 'HEAD' })
  check('HEAD /api/time 200', r.status === 200)
  r = await call('/')
  check('статика через ASSETS', (await r.text()) === 'static')
  r = await post('/api/events', { events: [] })
  check('пустая пачка 400', r.status === 400)

  // 2. Расчёт: ручные ожидания для «вчера»
  const data = rows(DB)
  const sy = await S.summary(DB, S.period(Y))
  same('вчера: зашли / новые / вернулись / играли', [sy.opened, sy.newPlayers, sy.returning, sy.played], [6, 3, 3, 3])
  same('вчера: воронка', sy.funnel, { app_open: 6, life_start: 3, first_choice: 2, age_20: 1, life_end: 1, second_life: 2 })
  same('вчера: где уходят', sy.exits, [
    { screen: 'life', n: 3, avg_age: 16, avg_session_min: 25.6 },
    { screen: 'menu', n: 1, avg_age: 0, avg_session_min: 5 },
  ])
  same('вчера: жизни', sy.lives, { mode: 'все', started: 4, ended: 1, avg_min: 29, avg_age: 54, avg_choices: 30 })
  same('вчера: режимы', sy.modes.map((m) => [m.mode, m.started, m.ended]), [['quick', 3, 1], ['full', 1, 0]])
  same('вчера: отзывы', [sy.feedback.n, sy.feedback.avg, sy.feedback.last?.rating], [2, 4.5, 5])
  const sb = await S.summary(DB, S.period(B))
  same('позавчера (p2 в 01:00 по Стамбулу сюда не попал): зашли / играли / жизни', [sb.opened, sb.played, sb.lives.started], [2, 1, 1])
  same('позавчера: экран без screen → «(нет)»', sb.exits.map((x) => x.screen), ['(нет)', 'death'])

  // 3. Расчёт совпадает с независимым JS по всем периодам
  for (const [name, p, lim] of [['сегодня', S.period(T), 5], ['вчера', S.period(Y), 5], ['позавчера', S.period(B), 5], ['7 дней', S.period(T, 7), 10], ['прошлые 7 дней', S.period(T - 7, 7), 10], ['30 дней', S.period(T, 30), 10]]) {
    same(`SQL = JS: ${name}`, pick(await S.summary(DB, p, lim)), oracle(data, p, lim))
  }

  // 4. Когорты
  const coh = await S.cohorts(DB, T, 21)
  const byDay = Object.fromEntries(coh.map((c) => [c.day, c]))
  same('когорта позавчера: 2 новых, D1 = 1 (p5), D7 ещё рано', [byDay[S.dayIso(B)]?.new_players, byDay[S.dayIso(B)]?.d1, byDay[S.dayIso(B)]?.d7], [2, '1 (50%)', '—'])
  same('когорта 8 дней назад: D7 = 1 (p6)', [byDay[S.dayIso(T - 8)]?.d1, byDay[S.dayIso(T - 8)]?.d7], ['0 (0%)', '1 (100%)'])
  same('когорта вчера: D1 = p3 (событие в 00:00 сегодня)', byDay[S.dayIso(Y)]?.d1, '1 (33%)')
  same('когорта 10 дней назад', [byDay[S.dayIso(T - 10)]?.new_players, byDay[S.dayIso(T - 10)]?.d7], [1, '0 (0%)'])

  // 5. Webhook бота
  const tg = (text, chat = CHAT, secret = WEBHOOK) =>
    call('/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret == null ? {} : { 'x-telegram-bot-api-secret-token': secret }) }, body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: Number(chat), type: 'private' }, text } }) })
  sent.length = 0
  r = await tg('/stats', CHAT, null)
  check('webhook без секрета → 403', r.status === 403)
  r = await tg('/stats', CHAT, 'wrong')
  check('webhook с чужим секретом → 403', r.status === 403)
  r = await tg('/stats', '12345')
  await settle()
  check('чужой чат → 200 и тишина', r.status === 200 && sent.length === 0, `status ${r.status}, отправлено ${sent.length}`)
  r = await tg('привет')
  await settle()
  check('не команда → тишина', r.status === 200 && sent.length === 0)
  r = await call('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': WEBHOOK }, body: 'не json' })
  check('битый JSON → 200', r.status === 200)
  r = await call('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': WEBHOOK }, body: '{}' }, { ...env, TELEGRAM_WEBHOOK_SECRET: undefined })
  check('секрет не задан в env → 403', r.status === 403)
  r = await call('/api/telegram')
  check('GET /api/telegram → 405', r.status === 405)
  sent.length = 0
  await settle()

  const replies = {}
  for (const cmd of ['/stats', '/week', '/funnel', '/exits', '/help', '/digest', '/stats@thousands_bot', '/непонятно']) {
    sent.length = 0
    r = await tg(cmd)
    const rej = await settle()
    const msg = sent[0]?.body
    replies[cmd] = msg?.text ?? ''
    check(`${cmd}: 200, одно сообщение HTML в чат владельца, ≤ 4000`, r.status === 200 && rej.length === 0 && sent.length === 1 && msg.chat_id === CHAT && msg.parse_mode === 'HTML' && msg.text.length <= 4000, JSON.stringify({ status: r.status, n: sent.length, msg }).slice(0, 300))
  }
  check('/stats с @именем бота = /stats', replies['/stats@thousands_bot'] === replies['/stats'])
  check('незнакомая команда → /help', replies['/непонятно'] === replies['/help'] && /\/funnel/.test(replies['/help']))
  const st = replies['/stats']
  const oT = oracle(rows(DB), S.period(T))
  const m = st.match(/Зашли\s+(\d+)\s+(\d+)/)
  same('/stats: «Зашли» сегодня и вчера', m && [Number(m[1]), Number(m[2])], [oT.opened, 6])
  check('/stats: цифры в <pre>', /<pre>[\s\S]*Играли[\s\S]*<\/pre>/.test(st))
  const ow = oracle(rows(DB), S.period(T, 7), 10)
  const fu = replies['/funnel']
  for (const [k, label] of S.FUNNEL_STEPS) {
    const mm = fu.match(new RegExp(label + '\\s+(\\d+)'))
    check(`/funnel: ${label} = ${ow.funnel[k]}`, mm && Number(mm[1]) === ow.funnel[k], mm?.[0])
  }
  const ex = replies['/exits']
  check('/exits: все экраны недели с количеством', ow.exits.every((x) => new RegExp(x.screen.replace(/[()]/g, '\\$&') + '\\s+' + x.n + '\\s').test(ex)), ex)
  const wk = replies['/week']
  check('/week: зашли за 7 дней', new RegExp('Зашли\\s+' + ow.opened + '\\b').test(wk), wk.slice(0, 300))
  check('/week: строка «Сравнение»', /Сравнение<\/b> с прошлыми 7 днями/.test(wk))

  // 6. Утренняя сводка (отдельный Worker) = /digest = блок в /admin
  const dEnv = { DB, TELEGRAM_TOKEN: TOKEN, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_WEBHOOK_SECRET: WEBHOOK }
  sent.length = 0
  await digest.default.scheduled({ scheduledTime: now, cron: '0 6 * * *' }, dEnv, ctx)
  const dg = sent[0]?.body
  check('cron: одно сообщение HTML', sent.length === 1 && dg.parse_mode === 'HTML' && dg.chat_id === CHAT && dg.text.length <= 4000)
  check('cron = /digest', dg?.text === replies['/digest'])
  check('сводка: зашли 6, новых 3, вернулись 3, играли 3 (50%)', /Зашли\s+6\n\s+новые\s+3\n\s+вернулись\s+3\nИграли\s+3\s+50%/.test(dg?.text ?? ''), dg?.text)
  check('сводка: воронка с % от прошлого шага', /Начали жизнь\s+3\s+50%\nПервый выбор\s+2\s+67%\nДожили до 20\s+1\s+50%\nКонец жизни\s+1\s+100%\nВторая жизнь\s+2\s+200%/.test(dg?.text ?? ''))
  check('сводка: где уходят', /life\s+3\s+16\.0\s+25\.6\nmenu\s+1\s+0\.0\s+5\.0/.test(dg?.text ?? ''))
  check('сводка: жизни', /Начато\s+4\nЗавершено\s+1\nМин на жизнь\s+29\.0\nВозраст смерти\s+54\.0\nВыборов\s+30\.0/.test(dg?.text ?? ''))
  check('сводка: отзывы и последний одной строкой, HTML экранирован', /Отзывы:<\/b> 2, средняя оценка 4\.5\nПоследний: ★★★★★ =SUM\(1\+1\) \/ текст с &quot;кавычками&quot;; точкой с запятой, запятой и &lt;тегом&gt; &amp; амперсандом/.test(dg?.text ?? ''), dg?.text?.split('\n').slice(-3).join(' | '))
  check('сводка: сравнение с позавчера ▲200/▲200/▲300', /Сравнение<\/b> с .*: зашли ▲200% · играли ▲200% · жизни ▲300%/.test(dg?.text ?? ''))
  r = await call('/admin', { headers: auth })
  const html = await r.text()
  check('/admin: та же сводка, что в Telegram', r.status === 200 && html.includes(`<div class="tg">${dg?.text}</div>`))
  check('/admin: старые отчёты и отзывы на месте', /быстрее/.test(html) && /Где уходят/.test(html) && /События: частота/.test(html))
  check('/admin: отчёты «Воронка по дням» и «Когорты»', /Воронка по дням/.test(html) && /Когорты по дню первого захода/.test(html))
  check('/admin: отчёт по снам — доля верных и частый неверный ответ', html.includes('<td>eratosthenes</td><td>3</td><td>3</td><td>33</td><td>3 ×2</td>'))
  check('/admin: ссылки CSV', /href="\/admin\/export\?table=events&amp;days=7"/.test(html) && /table=feedback/.test(html))
  const fy = sy.funnel
  check('/admin: строка вчера в «Воронке по дням» = цифрам сводки', html.includes(`<tr><td>${S.dayIso(Y)}</td><td>${fy.app_open}</td><td>${fy.life_start}</td><td>${fy.first_choice}</td><td>${fy.age_20}</td><td>${fy.life_end}</td><td>${fy.second_life}</td></tr>`))
  check('/admin: воронка 7 дней = /funnel', S.FUNNEL_STEPS.every(([k, label]) => html.includes(`<td>${label}</td><td>${k}</td><td>${ow.funnel[k]}</td>`)))
  r = await call('/admin')
  check('/admin без пароля → 401', r.status === 401)
  r = await call('/admin', { headers: { authorization: 'Basic ' + Buffer.from('x:не тот').toString('base64') } })
  check('/admin с неверным паролем → 401', r.status === 401)
  r = await call('/admin', { headers: { authorization: 'Basic !!!' } })
  check('/admin с мусором в Basic → 401', r.status === 401)

  // Ручной запуск сводки
  sent.length = 0
  r = await digest.default.fetch(new Request('https://thousands-digest.example.workers.dev/run', { method: 'POST' }), dEnv)
  check('digest /run без ключа → 404', r.status === 404 && sent.length === 0)
  r = await digest.default.fetch(new Request('https://thousands-digest.example.workers.dev/run', { method: 'POST', headers: { authorization: 'Bearer ' + WEBHOOK } }), dEnv)
  check('digest /run с ключом → 200 и сообщение', r.status === 200 && sent.length === 1 && sent[0].body.text === dg?.text)
  tgMode = '500'
  let threw = false
  await digest.default.scheduled({ scheduledTime: now }, dEnv, ctx).catch(() => (threw = true))
  check('cron: отказ Telegram → запуск помечается неудачным', threw)
  tgMode = 'ok'

  // 7. CSV
  r = await call('/admin/export?table=events&days=7')
  check('CSV без пароля → 401', r.status === 401)
  r = await call('/admin/export?table=users&days=7', { headers: auth })
  check('CSV неизвестная таблица → 400', r.status === 400)
  r = await call('/admin/export?table=events&days=7', { headers: auth })
  const buf = new Uint8Array(await r.clone().arrayBuffer())
  const csv = await r.text()
  check('CSV: text/csv; charset=utf-8', r.headers.get('content-type') === 'text/csv; charset=utf-8')
  check('CSV: BOM EF BB BF в начале', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
  check('CSV: имя файла', /attachment; filename="thousands-events-\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv"/.test(r.headers.get('content-disposition') ?? ''))
  const ec = parseCsv(csv.replace(/^\uFEFF/, ''), ';')
  const want = DB.sql.prepare('SELECT COUNT(*) AS n FROM events WHERE ts >= ?').get(S.dayStart(T - 6)).n
  same('CSV events: заголовок', ec[0], ['id', 'time_istanbul', 'ts', 'player_id', 'session_id', 'name', 'params_json', 'platform', 'build'])
  same('CSV events: строк = событий за 7 дней', ec.length - 1, want)
  const p2row = ec.find((x) => x[3] === 'p2' && x[5] === 'app_open')
  same('CSV: время по Стамбулу', p2row?.[1], `${S.dayIso(Y)} 01:00:00`)
  check('CSV: params_json цел после кавычек', p2row && JSON.parse(p2row[6]).mode === 'full')
  r = await call('/admin/export?table=feedback&days=30&sep=comma', { headers: auth })
  const fc = parseCsv((await r.text()).replace(/^\uFEFF/, ''), ',')
  same('CSV feedback (запятая): строк', fc.length - 1, DB.sql.prepare('SELECT COUNT(*) AS n FROM feedback').get().n)
  const tricky = fc.find((x) => x[3] === 'p2')
  const ans = tricky && JSON.parse(tricky[5])
  check('CSV: многострочный ответ с кавычками и запятыми восстановлен', ans?.change === 'текст с "кавычками"; точкой с запятой,\nзапятой и <тегом> & амперсандом', tricky?.[5])
  r = await call('/admin/export?table=feedback&days=30', { headers: auth })
  const sc = parseCsv((await r.text()).replace(/^\uFEFF/, ''), ';')
  same('CSV: Excel-разделитель «;», колонок столько же', sc.every((x) => x.length === 8), true)

  // 8. Пустая база: «Вчера активности не было»
  const emptyMod = await load(files.digest)
  const E = makeD1(realBinds)
  E.sql.exec('CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, player_id TEXT, session_id TEXT, name TEXT NOT NULL, params_json TEXT, platform TEXT, build TEXT); CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, player_id TEXT, rating INTEGER, answers_json TEXT, contact TEXT, context_json TEXT);')
  sent.length = 0
  await emptyMod.default.scheduled({ scheduledTime: now }, { ...dEnv, DB: E }, ctx)
  check('пустая база: «Вчера активности не было»', sent.length === 1 && /Вчера активности не было/.test(sent[0].body.text), sent[0]?.body.text)
  return { digest: dg?.text, stats: st, week: wk, funnel: fu, exits: ex, help: replies['/help'] }
}

const a = await suite(false)
const b = await suite(true)
check('INTEGER и REAL дают одинаковые сообщения', JSON.stringify(a) === JSON.stringify(b))

// 9. Лимит CSV 50 000 строк и длина сообщения при «мусорных» данных
{
  const mod = await load(files.worker)
  const DB = makeD1(false)
  const env = { DB, ADMIN_PASSWORD: 'pw', TELEGRAM_TOKEN: TOKEN, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_WEBHOOK_SECRET: WEBHOOK, ASSETS: { fetch: async () => new Response('static') } }
  const req = (path, init = {}) => mod.default.fetch(new Request('https://thousands.life' + path, init), env, ctx)
  await req('/admin', { headers: { authorization: 'Basic ' + btoa('x:pw') } })
  const ins = DB.sql.prepare('INSERT INTO events (ts, player_id, session_id, name, params_json, platform, build) VALUES (?, ?, ?, ?, ?, ?, ?)')
  DB.sql.exec('BEGIN')
  const long = 'экран-' + 'x<&>"'.repeat(80)
  for (let i = 0; i < 50010; i++) {
    const k = i % 40
    const name = ['app_open', 'life_start', 'session_end', 'life_end'][i % 4]
    ins.run(at(Y, 12) + Math.floor(i / 7), 'q' + (i % 997), 's', name, JSON.stringify({ screen: long + k, mode: 'mode-' + long + k, age: k, sec_in_session: 60 * k, sec_in_life: 600, choices: 3, life_index: (i % 3) + 1 }), 'web', 't')
  }
  for (let i = 0; i < 20; i++) DB.sql.prepare('INSERT INTO feedback (ts, player_id, rating, answers_json) VALUES (?, ?, ?, ?)').run(at(Y, 13) + i, 'q', 5, JSON.stringify({ a: '<&>"'.repeat(500) }))
  DB.sql.exec('COMMIT')
  const t0 = Date.now()
  const r = await req('/admin/export?table=events&days=3', { headers: { authorization: 'Basic ' + btoa('x:pw') } })
  const lines = (await r.text()).split('\r\n').slice(1, -1)
  const ids = new Set(lines.map((l) => l.split(';')[0]))
  check('CSV: не больше 50 000 строк, без повторов на границах страниц, пометка x-truncated', lines.length === 50000 && ids.size === 50000 && r.headers.get('x-truncated') === '1', `${lines.length} строк, ${ids.size} разных id, ${r.headers.get('x-truncated')}`)
  const tss = lines.map((l) => Number(l.split(';')[2]))
  check('CSV: строки по времени', tss.every((t, i) => !i || t >= tss[i - 1]))
  console.log(`CSV 50 000 строк: ${Date.now() - t0} мс`)
  sent.length = 0
  for (const cmd of ['/stats', '/week', '/exits', '/digest']) {
    await req('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': WEBHOOK }, body: JSON.stringify({ message: { chat: { id: 777 }, text: cmd } }) })
  }
  await settle()
  const lens = sent.map((x) => x.body.text.length)
  check('длинные данные: все ответы ≤ 4000 и в HTML', sent.length === 4 && sent.every((x) => x.body.text.length <= 4000 && x.body.parse_mode === 'HTML'), lens.join(','))
  console.log('длина ответов /stats /week /exits /digest на «мусорных» данных:', lens.join(', '))
}

// 10. Секреты не попадают в логи; SQL без подстановки чисел в текст запроса
check('токен и секрет webhook не в логах', !logs.some((l) => l.includes(TOKEN) || l.includes(WEBHOOK)), logs.filter((l) => l.includes(TOKEN)).join(' | '))
const glued = [...new Set(sqlLog)].filter((q) => /\d{9,}/.test(q) || /'p\d'|'q\d/.test(q))
check('в текстах SQL нет вклеенных значений (только bind)', glued.length === 0, glued[0])

console.log('\nПример утренней сводки (как придёт в Telegram, HTML):\n' + a.digest)
console.log('\nПример /stats:\n' + a.stats)
console.log('\nПример /exits:\n' + a.exits)
console.log(`\nПроверок: ${passed + failed}, не прошло: ${failed}`)
rmSync(out, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
