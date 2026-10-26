// Свой приёмник аналитики и отзывов (ТЗ A3). Работает как _worker.js проекта Cloudflare Pages:
// /api/* и /admin обслуживает сам, всё остальное отдаёт статикой сайта (env.ASSETS).
//   POST /api/events    — пачка событий (до 50), пишется в D1, таблица events;
//   POST /api/feedback  — отзыв: таблица feedback + копия в Telegram (если заданы TELEGRAM_TOKEN и TELEGRAM_CHAT_ID);
//   HEAD|GET /api/time  — время сервера (заголовок Date и {now});
//   GET /admin          — отзывы и 5 отчётов, пароль ADMIN_PASSWORD (логин любой).
// IP-адреса не сохраняются: используются только для ограничения частоты запросов в памяти.

interface D1Result<T> {
  results: T[]
}
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared
  run(): Promise<unknown>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}
interface D1Database {
  prepare(sql: string): D1Prepared
  batch(statements: D1Prepared[]): Promise<unknown>
  exec(sql: string): Promise<unknown>
}
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
  DB?: D1Database
  ADMIN_PASSWORD?: string
  TELEGRAM_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void
}

const ORIGINS = [/^https:\/\/(www\.)?thousands\.life$/, /^https:\/\/[a-z0-9-]+\.thousands-life\.pages\.dev$/, /^https:\/\/([a-z0-9-]+\.)*yandex\.(ru|net|com|by|kz|uz|com\.tr)$/, /^http:\/\/localhost(:\d+)?$/]

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, player_id TEXT, session_id TEXT, name TEXT NOT NULL, params_json TEXT, platform TEXT, build TEXT);
CREATE INDEX IF NOT EXISTS events_name_ts ON events(name, ts);
CREATE INDEX IF NOT EXISTS events_player ON events(player_id);
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, player_id TEXT, rating INTEGER, answers_json TEXT, contact TEXT, context_json TEXT);
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
    ctx.waitUntil(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }),
      }).catch(() => null),
    )
  }
  return json({ ok: true })
}

// ---------- /admin ----------

const DAY = 864e5
const REPORTS: { title: string; days: number; sql: string }[] = [
  {
    title: 'Воронка за 7 дней (уникальные игроки)',
    days: 7,
    sql: `SELECT
  COUNT(DISTINCT CASE WHEN name='app_open' THEN player_id END) AS app_open,
  COUNT(DISTINCT CASE WHEN name='life_start' THEN player_id END) AS life_start,
  COUNT(DISTINCT CASE WHEN name='first_choice' THEN player_id END) AS first_choice,
  COUNT(DISTINCT CASE WHEN name='age_milestone' AND json_extract(params_json,'$.age')=20 THEN player_id END) AS age_20,
  COUNT(DISTINCT CASE WHEN name='life_end' THEN player_id END) AS life_end,
  COUNT(DISTINCT CASE WHEN name='life_start' AND json_extract(params_json,'$.life_index')>=2 THEN player_id END) AS second_life
FROM events WHERE ts > ?1`,
  },
  {
    title: 'Игроки и жизни по дням (14 дней)',
    days: 14,
    sql: `SELECT date(ts/1000,'unixepoch') AS day, COUNT(DISTINCT player_id) AS players,
  SUM(name='life_start') AS lives, SUM(name='life_end') AS deaths, SUM(name='feedback_sent') AS feedback
FROM events WHERE ts > ?1 GROUP BY day ORDER BY day DESC`,
  },
  {
    title: 'Длительность жизни: минуты и возраст по режимам (7 дней)',
    days: 7,
    sql: `SELECT json_extract(params_json,'$.mode') AS mode, COUNT(*) AS lives,
  ROUND(AVG(json_extract(params_json,'$.sec_in_life'))/60.0,1) AS avg_min,
  ROUND(AVG(json_extract(params_json,'$.age')),1) AS avg_age,
  ROUND(AVG(json_extract(params_json,'$.choices')),1) AS avg_choices
FROM events WHERE name='life_end' AND ts > ?1 GROUP BY mode`,
  },
  {
    title: 'Где уходят: последний экран и возраст при закрытии (7 дней)',
    days: 7,
    sql: `SELECT json_extract(params_json,'$.screen') AS screen, COUNT(*) AS n,
  ROUND(AVG(json_extract(params_json,'$.age')),1) AS avg_age,
  ROUND(AVG(json_extract(params_json,'$.sec_in_session'))/60.0,1) AS avg_session_min
FROM events WHERE name='session_end' AND ts > ?1 GROUP BY screen ORDER BY n DESC`,
  },
  {
    title: 'События: частота и доля успеха выбора (топ-30, 7 дней)',
    days: 7,
    sql: `SELECT json_extract(params_json,'$.event_id') AS event, COUNT(*) AS shown,
  ROUND(100.0*SUM(json_extract(params_json,'$.success'))/COUNT(*)) AS success_pct
FROM events WHERE name='choice_made' AND ts > ?1 GROUP BY event ORDER BY shown DESC LIMIT 30`,
  },
]

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function table(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '<p class="muted">Пока пусто.</p>'
  const cols = Object.keys(rows[0])
  return `<div class="scroll"><table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</table></div>`
}

