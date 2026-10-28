// /admin — отчёты и отзывы, /admin/export — выгрузка CSV. Пароль ADMIN_PASSWORD (Basic, логин любой).
// Цифры считаются тем же кодом, что и бот, и ежедневная сводка (worker/stats.ts), дни — по Стамбулу.
import { cohorts, dayIso, dayOf, dayStart, digestMessage, esc, FUNNEL_STEPS, pct, period, SQL, summary, type D1Database } from './stats'
import { safeEqual } from './telegram'

export interface AdminEnv {
  DB?: D1Database
  ADMIN_PASSWORD?: string
}

const EXPORT_LIMIT = 50000
const PAGE = 5000

/** Пароль из заголовка Basic (логин любой). UTF-8, чтобы работали пароли не только латиницей. */
function basicPassword(req: Request): string {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Basic ')) return ''
  try {
    const bin = atob(auth.slice(6).trim())
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    return text.split(':').slice(1).join(':')
  } catch {
    return ''
  }
}

export async function authorized(req: Request, env: AdminEnv): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false
  return safeEqual(basicPassword(req), env.ADMIN_PASSWORD)
}

export const unauthorized = () => new Response('Нужен пароль', { status: 401, headers: { 'www-authenticate': 'Basic realm="thousands admin", charset="UTF-8"' } })

function table(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '<p class="muted">Пока пусто.</p>'
  const cols = Object.keys(rows[0])
  return `<div class="scroll"><table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</table></div>`
}

