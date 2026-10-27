// Общие расчёты аналитики: один и тот же код считает цифры для /admin, команд бота (/api/telegram)
// и ежедневной сводки (отдельный Worker thousands-digest, worker/digest/). Поэтому цифры везде совпадают.
// Дни — по Стамбулу (UTC+3, без перехода на летнее время): в SQL день события — date(ts/1000 + 10800, 'unixepoch').
// Границы периода передаются параметрами bind (мс UTC начала дня по Стамбулу), без склейки строк.

export interface D1Result<T> {
  results: T[]
}
export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared
  run(): Promise<unknown>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}
export interface D1Database {
  prepare(sql: string): D1Prepared
  batch(statements: D1Prepared[]): Promise<unknown>
  exec(sql: string): Promise<unknown>
}

export const DAY = 864e5
/** Сдвиг Стамбула от UTC: +3 часа. */
export const TZ_SHIFT = 3 * 36e5

/** Номер дня по Стамбулу (дни от 1970-01-01). */
export const dayOf = (ms: number) => Math.floor((ms + TZ_SHIFT) / DAY)
/** Начало дня по Стамбулу, мс UTC. */
export const dayStart = (day: number) => day * DAY - TZ_SHIFT
/** День в виде 2026-10-25. */
export const dayIso = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
/** День в виде «25.10 (сб)». */
export const dayLabel = (day: number) => {
  const d = new Date(day * DAY)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')} (${WEEKDAYS[d.getUTCDay()]})`
}
const shortDay = (day: number) => dayLabel(day).slice(0, 5)

export interface Period {
  from: number
  to: number
  first: number
  last: number
  label: string
}

/** Период из n дней по Стамбулу; последний день — last (включительно). */
export function period(last: number, n = 1): Period {
  const first = last - n + 1
  return { from: dayStart(first), to: dayStart(last + 1), first, last, label: n === 1 ? dayLabel(last) : `${shortDay(first)}–${shortDay(last)}` }
}

// ---------- SQL ----------

/** День события по Стамбулу (строка 2026-10-25). */
const DAY_SQL = `date(ts/1000 + 10800, 'unixepoch')`
/** Номер дня события по Стамбулу (целое). */
const DAYNUM_SQL = `CAST((ts/1000 + 10800)/86400 AS INTEGER)`

/** Воронка: уникальные игроки на каждом шаге. */
const FUNNEL_COLS = `COUNT(DISTINCT CASE WHEN name='app_open' THEN player_id END) AS app_open,
  COUNT(DISTINCT CASE WHEN name='life_start' THEN player_id END) AS life_start,
  COUNT(DISTINCT CASE WHEN name='first_choice' THEN player_id END) AS first_choice,
  COUNT(DISTINCT CASE WHEN name='age_milestone' AND json_extract(params_json,'$.age')=20 THEN player_id END) AS age_20,
  COUNT(DISTINCT CASE WHEN name='life_end' THEN player_id END) AS life_end,
  COUNT(DISTINCT CASE WHEN name='life_start' AND json_extract(params_json,'$.life_index')>=2 THEN player_id END) AS second_life`

