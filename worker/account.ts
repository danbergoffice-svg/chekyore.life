// Аккаунты (просьба владельца 09.11): вход по ссылке на почту (письмо - через Resend, ключ RESEND_API_KEY в Cloudflare),
// сохранение достижений и мемориала на сервере, согласие на рассылку новостей и бонусных кодов, удаление своих данных.
// Игрокам из России (cf-ipcountry / request.cf.country = RU) вход не предлагается и не работает.
//   GET    /api/account/geo         - {ru}: показывать ли форму;
//   POST   /api/account/start       - {email, player_id, lang, newsletter}: письмо со ссылкой (действует 30 минут);
//   POST   /api/account/verify      - {token}: вход по ссылке, ответ - {session, email, newsletter, updated};
//   GET    /api/account/data        - сохранённые данные (Authorization: Bearer <session>);
//   PUT    /api/account/data        - сохранить данные (до 900 КБ);
//   POST   /api/account/newsletter  - {subscribe}: подписка на рассылку;
//   POST   /api/account/logout      - выйти на этом устройстве;
//   DELETE /api/account             - удалить аккаунт, сохранения и события аналитики этого игрока.
// Почта хранится только для входа и (по согласию) рассылки; токены - только в виде хеша SHA-256.

import type { D1Database } from './stats'

export interface AccountEnv {
  DB?: D1Database
  RESEND_API_KEY?: string
  /** Отправитель писем (домен должен быть подтверждён в Resend). */
  MAIL_FROM?: string
  /** Адрес сайта для ссылки входа. */
  SITE_URL?: string
}

export const ACCOUNT_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, player_id TEXT, created INTEGER NOT NULL, newsletter INTEGER NOT NULL DEFAULT 0, consent_ts INTEGER, lang TEXT, data_json TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, player_id TEXT, newsletter INTEGER NOT NULL DEFAULT 0, lang TEXT, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created INTEGER NOT NULL);
`

let schemaReady = false
const TOKEN_TTL = 30 * 60e3
const MAX_DATA = 900_000
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

export function isRussia(req: Request): boolean {
  const cf = (req as Request & { cf?: { country?: string } }).cf
  return (cf?.country ?? req.headers.get('cf-ipcountry') ?? '').toUpperCase() === 'RU'
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const a = new Uint8Array(24)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const MAIL: Record<string, { subject: string; text: (link: string) => string }> = {
  ru: {
    subject: 'Вход в «Тысячи жизней»',
    text: (l) => `Здравствуйте!\n\nЧтобы сохранить свои жизни и награды, откройте ссылку (действует 30 минут):\n${l}\n\nЕсли вы не запрашивали вход - просто удалите это письмо.\n\n«Тысячи жизней», thousands.life`,
  },
  en: {
    subject: 'Sign in to Thousands of Lives',
    text: (l) => `Hello!\n\nTo save your lives and awards, open this link (valid for 30 minutes):\n${l}\n\nIf you did not ask to sign in, just delete this email.\n\nThousands of Lives, thousands.life`,
  },
  tr: {
    subject: 'Thousands of Lives giriş',
    text: (l) => `Merhaba!\n\nHayatlarını ve ödüllerini kaydetmek için bu bağlantıyı aç (30 dakika geçerli):\n${l}\n\nGiriş istemediysen bu e-postayı silmen yeterli.\n\nThousands of Lives, thousands.life`,
  },
}

async function sendLoginMail(env: AccountEnv, email: string, link: string, lang: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  const m = MAIL[lang] ?? MAIL.en
  const text = m.text(link)
  const html = `<p>${text.split('\n\n').map((p) => p.replace(/\n/g, '<br>').replace(link, `<a href="${link}">${link}</a>`)).join('</p><p>')}</p>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM ?? 'Thousands of Lives <hello@thousands.life>', to: [email], subject: m.subject, text, html }),
  })
  return res.ok
}

type Json = (data: unknown, status?: number) => Response

