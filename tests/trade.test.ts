// Торговля на максимуме навыка не в минус (пакет 2): убытки редкие и небольшие, доход заметно выше.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay, riskChance } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { applyEffects, tradeEffects, tradeMastery } from '../src/engine/rules'
import type { ChoiceDef, Effect } from '../src/engine/types'

const era = await loadEra('EUR')
const base = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, protectedUntil: 90 }
const focus = era.focuses.find((f) => f.id === 'trade')!

function trader(seed: number, skill: number) {
  const s = autoplay(newLife(era, base, seed), era, 6)
  s.hero.age = 35
  s.hero.cls = 'craftsman'
  s.hero.skills.trade = skill
  return s
}

/** Средний итог и доля убыточных лет фокуса «торговля» (только деньги, без роста навыка). */
function yearOfTrade(skill: number, n = 4000) {
  const s = trader(1, skill)
  const money = focus.effects.filter((e) => 'chance' in e)
  let sum = 0
  let losses = 0
  let worst = 0
  for (let i = 0; i < n; i++) {
    s.hero.money = 1000
    s.hero.skills.trade = skill
    applyEffects(s, era, tradeEffects(s.hero, money))
    const d = s.hero.money - 1000
    sum += d
    if (d < 0) losses++
    worst = Math.min(worst, d)
  }
  return { avg: sum / n, losses: losses / n, worst }
}

describe('Торговля и мастерство', () => {
  it('мастерство: до 50 навыка - ноль, на 100 - полное', () => {
    const s = trader(2, 40)
    expect(tradeMastery(s.hero)).toBe(0)
    s.hero.skills.trade = 75
    expect(tradeMastery(s.hero)).toBeCloseTo(0.5)
    s.hero.skills.trade = 100
    expect(tradeMastery(s.hero)).toBe(1)
  })

  it('до 50 навыка фокус работает как написано в контенте', () => {
    const s = trader(3, 30)
    expect(tradeEffects(s.hero, focus.effects)).toBe(focus.effects)
  })

  it('на максимуме убыточный год - редкость (до 10%) и небольшой, доход заметно выше новичка, но не в разы', () => {
    const novice = yearOfTrade(30)
    const master = yearOfTrade(100)
    expect(novice.losses).toBeGreaterThan(0.12)
    expect(master.losses).toBeLessThan(0.1)
    expect(Math.abs(master.worst)).toBeLessThan(Math.abs(novice.worst) * 0.6)
    expect(master.avg).toBeGreaterThan(novice.avg * 1.8)
    expect(master.avg).toBeLessThan(novice.avg * 5)
  })

  it('рискованная сделка на навыке торговли: мастер почти не проваливает, а провал стоит меньше', () => {
    const s = trader(4, 100)
    const choice = { id: 'x', risk_roll: { param: 'trade', success_chance_base: 0.55, on_success: [], on_failure: [{ param: 'money', delta: -100 }] } } as unknown as ChoiceDef
    expect(riskChance(s, choice)!).toBeGreaterThanOrEqual(0.95)
    const other = { ...choice, risk_roll: { ...choice.risk_roll!, param: 'oratory' } } as ChoiceDef
    s.hero.skills.oratory = 100
    expect(riskChance(s, other)!).toBeLessThanOrEqual(0.95)
    const fail = tradeEffects(s.hero, choice.risk_roll!.on_failure) as Effect[]
    expect((fail[0] as { delta: number }).delta).toBeGreaterThan(-50)
    s.hero.skills.trade = 50
    expect(riskChance(s, choice)).toBeCloseTo(0.55)
  })
})
