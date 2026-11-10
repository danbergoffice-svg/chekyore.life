// Спецключи для подписчиков (меню → «Ключ»): код даёт дар один раз на игрока (на этом устройстве - сервера у ключей нет).
// В коде игры лежат не сами ключи, а их хеши: подсмотреть ключ в файлах страницы нельзя. Новый ключ: посчитать
// promoHash('КОД') и добавить строку в PROMO. Ключи (09.11.2026): MONGOL2026 - жизнь у монголов, ROYAL2026 - царский род;
// (10.11) ЭКСТРИМАЛ / EXTREMAL - рождение в самом раннем времени игры, для самой долгой династии.
import type { Gift } from './daily'

export interface PromoReward {
  gift: Gift
  /** Для дара «страна по выбору» - сразу эта страна. */
  country?: string
}

const PROMO: Record<string, PromoReward> = {
  '1olad07': { gift: 'country', country: 'MNG' },
  '1c3t20i': { gift: 'royal' },
  '1ulpjy': { gift: 'earliest' },
  '502yxx': { gift: 'earliest' },
}

/** Код без пробелов и дефисов, заглавными (турецкая i - как латинская). */
export const normalizePromo = (code: string) => code.normalize('NFKC').replace(/[\s-]/g, '').toLocaleUpperCase('en')

export function promoHash(code: string): string {
  let h = 2166136261
  for (const c of normalizePromo(code)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0).toString(36)
}

export type PromoResult = { ok: true; hash: string; reward: PromoReward } | { ok: false; error: 'unknown' | 'used' | 'empty' }

export function redeemPromo(code: string, used: string[] = []): PromoResult {
  if (!normalizePromo(code)) return { ok: false, error: 'empty' }
  const hash = promoHash(code)
  const reward = PROMO[hash]
  if (!reward) return { ok: false, error: 'unknown' }
  if (used.includes(hash)) return { ok: false, error: 'used' }
  return { ok: true, hash, reward }
}
