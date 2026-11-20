// Общие расчёты аналитики: один и тот же код считает цифры для /admin, команд бота (/api/telegram)
// и ежедневной сводки (отдельный Worker thousands-digest, worker/digest/). Поэтому цифры везде совпадают.
// Дни - по Стамбулу (UTC+3, без перехода на летнее время): в SQL день события - date(ts/1000 + 10800, 'unixepoch').
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

/**
 * D1 выполняет запросы одной базы по одному. Отчёты запускали ~20 тяжёлых запросов разом (Promise.all), и D1
 * отвечал «D1 DB is overloaded. Too many resources consumed within a 10 second window» (08.11, /admin).
 * Обёртка ставит все запросы в очередь (следующий - после конца предыдущего) и повторяет запрос при перегрузке
 * с паузой 1, 2, 4 с. Код отчётов при этом не меняется: Promise.all просто ждёт очередь.
 */
export function serialDb(db: D1Database, pauses = [1000, 2000, 4000]): D1Database {
  let tail: Promise<unknown> = Promise.resolve()
  const overloaded = (e: unknown) => /overloaded|too many resources|D1_ERROR.*(busy|timeout)/i.test(String(e))
  const queue = <T>(run: () => Promise<T>): Promise<T> => {
    const attempt = async (): Promise<T> => {
      for (let i = 0; ; i++) {
        try {
          return await run()
        } catch (e) {
          if (i >= pauses.length || !overloaded(e)) throw e
          await new Promise((r) => setTimeout(r, pauses[i]))
        }
      }
    }
    const next = tail.then(attempt, attempt)
    tail = next.catch(() => null)
    return next
  }
  const wrap = (st: D1Prepared): D1Prepared => ({
    bind: (...values: unknown[]) => wrap(st.bind(...values)),
    run: () => queue(() => st.run()),
    all: <T = Record<string, unknown>>() => queue(() => st.all<T>()),
    // Для batch нужен исходный объект D1.
    get raw() {
      return st
    },
  } as D1Prepared)
  return {
    prepare: (sql: string) => wrap(db.prepare(sql)),
    batch: (statements: D1Prepared[]) => queue(() => db.batch(statements.map((x) => (x as D1Prepared & { raw?: D1Prepared }).raw ?? x))),
    exec: (sql: string) => queue(() => db.exec(sql)),
  }
}

/**
 * ТЗ удержания (20.11): страна и сеть провайдера в events (R3), метки игроков в player_marks (R6, R11):
 * internal = 1 - служебное устройство (?internal=1 или секрет INTERNAL_IDS), visible = 0 - вкладку при загрузке
 * так и не показали (фон, открыта с Reddit «на потом»). Создаётся и сайтом, и утренней сводкой - кто первый придёт в базу.
 */
let retentionReady = false
export async function ensureRetention(db: D1Database): Promise<void> {
  if (retentionReady) return
  await db.exec('CREATE TABLE IF NOT EXISTS player_marks (player_id TEXT PRIMARY KEY, internal INTEGER NOT NULL DEFAULT 0, visible INTEGER);')
  const cols = (await db.prepare('PRAGMA table_info(events)').all<{ name: string }>()).results.map((r) => r.name)
  // Таблицы событий ещё нет - её создаст сайт сразу с новыми колонками (SCHEMA в worker/index.ts).
  if (cols.length) {
    for (const [col, type] of [
      ['country', 'TEXT'],
      ['asn', 'INTEGER'],
    ]) {
      if (cols.includes(col)) continue
      // Два экземпляра Worker могли добавить колонку одновременно - «duplicate column» не ошибка.
      await db.exec(`ALTER TABLE events ADD COLUMN ${col} ${type};`).catch((e: unknown) => {
        if (!/duplicate column/i.test(String(e))) throw e
      })
    }
  }
  retentionReady = true
}

/** Кого не считать в отчётах: служебные устройства (internal) и игроков, чью вкладку так и не показали (hidden). */
export interface ReportFilter {
  internal: boolean
  hidden: boolean
}
export const REPORT_DEFAULT: ReportFilter = { internal: true, hidden: true }
const FILTERED = Symbol('filtered')

