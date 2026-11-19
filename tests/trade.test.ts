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

// ---------- Рынок и личная торговля (ТЗ семейной системы, этап 4, п. 5.6) ----------
import { loadAllEras } from '../src/content'
import { buyGoods, buyPrice, capacity, initializeTrade, marketGoods, marketPrice, onTradeEvent, sellGoods, sellPrice, stockOf, tradeYear } from '../src/engine/trade'
import { acquireAsset, initializeEstate } from '../src/engine/estate'
import { SAVE_VERSION } from '../src/engine/life'
import { migrate } from '../src/storage'
import type { EraDef, GameState } from '../src/engine/types'

const ALL = await loadAllEras()

function merchant(e: EraDef, seed = 5, money = 5000): GameState {
  const s = newLife(e, base, seed)
  s.hero.age = 30
  s.hero.cls = 'trader'
  s.hero.money = money
  s.hero.skills.trade = 0
  s.hero.region = e.regions.find((r) => !(r.tags ?? []).includes('rural'))!.id
  initializeTrade(s)
  initializeEstate(s)
  return s
}

describe('Рынок (5.6)', () => {
  it('товары по стране: вино - где вино, какао - у майя и ацтеков, шёлк - где пути шёлка', () => {
    const ids = (id: string) => marketGoods(ALL[id]).map((g) => g.id)
    expect(ids('EUR')).toContain('wine')
    expect(ids('MNG')).not.toContain('wine')
    expect(ids('AMR')).toContain('cacao')
    expect(ids('EUR')).not.toContain('cacao')
    expect(ids('CHN')).toContain('silk')
    for (const id of Object.keys(ALL)) expect(ids(id).length, id).toBeGreaterThanOrEqual(3)
  })

  it('нельзя купить без денег и сверх места; нельзя продать больше, чем есть', () => {
    const s = merchant(era, 5, 10)
    expect(buyGoods(s, 'cloth', 5).error).toBe('no_money')
    s.hero.money = 1e6
    expect(buyGoods(s, 'grain', capacity(s) + 1).error).toBe('no_space')
    expect(buyGoods(s, 'grain', 0).error).toBe('bad_quantity')
    const room = capacity(s)
    expect(buyGoods(s, 'grain', room).ok).toBe(true)
    expect(buyGoods(s, 'salt', 1).error).toBe('no_space')
    expect(sellGoods(s, 'grain', room + 1).error).toBe('no_stock')
    expect(sellGoods(s, 'salt', 1).error).toBe('no_stock')
    expect(buyGoods(s, 'cacao', 1).error).toBe('no_good')
    const kid = merchant(era)
    kid.hero.age = 10
    expect(buyGoods(kid, 'salt', 1).error).toBe('young')
  })

  it('склад и лавка рода дают место под запас', () => {
    const s = merchant(era, 5, 1e5)
    const before = capacity(s)
    acquireAsset(s, { type: 'shop' })
    expect(capacity(s)).toBeGreaterThan(before)
  })

  it('прибыль считается от средней цены закупки; изменение цены не меняет совершённую сделку', () => {
    const s = merchant(era, 5, 1e5)
    const p1 = buyPrice(s, 'cloth')
    expect(buyGoods(s, 'cloth', 4).money).toBe(p1 * 4)
    s.year++
    const p2 = buyPrice(s, 'cloth')
    buyGoods(s, 'cloth', 6)
    const avg = (p1 * 4 + p2 * 6) / 10
    expect(s.family.trade!.inventory.goods[0].averagePrice).toBeCloseTo(avg, 6)
    s.year++
    const sp = sellPrice(s, 'cloth')
    const r = sellGoods(s, 'cloth', 10)
    expect(r.money).toBe(sp * 10)
    expect(r.profit).toBe(Math.round(sp * 10 - avg * 10))
    expect(s.family.trade!.profit).toBe(r.profit)
  })

  it('цена года одна и та же при повторном взгляде и не тратит поток случайности; одинаковый род - одинаковые цены', () => {
    const a = merchant(era, 7)
    const b = merchant(era, 7)
    const rng = a.rng
    for (let i = 0; i < 20; i++) marketPrice(a, 'iron')
    expect(a.rng).toBe(rng)
    expect(marketPrice(a, 'iron')).toBe(marketPrice(b, 'iron'))
    a.year++
    const prices = new Set(Array.from({ length: 30 }, (_, i) => marketPrice({ ...a, year: a.year + i } as GameState, 'iron')))
    expect(prices.size).toBeGreaterThan(5)
  })

  it('торговля - не бесконечные деньги: купить и тут же продать - убыток; 200 лет случайной торговли - без взрыва денег', () => {
    for (const good of ['grain', 'cloth', 'iron', 'wine']) {
      const s = merchant(era, 5, 1e5)
      buyGoods(s, good, 10)
      expect(sellGoods(s, good, 10).profit!).toBeLessThan(0)
    }
    // Простая стратегия: дёшево (ниже базовой) - купить, дорого - продать; запас портится.
    const s = merchant(era, 9, 2000)
    s.hero.skills.trade = 100
    for (let y = 0; y < 200; y++) {
      s.year++
      tradeYear(s)
      for (const g of marketGoods(era)) {
        const p = marketPrice(s, g.id)
        if (p < g.price * 0.85) buyGoods(s, g.id, Math.min(5, Math.floor((capacity(s) - s.family.trade!.inventory.goods.reduce((x, i) => x + i.quantity, 0)) / 2)) || 1)
        else if (p > g.price * 1.15 && stockOf(s, g.id)) sellGoods(s, g.id, stockOf(s, g.id))
      }
    }
    // С навыком 100 за 200 лет - доход есть, но в пределах нескольких десятков тысяч, не миллионы.
    expect(s.hero.money).toBeLessThan(200000)
  })

  it('запас портится; аналитика сделок', () => {
    const got: string[] = []
    onTradeEvent((k) => got.push(k))
    const s = merchant(era, 5, 1e5)
    const n = Math.min(20, capacity(s))
    buyGoods(s, 'grain', n)
    for (let y = 0; y < 5; y++) tradeYear(s)
    expect(stockOf(s, 'grain')).toBeLessThan(n)
    sellGoods(s, 'grain', stockOf(s, 'grain'))
    onTradeEvent(undefined)
    expect(got).toEqual(['trade_started', 'trade_completed'])
  })

  it(`старое сохранение без торговли: миграция до ${SAVE_VERSION}, пустой запас`, () => {
    const s = autoplay(newLife(era, base, 3), era, 10)
    const old = JSON.parse(JSON.stringify(s)) as GameState
    old.version = 8
    delete old.family.trade
    const m = migrate(old)!
    expect(m.version).toBe(SAVE_VERSION)
    expect(m.family.trade).toEqual({ inventory: { goods: [], capacity: 20 }, businesses: [] })
  })
})