export const SQL = {
  events: `SELECT COUNT(*) AS n FROM events WHERE ts >= ?1 AND ts < ?2`,
  // Зашли: уникальные с app_open; новые — первое событие игрока вообще попало в этот период.
  opened: `SELECT COUNT(*) AS opened, COALESCE(SUM(first_ts >= ?1), 0) AS new_players FROM (
  SELECT o.player_id, (SELECT MIN(e.ts) FROM events e WHERE e.player_id = o.player_id) AS first_ts
  FROM (SELECT DISTINCT player_id FROM events WHERE name='app_open' AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL) o
)`,
  funnel: `SELECT ${FUNNEL_COLS} FROM events WHERE ts >= ?1 AND ts < ?2`,
  funnelByDay: `SELECT ${DAY_SQL} AS day, ${FUNNEL_COLS} FROM events WHERE ts >= ?1 AND ts < ?2 GROUP BY day ORDER BY day DESC`,
  exits: `SELECT COALESCE(json_extract(params_json,'$.screen'),'(нет)') AS screen, COUNT(*) AS n,
  ROUND(AVG(json_extract(params_json,'$.age')),1) AS avg_age,
  ROUND(AVG(json_extract(params_json,'$.sec_in_session'))/60.0,1) AS avg_session_min
FROM events WHERE name='session_end' AND ts >= ?1 AND ts < ?2 GROUP BY screen ORDER BY n DESC, screen LIMIT ?3`,
  lives: `SELECT 'все' AS mode, SUM(name='life_start') AS started, SUM(name='life_end') AS ended,
  ROUND(AVG(CASE WHEN name='life_end' THEN json_extract(params_json,'$.sec_in_life') END)/60.0,1) AS avg_min,
  ROUND(AVG(CASE WHEN name='life_end' THEN json_extract(params_json,'$.age') END),1) AS avg_age,
  ROUND(AVG(CASE WHEN name='life_end' THEN json_extract(params_json,'$.choices') END),1) AS avg_choices
FROM events WHERE name IN ('life_start','life_end') AND ts >= ?1 AND ts < ?2`,
  livesByMode: `SELECT COALESCE(json_extract(params_json,'$.mode'),'(нет)') AS mode, SUM(name='life_start') AS started, SUM(name='life_end') AS ended,
  ROUND(AVG(CASE WHEN name='life_end' THEN json_extract(params_json,'$.sec_in_life') END)/60.0,1) AS avg_min,
  ROUND(AVG(CASE WHEN name='life_end' THEN json_extract(params_json,'$.age') END),1) AS avg_age,
  ROUND(AVG(CASE WHEN name='life_end' THEN json_extract(params_json,'$.choices') END),1) AS avg_choices
FROM events WHERE name IN ('life_start','life_end') AND ts >= ?1 AND ts < ?2 GROUP BY mode ORDER BY started DESC, mode LIMIT 10`,
  feedback: `SELECT COUNT(*) AS n, ROUND(AVG(rating),1) AS avg FROM feedback WHERE ts >= ?1 AND ts < ?2`,
  lastFeedback: `SELECT ts, rating, answers_json FROM feedback WHERE ts >= ?1 AND ts < ?2 ORDER BY ts DESC, id DESC LIMIT 1`,
  playersByDay: `SELECT ${DAY_SQL} AS day, COUNT(DISTINCT player_id) AS players,
  SUM(name='life_start') AS lives, SUM(name='life_end') AS deaths, SUM(name='feedback_sent') AS feedback
FROM events WHERE ts >= ?1 AND ts < ?2 GROUP BY day ORDER BY day DESC`,
  choices: `SELECT json_extract(params_json,'$.event_id') AS event, COUNT(*) AS shown,
  ROUND(100.0*SUM(json_extract(params_json,'$.success'))/COUNT(*)) AS success_pct
FROM events WHERE name='choice_made' AND ts >= ?1 AND ts < ?2 GROUP BY event ORDER BY shown DESC LIMIT 30`,
  // Сны о будущем: доля верных ответов по сну и шагу и самое частое неверное значение (docs/TZ_dreams.md).
  dreamSteps: `WITH d AS (
  SELECT json_extract(params_json,'$.dream') AS dream, json_extract(params_json,'$.step') AS step,
    json_extract(params_json,'$.correct') AS ok, json_extract(params_json,'$.value') AS value
  FROM events WHERE name='dream_step' AND ts >= ?1 AND ts < ?2
), w AS (
  SELECT dream, step, value, COUNT(*) AS n, ROW_NUMBER() OVER (PARTITION BY dream, step ORDER BY COUNT(*) DESC) AS r
  FROM d WHERE ok = 0 GROUP BY dream, step, value
)
SELECT d.dream AS dream, d.step AS step, COUNT(*) AS answers, ROUND(100.0*SUM(d.ok)/COUNT(*)) AS correct_pct,
  (SELECT value || ' ×' || n FROM w WHERE w.dream = d.dream AND w.step = d.step AND w.r = 1) AS top_wrong
FROM d GROUP BY d.dream, d.step ORDER BY d.dream, d.step LIMIT 120`,
  // Когорты: день первого события игрока (?1…?2 — номера дней), возврат — любое событие ровно через 1 и 7 дней.
  cohorts: `WITH f AS (
  SELECT player_id, CAST((MIN(ts)/1000 + 10800)/86400 AS INTEGER) AS d0 FROM events WHERE player_id IS NOT NULL GROUP BY player_id
), c AS (SELECT player_id, d0 FROM f WHERE d0 >= ?1 AND d0 <= ?2),
a AS (SELECT DISTINCT player_id, ${DAYNUM_SQL} AS d FROM events WHERE ts >= ?3 AND player_id IN (SELECT player_id FROM c))
SELECT c.d0 AS d0, COUNT(DISTINCT c.player_id) AS new_players,
  COUNT(DISTINCT CASE WHEN a.d = c.d0 + 1 THEN c.player_id END) AS d1,
  COUNT(DISTINCT CASE WHEN a.d = c.d0 + 7 THEN c.player_id END) AS d7
FROM c LEFT JOIN a ON a.player_id = c.player_id GROUP BY c.d0 ORDER BY c.d0 DESC`,
}

