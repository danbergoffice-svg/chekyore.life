// Дары за вход (src/daily.ts): серия дней, лестница даров и их действие в жизни.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { BIG_DAYS, CHEST_GIFT, dailyNext, dayKey, GIFTS, HEALTH_GIFT, spendGifts } from '../src/daily'
import { autoplay } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'

const ERAS = await loadAllEras()
const breathe = () => new Promise((r) => setTimeout(r, 0))

describe('Дары за вход', () => {
  it('лестница: 7 даров, сильные дни 1, 4, 7, на седьмой – царская семья', () => {
    expect(GIFTS).toHaveLength(7)
    expect(BIG_DAYS).toEqual([1, 4, 7])
    expect(GIFTS[0]).toBe('country')
    expect(GIFTS[3]).toBe('noble')
    expect(GIFTS[6]).toBe('royal')
  })

  it('серия: подряд – следующий день, сегодня второй раз – нельзя, пропуск – снова первый, после седьмого – новая неделя', () => {
    expect(dailyNext(undefined, '2026-10-28')).toEqual({ day: 1, broken: false })
    expect(dailyNext({ last: '2026-10-28', day: 1 }, '2026-10-28')).toBeNull()
    expect(dailyNext({ last: '2026-10-28', day: 1 }, '2026-10-29')).toEqual({ day: 2, broken: false })
    expect(dailyNext({ last: '2026-10-28', day: 3 }, '2026-10-30')).toEqual({ day: 1, broken: true })
    expect(dailyNext({ last: '2026-10-28', day: 7 }, '2026-10-29')).toEqual({ day: 1, broken: false })
    expect(dailyNext({ last: '2026-10-25', day: 7 }, '2026-10-29')).toEqual({ day: 1, broken: false })
    // Через границы месяца и года.
    expect(dailyNext({ last: '2026-10-31', day: 4 }, '2026-11-01')).toEqual({ day: 5, broken: false })
    expect(dailyNext({ last: '2026-12-31', day: 6 }, '2027-01-01')).toEqual({ day: 7, broken: false })
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
  })

  it('потраченные дары убираются по одному, лишние ждут', () => {
    expect(spendGifts(['country', 'respins', 'country', 'health'], ['country', 'health'])).toEqual(['respins', 'country'])
    expect(spendGifts([], ['royal'])).toEqual([])
  })

  it('здоровье и богатство с рождения; остальная жизнь от того же seed не меняется', () => {
    const settings = { mode: 'quick', mortality: 'soft', softenHeavy: false, livesBefore: 3 } as const
    for (let i = 0; i < 40; i++) {
      const b = rollBirth(9100 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
      const plain = newLife(ERAS[b.era], settings, 9100 + i, undefined, b).hero
      const gifted = newLife(ERAS[b.era], settings, 9100 + i, undefined, { ...b, boons: { health: HEALTH_GIFT, wealth: CHEST_GIFT } }).hero
      expect(gifted.attrs.health).toBe(Math.min(95, plain.attrs.health + HEALTH_GIFT))
      expect(gifted.money).toBe(Math.round(plain.money * CHEST_GIFT))
      expect({ ...gifted.attrs, health: 0 }).toEqual({ ...plain.attrs, health: 0 })
      expect(gifted.name).toBe(plain.name)
      expect(gifted.traits).toEqual(plain.traits)
    }
  })

  it('«Вещий сон»: не в первой жизни, но у доживших до 26 лет сон был почти у всех', async () => {
    let alive = 0
    let had = 0
    for (let i = 0; i < 300; i++) {
      if (i % 50 === 0) await breathe()
      const era = ERAS[ERA_IDS[i % ERA_IDS.length]]
      const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, livesBefore: 4, dreamChance: 0.05, dreamFirstBy: 25, dreamSure: true }, 9500 + i), era)
      const intro = s.hero.diary.filter((d) => d.eventId === 'dream_intro')
      expect(intro.length).toBeLessThanOrEqual(1)
      if (s.hero.age >= 26) {
        alive++
        if (intro.length && intro[0].age <= 26) had++
      }
    }
    expect(had / alive).toBeGreaterThan(0.9)
  }, 300000)
})