/**
 * База для отчётов без служебных и «невиденных» игроков: в каждом SELECT к events, feedback и players после WHERE
 * добавляется условие на player_marks. Запись (INSERT в players при syncPlayers) не трогается. События без игрока
 * (boot до первого запуска) остаются.
 */
export function reportDb(db: D1Database, f: ReportFilter = REPORT_DEFAULT): D1Database {
  if ((db as D1Database & { [FILTERED]?: boolean })[FILTERED]) return db
  const conds = [f.internal && 'internal = 1', f.hidden && 'visible = 0'].filter(Boolean)
  if (!conds.length) return db
  const marked = `(SELECT player_id FROM player_marks WHERE ${conds.join(' OR ')})`
  const rewrite = (sql: string) =>
    /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA)\b/i.test(sql)
      ? sql
      : sql.replace(/\bFROM (events|feedback|players)(?:\s+(?!WHERE\b)(\w+))?\s+WHERE\s/g, (_, table: string, alias?: string) => {
          const col = alias ? `${alias}.player_id` : 'player_id'
          return `FROM ${table}${alias ? ' ' + alias : ''} WHERE (${col} IS NULL OR ${col} NOT IN ${marked}) AND `
        })
  const out: D1Database & { [FILTERED]?: boolean } = {
    prepare: (sql: string) => db.prepare(rewrite(sql)),
    batch: (statements: D1Prepared[]) => db.batch(statements),
    exec: (sql: string) => db.exec(sql),
  }
  out[FILTERED] = true
  return out
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

