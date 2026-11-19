// Хозяйство рода (план «Герой» 19.11, docs/TZ_hero.md): управление по сословию, подать, починка, учёт дохода за год,
// беды с выбором (engine/perils.ts) - пожар, паводок, вороватый управляющий, опала, тяжба.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay, choose, eventParams } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { acquireAsset, assetNet, assetsYear, canRepair, ledger, manageable, repairAsset, repairCost, taxBase, underSteward, yearTax } from '../src/engine/estate'
import { applyPeril, assetPeril, perilParams, PERILS } from '../src/engine/perils'
import type { GameState } from '../src/engine/types'

const era = await loadEra('EUR')
const opts = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, protectedUntil: 90 }

function rich(seed: number, cls = 'craftsman'): GameState {
  const s = autoplay(newLife(era, opts, seed), era, 6)
  s.hero.age = 35
  s.hero.cls = cls
  s.hero.region = 'paris'
  s.hero.tags = s.hero.tags.filter((t) => t !== 'enslaved')
  s.hero.money = 20000
  return s
}

describe('Хозяйство рода: экономика', () => {
  it('сколько хозяйств род ведёт сам - по сословию; сверх этого - управляющий, доход ниже', () => {
    const s = rich(1, 'craftsman')
    expect(manageable(s)).toBe(2)
    const a = [acquireAsset(s, { type: 'workshop' })!, acquireAsset(s, { type: 'shop' })!, acquireAsset(s, { type: 'house' })!]
    expect(a.map((x) => underSteward(s, x))).toEqual([false, false, true])
    s.hero.cls = 'noble'
    expect(underSteward(s, a[2])).toBe(false)
  })

  it('подать - 2% цены имущества в год; дом и деньги не облагаются; учёт года собирает доход и подать', () => {
    const s = rich(2)
    expect(yearTax(s)).toBe(0)
    const a = acquireAsset(s, { type: 'workshop' })!
    expect(taxBase(s)).toBe(a.value)
    const before = s.hero.money
    assetsYear(s)
    const L = ledger(s)
    expect(L.tax).toBe(-Math.round(a.value * 0.02))
    expect(s.hero.money - before).toBe(L.assets + L.tax)
  })

  it('починка: десятая часть цены, сохранность 100; ветхое хозяйство приносит меньше', () => {
    const s = rich(3)
    const a = acquireAsset(s, { type: 'farm' })!
    const fresh = assetNet(s, a)
    a.condition = 25
    expect(assetNet(s, a)).toBeLessThan(fresh)
    expect(canRepair(s, a)).toBe(true)
    const m = s.hero.money
    expect(repairAsset(s, a.id)).toBe(true)
    expect(a.condition).toBe(100)
    expect(m - s.hero.money).toBe(repairCost(a))
  })
})

