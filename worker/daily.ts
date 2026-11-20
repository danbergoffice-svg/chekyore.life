// «Жизнь дня» (docs/TZ_daily.md): итоги одной общей жизни за сутки UTC, таблица дня и ники игроков.
//   GET  /api/daily?date=YYYY-MM-DD&player=ID  - таблица дня: сколько сыграло, топ-10, своё место;
//   POST /api/daily/result                     - {date, player_id, age, kids, wealth, prof, sec, birth}: итог (один на игрока за день);
//   POST /api/nick                             - {player_id, nick, hidden}: ник для таблиц (уникальный без учёта регистра).
// Порядок в таблице: дольше прожил → больше живых детей и внуков → богаче → раньше прислал.
// Проверки правдоподобия: дата - сегодня или вчера (UTC), возраст 0–110, жизнь шла в реальном времени не слишком быстро,
// рождение совпадает с рождением первого итога этого дня. Все запросы - только с bind.

import type { D1Database } from './stats'

export interface DailyEnv {
  DB?: D1Database
}

export const DAILY_SCHEMA = `
CREATE TABLE IF NOT EXISTS daily_results (date TEXT NOT NULL, player_id TEXT NOT NULL, age INTEGER NOT NULL, kids INTEGER NOT NULL, wealth INTEGER NOT NULL, prof TEXT, birth TEXT, sec INTEGER, country TEXT, ts INTEGER NOT NULL, PRIMARY KEY (date, player_id));
CREATE INDEX IF NOT EXISTS daily_rank ON daily_results(date, age, kids, wealth, ts);
CREATE TABLE IF NOT EXISTS nicks (player_id TEXT PRIMARY KEY, nick TEXT NOT NULL, nick_lc TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS nicks_lc ON nicks(nick_lc);
`

let schemaReady = false
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PLAYER = /^[\w-]{4,64}$/
const PROF = /^[a-z0-9_]{1,40}$/
const NICK = /^[\p{L}\p{N}_-]{3,16}$/u
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Грубые слова на пяти языках игры (корни), ссылки и выдача себя за игру: проверяются по нику в нижнем регистре,
// где похожие цифры и знаки заменены буквами (0 → o, 1 → i, 3 → e, 4 → a, @ → a, $ → s), ё → е.
const BAD = [
  'хуй', 'хуе', 'хуё', 'пизд', 'ебат', 'ебан', 'ебал', 'ёб', 'ебл', 'бляд', 'блят', 'сука', 'суки', 'мудак', 'мудил', 'залуп', 'гандон', 'пидор', 'пидар', 'шлюх', 'дроч',
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'nigga', 'fag', 'whore', 'slut', 'dick', 'cock', 'pussy', 'rape', 'nazi', 'hitler',
  'amk', 'amın', 'amina', 'orospu', 'sikt', 'sikim', 'piç', 'yarak', 'göt',
  'puta', 'puto', 'mierda', 'coño', 'pendej', 'cabron', 'cabrón', 'joder', 'polla', 'verga',
  'putain', 'merde', 'salope', 'connard', 'encul', 'pute', 'bite', 'couille',
  'admin', 'moderator', 'thousands',
]

export function nickAllowed(nick: string): boolean {
  const s = nick.trim()
  if (!NICK.test(s) || /(https?|www|\.com|\.ru)/i.test(s)) return false
  const norm = s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[_-]/g, '')
  return !BAD.some((w) => norm.includes(w.replace(/ё/g, 'е')))
}

type Json = (data: unknown, status?: number) => Response

interface Row {
  player_id: string
  age: number
  kids: number
  wealth: number
  prof: string | null
  country: string | null
  ts: number
  nick: string | null
  hidden: number | null
}

const SELECT = 'SELECT r.player_id, r.age, r.kids, r.wealth, r.prof, r.country, r.ts, n.nick, n.hidden FROM daily_results r LEFT JOIN nicks n ON n.player_id = r.player_id'
const ORDER = 'ORDER BY r.age DESC, r.kids DESC, r.wealth DESC, r.ts ASC'

const out = (r: Row, place: number, me: string) => ({
  place,
  nick: r.hidden ? null : r.nick ?? null,
  country: r.country ?? null,
  age: Number(r.age),
  kids: Number(r.kids),
  prof: r.prof ?? null,
  ...(r.player_id === me ? { me: true } : {}),
})

