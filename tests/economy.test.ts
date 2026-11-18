// Экономика дел (решение владельца 16.11): дело требует внимания (фокус «Торговля»/«Работа») и несёт риск.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { newLife } from '../src/engine/life'
import { businessYear, createBusiness, NO_ATTENTION, PERILS } from '../src/engine/business'
import type { GameState } from '../src/engine/types'

const era = await loadEra('ISL')
const settings = { mode: 'quick', mortality: 'soft', softenHeavy: false } as const

function trader(seed: number): GameState {
  const s = newLife(era, settings, seed, undefined, { era: 'ISL', region: era.regions[0].id, year: 900, cls: 'trader', sex: 'm' })
  s.hero.age = 30
  s.hero.money = 5000
  createBusiness(s, { type: 'trading_house', capital: 800 })
  s.year += 1
  return s
}

describe('Дело требует внимания', () => {
  it('без фокуса «Торговля»/«Работа» роду достаётся меньше, чем с ним, на тех же бросках', () => {
    let withFocus = 0
    let without = 0
    for (let i = 0; i < 200; i++) {
      const a = trader(700 + i)
      const b = trader(700 + i)
      a.lastFocus = 'trade'
      b.lastFocus = 'rest'
      const a0 = a.hero.money
      const b0 = b.hero.money
      businessYear(a)
      businessYear(b)
      withFocus += a.hero.money - a0
      without += b.hero.money - b0
    }
    expect(withFocus).toBeGreaterThan(0)
    expect(without / withFocus).toBeCloseTo(NO_ATTENTION, 1)
  })
})

describe('Беды дела', () => {
  it('за много лет случаются, отнимают часть капитала и пишутся в дневник', () => {
    let hits = 0
    for (let i = 0; i < 300; i++) {
      const s = trader(1700 + i)
      s.lastFocus = 'trade'
      const before = s.family.trade!.businesses[0].capital
      businessYear(s)
      const after = s.family.trade!.businesses[0].capital
      if (s.hero.diary.some((d) => d.key === 'diary.business_levy')) {
        hits++
        expect(after).toBeLessThan(before)
      }
    }
    // Поборы - 4% в год: из 300 лет хоть несколько, но не большинство.
    expect(hits).toBeGreaterThan(2)
    expect(hits).toBeLessThan(40)
    expect(PERILS.caravan[0].id).toBe('robbed')
  })
})