/** Период из n дней по Стамбулу; последний день - last (включительно). */
export function period(last: number, n = 1): Period {
  const first = last - n + 1
  return { from: dayStart(first), to: dayStart(last + 1), first, last, label: n === 1 ? dayLabel(last) : `${shortDay(first)}-${shortDay(last)}` }
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

/** Только события шагов воронки: по индексу events_name_ts, а не все события периода. */
const FUNNEL_WHERE = `name IN ('app_open','life_start','first_choice','age_milestone','life_end') AND ts >= ?1 AND ts < ?2`

/** Страна для отчётов: RU, TR, US отдельно, остальные - «прочие», строки без страны (до 20.11) - «(нет)». */
const COUNTRY_SQL = `CASE WHEN country IN ('RU','TR','US') THEN country WHEN country IS NULL OR country = '' THEN '(нет)' ELSE 'прочие' END`
const countryOf = (c: unknown) => (c === 'RU' || c === 'TR' || c === 'US' ? c : c == null || c === '' ? '(нет)' : 'прочие')

// Бесплатный D1 - 5 млн прочитанных строк в день на всё. Поэтому запросы читают только нужные события по индексу
// (name, ts), «первый заход игрока» берут из таблицы players, а не из всей истории событий (syncPlayers).
export const SQL = {
  // Была ли активность за период (1/0) - для «вчера активности не было»; первая же строка, без подсчёта всех.
  events: `SELECT EXISTS (SELECT 1 FROM events WHERE ts >= ?1 AND ts < ?2) AS n`,
  // Зашли: уникальные с app_open; новые - первое событие игрока вообще (players.first_ts) попало в этот период.
  opened: `SELECT COUNT(*) AS opened, COALESCE(SUM(p.first_ts >= ?1), 0) AS new_players
FROM (SELECT DISTINCT player_id FROM events WHERE name='app_open' AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL) o
LEFT JOIN players p ON p.player_id = o.player_id`,
  funnel: `SELECT ${FUNNEL_COLS} FROM events WHERE ${FUNNEL_WHERE}`,
  funnelByDay: `SELECT ${DAY_SQL} AS day, ${FUNNEL_COLS} FROM events WHERE ${FUNNEL_WHERE} GROUP BY day ORDER BY day DESC`,
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
  // Игроки дня - открывшие игру (app_open), без перебора всех событий.
  playersByDay: `SELECT ${DAY_SQL} AS day, COUNT(DISTINCT CASE WHEN name='app_open' THEN player_id END) AS players,
  SUM(name='life_start') AS lives, SUM(name='life_end') AS deaths, SUM(name='feedback_sent') AS feedback
FROM events WHERE name IN ('app_open','life_start','life_end','feedback_sent') AND ts >= ?1 AND ts < ?2 GROUP BY day ORDER BY day DESC`,
  choices: `SELECT json_extract(params_json,'$.event_id') AS event, COUNT(*) AS shown,
  ROUND(100.0*SUM(json_extract(params_json,'$.success'))/COUNT(*)) AS success_pct
FROM events WHERE name='choice_made' AND ts >= ?1 AND ts < ?2 GROUP BY event ORDER BY shown DESC LIMIT 30`,
  // Сны о будущем: доля верных ответов по сну и шагу и самое частое неверное значение (docs/TZ_dreams.md).
  // d читается из базы один раз (MATERIALIZED); самый частый неверный ответ - соединением, не подзапросом на каждую группу.
  dreamSteps: `WITH d AS MATERIALIZED (
  SELECT json_extract(params_json,'$.dream') AS dream, json_extract(params_json,'$.step') AS step,
    json_extract(params_json,'$.correct') AS ok, json_extract(params_json,'$.value') AS value
  FROM events WHERE name='dream_step' AND ts >= ?1 AND ts < ?2 AND json_extract(params_json,'$.training') IS NULL
), w AS (
  SELECT dream, step, value || ' ×' || n AS top_wrong FROM (
    SELECT dream, step, value, COUNT(*) AS n, ROW_NUMBER() OVER (PARTITION BY dream, step ORDER BY COUNT(*) DESC) AS r
    FROM d WHERE ok = 0 GROUP BY dream, step, value
  ) WHERE r = 1
), g AS (
  SELECT dream, step, COUNT(*) AS answers, ROUND(100.0*SUM(ok)/COUNT(*)) AS correct_pct FROM d GROUP BY dream, step
)
SELECT g.dream AS dream, g.step AS step, g.answers AS answers, g.correct_pct AS correct_pct, w.top_wrong AS top_wrong
FROM g LEFT JOIN w ON w.dream = g.dream AND w.step = g.step ORDER BY g.dream, g.step LIMIT 120`,
  // A/B второй жизни: игроки, начавшие вторую жизнь по лотерее (не наследником), по вариантам - дожили в ней до 20 и 40,
  // начали третью жизнь, вернулись в другой день (открыли или закрыли игру); средний возраст смерти во второй жизни.
  abSecondLife: `WITH s AS (
  SELECT player_id, MIN(ts) AS t2, MIN(COALESCE(json_extract(params_json,'$.ab'),'(нет)')) AS variant,
    MAX(COALESCE(json_extract(params_json,'$.high'),0)) AS high
  FROM events WHERE name='life_start' AND json_extract(params_json,'$.life_index') = 2
    AND COALESCE(json_extract(params_json,'$.lottery'),'') <> 'heir' AND COALESCE(json_extract(params_json,'$.royal'),0) = 0
    AND COALESCE(json_extract(params_json,'$.gifts'),'') = ''
    AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL
  GROUP BY player_id
), e AS (SELECT player_id, ts, name, params_json FROM events
  WHERE name IN ('age_milestone','life_start','life_end','app_open','session_end') AND ts >= ?1 AND player_id IN (SELECT player_id FROM s))
SELECT s.variant AS variant, COUNT(DISTINCT s.player_id) AS players, COUNT(DISTINCT CASE WHEN s.high = 1 THEN s.player_id END) AS high,
  COUNT(DISTINCT CASE WHEN e.name='age_milestone' AND json_extract(e.params_json,'$.life_index')=2 AND json_extract(e.params_json,'$.age')=20 THEN e.player_id END) AS age_20,
  COUNT(DISTINCT CASE WHEN e.name='age_milestone' AND json_extract(e.params_json,'$.life_index')=2 AND json_extract(e.params_json,'$.age')=40 THEN e.player_id END) AS age_40,
  COUNT(DISTINCT CASE WHEN e.name='life_start' AND json_extract(e.params_json,'$.life_index')>=3 THEN e.player_id END) AS third_life,
  COUNT(DISTINCT CASE WHEN ${DAYNUM_SQL.replace(/ts/g, 'e.ts')} > CAST((s.t2/1000 + 10800)/86400 AS INTEGER) THEN e.player_id END) AS returned,
  ROUND(AVG(CASE WHEN e.name='life_end' AND json_extract(e.params_json,'$.life_index')=2 THEN json_extract(e.params_json,'$.age') END),1) AS death_age
FROM s LEFT JOIN e ON e.player_id = s.player_id GROUP BY s.variant ORDER BY s.variant LIMIT 10`,
  // Дары за вход: сколько игроков забрали дар каждого дня серии (1–7), из них - после обрыва серии.
  dailyClaims: `SELECT json_extract(params_json,'$.day') AS day, COUNT(DISTINCT player_id) AS players,
  COUNT(DISTINCT CASE WHEN json_extract(params_json,'$.broken') = 1 THEN player_id END) AS broken
FROM events WHERE name='daily_claim' AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL GROUP BY day ORDER BY day LIMIT 7`,
  // Ушли из меню, так и не начав жизнь (новички: ни одной жизни ни до, ни в этом периоде): по игроку - видел ли барабан
  // и кнопку «Крути», крутил ли, сколько секунд пробыл в меню (сумма за все уходы), прокрутка и высота экрана (menu_leave).
  menuLeave: `WITH m AS (
  SELECT player_id, MAX(json_extract(params_json,'$.spun')) AS spun, MAX(json_extract(params_json,'$.button')) AS button,
    MAX(json_extract(params_json,'$.drum')) AS drum, SUM(json_extract(params_json,'$.sec')) AS sec,
    MAX(json_extract(params_json,'$.scroll')) AS scroll, MAX(json_extract(params_json,'$.vh')) AS vh
  FROM events WHERE name='menu_leave' AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL
    AND json_extract(params_json,'$.lives') = 0 AND json_extract(params_json,'$.hero') = 0
    AND player_id NOT IN (SELECT player_id FROM events WHERE name='life_start' AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL)
  GROUP BY player_id
)
SELECT CASE WHEN spun = 1 THEN 'крутил, но не начал жизнь' WHEN button = 1 THEN 'видел кнопку «Крути», не крутил'
  WHEN drum >= 50 THEN 'видел барабан, кнопку - нет' ELSE 'барабан почти не видел' END AS what,
  COUNT(*) AS players, SUM(sec <= 10) AS quick, CAST(ROUND(AVG(sec)) AS INTEGER) AS avg_sec,
  CAST(ROUND(AVG(scroll)) AS INTEGER) AS avg_scroll, CAST(ROUND(AVG(vh)) AS INTEGER) AS avg_vh
FROM m GROUP BY what ORDER BY players DESC, what`,
  // Когорты: новые игроки (players.first_ts от ?1 до ?2, мс) и дни, когда игроки открывали или закрывали игру (с ?1, мс;
  // закрытие - чтобы сессия через полночь тоже считалась заходом в следующий день).
  // Соединяются в JS (cohorts): соединение в SQL D1 считает как перебор пар строк.
  cohortPlayers: `SELECT player_id, CAST((first_ts/1000 + 10800)/86400 AS INTEGER) AS d0 FROM players WHERE first_ts >= ?1 AND first_ts < ?2`,
  cohortOpens: `SELECT DISTINCT player_id, ${DAYNUM_SQL} AS d FROM events WHERE name IN ('app_open','session_end') AND ts >= ?1 AND player_id IS NOT NULL`,
  // R3 ТЗ удержания: игроки периода - страна (колонка country, у строк до 20.11 её нет), язык и время загрузки первого
  // захода, начали ли жизнь и сделали ли выбор. Соединяется с новыми игроками (cohortPlayers) в JS (byCountry).
  countryPlayers: `SELECT player_id, MAX(country) AS country, MAX(CASE WHEN name='app_open' THEN json_extract(params_json,'$.lang') END) AS lang,
  MIN(CASE WHEN name='app_open' THEN json_extract(params_json,'$.load_ms') END) AS load_ms,
  MAX(name='life_start') AS life_start, MAX(name='first_choice') AS first_choice
FROM events WHERE name IN ('app_open','life_start','first_choice') AND ts >= ?1 AND ts < ?2 AND player_id IS NOT NULL GROUP BY player_id`,
  // R4: загрузки страницы (маяк boot из index.html) без app_open с тем же boot_id - игра так и не загрузилась.
  // app_open ищется и в первый час после периода (загрузка на границе суток). Служебные устройства - не считаются.
  bootLoss: `WITH b AS (
  SELECT json_extract(params_json,'$.boot_id') AS bid, ${COUNTRY_SQL} AS country, COALESCE(json_extract(params_json,'$.lang'),'-') AS lang
  FROM events WHERE name='boot' AND ts >= ?1 AND ts < ?2 AND COALESCE(json_extract(params_json,'$.internal'),0) = 0
), o AS (
  SELECT DISTINCT json_extract(params_json,'$.boot_id') AS bid FROM events WHERE name='app_open' AND ts >= ?1 AND ts < ?2 + 3600000 AND json_extract(params_json,'$.boot_id') IS NOT NULL
)
SELECT country, lang, COUNT(*) AS boots, SUM(bid NOT IN (SELECT bid FROM o)) AS lost FROM b GROUP BY country, lang ORDER BY boots DESC, country, lang LIMIT 30`,
  // R5: долгая загрузка страны после рывка рычага, ошибка загрузки и сколько ждали активную кнопку.
  loadEvents: `SELECT name, ${COUNTRY_SQL} AS country, json_extract(params_json,'$.ms') AS ms, json_extract(params_json,'$.wait_ms') AS wait_ms
FROM events WHERE name IN ('load_ready','load_slow','load_error') AND ts >= ?1 AND ts < ?2 LIMIT 20000`,
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

/** Таблица players (первое событие каждого игрока) догоняется по новым событиям: id больше отметки в counters.
 *  Читает только новые строки событий; вызывать перед расчётами, где нужны новые игроки и когорты. Возвращает число игроков. */
let playersReady = false
export async function syncPlayers(db: D1Database, now = Date.now()): Promise<number> {
  // Сводка (worker/digest) может прийти в базу раньше сайта - таблицы на этот случай.
  await ensureRetention(db)
  if (!playersReady) {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS players (player_id TEXT PRIMARY KEY, first_ts INTEGER); CREATE INDEX IF NOT EXISTS players_first ON players(first_ts); CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL, mark INTEGER NOT NULL, updated INTEGER NOT NULL);',
    )
    playersReady = true
  }
  const row = (await db.prepare("SELECT value, mark FROM counters WHERE name = 'players'").all<{ value: number; mark: number }>()).results[0]
  const mark = row ? Number(row.mark) : 0
  const top = Number((await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM events').all<{ m: number }>()).results[0]?.m ?? 0)
  if (row && top <= mark) return Number(row.value)
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO players (player_id, first_ts) SELECT player_id, MIN(ts) FROM events WHERE id > ?1 AND id <= ?2 AND player_id IS NOT NULL GROUP BY player_id').bind(mark, top),
    db
      .prepare("INSERT INTO counters (name, value, mark, updated) VALUES ('players', (SELECT COUNT(*) FROM players), ?1, ?2) ON CONFLICT(name) DO UPDATE SET value = excluded.value, mark = excluded.mark, updated = excluded.updated")
      .bind(top, now),
  ])
  return Number((await db.prepare("SELECT value FROM counters WHERE name = 'players'").all<{ value: number }>()).results[0]?.value ?? 0)
}

