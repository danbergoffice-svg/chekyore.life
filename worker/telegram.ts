// Telegram: отправка сообщений и webhook бота (POST /api/telegram).
// Токен и секреты берутся только из env и никогда не пишутся в логи и ответы.
import { commandReply, type D1Database } from './stats'

export interface TgEnv {
  DB?: D1Database
  TELEGRAM_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  TELEGRAM_WEBHOOK_SECRET?: string
}
export interface Ctx {
  waitUntil(p: Promise<unknown>): void
}

const LIMIT = 4000

/** Сравнение строк за постоянное время: сравниваются SHA-256 обеих строк, длина не влияет. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i]
  return diff === 0
}

/** HTML Telegram → обычный текст (запасной вариант, если сообщение длиннее лимита). */
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

/** Отправка в чат владельца. Никогда не бросает исключение: ошибка Telegram не должна ронять приёмник. */
export async function sendMessage(env: TgEnv, text: string, html = true): Promise<boolean> {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT_ID) return false
  // Длиннее лимита — без разметки и обрезано, чтобы не разорвать теги.
  const tooLong = text.length > LIMIT
  const body: Record<string, unknown> = { chat_id: env.TELEGRAM_CHAT_ID, text: tooLong || !html ? (html ? plain(text) : text).slice(0, LIMIT) : text, disable_web_page_preview: true }
  if (html && !tooLong) body.parse_mode = 'HTML'
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) console.log('telegram sendMessage: HTTP', res.status)
    return res.ok
  } catch (e) {
    console.log('telegram sendMessage: сеть', (e as Error)?.name ?? 'error')
    return false
  }
}

interface Update {
  message?: { chat?: { id?: number | string }; text?: string }
}

const ok = () => new Response('ok', { headers: { 'cache-control': 'no-store' } })

/** Webhook бота: проверка секрета, только чат владельца, ответ отправляется в фоне (ctx.waitUntil). */
export async function telegramWebhook(req: Request, env: TgEnv, ctx: Ctx): Promise<Response> {
  const secret = env.TELEGRAM_WEBHOOK_SECRET
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!secret || !(await safeEqual(got, secret))) return new Response('forbidden', { status: 403 })
  const update = (await req.json().catch(() => null)) as Update | null
  const msg = update?.message
  const chat = msg?.chat?.id
  // Чужие чаты и всё, что не команда, — молча 200, чтобы Telegram не повторял доставку.
  if (chat == null || !env.TELEGRAM_CHAT_ID || String(chat) !== String(env.TELEGRAM_CHAT_ID).trim()) return ok()
  const text = typeof msg?.text === 'string' ? msg.text.trim() : ''
  if (!text.startsWith('/')) return ok()
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase()
  ctx.waitUntil(
    commandReply(env.DB, command, Date.now())
      .catch((e) => {
        console.log('telegram command: ошибка расчёта', String(e).slice(0, 200))
        return 'Не получилось посчитать: ошибка базы. Попробуйте позже или откройте /admin.'
      })
      .then((reply) => sendMessage(env, reply)),
  )
  return ok()
}
