// /admin - отчёты и отзывы, /admin/export - выгрузка CSV. Пароль ADMIN_PASSWORD (Basic, логин любой).
// Цифры считаются тем же кодом, что и бот, и ежедневная сводка (worker/stats.ts), дни - по Стамбулу.
import { cohorts, dayIso, dayOf, dayStart, digestMessage, esc, FUNNEL_STEPS, pct, period, serialDb, SQL, summary, syncPlayers, type D1Database } from './stats'
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
  // Запросы по очереди, а не разом: иначе D1 «overloaded» (stats.serialDb).
  const db = serialDb(env.DB!)
  const now = Date.now()
  const today = dayOf(now)
  const week = period(today, 7)
  const two = period(today, 14)
  await syncPlayers(db, now)
  const all = (sql: string, p = week) => db.prepare(sql).bind(p.from, p.to).all().then((r) => r.results)
  const [fb, s, byDay, players, choices, dreams, cohortRows, digest, ab, daily, menuLeave] = await Promise.all([
    db.prepare("SELECT datetime(ts/1000 + 10800,'unixepoch') AS time, rating, answers_json, contact, context_json FROM feedback ORDER BY ts DESC LIMIT 100").all(),
    summary(db, week, 100),
    all(SQL.funnelByDay, two),
    all(SQL.playersByDay, two),
    all(SQL.choices),
    all(SQL.dreamSteps, period(today, 30)),
    cohorts(db, today, 21),
    digestMessage(db, now),
    all(SQL.abSecondLife, two),
    all(SQL.dailyClaims, two),
    all(SQL.menuLeave, two),
  ])
  // A/B второй жизни: доли - от начавших вторую жизнь в варианте.
  const abRows = ab.map((r) => {
    const n = Number(r.players)
    const p = (k: string) => `${r[k]} (${pct(Number(r[k]), n)})`
    return { вариант: r.variant, 'начали 2-ю жизнь': n, 'высокое положение': r.high, 'до 20 лет': p('age_20'), 'до 40 лет': p('age_40'), '3-я жизнь': p('third_life'), 'вернулись в другой день': p('returned'), 'возраст смерти': r.death_age ?? '-' }
  })
  // Дары за вход: дни серии и их дары (src/daily.ts); сильные дни - 1, 4, 7.
  const GIFT_NAMES = ['страна по выбору', '+3 перекрутки', 'здоровье +20', 'знатная семья', 'вещий сон', 'богатство ×3', 'царская семья']
  const dailyRows = daily.map((r) => ({ день: r.day, дар: GIFT_NAMES[Number(r.day) - 1] ?? '-', игроки: r.players, 'после обрыва серии': r.broken }))
  const menuRows = menuLeave.map((r) => ({ 'что было': r.what, игроки: r.players, 'ушли за 10 с': r.quick, 'секунд в меню': r.avg_sec, 'прокрутили, px': r.avg_scroll, 'высота экрана, px': r.avg_vh }))
  const f = s.funnel
  const reports: { title: string; rows: Record<string, unknown>[] }[] = [
    { title: `Воронка за 7 дней, ${week.label} (уникальные игроки; как /funnel)`, rows: FUNNEL_STEPS.map(([k, label], i) => ({ шаг: label, событие: k, игроки: f[k], '% от прошлого': i ? pct(f[k], f[FUNNEL_STEPS[i - 1][0]]) : '' })) },
    { title: 'Воронка по дням (14 дней, уникальные игроки)', rows: byDay },
    { title: 'A/B второй жизни за 14 дней: a - положение как выпало, b - сразу высокое (обе защищены до 20 лет; флаг ab_buckets)', rows: abRows },
    { title: 'Ушли из меню, так и не начав жизнь (новички, 14 дней): видели ли барабан и кнопку «Крути», сколько пробыли (событие menu_leave)', rows: menuRows },
    { title: 'Дары за вход за 14 дней: сколько игроков забрали дар каждого дня серии (на 7-й - царская семья)', rows: dailyRows },
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
  const csv = `<p class="csv">Скачать CSV - события: ${link('events', 1, 'сегодня')} · ${link('events', 7, '7 дней')} · ${link('events', 30, '30 дней')} · ${link('events', 90, '90 дней')};
отзывы: ${link('feedback', 30, '30 дней')} · ${link('feedback', 365, 'год')}; подписчики рассылки: ${link('subscribers', 3650, 'все')}.<br><span class="muted">Файлы для Excel (разделитель «;»). Для Google Таблиц: ${link('events', 30, 'события 30 дней', 'comma')} · ${link('feedback', 365, 'отзывы за год', 'comma')} (разделитель «,»). Не больше ${EXPORT_LIMIT.toLocaleString('ru-RU')} строк.</span></p>
<p class="csv"><b>Скачать всё без ограничений:</b> <button type="button" data-all="events">все события</button> <button type="button" data-all="feedback">все отзывы</button>
<label class="muted"><input type="checkbox" id="all-comma"> для Google Таблиц (разделитель «,»)</label> <span id="all-status" class="muted"></span><br>
<span class="muted">Файл собирается частями по ${EXPORT_LIMIT.toLocaleString('ru-RU')} строк прямо в браузере - не закрывайте страницу, пока идёт загрузка. Excel открывает до 1 048 576 строк, Google Таблицы - до 10 млн ячеек (около 1,1 млн строк событий).</span></p>
<script>${ALL_SCRIPT}</script>`
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Тысячи жизней - админка</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1100px;color:#2b2119;background:#f6efe2}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d6c6aa;padding:4px 8px;text-align:left}th{background:#ebdfc8}.scroll{overflow-x:auto}
article,.tg{background:#fbf6ec;border:1px solid #d6c6aa;border-radius:8px;padding:8px 12px;margin:8px 0}article p{margin:4px 0}.muted{color:#7d6b58;font-size:13px}
.tg{white-space:pre-wrap;max-width:520px}.tg pre{margin:4px 0;font-size:13px;overflow-x:auto}</style></head>
<body><h1>Тысячи жизней - отзывы и отчёты</h1><p class="muted">Дни считаются по Стамбулу (UTC+3). «7 дней» - сегодня и 6 дней до него, как в командах бота.<br>Посчитано в ${new Date(now + 10800e3).toISOString().slice(11, 16)} по Стамбулу; страница обновляется раз в 10 минут - <a href="/admin?fresh=1">пересчитать сейчас</a>.</p>${csv}
<h2>Сводка за вчера - то же сообщение, что утром приходит в Telegram</h2><div class="tg">${digest}</div>
${reports.map((r) => `<h2>${esc(r.title)}</h2>${table(r.rows)}`).join('')}<h2>Отзывы (последние 100)</h2>${feedbackHtml}</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

/**
 * «Скачать всё»: один запрос к Worker отдаёт не больше EXPORT_LIMIT строк (память и время Worker ограничены, каждая
 * прочитанная строка - из бесплатной квоты D1). Страница забирает выгрузку частями (after = последний id прошлой
 * части, head=0 - без заголовка) с паузой между ними и склеивает их в один файл у себя.
 */
const ALL_SCRIPT = `
document.querySelectorAll('[data-all]').forEach(function (b) {
  b.addEventListener('click', async function () {
    var table = b.getAttribute('data-all'), comma = document.getElementById('all-comma').checked
    var status = document.getElementById('all-status'), parts = [], after = 0, rows = 0, first = true
    document.querySelectorAll('[data-all]').forEach(function (x) { x.disabled = true })
    try {
      for (;;) {
        var r = await fetch('/admin/export?table=' + table + '&days=all&after=' + after + (first ? '' : '&head=0') + (comma ? '&sep=comma' : ''), { credentials: 'same-origin' })
        if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200))
        var n = Number(r.headers.get('x-rows') || 0)
        parts.push(await r.blob())
        rows += n
        after = Number(r.headers.get('x-last-id') || after)
        first = false
        status.textContent = 'Скачано строк: ' + rows.toLocaleString('ru-RU') + '…'
        if (r.headers.get('x-truncated') !== '1' || n === 0) break
        await new Promise(function (ok) { setTimeout(ok, 400) })
      }
      var a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(parts, { type: 'text/csv;charset=utf-8' }))
      a.download = 'thousands-' + table + '-all_' + new Date().toISOString().slice(0, 10) + '.csv'
      document.body.appendChild(a); a.click(); a.remove()
      status.textContent = 'Готово, строк: ' + rows.toLocaleString('ru-RU') + '.'
    } catch (e) {
      status.textContent = 'Ошибка (скачано строк: ' + rows.toLocaleString('ru-RU') + '): ' + e.message + '. Нажмите ещё раз через минуту.'
    } finally {
      document.querySelectorAll('[data-all]').forEach(function (x) { x.disabled = false })
    }
  })
})
`

// ---------- CSV ----------

const COLUMNS = {
  events: ['id', 'time_istanbul', 'ts', 'player_id', 'session_id', 'name', 'params_json', 'platform', 'build'],
  feedback: ['id', 'time_istanbul', 'ts', 'player_id', 'rating', 'answers_json', 'contact', 'context_json'],
} as const
const EXPORT_SQL = {
  events: `SELECT id, datetime(ts/1000 + 10800,'unixepoch') AS time_istanbul, ts, player_id, session_id, name, params_json, platform, build
FROM events WHERE id > ?2 AND ts >= ?1 ORDER BY id LIMIT ?3`,
  feedback: `SELECT id, datetime(ts/1000 + 10800,'unixepoch') AS time_istanbul, ts, player_id, rating, answers_json, contact, context_json
FROM feedback WHERE id > ?2 AND ts >= ?1 ORDER BY id LIMIT ?3`,
}

/** Ячейка CSV: кавычки по необходимости; текст, похожий на формулу (=, +, -, @), - с апострофом, чтобы Excel его не исполнял. */
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
  // Подписчики рассылки (worker/account.ts): только согласившиеся, без сохранений игры.
  if (name === 'subscribers') {
    await env.DB!.exec("CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, player_id TEXT, created INTEGER NOT NULL, newsletter INTEGER NOT NULL DEFAULT 0, consent_ts INTEGER, lang TEXT, data_json TEXT, updated INTEGER);")
    const rows = (await env.DB!.prepare("SELECT email, lang, datetime(consent_ts/1000 + 10800,'unixepoch') AS consent FROM accounts WHERE newsletter = 1 ORDER BY consent_ts").all<Record<string, unknown>>()).results
    const sep = url.searchParams.get('sep') === 'comma' ? ',' : ';'
    const lines = [['email', 'lang', 'consent_istanbul'].join(sep), ...rows.map((r) => [r.email, r.lang, r.consent].map((v) => cell(v, sep)).join(sep))]
    return new Response('\ufeff' + lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="thousands-subscribers.csv"', 'cache-control': 'no-store' } })
  }
  if (name !== 'events' && name !== 'feedback') return new Response('table=events, feedback или subscribers', { status: 400 })
  // days=all - за всё время (для кнопки «Скачать всё», которая забирает выгрузку частями).
  const all = url.searchParams.get('days') === 'all'
  const days = all ? 0 : Math.max(1, Math.min(3650, Math.floor(Number(url.searchParams.get('days') ?? 7)) || 7))
  // Продолжение: after - последний id прошлой части; head=0 - без заголовка и BOM (часть приклеивается к файлу).
  const after = Math.max(0, Math.floor(Number(url.searchParams.get('after') ?? 0)) || 0)
  const head = url.searchParams.get('head') !== '0'
  const sep = url.searchParams.get('sep') === 'comma' ? ',' : ';'
  const db = serialDb(env.DB!)
  const today = dayOf(Date.now())
  const from = all ? 0 : dayStart(today - days + 1)
  const cols = COLUMNS[name]
  const lines: string[] = head ? [cols.join(sep)] : []
  const lastTs = from
  let lastId = after
  let total = 0
  // Строк больше лимита - отдаём самые свежие: начинаем с 50 000-й строки с конца (по первичному ключу, без индекса по времени).
  // «Скачать всё» (days=all) идёт с начала частями, поэтому так - только для обычных ссылок.
  if (!all) {
    const edge = (await db.prepare(`SELECT id FROM ${name} ORDER BY id DESC LIMIT 1 OFFSET ?1`).bind(EXPORT_LIMIT - 1).all()).results[0]
    if (edge) lastId = Math.max(0, Number(edge.id) - 1)
  }
  // Страницами по 5000 строк по номеру строки (id растёт со временем записи; индекса по времени больше нет -
  // он удваивал запись каждого события в D1), продолжение - после последнего id; всего не больше 50 000 (самых свежих).
  while (total < EXPORT_LIMIT) {
    const take = Math.min(PAGE, EXPORT_LIMIT - total)
    const rows = (await db.prepare(EXPORT_SQL[name]).bind(lastTs, lastId, take).all()).results
    for (const r of rows) lines.push(cols.map((c) => cell(r[c], sep)).join(sep))
    total += rows.length
    if (rows.length) lastId = Number(rows[rows.length - 1].id)
    if (rows.length < take) break
  }
  const file = all ? `thousands-${name}-all_${dayIso(today)}.csv` : `thousands-${name}-${dayIso(today - days + 1)}_${dayIso(today)}.csv`
  // BOM в начале - чтобы Excel открыл UTF-8 без кракозябр.
  const body = lines.length ? (head ? '﻿' : '') + lines.join('\r\n') + '\r\n' : ''
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${file}"`,
      'cache-control': 'no-store',
      'x-rows': String(total),
      'x-truncated': total >= EXPORT_LIMIT ? '1' : '0',
      'x-last-id': String(lastId),
    },
  })
}
