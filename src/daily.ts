// Дары за вход: заходишь 7 дней подряд - каждый день дар на следующую жизнь, на седьмой - царская семья.
// Сильные дни - 1, 4 и 7, между ними дары поменьше. Пропустил день - серия снова с первого дня, полученные дары не сгорают.
// День считается по времени сервера (перевод часов на телефоне не помогает), граница дня - местная полночь.

import type { IconName } from './ui/icons'

export const GIFTS = ['country', 'respins', 'health', 'noble', 'dream', 'chest', 'royal'] as const
export type Gift = (typeof GIFTS)[number]

export const GIFT_ICON: Record<Gift, IconName> = { country: 'globe', respins: 'reels', health: 'heart', noble: 'castle', dream: 'moon', chest: 'purse', royal: 'crown' }
/** Сильные дни лестницы - выделены в календаре. */
export const BIG_DAYS = [1, 4, 7]
/** Сила даров: перекрутки сверх флага respins, здоровье с рождения, во сколько раз богаче семья. */
export const RESPIN_GIFT = 3
export const HEALTH_GIFT = 20
export const CHEST_GIFT = 3

/** Последний полученный дар серии: день (YYYY-MM-DD) и его номер 1–7. */
export interface Daily {
  last: string
  day: number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function prevDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime())
}

/** Какой день серии можно забрать сегодня; null - сегодня уже забрали. broken - серия прервалась (пропущен день). */
export function dailyNext(daily: Daily | undefined, today: string): { day: number; broken: boolean } | null {
  if (daily?.last === today) return null
  const streak = !!daily && daily.last === prevDay(today)
  // После седьмого дня - новая неделя; это не обрыв серии.
  return { day: streak ? (daily!.day % 7) + 1 : 1, broken: !!daily && !streak && daily.day < 7 }
}

/** Убрать потраченные дары: каждый вид - по одному, лишние (полученные дважды) ждут следующей жизни. */
export function spendGifts(gifts: Gift[], used: Gift[]): Gift[] {
  const left = [...gifts]
  for (const g of used) {
    const i = left.indexOf(g)
    if (i >= 0) left.splice(i, 1)
  }
  return left
}