export async function admin(req: Request, env: AdminEnv): Promise<Response> {
  const db = env.DB!
  const now = Date.now()
  const today = dayOf(now)
  const week = period(today, 7)
  const two = period(today, 14)
  const all = (sql: string, p = week) => db.prepare(sql).bind(p.from, p.to).all().then((r) => r.results)
  const [fb, s, byDay, players, choices, dreams, cohortRows, digest, ab] = await Promise.all([
    db.prepare("SELECT datetime(ts/1000 + 10800,'unixepoch') AS time, rating, answers_json, contact, context_json FROM feedback ORDER BY ts DESC LIMIT 100").all(),
    summary(db, week, 100),
    all(SQL.funnelByDay, two),
    all(SQL.playersByDay, two),
    all(SQL.choices),
    all(SQL.dreamSteps, period(today, 30)),
    cohorts(db, today, 21),
    digestMessage(db, now),
    all(SQL.abSecondLife, two),
  ])
  // A/B второй жизни: доли — от начавших вторую жизнь в варианте.
  const abRows = ab.map((r) => {
    const n = Number(r.players)
    const p = (k: string) => `${r[k]} (${pct(Number(r[k]), n)})`
    return { вариант: r.variant, 'начали 2-ю жизнь': n, 'высокое положение': r.high, 'до 20 лет': p('age_20'), 'до 40 лет': p('age_40'), '3-я жизнь': p('third_life'), 'вернулись в другой день': p('returned'), 'возраст смерти': r.death_age ?? '—' }
  })
  const f = s.funnel
  const reports: { title: string; rows: Record<string, unknown>[] }[] = [
    { title: `Воронка за 7 дней, ${week.label} (уникальные игроки; как /funnel)`, rows: FUNNEL_STEPS.map(([k, label], i) => ({ шаг: label, событие: k, игроки: f[k], '% от прошлого': i ? pct(f[k], f[FUNNEL_STEPS[i - 1][0]]) : '' })) },
    { title: 'Воронка по дням (14 дней, уникальные игроки)', rows: byDay },
    { title: 'A/B второй жизни за 14 дней: a — положение как выпало, b — сразу высокое (обе защищены до 20 лет; флаг ab_buckets)', rows: abRows },
    { title: 'Когорты по дню первого захода: вернулись через 1 день (D1) и через 7 дней (D7)', rows: cohortRows.map((c) => ({ day: c.day, new_players: c.new_players, D1: c.d1, D7: c.d7 })) },
    { title: 'Игроки и жизни по дням (14 дней)', rows: players },
    { title: `Жизни по режимам за 7 дней (как /week): минуты, возраст смерти, выборы`, rows: [...s.modes, s.lives] as unknown as Record<string, unknown>[] },
    { title: `Где уходят за 7 дней (как /exits): последний экран, возраст героя, минуты сессии`, rows: s.exits as unknown as Record<string, unknown>[] },
    { title: 'События: частота и доля успеха выбора (топ-30, 7 дней)', rows: choices },
    { title: 'Сны о будущем (30 дней): доля верных ответов по сну и шагу, самый частый неверный ответ', rows: dreams },
  ]
  const feedbackHtml = fb.results.length
    ? fb.results
        .map((r) => {
          let answers: [string, unknown][] = []
          try {
            answers = Object.entries(JSON.parse(String(r.answers_json || '{}')) as Record<string, unknown>)
          } catch {
            answers = [['?', r.answers_json]]
          }
          return `<article><p class="muted">${esc(r.time)} · ${'★'.repeat(Number(r.rating))} · ${esc(r.context_json)}</p>${answers.map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}${r.contact ? `<p>✉ ${esc(r.contact)}</p>` : ''}</article>`
        })
        .join('')
    : '<p class="muted">Отзывов пока нет.</p>'
  const link = (t: string, days: number, label: string, sep = '') => `<a href="/admin/export?table=${t}&amp;days=${days}${sep ? '&amp;sep=comma' : ''}">${label}</a>`
  const csv = `<p class="csv">Скачать CSV — события: ${link('events', 1, 'сегодня')} · ${link('events', 7, '7 дней')} · ${link('events', 30, '30 дней')} · ${link('events', 90, '90 дней')};
отзывы: ${link('feedback', 30, '30 дней')} · ${link('feedback', 365, 'год')}.<br><span class="muted">Файлы для Excel (разделитель «;»). Для Google Таблиц: ${link('events', 30, 'события 30 дней', 'comma')} · ${link('feedback', 365, 'отзывы за год', 'comma')} (разделитель «,»). Не больше ${EXPORT_LIMIT.toLocaleString('ru-RU')} строк.</span></p>`
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Тысячи жизней — админка</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1100px;color:#2b2119;background:#f6efe2}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d6c6aa;padding:4px 8px;text-align:left}th{background:#ebdfc8}.scroll{overflow-x:auto}
article,.tg{background:#fbf6ec;border:1px solid #d6c6aa;border-radius:8px;padding:8px 12px;margin:8px 0}article p{margin:4px 0}.muted{color:#7d6b58;font-size:13px}
.tg{white-space:pre-wrap;max-width:520px}.tg pre{margin:4px 0;font-size:13px;overflow-x:auto}</style></head>
<body><h1>Тысячи жизней — отзывы и отчёты</h1><p class="muted">Дни считаются по Стамбулу (UTC+3). «7 дней» — сегодня и 6 дней до него, как в командах бота.</p>${csv}
<h2>Сводка за вчера — то же сообщение, что утром приходит в Telegram</h2><div class="tg">${digest}</div>
${reports.map((r) => `<h2>${esc(r.title)}</h2>${table(r.rows)}`).join('')}<h2>Отзывы (последние 100)</h2>${feedbackHtml}</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

// ---------- CSV ----------

const COLUMNS = {
  events: ['id', 'time_istanbul', 'ts', 'player_id', 'session_id', 'name', 'params_json', 'platform', 'build'],
  feedback: ['id', 'time_istanbul', 'ts', 'player_id', 'rating', 'answers_json', 'contact', 'context_json'],
} as const
const EXPORT_SQL = {
  events: `SELECT id, datetime(ts/1000 + 10800,'unixepoch') AS time_istanbul, ts, player_id, session_id, name, params_json, platform, build
FROM events WHERE ts >= ?1 AND (ts > ?1 OR id > ?2) ORDER BY ts, id LIMIT ?3`,
  feedback: `SELECT id, datetime(ts/1000 + 10800,'unixepoch') AS time_istanbul, ts, player_id, rating, answers_json, contact, context_json
FROM feedback WHERE ts >= ?1 AND (ts > ?1 OR id > ?2) ORDER BY ts, id LIMIT ?3`,
}

/** Ячейка CSV: кавычки по необходимости; текст, похожий на формулу (=, +, -, @), — с апострофом, чтобы Excel его не исполнял. */
function cell(v: unknown, sep: string): string {
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(req: Request, env: AdminEnv): Promise<Response> {
  const url = new URL(req.url)
  const name = url.searchParams.get('table')
  if (name !== 'events' && name !== 'feedback') return new Response('table=events или table=feedback', { status: 400 })
  const days = Math.max(1, Math.min(3650, Math.floor(Number(url.searchParams.get('days') ?? 7)) || 7))
  const sep = url.searchParams.get('sep') === 'comma' ? ',' : ';'
  const today = dayOf(Date.now())
  const from = dayStart(today - days + 1)
  const cols = COLUMNS[name]
  const lines: string[] = [cols.join(sep)]
  let lastTs = from
  let lastId = 0
  let total = 0
  // Страницами по 5000 строк по времени (индекс events_ts), продолжение — после последней пары (ts, id); всего не больше 50 000.
  while (total < EXPORT_LIMIT) {
    const take = Math.min(PAGE, EXPORT_LIMIT - total)
    const rows = (await env.DB!.prepare(EXPORT_SQL[name]).bind(lastTs, lastId, take).all()).results
    for (const r of rows) lines.push(cols.map((c) => cell(r[c], sep)).join(sep))
    total += rows.length
    if (rows.length < take) break
    lastTs = Number(rows[rows.length - 1].ts)
    lastId = Number(rows[rows.length - 1].id)
  }
  const file = `thousands-${name}-${dayIso(today - days + 1)}_${dayIso(today)}.csv`
  // BOM в начале — чтобы Excel открыл UTF-8 без кракозябр.
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${file}"`,
      'cache-control': 'no-store',
      'x-rows': String(total),
      'x-truncated': total >= EXPORT_LIMIT ? '1' : '0',
    },
  })
}