/** Все цифры сводки за период (перед вызовом - syncPlayers, иначе новые игроки последних минут посчитаются вернувшимися). */
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

/** Когорты по дню первого захода за n дней до today (включительно). Возврат, которого ещё не могло быть, - «-». */
export async function cohorts(db: D1Database, today: number, n = 21): Promise<CohortRow[]> {
  const first = today - n + 1
  const [c, a] = await Promise.all([
    db.prepare(SQL.cohortPlayers).bind(dayStart(first), dayStart(today + 1)).all<{ player_id: string; d0: number }>(),
    db.prepare(SQL.cohortOpens).bind(dayStart(first + 1)).all<{ player_id: string; d: number }>(),
  ])
  const opens = new Set(a.results.map((r) => `${r.player_id}:${num(r.d)}`))
  const byDay = new Map<number, { total: number; d1: number; d7: number }>()
  for (const r of c.results) {
    const d0 = num(r.d0)
    const g = byDay.get(d0) ?? { total: 0, d1: 0, d7: 0 }
    g.total++
    if (opens.has(`${r.player_id}:${d0 + 1}`)) g.d1++
    if (opens.has(`${r.player_id}:${d0 + 7}`)) g.d7++
    byDay.set(d0, g)
  }
  const cell = (d0: number, k: number, v: number, total: number) => (d0 + k > today ? '-' : `${v} (${pct(v, total)})`)
  return [...byDay]
    .sort((x, y) => y[0] - x[0])
    .map(([d0, g]) => ({ day: dayIso(d0), new_players: g.total, d1: cell(d0, 1, g.d1, g.total), d7: cell(d0, 7, g.d7, g.total) }))
}