// ---------- Расчёт ----------

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v))
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v))

export interface Funnel {
  app_open: number
  life_start: number
  first_choice: number
  age_20: number
  life_end: number
  second_life: number
}
export const FUNNEL_STEPS: [keyof Funnel, string][] = [
  ['app_open', 'Открыли игру'],
  ['life_start', 'Начали жизнь'],
  ['first_choice', 'Первый выбор'],
  ['age_20', 'Дожили до 20'],
  ['life_end', 'Конец жизни'],
  ['second_life', 'Вторая жизнь'],
]
export interface ExitRow {
  screen: string
  n: number
  avg_age: number | null
  avg_session_min: number | null
}
export interface LivesRow {
  mode: string
  started: number
  ended: number
  avg_min: number | null
  avg_age: number | null
  avg_choices: number | null
}
export interface Summary {
  period: Period
  events: number
  opened: number
  newPlayers: number
  returning: number
  played: number
  funnel: Funnel
  exits: ExitRow[]
  lives: LivesRow
  modes: LivesRow[]
  feedback: { n: number; avg: number | null; last: { rating: number; text: string } | null }
}

const toFunnel = (r: Record<string, unknown> | undefined): Funnel => ({
  app_open: num(r?.app_open),
  life_start: num(r?.life_start),
  first_choice: num(r?.first_choice),
  age_20: num(r?.age_20),
  life_end: num(r?.life_end),
  second_life: num(r?.second_life),
})
const toLives = (r: Record<string, unknown> | undefined): LivesRow => ({
  mode: String(r?.mode ?? 'все'),
  started: num(r?.started),
  ended: num(r?.ended),
  avg_min: numOrNull(r?.avg_min),
  avg_age: numOrNull(r?.avg_age),
  avg_choices: numOrNull(r?.avg_choices),
})

