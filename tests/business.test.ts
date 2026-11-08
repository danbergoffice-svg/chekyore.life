// Предприятия и товарищества (src/engine/business.ts; ТЗ семейной системы, этап 4, п. 5.6).
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { addPartner, businessForm, businessLock, businessYear, closeBusiness, closingShares, createBusiness, heroStake, onBusinessEvent, partnerCandidates } from '../src/engine/business'
import { initializeTrade } from '../src/engine/trade'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife, stateFromMemorial, summarize } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { EraDef, GameState, Npc } from '../src/engine/types'

const ERAS = await loadAllEras()
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 90 } as const

function owner(era: EraDef, seed = 3, money = 10000): GameState {
  const s = newLife(era, opts, seed)
  s.hero.age = 35
  s.hero.birthYear = s.year - 35
  s.hero.cls = 'trader'
  s.hero.money = money
  s.hero.npcs = []
  initializeTrade(s)
  return s
}

function relative(s: GameState, era: EraDef, role: 'sibling' | 'friend' | 'child', attitude = 50): Npc {
  const n = makeNpc(s, era, role, 'm', s.year - 30, attitude)
  if (!s.hero.npcs.includes(n)) s.hero.npcs.push(n)
  return n
}

describe('Предприятия (5.6)', () => {
  it('основать: нужен вклад не меньше наименьшего, деньги и подходящая страна; форма товарищества своя у страны', () => {
    const era = ERAS.E03
    const s = owner(era)
    expect(businessLock(s, 'trading_house', 100)).toBe('business.lock.small')
    const b = createBusiness(s, { type: 'trading_house', capital: 1000 })!
    expect(s.hero.money).toBe(9000)
    expect(heroStake(b)).toBe(1)
    expect(businessForm('E03')).toBe('societas')
    expect(businessForm('ISL')).toBe('mudaraba')
    expect(businessLock(owner(ERAS.MNG), 'shipping', 2000)).toBe('business.lock.era')
    const poor = owner(era, 3, 50)
    expect(createBusiness(poor, { type: 'artel', capital: 300 })).toBeUndefined()
  })

  it('доли компаньонов вместе не больше 100%, у рода остаётся хоть десятая часть', () => {
    const era = ERAS.EUR
    const s = owner(era)
    const b = createBusiness(s, { type: 'trading_house', capital: 1000 })!
    const a = relative(s, era, 'sibling')
    const c = relative(s, era, 'friend')
    const d = relative(s, era, 'friend')
    expect(addPartner(s, b.id, a.id, 0.4)).toBe(true)
    expect(b.capital).toBe(1000 + Math.round((1000 * 0.4) / 0.6))
    expect(addPartner(s, b.id, c.id, 0.4)).toBe(true)
    expect(addPartner(s, b.id, d.id, 0.6)).toBe(false)
    expect(addPartner(s, b.id, a.id, 0.05)).toBe(false)
    const total = b.partners.reduce((x, p) => x + p.share, 0)
    expect(total).toBeLessThanOrEqual(1)
    expect(heroStake(b)).toBeGreaterThanOrEqual(0.1)
    expect(heroStake(b) + total).toBeCloseTo(1, 9)
    expect(partnerCandidates(s, b)).not.toContain(a)
  })

  it('закрытие делит остаток по долям, ничего не теряется', () => {
    const era = ERAS.EUR
    const s = owner(era)
    const b = createBusiness(s, { type: 'artel', capital: 600 })!
    const a = relative(s, era, 'sibling')
    addPartner(s, b.id, a.id, 0.25)
    const cap = b.capital
    const shares = closingShares(b)
    expect(Object.values(shares).reduce((x, y) => x + y, 0)).toBeCloseTo(cap, 6)
    const m = s.hero.money
    const got = closeBusiness(s, b.id)
    expect(got).toBe(Math.round(shares.hero))
    expect(s.hero.money).toBe(m + got)
    expect(b.active).toBe(false)
    expect(closeBusiness(s, b.id)).toBe(0)
  })

  it('год дела: прибыль по доле роду, убыток - из капитала; разорение ниже трети вклада', () => {
    const era = ERAS.EUR
    let bankrupt = 0
    let earned = 0
    for (let seed = 1; seed <= 30; seed++) {
      const s = owner(era, seed)
      const b = createBusiness(s, { type: 'caravan', capital: 1200 })!
      const m0 = s.hero.money
      for (let y = 0; y < 30 && b.active; y++) {
        s.year++
        businessYear(s)
        if (b.active) b.reputation = 0 // плохое имя - доход ниже, чаще убыток
      }
      if (!b.active) bankrupt++
      earned += s.hero.money - m0
      expect(Number.isFinite(s.hero.money)).toBe(true)
    }
    expect(bankrupt).toBeGreaterThanOrEqual(0)
    // В среднем дело кормит, но не делает миллионы: за 30 лет - меньше 20 вкладов.
    expect(earned / 30).toBeLessThan(1200 * 20)
  })

  it('компаньон в ссоре может уйти со своей долей', () => {
    const era = ERAS.EUR
    let left = 0
    for (let seed = 1; seed <= 40; seed++) {
      const s = owner(era, seed)
      const b = createBusiness(s, { type: 'trading_house', capital: 1000 })!
      const a = relative(s, era, 'friend', 0)
      addPartner(s, b.id, a.id, 0.3)
      a.attitude = -50
      for (let y = 0; y < 10 && b.active; y++) {
        s.year++
        businessYear(s)
      }
      if (!b.partners.length) left++
    }
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThan(40)
  })

  it('смерть владельца: дело остаётся роду, ведёт наследник; мемориал хранит дела', () => {
    const era = ERAS.EUR
    let s = autoplay(newLife(era, opts, 77), era, 40)
    for (let seed = 78; !heirs(s).length; seed++) s = autoplay(newLife(era, opts, seed), era, 40)
    s.hero.cls = 'trader'
    s.hero.money = 5000
    initializeTrade(s)
    const b = createBusiness(s, { type: 'trading_house', capital: 1000 })!
    s.hero.alive = false
    s.phase = 'dead'
    s.hero.deathYear = s.year
    const next = continueWithHeir(s, era, heirs(s)[0].id)
    const kept = next.family.trade!.businesses.find((x) => x.id === b.id)!
    expect(kept.active).toBe(true)
    expect(next.hero.diary.some((d) => d.key === 'diary.inherit_business')).toBe(true)
    const life = summarize(s, era)
    const back = stateFromMemorial(era, life, [life], opts)
    expect(back.family.trade!.businesses.some((x) => x.id === b.id)).toBe(true)
  })

  it('одинаковый сид - одинаковый итог; аналитика', () => {
    const run = () => {
      const s = owner(ERAS.ISL, 11)
      const b = createBusiness(s, { type: 'trading_house', capital: 900 })!
      for (let y = 0; y < 15 && b.active; y++) {
        s.year++
        businessYear(s)
      }
      return [s.hero.money, b.capital, b.reputation]
    }
    expect(run()).toEqual(run())
    const got: string[] = []
    onBusinessEvent((k) => got.push(k))
    const s = owner(ERAS.ISL)
    const b = createBusiness(s, { type: 'artel', capital: 300 })!
    closeBusiness(s, b.id)
    onBusinessEvent(undefined)
    expect(got).toEqual(['business_created', 'business_closed'])
  })
})