async function sessionEmail(req: Request, db: D1Database): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!/^[0-9a-f]{48}$/.test(token)) return null
  const row = (await db.prepare('SELECT email FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).all<{ email: string }>()).results[0]
  return row?.email ?? null
}

/** Все пути /api/account*. json - ответ с CORS-заголовками. */
export async function account(req: Request, env: AccountEnv, path: string, json: Json): Promise<Response> {
  const ru = isRussia(req)
  if (path === '/api/account/geo') return json({ ok: true, ru })
  const db = env.DB
  if (!db) return json({ ok: false, error: 'no_db' }, 503)
  if (!schemaReady) {
    await db.exec(ACCOUNT_SCHEMA.trim().split('\n').join(' '))
    schemaReady = true
  }
  const now = Date.now()

  if (path === '/api/account/start' && req.method === 'POST') {
    if (ru) return json({ ok: false, error: 'region' }, 403)
    const b = (await req.json().catch(() => null)) as { email?: string; player_id?: string; lang?: string; newsletter?: boolean } | null
    const email = (b?.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) return json({ ok: false, error: 'email' }, 400)
    if (!env.RESEND_API_KEY) return json({ ok: false, error: 'mail_off' }, 503)
    const token = randomToken()
    const lang = ['ru', 'en', 'tr'].includes(b?.lang ?? '') ? b!.lang! : 'en'
    await db.prepare('DELETE FROM login_tokens WHERE expires < ?1').bind(now).run()
    await db
      .prepare('INSERT INTO login_tokens (token_hash, email, player_id, newsletter, lang, expires) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(await sha256(token), email, (b?.player_id ?? '').slice(0, 64), b?.newsletter ? 1 : 0, lang, now + TOKEN_TTL)
      .run()
    const site = (env.SITE_URL ?? new URL(req.url).origin).replace(/\/$/, '')
    const sent = await sendLoginMail(env, email, `${site}/?login=${token}`, lang)
    return sent ? json({ ok: true }) : json({ ok: false, error: 'mail' }, 502)
  }

  if (path === '/api/account/verify' && req.method === 'POST') {
    if (ru) return json({ ok: false, error: 'region' }, 403)
    const b = (await req.json().catch(() => null)) as { token?: string } | null
    const token = b?.token ?? ''
    if (!/^[0-9a-f]{48}$/.test(token)) return json({ ok: false, error: 'token' }, 400)
    const hash = await sha256(token)
    const row = (await db.prepare('SELECT email, player_id, newsletter, lang, expires FROM login_tokens WHERE token_hash = ?1').bind(hash).all<{ email: string; player_id: string; newsletter: number; lang: string; expires: number }>()).results[0]
    if (!row || Number(row.expires) < now) return json({ ok: false, error: 'expired' }, 410)
    await db.prepare('DELETE FROM login_tokens WHERE token_hash = ?1').bind(hash).run()
    const existing = (await db.prepare('SELECT newsletter, updated FROM accounts WHERE email = ?1').bind(row.email).all<{ newsletter: number; updated: number | null }>()).results[0]
    if (!existing) {
      await db
        .prepare('INSERT INTO accounts (email, player_id, created, newsletter, consent_ts, lang) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(row.email, row.player_id, now, Number(row.newsletter), Number(row.newsletter) ? now : null, row.lang)
        .run()
    } else if (Number(row.newsletter) && !Number(existing.newsletter)) {
      await db.prepare('UPDATE accounts SET newsletter = 1, consent_ts = ?2 WHERE email = ?1').bind(row.email, now).run()
    }
    const session = randomToken()
    await db.prepare('INSERT INTO sessions (token_hash, email, created) VALUES (?1, ?2, ?3)').bind(await sha256(session), row.email, now).run()
    return json({ ok: true, session, email: row.email, newsletter: Number(existing?.newsletter ?? row.newsletter) === 1, updated: existing?.updated ?? null })
  }

  const email = await sessionEmail(req, db)
  if (!email) return json({ ok: false, error: 'auth' }, 401)

  if (path === '/api/account/data' && req.method === 'GET') {
    const row = (await db.prepare('SELECT data_json, updated, newsletter FROM accounts WHERE email = ?1').bind(email).all<{ data_json: string | null; updated: number | null; newsletter: number }>()).results[0]
    return json({ ok: true, email, newsletter: Number(row?.newsletter) === 1, updated: row?.updated ?? null, data: row?.data_json ? JSON.parse(row.data_json) : null })
  }
  if (path === '/api/account/data' && req.method === 'PUT') {
    const text = await req.text()
    if (text.length > MAX_DATA) return json({ ok: false, error: 'too_big' }, 413)
    try {
      JSON.parse(text)
    } catch {
      return json({ ok: false, error: 'json' }, 400)
    }
    await db.prepare('UPDATE accounts SET data_json = ?2, updated = ?3 WHERE email = ?1').bind(email, text, now).run()
    return json({ ok: true, updated: now })
  }
  if (path === '/api/account/newsletter' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { subscribe?: boolean } | null
    await db.prepare('UPDATE accounts SET newsletter = ?2, consent_ts = ?3 WHERE email = ?1').bind(email, b?.subscribe ? 1 : 0, b?.subscribe ? now : null).run()
    return json({ ok: true, newsletter: !!b?.subscribe })
  }
  if (path === '/api/account/logout' && req.method === 'POST') {
    const auth = (req.headers.get('authorization') ?? '').slice(7).trim()
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(auth)).run()
    return json({ ok: true })
  }
  if (path === '/api/account' && req.method === 'DELETE') {
    // Всё, что связано с этим человеком: аккаунт, входы, сохранения, а также события и отзывы его игрока.
    const row = (await db.prepare('SELECT player_id FROM accounts WHERE email = ?1').bind(email).all<{ player_id: string | null }>()).results[0]
    const b = (await req.json().catch(() => null)) as { player_id?: string } | null
    const ids = [...new Set([row?.player_id, b?.player_id].filter((x): x is string => !!x))]
    const stmts = [
      db.prepare('DELETE FROM accounts WHERE email = ?1').bind(email),
      db.prepare('DELETE FROM sessions WHERE email = ?1').bind(email),
      db.prepare('DELETE FROM login_tokens WHERE email = ?1').bind(email),
      ...ids.flatMap((id) => [db.prepare('DELETE FROM events WHERE player_id = ?1').bind(id), db.prepare('DELETE FROM feedback WHERE player_id = ?1').bind(id)]),
    ]
    await db.batch(stmts)
    return json({ ok: true })
  }
  return json({ ok: false }, 404)
}
