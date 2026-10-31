// Свой приёмник аналитики и отзывов (ТЗ A3). Работает как _worker.js проекта Cloudflare Pages:
// /api/* и /admin обслуживает сам, всё остальное отдаёт статикой сайта (env.ASSETS).
//   POST /api/events    - пачка событий (до 50), пишется в D1, таблица events;
//   POST /api/feedback  - отзыв: таблица feedback + копия в Telegram (если заданы TELEGRAM_TOKEN и TELEGRAM_CHAT_ID);
//   HEAD|GET /api/time  - время сервера (заголовок Date и {now});
//   GET /api/players    - сколько всего игроков заходило в игру ({n}; пересчёт не чаще раза в 10 минут);
//   POST /api/telegram  - webhook бота: команды /stats /week /funnel /exits /digest /help (worker/telegram.ts);
//   GET /admin          - отзывы и отчёты, пароль ADMIN_PASSWORD (логин любой) (worker/admin.ts);
//   GET /admin/export   - CSV для Excel/Google Таблиц (?table=events|feedback&days=N).
// Цифры для админки, бота и ежедневной сводки (worker/digest/) считает один модуль - worker/stats.ts.
// IP-адреса не сохраняются: используются только для ограничения частоты запросов в памяти.

import { admin, authorized, exportCsv, unauthorized } from './admin'
import type { D1Database } from './stats'
import { sendMessage, telegramWebhook, type Ctx } from './telegram'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
  DB?: D1Database
  ADMIN_PASSWORD?: string
  TELEGRAM_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  TELEGRAM_WEBHOOK_SECRET?: string
}