/** Ответы отзыва одной строкой. */
export function feedbackLine(answersJson: unknown, max = 200): string {
  let answers: Record<string, unknown> = {}
  try {
    answers = JSON.parse(String(answersJson || '{}'))
  } catch {
    answers = {}
  }
  const text = Object.values(answers ?? {})
    .map((v) => String(v ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ')
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

/** Все цифры сводки за период. */
export async function summary(db: D1Database, p: Period, exitsLimit = 5): Promise<Summary> {
  const q = (sql: string, ...extra: unknown[]) => db.prepare(sql).bind(p.from, p.to, ...extra).all()
  const [ev, op, fu, ex, li, mo, fb, last] = await Promise.all([
    q(SQL.events),
    q(SQL.opened),
    q(SQL.funnel),
    q(SQL.exits, exitsLimit),
    q(SQL.lives),
    q(SQL.livesByMode),
    q(SQL.feedback),
    q(SQL.lastFeedback),
  ])
  const opened = num(op.results[0]?.opened)
  const newPlayers = num(op.results[0]?.new_players)
  const funnel = toFunnel(fu.results[0])
  const l = last.results[0]
  return {
    period: p,
    events: num(ev.results[0]?.n),
    opened,
    newPlayers,
    returning: opened - newPlayers,
    played: funnel.life_start,
    funnel,
    exits: ex.results.map((r) => ({ screen: String(r.screen), n: num(r.n), avg_age: numOrNull(r.avg_age), avg_session_min: numOrNull(r.avg_session_min) })),
    lives: toLives(li.results[0]),
    modes: mo.results.map(toLives),
    feedback: { n: num(fb.results[0]?.n), avg: numOrNull(fb.results[0]?.avg), last: l ? { rating: num(l.rating), text: feedbackLine(l.answers_json) } : null },
  }
}

export interface CohortRow {
  day: string
  new_players: number
  d1: string
  d7: string
}

/** Когорты по дню первого захода за n дней до today (включительно). Возврат, которого ещё не могло быть, — «—». */
export async function cohorts(db: D1Database, today: number, n = 21): Promise<CohortRow[]> {
  const first = today - n + 1
  const res = await db.prepare(SQL.cohorts).bind(first, today, dayStart(first + 1)).all()
  const cell = (d0: number, k: number, v: number, total: number) => (d0 + k > today ? '—' : `${v} (${pct(v, total)})`)
  return res.results.map((r) => {
    const d0 = num(r.d0)
    const total = num(r.new_players)
    return { day: dayIso(d0), new_players: total, d1: cell(d0, 1, num(r.d1), total), d7: cell(d0, 7, num(r.d7), total) }
  })
}

// ---------- Форматирование для Telegram (parse_mode HTML) ----------

/** Экранирование для HTML Telegram и админки. */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—')
const f1 = (v: number | null) => (v == null || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1))
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Изменение к прошлому периоду: ▲12% / ▼5% / =0%. */
export function delta(cur: number, prev: number): string {
  if (!prev) return cur ? 'было 0' : '=0'
  const d = Math.round((100 * (cur - prev)) / prev)
  return d > 0 ? `▲${d}%` : d < 0 ? `▼${-d}%` : '=0%'
}

/** Таблица для <pre>: первая колонка влево, остальные вправо. Экранируется целиком. */
function grid(rows: (string | number)[][]): string {
  const cols = Math.max(...rows.map((r) => r.length))
  const w = Array.from({ length: cols }, (_, i) => Math.max(...rows.map((r) => String(r[i] ?? '').length)))
  const lines = rows.map((r) =>
    r
      .map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c ?? '').padStart(w[i])))
      .join('  ')
      .trimEnd(),
  )
  return `<pre>${esc(lines.join('\n'))}</pre>`
}

function funnelGrid(f: Funnel): string {
  return grid(FUNNEL_STEPS.map(([k, label], i) => [label, f[k], i ? pct(f[k], f[FUNNEL_STEPS[i - 1][0]]) : '']))
}

function exitsGrid(rows: ExitRow[]): string {
  if (!rows.length) return '<i>Закрытий вкладки не было.</i>'
  return grid([['экран', 'раз', 'возр', 'мин'], ...rows.map((r) => [cut(r.screen, 12), r.n, f1(r.avg_age), f1(r.avg_session_min)])])
}

function livesGrid(s: Summary): string {
  const l = s.lives
  const main = grid([
    ['Начато', l.started],
    ['Завершено', l.ended],
    ['Мин на жизнь', f1(l.avg_min)],
    ['Возраст смерти', f1(l.avg_age)],
    ['Выборов', f1(l.avg_choices)],
  ])
  if (!s.modes.length) return main
  return main + grid([['режим', 'нач', 'зав', 'мин', 'возр'], ...s.modes.map((m) => [cut(m.mode, 10), m.started, m.ended, f1(m.avg_min), f1(m.avg_age)])])
}

function feedbackBlock(s: Summary): string {
  const f = s.feedback
  if (!f.n) return '<b>Отзывы:</b> 0'
  const last = f.last ? `\nПоследний: ${'★'.repeat(f.last.rating)} ${esc(cut(f.last.text || '(без текста)', 200))}` : ''
  return `<b>Отзывы:</b> ${f.n}, средняя оценка ${f1(f.avg)}${last}`
}

/** Полная сводка за период с дельтой к прошлому периоду (ежедневная сводка и /week). */
export function formatSummary(title: string, s: Summary, prev: Summary, prevLabel: string): string {
  return [
    `<b>${esc(title)}</b>`,
    grid([
      ['Зашли', s.opened, ''],
      ['  новые', s.newPlayers, ''],
      ['  вернулись', s.returning, ''],
      ['Играли', s.played, pct(s.played, s.opened)],
    ]),
    '<b>Воронка</b> (игроки, % от прошлого шага)',
    funnelGrid(s.funnel),
    '<b>Где уходят</b> (закрытие вкладки)',
    exitsGrid(s.exits),
    '<b>Жизни</b>',
    livesGrid(s),
    feedbackBlock(s),
    `<b>Сравнение</b> с ${esc(prevLabel)}: зашли ${delta(s.opened, prev.opened)} · играли ${delta(s.played, prev.played)} · жизни ${delta(s.lives.started, prev.lives.started)}`,
  ].join('\n')
}