describe('Беды хозяйства', () => {
  it('пожар: отстроить - деньги и год без дохода; продать пепелище - хозяйства нет, немного денег; бросить - ничего', () => {
    for (const [act, keep] of [['rebuild', true], ['sell_ruins', false], ['abandon', false]] as const) {
      const s = rich(10)
      const a = acquireAsset(s, { type: 'house' })!
      const m = s.hero.money
      applyPeril(s, a.id, act)
      expect(!!s.family.estate!.assets.find((x) => x.id === a.id)).toBe(keep)
      if (act === 'rebuild') {
        expect(m - s.hero.money).toBe(Math.round(a.value * 0.4))
        expect(a.idleUntil).toBe(s.year + 1)
      }
      if (act === 'sell_ruins') expect(s.hero.money - m).toBe(Math.round(a.value * 0.15))
      if (act === 'abandon') expect(s.hero.money).toBe(m)
    }
  })

  it('год после беды хозяйство не приносит дохода', () => {
    const s = rich(11)
    const a = acquireAsset(s, { type: 'farm' })!
    applyPeril(s, a.id, 'wait')
    s.year++
    assetsYear(s)
    expect(ledger(s).assets).toBe(-Math.round(a.maintenance))
  })

  it('управляющий ворует только там, где хозяйств больше, чем род ведёт сам; беда - одна в год', () => {
    const s = rich(12, 'peasant')
    acquireAsset(s, { type: 'farm' })
    const many = PERILS.find((p) => p.id === 'steward')!
    const was = many.chance
    many.chance = 1
    try {
      for (let i = 0; i < 20; i++) expect(assetPeril(s)?.eventId ?? '').not.toBe('peril_steward')
      s.hero.cls = 'craftsman'
      acquireAsset(s, { type: 'farm' })
      acquireAsset(s, { type: 'farm' })
      s.hero.cls = 'peasant'
      let seen = false
      for (let i = 0; i < 20; i++) if (assetPeril(s)?.eventId === 'peril_steward') seen = true
      expect(seen).toBe(true)
    } finally {
      many.chance = was
    }
  })

  it('событие беды: суммы и название запомнены - после продажи пепелища текст исхода не ломается', () => {
    const s = rich(13)
    const a = acquireAsset(s, { type: 'shop' })!
    s.queue = [{ eventId: 'peril_fire', at: 0.5, outcome: null, assetId: a.id, perilText: perilParams(s, a.id) }]
    s.phase = 'running'
    choose(s, era, 'sell_ruins')
    expect(s.family.estate!.assets.find((x) => x.id === a.id)).toBeUndefined()
    const p = eventParams(s, s.queue[0])
    expect(p.what).toEqual({ key: 'asset.shop' })
    expect(p.ruins).toBe(Math.round(a.value * 0.15))
    expect(p.coin).toMatchObject({ key: expect.stringMatching(/^coin\./) })
  })

  it('в автоигре беды случаются и хозяйства теряются, но не все', () => {
    let lost = 0
    let kept = 0
    for (let seed = 1; seed <= 25; seed++) {
      const s = autoplay(newLife(era, opts, 700 + seed), era, 130, undefined, (_f, st) => {
        if (st.hero.age === 30 && st.hero.cls !== 'slave') {
          st.hero.money += 3000
          for (const ty of ['farm', 'workshop', 'house'] as const) acquireAsset(st, { type: ty })
        }
        return null
      })
      const left = s.family.estate?.assets.length ?? 0
      kept += left
      lost += s.hero.diary.filter((e) => e.key === 'diary.peril_lost').length
    }
    expect(lost).toBeGreaterThan(0)
    expect(kept).toBeGreaterThan(lost)
  })
})

describe('Потолок богатства (симуляция tools/sim/econ.test.ts)', () => {
  it('накопитель, покупающий всё возможное: к смерти 1-го поколения в среднем не больше 60 годовых расходов ремесленника', async () => {
    const { acquireAsset: buy, assetLock, assetPrice, canImprove, improveAsset, estateValue, estateWorth } = await import('../src/engine/estate')
    const { businessLock, businessDef, createBusiness, heroStake } = await import('../src/engine/business')
    const ref = era.classes.find((c) => c.id === 'craftsman')!.upkeep
    const worths: number[] = []
    for (let seed = 1; seed <= 8; seed++) {
      const s = autoplay(newLife(era, { ...opts, protectedUntil: 70 }, 500 + seed), era, 130, undefined, (_f, st) => {
        const h = st.hero
        for (const a of st.family.estate?.assets ?? []) if (canImprove(st, a) && h.money > a.value * 0.45) improveAsset(st, a.id)
        const ty = (['farm', 'workshop', 'shop', 'house', 'warehouse'] as const).filter((t) => !assetLock(st, t)).sort((a, b) => assetPrice(st, a) - assetPrice(st, b))[0]
        if (ty && h.money > assetPrice(st, ty) * 1.3) buy(st, { type: ty })
        for (const b of ['shipping', 'caravan', 'trading_house', 'artel']) if (!businessLock(st, b, businessDef(b)!.capital) && h.money > businessDef(b)!.capital * 1.5) createBusiness(st, { type: b, capital: businessDef(b)!.capital })
        return null
      })
      const biz = (s.family.trade?.businesses ?? []).filter((b) => b.active).reduce((x, b) => x + b.capital * heroStake(b), 0)
      worths.push((Math.max(0, s.hero.money) + estateValue(s) + estateWorth(s.hero, s) + biz) / ref)
    }
    worths.sort((a, b) => a - b)
    expect(worths[Math.floor(worths.length / 2)]).toBeLessThanOrEqual(60)
  }, 60000)
})