export interface CountryRow {
  country: string
  lang: string
  new_players: number
  life_start: string
  first_choice: string
  d1: string
  load_ms: number | null
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

/**
 * R3 ТЗ удержания: новые игроки периода по стране (и языку, если byLang): сколько начали жизнь, сделали первый выбор,
 * вернулись на следующий день (D1 - только у тех, у кого следующий день уже наступил; иначе «-»), медиана load_ms.
 */
export async function byCountry(db: D1Database, p: Period, today: number, byLang = true): Promise<CountryRow[]> {
  const [c, e, a] = await Promise.all([
    db.prepare(SQL.cohortPlayers).bind(p.from, p.to).all<{ player_id: string; d0: number }>(),
    db.prepare(SQL.countryPlayers).bind(p.from, p.to).all<Record<string, unknown>>(),
    db.prepare(SQL.cohortOpens).bind(dayStart(p.first + 1)).all<{ player_id: string; d: number }>(),
  ])
  const info = new Map(e.results.map((r) => [String(r.player_id), r]))
  const opens = new Set(a.results.map((r) => `${r.player_id}:${num(r.d)}`))
  const groups = new Map<string, { country: string; lang: string; n: number; ls: number; fc: number; d1n: number; d1: number; load: number[] }>()
  for (const r of c.results) {
    const x = info.get(String(r.player_id))
    const country = countryOf(x?.country)
    const l = String(x?.lang ?? '')
    const lang = byLang ? (l === 'ru' || l === 'en' ? l : 'прочие') : 'все'
    const key = `${country}|${lang}`
    const g = groups.get(key) ?? { country, lang, n: 0, ls: 0, fc: 0, d1n: 0, d1: 0, load: [] }
    const d0 = num(r.d0)
    g.n++
    if (num(x?.life_start)) g.ls++
    if (num(x?.first_choice)) g.fc++
    if (d0 + 1 <= today) {
      g.d1n++
      if (opens.has(`${r.player_id}:${d0 + 1}`)) g.d1++
    }
    if (x?.load_ms != null) g.load.push(num(x.load_ms))
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((x, y) => y.n - x.n || (x.country < y.country ? -1 : 1))
    .map((g) => ({
      country: g.country,
      lang: g.lang,
      new_players: g.n,
      life_start: `${g.ls} (${pct(g.ls, g.n)})`,
      first_choice: `${g.fc} (${pct(g.fc, g.n)})`,
      d1: g.d1n ? `${g.d1} (${pct(g.d1, g.d1n)})` : '-',
      load_ms: median(g.load),
    }))
}

export interface LoadRow {
  country: string
  ready: number
  ms_median: number | null
  ms_p90: number | null
  wait_median: number | null
  slow: number
  error: number
}

/** R5/R7: загрузка страны после рывка рычага по стране - медиана и p90 ожидания, сколько раз «долго» и ошибок. */
export async function loadStats(db: D1Database, p: Period): Promise<LoadRow[]> {
  const rows = (await db.prepare(SQL.loadEvents).bind(p.from, p.to).all<Record<string, unknown>>()).results
  const by = new Map<string, { ms: number[]; wait: number[]; slow: number; error: number }>()
  for (const r of rows) {
    const k = String(r.country)
    const g = by.get(k) ?? { ms: [], wait: [], slow: 0, error: 0 }
    if (r.name === 'load_ready') {
      if (r.ms != null) g.ms.push(num(r.ms))
      if (r.wait_ms != null) g.wait.push(num(r.wait_ms))
    } else if (r.name === 'load_slow') g.slow++
    else g.error++
    by.set(k, g)
  }
  return [...by]
    .map(([country, g]) => ({ country, ready: g.ms.length, ms_median: median(g.ms), ms_p90: quantile(g.ms, 0.9), wait_median: median(g.wait), slow: g.slow, error: g.error }))
    .sort((x, y) => y.ready - x.ready || (x.country < y.country ? -1 : 1))
}

// ---------- Форматирование для Telegram (parse_mode HTML) ----------

/** Экранирование для HTML Telegram и админки. */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-')
const f1 = (v: number | null) => (v == null || Number.isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1))
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
    '<i>Сегодня - с 00:00 по Стамбулу до этой минуты.</i>',
  ].join('\n')
}

