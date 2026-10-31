// Worker thousands-digest: каждый день в 09:00 по Стамбулу (cron «0 6 * * *» UTC) шлёт в Telegram сводку
// за вчера с дельтой к позавчера. Цифры считает тот же модуль, что /admin и бот (worker/stats.ts).
// Деплой и секреты - docs/BACKEND.md, раздел «Telegram: бот и утренняя сводка».
//   POST /run (заголовок Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>) - отправить сводку сейчас, для проверки.
import { digestMessage, type D1Database } from '../stats'
import { safeEqual, sendMessage } from '../telegram'

interface Env {
  DB?: D1Database
  TELEGRAM_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  TELEGRAM_WEBHOOK_SECRET?: string
}
interface ScheduledController {
  scheduledTime: number
  cron: string
}

/** Посчитать и отправить сводку. Бросает ошибку при сбое - тогда запуск виден как неудачный в Cron Events. */
async function runDigest(env: Env, now: number): Promise<string> {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('нет секретов TELEGRAM_TOKEN / TELEGRAM_CHAT_ID')
  if (!env.DB) {
    await sendMessage(env, 'Утренняя сводка: к Worker thousands-digest не подключена база D1 (привязка DB).', false)
    throw new Error('нет привязки DB')
  }
  let text: string
  try {
    text = await digestMessage(env.DB, now)
  } catch (e) {
    await sendMessage(env, 'Утренняя сводка не посчиталась: ошибка базы. Подробности - в логах thousands-digest.', false)
    throw e
  }
  if (!(await sendMessage(env, text))) throw new Error('Telegram не принял сообщение')
  return text
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runDigest(env, controller.scheduledTime || Date.now())
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const auth = req.headers.get('authorization') ?? ''
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (req.method !== 'POST' || url.pathname !== '/run' || !env.TELEGRAM_WEBHOOK_SECRET || !(await safeEqual(key, env.TELEGRAM_WEBHOOK_SECRET))) {
      return new Response('Не найдено', { status: 404 })
    }
    try {
      await runDigest(env, Date.now())
      return new Response('Сводка отправлена в Telegram\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    } catch (e) {
      return new Response('Не получилось: ' + String((e as Error)?.message ?? e).slice(0, 200) + '\n', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  },
}