async function admin(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  const pass = auth.startsWith('Basic ') ? atob(auth.slice(6)).split(':').slice(1).join(':') : ''
  if (!env.ADMIN_PASSWORD || pass !== env.ADMIN_PASSWORD) {
    return new Response('Нужен пароль', { status: 401, headers: { 'www-authenticate': 'Basic realm="thousands admin", charset="UTF-8"' } })
  }
  const db = env.DB!
  await ensureSchema(db)
  const now = Date.now()
  const fb = await db.prepare("SELECT datetime(ts/1000,'unixepoch') AS time, rating, answers_json, contact, context_json FROM feedback ORDER BY ts DESC LIMIT 100").all()
  const reports = await Promise.all(REPORTS.map(async (r) => ({ title: r.title, rows: (await db.prepare(r.sql).bind(now - r.days * DAY).all()).results })))
  const feedbackHtml = fb.results.length
    ? fb.results
        .map((f) => {
          const answers = Object.entries(JSON.parse(String(f.answers_json || '{}')) as Record<string, string>)
          return `<article><p class="muted">${esc(f.time)} · ${'★'.repeat(Number(f.rating))} · ${esc(f.context_json)}</p>${answers.map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}${f.contact ? `<p>✉ ${esc(f.contact)}</p>` : ''}</article>`
        })
        .join('')
    : '<p class="muted">Отзывов пока нет.</p>'
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Тысячи жизней — админка</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1100px;color:#2b2119;background:#f6efe2}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d6c6aa;padding:4px 8px;text-align:left}th{background:#ebdfc8}.scroll{overflow-x:auto}
article{background:#fbf6ec;border:1px solid #d6c6aa;border-radius:8px;padding:8px 12px;margin:8px 0}article p{margin:4px 0}.muted{color:#7d6b58;font-size:13px}</style></head>
<body><h1>Тысячи жизней — отзывы и отчёты</h1>${reports.map((r) => `<h2>${esc(r.title)}</h2>${table(r.rows)}`).join('')}<h2>Отзывы (последние 100)</h2>${feedbackHtml}</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (!path.startsWith('/api/') && path !== '/admin') return env.ASSETS.fetch(req)
    if (path === '/admin') return env.DB ? admin(req, env) : new Response('База D1 не подключена (привязка DB)', { status: 503 })
    const headers = cors(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (path === '/api/time') return req.method === 'HEAD' ? new Response(null, { headers: { ...headers, 'cache-control': 'no-store' } }) : json({ now: Date.now() }, 200, headers)
    if (req.method !== 'POST') return json({ ok: false }, 405, headers)
    if (!env.DB) return json({ ok: false, error: 'no_db' }, 503, headers)
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
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