export function formatFunnel(s: Summary): string {
  return [`<b>Воронка за ${esc(s.period.label)}</b> (уникальные игроки, % от прошлого шага)`, funnelGrid(s.funnel)].join('\n')
}

export function formatExits(s: Summary): string {
  return [`<b>Где уходят за ${esc(s.period.label)}</b> (топ-10 экранов при закрытии вкладки; возраст героя и минуты с начала сессии - средние)`, exitsGrid(s.exits)].join('\n')
}

export const HELP = [
  '<b>Тысячи жизней - команды</b>',
  '/stats - сегодня и вчера',
  '/week - сводка за 7 дней (с сегодняшним)',
  '/funnel - воронка за 7 дней',
  '/exits - топ-10 экранов выхода за 7 дней',
  '/digest - утренняя сводка за вчера прямо сейчас',
  '/help - этот список',
  '<i>Дни считаются по Стамбулу (UTC+3).</i>',
].join('\n')

/** Ежедневная сводка: вчера (по Стамбулу) с дельтой к позавчера. Её же шлёт команда /digest. */
export async function digestMessage(db: D1Database, now: number): Promise<string> {
  await syncPlayers(db, now)
  // Без служебных устройств и вкладок, которые так и не показали (R6, R11 ТЗ удержания).
  db = reportDb(db)
  const y = dayOf(now) - 1
  const cur = await summary(db, period(y))
  if (!cur.events && !cur.feedback.n) return `<b>Тысячи жизней, вчера ${esc(dayLabel(y))}</b>\nВчера активности не было.`
  const [prev, cy, cb] = await Promise.all([summary(db, period(y - 1)), byCountry(db, period(y), y, false), byCountry(db, period(y - 1), y, false)])
  return [formatSummary(`Тысячи жизней, вчера ${dayLabel(y)}`, cur, prev, dayLabel(y - 1)), formatCountries(cy, cb)].join('\n')
}