/** Таблица дня: сколько сыграло, топ-10 и своя строка (если игрок сыграл). */
export async function dailyBoard(db: D1Database, date: string, player: string) {
  const top = (await db.prepare(`${SELECT} WHERE r.date = ?1 ${ORDER} LIMIT 10`).bind(date).all<Row>()).results
  const n = Number((await db.prepare('SELECT COUNT(*) AS n FROM daily_results WHERE date = ?1').bind(date).all<{ n: number }>()).results[0]?.n ?? 0)
  let me = null
  if (PLAYER.test(player)) {
    const mine = (await db.prepare(`${SELECT} WHERE r.date = ?1 AND r.player_id = ?2`).bind(date, player).all<Row>()).results[0]
    if (mine) {
      const better = (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM daily_results WHERE date = ?1 AND (age > ?2 OR (age = ?2 AND kids > ?3) OR (age = ?2 AND kids = ?3 AND wealth > ?4) OR (age = ?2 AND kids = ?3 AND wealth = ?4 AND ts < ?5))',
          )
          .bind(date, Number(mine.age), Number(mine.kids), Number(mine.wealth), Number(mine.ts))
          .all<{ n: number }>()
      ).results[0]
      me = out(mine, Number(better?.n ?? 0) + 1, player)
    }
  }
  return { date, n, top: top.map((r, i) => out(r, i + 1, player)), me }
}

const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null)

/** Все пути /api/daily* и /api/nick. country - страна запроса (Cloudflare), для «Игрок из …» у скрытых ников. */
export async function daily(req: Request, env: DailyEnv, path: string, country: string | null, json: Json): Promise<Response> {
  const db = env.DB
  if (!db) return json({ ok: false, error: 'no_db' }, 503)
  if (!schemaReady) {
    await db.exec(DAILY_SCHEMA.trim().split('\n').join(' '))
    schemaReady = true
  }
  const now = Date.now()
  const today = utc(now)
  const yesterday = utc(now - 86400000)

  if (path === '/api/daily' && req.method === 'GET') {
    const url = new URL(req.url)
    const date = url.searchParams.get('date') ?? today
    if (!DATE.test(date) || date > today) return json({ ok: false, error: 'date' }, 400)
    return json({ ok: true, board: await dailyBoard(db, date, url.searchParams.get('player') ?? '') })
  }

  if (path === '/api/daily/result' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const date = typeof b?.date === 'string' ? b.date : ''
    const player = typeof b?.player_id === 'string' ? b.player_id : ''
    // Жизнь, начатая вчера, может кончиться сегодня: итог принимается за сегодня и вчера.
    if (!DATE.test(date) || (date !== today && date !== yesterday)) return json({ ok: false, error: 'date' }, 400)
    if (!PLAYER.test(player)) return json({ ok: false, error: 'player' }, 400)
    const age = int(b?.age, 0, 110)
    const kids = int(b?.kids, 0, 80)
    const wealth = int(b?.wealth, 0, 1e9)
    const sec = int(b?.sec, 0, 1e7)
    const prof = b?.prof == null ? null : typeof b.prof === 'string' && PROF.test(b.prof) ? b.prof : undefined
    const birth = b?.birth && typeof b.birth === 'object' ? JSON.stringify(b.birth).slice(0, 300) : null
    if (age === null || kids === null || wealth === null || sec === null || prof === undefined || !birth) return json({ ok: false, error: 'bad' }, 400)
    // Год идёт не быстрее ~0,4 с реального времени (самая высокая скорость); детство до 13 можно пропустить.
    if (age > 20 && sec < (age - 13) * 0.4) return json({ ok: false, error: 'fast' }, 400)
    // Рождение у всех за этот день одинаковое: итог с другим рождением - подделка или старая сборка.
    const first = (await db.prepare('SELECT birth FROM daily_results WHERE date = ?1 LIMIT 1').bind(date).all<{ birth: string }>()).results[0]
    if (first && first.birth !== birth) return json({ ok: false, error: 'birth' }, 400)
    const dup = (await db.prepare('SELECT 1 AS x FROM daily_results WHERE date = ?1 AND player_id = ?2').bind(date, player).all()).results.length > 0
    if (!dup) {
      await db
        .prepare('INSERT INTO daily_results (date, player_id, age, kids, wealth, prof, birth, sec, country, ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
        .bind(date, player, age, kids, wealth, prof, birth, sec, country, now)
        .run()
    }
    return json({ ok: !dup, error: dup ? 'dup' : undefined, board: await dailyBoard(db, date, player) }, dup ? 409 : 200)
  }

  if (path === '/api/nick' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const player = typeof b?.player_id === 'string' ? b.player_id : ''
    const nick = typeof b?.nick === 'string' ? b.nick.trim() : ''
    if (!PLAYER.test(player)) return json({ ok: false, error: 'player' }, 400)
    if (!nickAllowed(nick)) return json({ ok: false, error: 'nick_bad' }, 400)
    const lc = nick.toLowerCase()
    const owner = (await db.prepare('SELECT player_id FROM nicks WHERE nick_lc = ?1').bind(lc).all<{ player_id: string }>()).results[0]
    if (owner && owner.player_id !== player) return json({ ok: false, error: 'nick_taken' }, 409)
    await db
      .prepare('INSERT INTO nicks (player_id, nick, nick_lc, hidden, ts) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(player_id) DO UPDATE SET nick = ?2, nick_lc = ?3, hidden = ?4, ts = ?5')
      .bind(player, nick, lc, b?.hidden ? 1 : 0, now)
      .run()
    return json({ ok: true })
  }

  return json({ ok: false }, 404)
}
