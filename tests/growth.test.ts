// Рост дел и займы (20.11): три дела одного вида за 20 лет - одно большое (флот, рынок, мануфактура, торговый путь),
// его можно расширять; доходный дом - в постоялый двор; займы под проценты (не в мусульманских странах), кредитная
// история рода; каждая трата - запись в дневнике на ту же сумму.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { canExpand, createBusiness, expandBusiness, growable, growBusiness, GROW, unitCost } from '../src/engine/business'
import { acquireAsset, canInn, improveAsset, makeInn } from '../src/engine/estate'
import { credit, LOAN, loanLimit, loanLock, loanYear, repayLoan, takeLoan } from '../src/engine/loans'
import type { GameState } from '../src/engine/types'

const opts = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, protectedUntil: 90 }
async function rich(eraId = 'EUR', seed = 1): Promise<GameState> {
  const era = await loadEra(eraId)
  const s = autoplay(newLife(era, opts, seed), era, 6)
  s.hero.age = 40
  s.hero.cls = 'trader'
  s.hero.region = eraId === 'EUR' ? 'venice' : s.hero.region
  s.hero.religion = eraId === 'EUR' ? 'catholic' : s.hero.religion
  s.hero.tags = s.hero.tags.filter((t) => !t.includes('debt') && t !== 'enslaved')
  s.hero.money = 1e5
  return s
}
const sumMoney = (s: GameState, from: number, sign: (k: string) => number) => s.hero.diary.slice(from).reduce((x, e) => x + (typeof e.params?.money === 'number' ? sign(e.key) * (e.params.money as number) : 0), 0)

describe('Рост дел', () => {
  it('три морских товарищества за 20 лет - свой флот; расширяется кораблями; доход выше', async () => {
    const s = await rich()
    for (let i = 0; i < 3; i++) createBusiness(s, { type: 'shipping', capital: 1500 })
    expect(growable(s, 'shipping')).toBe(false)
    s.year += GROW.years
    expect(growable(s, 'shipping')).toBe(true)
    const fleet = growBusiness(s, 'shipping')!
    expect(fleet.units).toBe(3)
    expect(fleet.capital).toBe(4500)
    expect(s.family.trade!.businesses.filter((b) => b.active && b.type === 'shipping')).toHaveLength(1)
    const m = s.hero.money
    const from = s.hero.diary.length
    expect(expandBusiness(s, fleet.id)).toBe(true)
    expect(fleet.units).toBe(4)
    expect(m - s.hero.money).toBe(unitCost(fleet))
    expect(sumMoney(s, from, () => -1)).toBe(s.hero.money - m)
  })

  it('мануфактура растёт и невольниками', async () => {
    const s = await rich('E03', 2)
    for (let i = 0; i < 3; i++) createBusiness(s, { type: 'artel', capital: 300 })
    s.year += GROW.years
    const m = growBusiness(s, 'artel')!
    s.hero.slaves = 2
    expect(canExpand(s, m, 'slaves')).toBe(true)
    const money = s.hero.money
    expect(expandBusiness(s, m.id, 'slaves')).toBe(true)
    expect(s.hero.slaves).toBe(1)
    expect(s.hero.money).toBe(money)
  })

  it('доходный дом, улучшенный до предела, - в постоялый двор: доход выше', async () => {
    const s = await rich()
    const a = acquireAsset(s, { type: 'house' })!
    expect(canInn(s, a)).toBe(false)
    for (let i = 0; i < 3; i++) improveAsset(s, a.id)
    const income = a.income
    expect(makeInn(s, a.id)).toBe(true)
    expect(a.inn).toBe(true)
    expect(a.income).toBeGreaterThan(income)
  })
})

describe('Займы', () => {
  it('в мусульманских странах и у мусульман займов под проценты нет', async () => {
    const s = await rich('ISL', 3)
    expect(loanLock(s)).toBe('loan.lock.riba')
    const e = await rich('EUR', 3)
    e.hero.religion = 'islam_sunni'
    expect(loanLock(e) === 'loan.lock.riba' || loanLock(e) === undefined).toBe(true)
  })

  it('проценты каждый год, возврат в срок - история лучше; суммы в дневнике = деньги', async () => {
    const s = await rich('EUR', 4)
    s.hero.money = 0
    const limit = loanLimit(s)
    expect(takeLoan(s, limit + 1)).toBe(false)
    expect(takeLoan(s, 300)).toBe(true)
    expect(s.hero.money).toBe(300)
    s.hero.money = 5000
    const m = s.hero.money
    const from = s.hero.diary.length
    for (let y = 1; y <= LOAN.term; y++) {
      s.year++
      loanYear(s)
    }
    expect(s.family.loan).toBeUndefined()
    expect(credit(s)).toBeGreaterThan(LOAN.start)
    expect(sumMoney(s, from, () => -1)).toBe(s.hero.money - m)
  })

  it('не вернул в срок - долг на герое, история хуже; вернул раньше - можно снова', async () => {
    const s = await rich('EUR', 5)
    takeLoan(s, 200)
    s.hero.money = 0
    s.year += LOAN.term
    loanYear(s)
    expect(s.hero.money).toBeLessThan(0)
    expect(credit(s)).toBeLessThan(LOAN.start)
    s.hero.money = 1000
    s.hero.tags = s.hero.tags.filter((t) => !t.includes('debt'))
    expect(takeLoan(s, 100)).toBe(true)
    expect(repayLoan(s)).toBe(true)
    expect(loanLock(s)).toBeUndefined()
  })
})