/** Новые игроки вчера по стране; D1 - у пришедших позавчера (их «завтра» - это вчера). */
export function formatCountries(yesterday: CountryRow[], before: CountryRow[]): string {
  if (!yesterday.length && !before.length) return ''
  const d1 = new Map(before.map((r) => [r.country, r.d1]))
  const names = [...new Set([...yesterday.map((r) => r.country), ...before.map((r) => r.country)])]
  const row = (c: string) => {
    const r = yesterday.find((x) => x.country === c)
    return [c, r?.new_players ?? 0, r ? r.life_start.replace(/^\d+ \((.*)\)$/, '$1') : '-', r ? r.first_choice.replace(/^\d+ \((.*)\)$/, '$1') : '-', d1.get(c)?.replace(/^\d+ \((.*)\)$/, '$1') ?? '-']
  }
  return ['<b>Новые по стране</b> (жизнь, первый выбор - вчера; D1 - пришедшие позавчера)', grid([['страна', 'новых', 'жизнь', 'выбор', 'D1'], ...names.map(row)])].join('\n')
}

/** Ответ на команду бота; незнакомая команда - список команд. */
export async function commandReply(db: D1Database | undefined, command: string, now: number): Promise<string> {
  const today = dayOf(now)
  if (command === '/help' || command === '/start') return HELP
  if (!['/stats', '/week', '/funnel', '/exits', '/digest'].includes(command)) return HELP
  if (!db) return 'База D1 не подключена к сайту (привязка DB) - считать не из чего.'
  db = serialDb(db)
  await syncPlayers(db, now)
  db = reportDb(db)
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