const ORIGINS = [/^https:\/\/(www\.)?thousands\.life$/, /^https:\/\/[a-z0-9-]+\.thousands-life\.pages\.dev$/, /^https:\/\/([a-z0-9-]+\.)*yandex\.(ru|net|com|by|kz|uz|com\.tr)$/, /^http:\/\/localhost(:\d+)?$/]

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, player_id TEXT, session_id TEXT, name TEXT NOT NULL, params_json TEXT, platform TEXT, build TEXT);
CREATE INDEX IF NOT EXISTS events_name_ts ON events(name, ts);
CREATE INDEX IF NOT EXISTS events_player ON events(player_id);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, player_id TEXT, rating INTEGER, answers_json TEXT, contact TEXT, context_json TEXT);
CREATE TABLE IF NOT EXISTS players (player_id TEXT PRIMARY KEY, first_ts INTEGER);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL, mark INTEGER NOT NULL, updated INTEGER NOT NULL);
`

let schemaReady = false
async function ensureSchema(db: D1Database) {
  if (schemaReady) return
  await db.exec(SCHEMA.trim().split('\n').join(' '))
  schemaReady = true
}

// Ограничение частоты: не больше 60 запросов в минуту с одного адреса (в памяти этого экземпляра, адрес не пишется в базу).
const hits = new Map<string, { n: number; until: number }>()
function limited(ip: string, max = 60): boolean {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.until < now) {
    hits.set(ip, { n: 1, until: now + 60000 })
    if (hits.size > 5000) hits.clear()
    return false
  }
  h.n++
  return h.n > max
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  if (!ORIGINS.some((r) => r.test(origin))) return {}
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, GET, HEAD, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' }
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
}

const str = (v: unknown, max = 64) => (typeof v === 'string' ? v.slice(0, max) : null)

async function events(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { events?: Record<string, unknown>[] } | null
  const list = Array.isArray(body?.events) ? body!.events.slice(0, 50) : []
  if (!list.length) return json({ ok: false }, 400)
  const db = env.DB!
  await ensureSchema(db)
  const now = Date.now()
  const stmt = db.prepare('INSERT INTO events (ts, player_id, session_id, name, params_json, platform, build) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const rows = list
    .filter((e) => e && typeof e.name === 'string' && /^[a-z0-9_]{2,40}$/.test(e.name as string))
    .map((e) => {
      const { name, ts, player_id, session_id, platform, build, ...params } = e
      const time = typeof ts === 'number' && Math.abs(ts - now) < 7 * 864e5 ? ts : now
      return stmt.bind(time, str(player_id), str(session_id), name, JSON.stringify(params).slice(0, 2000), str(platform, 16), str(build, 32))
    })
  if (rows.length) await db.batch(rows)
  return json({ ok: true, n: rows.length })
}

async function feedback(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const f = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!f || typeof f.rating !== 'number') return json({ ok: false }, 400)
  const db = env.DB!
  await ensureSchema(db)
  const answers = JSON.stringify(f.answers ?? {}).slice(0, 4000)
  const context = JSON.stringify(f.context ?? {}).slice(0, 1000)
  const contact = str(f.contact, 200)
  const rating = Math.max(0, Math.min(5, Math.round(f.rating)))
  await db.prepare('INSERT INTO feedback (ts, player_id, rating, answers_json, contact, context_json) VALUES (?, ?, ?, ?, ?, ?)').bind(Date.now(), str(f.player_id), rating, answers, contact, context).run()
  if (env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT_ID) {
    const a = (f.answers ?? {}) as Record<string, string>
    const text = [`⭐ ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`, ...Object.entries(a).map(([k, v]) => `• ${k}: ${v}`), contact ? `✉ ${contact}` : '', `ℹ ${context}`].filter(Boolean).join('\n')
    // В фоне и без исключений: отзыв уже записан, сбой Telegram на ответ не влияет.
    ctx.waitUntil(sendMessage(env, text, false))
  }
  return json({ ok: true })
}

// Сколько всего игроков заходило в игру - для строки в подвале главного экрана. Чтобы не перечитывать всю таблицу
// событий на каждый заход: игроки копятся в таблице players по новым событиям (id больше прошлой отметки),
// число и отметка лежат в counters; пересчёт - не чаще раза в 10 минут, между ними - одна строка counters.
const PLAYERS_FRESH = 10 * 6e4
let playersMemo: { n: number; until: number } | null = null
async function players(env: Env): Promise<number> {
  const now = Date.now()
  if (playersMemo && playersMemo.until > now) return playersMemo.n
  const db = env.DB!
  await ensureSchema(db)
  const row = (await db.prepare("SELECT value, mark, updated FROM counters WHERE name = 'players'").all<{ value: number; mark: number; updated: number }>()).results[0]
  let n = row ? Number(row.value) : 0
  if (!row || now - Number(row.updated) >= PLAYERS_FRESH) {
    const mark = row ? Number(row.mark) : 0
    const top = Number((await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM events').all<{ m: number }>()).results[0]?.m ?? 0)
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO players (player_id, first_ts) SELECT player_id, MIN(ts) FROM events WHERE id > ?1 AND id <= ?2 AND player_id IS NOT NULL GROUP BY player_id').bind(mark, top),
      db
        .prepare("INSERT INTO counters (name, value, mark, updated) VALUES ('players', (SELECT COUNT(*) FROM players), ?1, ?2) ON CONFLICT(name) DO UPDATE SET value = excluded.value, mark = excluded.mark, updated = excluded.updated")
        .bind(top, now),
    ])
    n = Number((await db.prepare("SELECT value FROM counters WHERE name = 'players'").all<{ value: number }>()).results[0]?.value ?? 0)
  }
  playersMemo = { n, until: now + 2 * 6e4 }
  return n
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (!path.startsWith('/api/') && path !== '/admin' && !path.startsWith('/admin/')) return env.ASSETS.fetch(req)
    if (path === '/admin' || path === '/admin/export') {
      if (!(await authorized(req, env))) return unauthorized()
      if (!env.DB) return new Response('База D1 не подключена (привязка DB)', { status: 503 })
      try {
        await ensureSchema(env.DB)
        return path === '/admin' ? await admin(req, env) : await exportCsv(req, env)
      } catch (e) {
        return new Response('Ошибка базы: ' + String(e).slice(0, 300), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }
    }
    if (path.startsWith('/admin/')) return new Response('Не найдено', { status: 404 })
    // Webhook бота: свой секрет, без CORS и без общего ограничения частоты (все запросы идут с адресов Telegram).
    if (path === '/api/telegram') {
      if (req.method !== 'POST') return new Response(null, { status: 405 })
      if (env.DB) await ensureSchema(env.DB).catch(() => null)
      return telegramWebhook(req, env, ctx)
    }
    const headers = cors(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (path === '/api/time') return req.method === 'HEAD' ? new Response(null, { headers: { ...headers, 'cache-control': 'no-store' } }) : json({ now: Date.now() }, 200, headers)
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
    if (path === '/api/players' && req.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'no_db' }, 503, headers)
      if (limited(ip)) return json({ ok: false, error: 'rate' }, 429, headers)
      try {
        return json({ ok: true, n: await players(env) }, 200, { ...headers, 'cache-control': 'public, max-age=300' })
      } catch (e) {
        return json({ ok: false, error: String(e).slice(0, 200) }, 500, headers)
      }
    }
    if (req.method !== 'POST') return json({ ok: false }, 405, headers)
    if (!env.DB) return json({ ok: false, error: 'no_db' }, 503, headers)
    if (limited(ip, path === '/api/feedback' ? 10 : 60)) return json({ ok: false, error: 'rate' }, 429, headers)
    try {
      if (path === '/api/events') return withHeaders(await events(req, env), headers)
      if (path === '/api/feedback') return withHeaders(await feedback(req, env, ctx), headers)
    } catch (e) {
      return json({ ok: false, error: String(e).slice(0, 200) }, 500, headers)
    }
    return json({ ok: false }, 404, headers)
  },
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
  return res
}