/** /stats: сегодня и вчера рядом. */
export function formatTwoDays(today: Summary, yesterday: Summary): string {
  const row = (label: string, pick: (s: Summary) => string | number) => [label, pick(today), pick(yesterday)]
  return [
    `<b>Тысячи жизней: сегодня ${esc(today.period.label)} и вчера ${esc(yesterday.period.label)}</b>`,
    grid([
      ['', 'сегодня', 'вчера'],
      row('Зашли', (s) => s.opened),
      row('  новые', (s) => s.newPlayers),
      row('  вернулись', (s) => s.returning),
      row('Играли', (s) => s.played),
      row('Первый выбор', (s) => s.funnel.first_choice),
      row('Дожили до 20', (s) => s.funnel.age_20),
      row('Конец жизни', (s) => s.funnel.life_end),
      row('Вторая жизнь', (s) => s.funnel.second_life),
      row('Жизней начато', (s) => s.lives.started),
      row('Завершено', (s) => s.lives.ended),
      row('Мин на жизнь', (s) => f1(s.lives.avg_min)),
      row('Отзывы', (s) => s.feedback.n),
    ]),
    '<i>Сегодня — с 00:00 по Стамбулу до этой минуты.</i>',
  ].join('\n')
}

export function formatFunnel(s: Summary): string {
  return [`<b>Воронка за ${esc(s.period.label)}</b> (уникальные игроки, % от прошлого шага)`, funnelGrid(s.funnel)].join('\n')
}

export function formatExits(s: Summary): string {
  return [`<b>Где уходят за ${esc(s.period.label)}</b> (топ-10 экранов при закрытии вкладки; возраст героя и минуты с начала сессии — средние)`, exitsGrid(s.exits)].join('\n')
}

export const HELP = [
  '<b>Тысячи жизней — команды</b>',
  '/stats — сегодня и вчера',
  '/week — сводка за 7 дней (с сегодняшним)',
  '/funnel — воронка за 7 дней',
  '/exits — топ-10 экранов выхода за 7 дней',
  '/digest — утренняя сводка за вчера прямо сейчас',
  '/help — этот список',
  '<i>Дни считаются по Стамбулу (UTC+3).</i>',
].join('\n')

/** Ежедневная сводка: вчера (по Стамбулу) с дельтой к позавчера. Её же шлёт команда /digest. */
export async function digestMessage(db: D1Database, now: number): Promise<string> {
  const y = dayOf(now) - 1
  const cur = await summary(db, period(y))
  if (!cur.events && !cur.feedback.n) return `<b>Тысячи жизней, вчера ${esc(dayLabel(y))}</b>\nВчера активности не было.`
  const prev = await summary(db, period(y - 1))
  return formatSummary(`Тысячи жизней, вчера ${dayLabel(y)}`, cur, prev, dayLabel(y - 1))
}

/** Ответ на команду бота; незнакомая команда — список команд. */
export async function commandReply(db: D1Database | undefined, command: string, now: number): Promise<string> {
  const today = dayOf(now)
  if (command === '/help' || command === '/start') return HELP
  if (!['/stats', '/week', '/funnel', '/exits', '/digest'].includes(command)) return HELP
  if (!db) return 'База D1 не подключена к сайту (привязка DB) — считать не из чего.'
  if (command === '/stats') {
    const [t, y] = await Promise.all([summary(db, period(today)), summary(db, period(today - 1))])
    return formatTwoDays(t, y)
  }
  if (command === '/week') {
    const [cur, prev] = await Promise.all([summary(db, period(today, 7)), summary(db, period(today - 7, 7))])
    return formatSummary(`Тысячи жизней за 7 дней, ${cur.period.label}`, cur, prev, `прошлыми 7 днями (${prev.period.label})`)
  }
  if (command === '/funnel') return formatFunnel(await summary(db, period(today, 7)))
  if (command === '/exits') return formatExits(await summary(db, period(today, 7), 10))
  return digestMessage(db, now)
}
