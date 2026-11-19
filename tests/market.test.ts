// Рынок и наделы (просьба 20.11): товары по краю и эпохе, место под запас по дому и складу, переезд - всё не увезти,
// фокус «Торговля» качает цену продажи; на наделах - выбор культуры, урожай на рынок или в запас.
import { describe, expect, it } from 'vitest'
import { ERA_META, loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { buyGoods, capacity, focusSwing, goodsHere, marketGoods, relocateStock, sellPrice, stockOf, stockTotal, unitOf } from '../src/engine/trade'
import { cropOf, cropsHere, harvestYear } from '../src/engine/crops'
import { acquireAsset } from '../src/engine/estate'
import type { GameState } from '../src/engine/types'

const opts = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, protectedUntil: 90 }
async function adult(eraId: string, seed = 1): Promise<GameState> {
  const era = await loadEra(eraId)
  const s = autoplay(newLife(era, opts, seed), era, 6)
  s.hero.age = 35
  s.hero.cls = 'trader'
  s.hero.tags = s.hero.tags.filter((t) => t !== 'enslaved')
  s.hero.money = 100000
  s.hero.rent = undefined
  return s
}

describe('Рынок по краю и эпохе', () => {
  it('у майя и ацтеков - маис вместо зерна; бумага в Европе - только с 1250 года; у каждого товара есть мера', () => {
    expect(marketGoods(ERA_META.MAY).map((g) => g.id)).toContain('maize')
    expect(marketGoods(ERA_META.MAY).map((g) => g.id)).not.toContain('grain')
    expect(marketGoods(ERA_META.EUR, 1100).map((g) => g.id)).not.toContain('paper')
    expect(marketGoods(ERA_META.EUR, 1300).map((g) => g.id)).toContain('paper')
    for (const era of Object.values(ERA_META)) for (const g of marketGoods(era)) expect(unitOf(g.id, era.id), g.id).not.toBe('measure')
    expect(unitOf('wine', 'EUR')).toBe('barrel')
    expect(unitOf('wine', 'E03')).toBe('amphora')
  })

  it('место под запас растёт с домом и складом', async () => {
    const s = await adult('EUR')
    s.hero.home = 0
    const hut = capacity(s)
    s.hero.home = 4
    expect(capacity(s)).toBeGreaterThan(hut)
    const big = capacity(s)
    s.hero.region = 'venice'
    acquireAsset(s, { type: 'warehouse' })
    expect(capacity(s)).toBeGreaterThan(big)
  })

  it('переезд: с собой - десять мер (дорогое первым), остальное продано за полцены, запись в дневник', async () => {
    const s = await adult('EUR', 2)
    s.hero.home = 4
    buyGoods(s, 'grain', 20)
    buyGoods(s, 'salt', 5)
    const money = s.hero.money
    s.hero.region = s.hero.region === 'paris' ? 'london' : 'paris'
    relocateStock(s)
    expect(stockTotal(s)).toBe(10)
    expect(stockOf(s, 'salt')).toBe(5)
    expect(s.hero.money).toBeGreaterThan(money)
    expect(s.hero.diary.some((e) => e.key === 'diary.trade_moved')).toBe(true)
  })

  it('фокус «Торговля»: цена продажи качается в обе стороны; без фокуса - нет', async () => {
    const s = await adult('EUR', 3)
    s.lastFocus = 'work'
    expect(focusSwing(s, 'salt')).toBe(0)
    s.lastFocus = 'trade'
    const swings = new Set<number>()
    for (let y = 0; y < 40; y++) {
      s.year++
      swings.add(Math.sign(focusSwing(s, 'salt')))
    }
    expect(swings.has(1) && swings.has(-1)).toBe(true)
    expect(goodsHere(s).length).toBeGreaterThan(3)
  })
})

describe('Наделы: что сеять', () => {
  it('культуры - по краю: у майя маис и какао, в Европе виноград и лён, в Китае рис и чай', async () => {
    const ids = async (e: string) => cropsHere(await adult(e)).map((c) => c.id)
    expect(await ids('MAY')).toEqual(expect.arrayContaining(['maize', 'cacao']))
    expect(await ids('MAY')).not.toContain('wheat')
    expect(await ids('EUR')).toEqual(expect.arrayContaining(['wheat', 'grapes', 'flax']))
    expect(await ids('CHN')).toEqual(expect.arrayContaining(['rice', 'tea']))
  })

  it('урожай по умолчанию продаётся по цене рынка; «в запас» - ложится в запас, пока есть место', async () => {
    const s = await adult('EUR', 4)
    s.hero.land = 3
    s.hero.home = 2
    expect(cropOf(s)?.id).toBe('wheat')
    const m = s.hero.money
    const got = harvestYear(s, 1)
    expect(got).toBeGreaterThan(0)
    expect(s.hero.money - m).toBe(got)
    expect(stockOf(s, 'grain')).toBe(0)
    s.hero.crop = 'grapes'
    s.hero.cropStore = true
    harvestYear(s, 1)
    expect(stockOf(s, 'wine')).toBeGreaterThan(0)
    expect(s.hero.lastHarvest?.crop).toBe('grapes')
  })

  it('надел в средний год даёт около прежних 30 (любой культурой - в разумных пределах)', async () => {
    for (const e of ['EUR', 'CHN', 'MAY', 'ISL', 'IND']) {
      const s = await adult(e, 5)
      s.hero.land = 1
      for (const c of cropsHere(s)) {
        const money = Math.round(c.yield * (sellPrice(s, c.good) || 1))
        expect(money, `${e} ${c.id}`).toBeGreaterThan(8)
        expect(money, `${e} ${c.id}`).toBeLessThan(90)
      }
    }
  })
})
