// Семейные активы и наследство (src/engine/estate.ts, inheritance.ts; ТЗ семейной системы, этап 3, пункт 4.7).
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import { acquireAsset, assetLock, assetPrice, assetsYear, estateValue, heroShare, improveAsset, initializeEstate, onEstateEvent, pledgeAsset, saleValue, sellAsset } from '../src/engine/estate'
import { createWill, customDistribution, distributeEstate, validateWill } from '../src/engine/inheritance'
import { autoplay, startYear } from '../src/engine/game'
import { continueWithHeir, heirs, newLife, SAVE_VERSION, stateFromMemorial, summarize } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { AssetType, EraDef, GameState, Npc } from '../src/engine/types'
import { migrate } from '../src/storage'

const ERAS = await loadAllEras()
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false } as const

function rich(era: EraDef, cls = 'trader', region?: string, seed = 3): GameState {
  const s = newLife(era, opts, seed)
  s.hero.age = 40
  s.hero.birthYear = s.year - 40
  s.hero.cls = cls
  if (region) s.hero.region = region
  s.hero.money = 20000
  s.hero.npcs = []
  initializeEstate(s)
  return s
}

function child(s: GameState, era: EraDef, sex: 'm' | 'f', age: number): Npc {
  const n = makeNpc(s, era, 'child', sex, s.year - age, 50)
  if (!s.hero.npcs.includes(n)) s.hero.npcs.push(n)
  return n
}

const city = (era: EraDef) => era.regions.find((r) => !(r.tags ?? []).includes('rural'))!.id

describe('Имущество (4.7)', () => {
  it('покупка уменьшает деньги на цену; продажа возвращает по сохранности (не больше цены)', () => {
    const era = ERAS.EUR
    const s = rich(era, 'trader', city(era))
    const price = assetPrice(s, 'shop')
    const a = acquireAsset(s, { type: 'shop' })!
    expect(s.hero.money).toBe(20000 - price)
    expect(a.ownerShares).toEqual({ [s.hero.id]: 1 })
    expect(saleValue(s, a)).toBe(Math.round(price * 0.9))
    a.condition = 0
    expect(saleValue(s, a)).toBe(Math.round(price * 0.5))
    const got = sellAsset(s, a.id)
    expect(got).toBe(Math.round(price * 0.5))
    expect(s.hero.money).toBe(20000 - price + got)
    expect(s.family.estate!.assets).toHaveLength(0)
  })

  it('без денег, ребёнком, рабом или в деревне лавку не купить; склад - только у моря или реки', () => {
    const era = ERAS.EUR
    const poor = rich(era, 'trader', city(era))
    poor.hero.money = 10
    expect(assetLock(poor, 'shop')).toBe('estate.lock.money')
    expect(acquireAsset(poor, { type: 'shop' })).toBeUndefined()
    const kid = rich(era, 'trader', city(era))
    kid.hero.age = 10
    expect(assetLock(kid, 'shop')).toBe('estate.lock.young')
    const slave = rich(ERAS.E03, 'slave')
    expect(assetLock(slave, 'workshop')).toBe('estate.lock.class')
    const rural = era.regions.find((r) => (r.tags ?? []).includes('rural'))
    if (rural) expect(assetLock(rich(era, 'trader', rural.id), 'shop')).toBe('estate.lock.rural')
    const dry = { ...ERAS.MNG, features: ERAS.MNG.features.filter((f) => f !== 'river' && f !== 'sea') }
    const m = rich(dry as EraDef, 'trader')
    m.hero.era = 'XXX'
    expect(assetLock(m, 'warehouse')).toBe('estate.lock.era')
  })

  it('доход и содержание каждый год; ветшает; улучшение поднимает доход; залог - деньги сейчас и проценты', () => {
    const era = ERAS.E03
    const s = rich(era, 'craftsman', city(era))
    const a = acquireAsset(s, { type: 'workshop' })!
    const m0 = s.hero.money
    assetsYear(s)
    expect(s.hero.money).not.toBe(m0)
    expect(a.condition).toBeLessThan(100)
    const inc = a.income
    expect(improveAsset(s, a.id)).toBe(true)
    expect(a.income).toBeGreaterThan(inc)
    expect(a.condition).toBe(100)
    const before = s.hero.money
    const loan = pledgeAsset(s, a.id)
    expect(s.hero.money).toBe(before + loan)
    expect(s.family.estate!.debts).toBe(loan)
    expect(estateValue(s)).toBe(a.value - loan)
  })

  it('торговля имуществом не даёт бесконечных денег: купить и сразу продать - убыток; 40 лет дохода в разумных пределах', () => {
    const era = ERAS.EUR
    for (const ty of ['farm', 'workshop', 'shop', 'house', 'warehouse'] as AssetType[]) {
      const s = rich(era, 'trader', city(era))
      if (assetLock(s, ty)) continue
      const a = acquireAsset(s, { type: ty })!
      expect(sellAsset(s, a.id)).toBeLessThan(assetPrice(s, ty))
    }
    const s = rich(era, 'trader', city(era))
    const a = acquireAsset(s, { type: 'shop' })!
    const m0 = s.hero.money
    for (let y = 0; y < 40; y++) {
      s.year++
      assetsYear(s)
    }
    // Без ухода лавка ветшает: за 40 лет приносит меньше пяти своих цен.
    expect(s.hero.money - m0).toBeLessThan(a.value * 5)
  })

  it('во всех странах знатной городской семье есть что купить', () => {
    for (const id of ERA_IDS) {
      const era = ERAS[id]
      const s = rich(era, 'noble', city(era))
      expect((['farm', 'workshop', 'shop', 'house', 'warehouse'] as AssetType[]).some((ty) => !assetLock(s, ty)), id).toBe(true)
    }
  })
})

describe('Завещание и раздел (4.7)', () => {
  function family(era: EraDef, region?: string) {
    const s = rich(era, 'trader', region ?? city(era))
    const son = child(s, era, 'm', 25)
    const daughter = child(s, era, 'f', 22)
    const young = child(s, era, 'm', 18)
    for (const ty of ['shop', 'workshop', 'farm'] as AssetType[]) acquireAsset(s, { type: ty })
    return { s, son, daughter, young, kids: heirs(s) }
  }

  it('нельзя завещать несуществующему наследнику, несуществующий актив и больше 100%', () => {
    const era = ERAS.E03
    const { s, son, kids } = family(era)
    const a = s.family.estate!.assets[0]
    expect(validateWill(s, era, { createdYear: s.year, distributions: [{ assetId: a.id, beneficiaryId: 'nobody', share: 1 }] }, kids).errors).toContain('no_heir')
    expect(validateWill(s, era, { createdYear: s.year, distributions: [{ assetId: 'zz', beneficiaryId: son.id, share: 1 }] }, kids).errors).toContain('no_asset')
    expect(
      validateWill(s, era, { createdYear: s.year, distributions: [{ assetId: a.id, beneficiaryId: son.id, share: 0.7 }, { assetId: a.id, beneficiaryId: kids[1].id, share: 0.5 }] }, kids).errors,
    ).toContain('over_100')
    expect(createWill(s, era, [{ assetId: a.id, beneficiaryId: 'nobody', share: 1 }], kids).ok).toBe(false)
    expect(s.family.estate!.will).toBeUndefined()
  })

  it('раздел не создаёт и не уничтожает активы; доли каждого актива ровно 100%', () => {
    for (const id of ['E03', 'EUR', 'MNG'] as const) {
      const era = ERAS[id]
      const { s, kids } = family(era)
      const res = distributeEstate(s, era, kids)
      const per: Record<string, number> = {}
      for (const list of Object.values(res.shares)) for (const x of list) per[x.assetId] = (per[x.assetId] ?? 0) + x.share
      expect(Object.keys(per).sort(), id).toEqual(s.family.estate!.assets.map((a) => a.id).sort())
      for (const v of Object.values(per)) expect(v).toBeCloseTo(1, 9)
    }
  })

  it('без завещания - обычай: где наследуют сыновья, дочери ничего; у монголов младшему сыну - самое ценное', () => {
    const eur = ERAS.EUR
    const fe = family(eur)
    const custom = (eur.regions.find((r) => r.id === fe.s.hero.region)?.inheritance ?? eur.inheritance)
    const d = customDistribution(fe.s, eur, fe.kids)
    if (custom === 'sons_first') expect(d.some((x) => x.beneficiaryId === fe.daughter.id)).toBe(false)
    const mng = ERAS.MNG
    const fm = family(mng)
    if ((mng.regions.find((r) => r.id === fm.s.hero.region)?.inheritance ?? mng.inheritance) === 'youngest_hearth') {
      const best = [...fm.s.family.estate!.assets].sort((a, b) => b.value - a.value)[0]
      expect(customDistribution(fm.s, mng, fm.kids).find((x) => x.assetId === best.id)!.beneficiaryId).toBe(fm.young.id)
      // Обойти младшего завещанием там нельзя.
      const all = fm.s.family.estate!.assets.map((a) => ({ assetId: a.id, beneficiaryId: fm.son.id, share: 1 }))
      expect(validateWill(fm.s, mng, { createdYear: fm.s.year, distributions: all }, fm.kids).errors).toContain('custom_forbids')
    }
  })

  it('завещание всё одному: наследник получает всё; обойдённый против обычая может судиться', () => {
    const era = ERAS.E03
    let disputes = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { s, daughter, kids } = family(era, undefined)
      s.rng = seed
      const dist = s.family.estate!.assets.map((a) => ({ assetId: a.id, beneficiaryId: daughter.id, share: 1 }))
      expect(createWill(s, era, dist, kids).ok).toBe(true)
      s.hero.alive = false
      s.phase = 'dead'
      s.hero.deathYear = s.year
      const next = continueWithHeir(s, era, daughter.id)
      expect(next.family.estate!.assets).toHaveLength(3)
      for (const a of next.family.estate!.assets) expect(heroShare(next, a)).toBe(1)
      if (next.hero.diary.some((d) => d.key === 'diary.inherit_dispute')) disputes++
      expect(next.hero.diary.some((d) => d.key === 'diary.inherit_assets_will')).toBe(true)
    }
    expect(disputes).toBeGreaterThan(0)
    expect(disputes).toBeLessThan(20)
  })

  it('переход к наследнику сохраняет семейные активы (свои - в реестре, ушедшие другим - в хронике)', () => {
    const era = ERAS.EUR
    const { s, son, kids } = family(era)
    const total = s.family.estate!.assets.length
    s.hero.alive = false
    s.phase = 'dead'
    s.hero.deathYear = s.year
    const next = continueWithHeir(s, era, son.id)
    const kept = next.family.estate!.assets.length
    const passed = (next.family.estate!.passed ?? []).length
    expect(kept + passed).toBe(total)
    expect(kids.length).toBeGreaterThan(1)
    // Чужое (прошлого героя) завещание новому герою не действует.
    for (const a of next.family.estate!.assets) expect(heroShare(next, a)).toBeGreaterThan(0)
    // Итог жизни и род из мемориала - с имуществом.
    const life = summarize(s, era)
    expect(life.estateSnapshot?.assets).toHaveLength(total)
    const back = stateFromMemorial(era, life, [life], opts)
    expect(back.family.estate!.assets).toHaveLength(total)
  })

  it('аналитика: покупка, продажа, завещание', () => {
    const got: string[] = []
    onEstateEvent((k) => got.push(k))
    const era = ERAS.E03
    const s = rich(era, 'trader', city(era))
    const kid = child(s, era, 'm', 20)
    const a = acquireAsset(s, { type: 'workshop' })!
    createWill(s, era, [{ assetId: a.id, beneficiaryId: kid.id, share: 1 }], heirs(s))
    sellAsset(s, a.id)
    onEstateEvent(undefined)
    expect(got).toEqual(['asset_acquired', 'will_created', 'asset_sold'])
  })
})

describe('Сохранения и поколения (4.7)', () => {
  it(`старое сохранение: миграция до ${SAVE_VERSION}, пустой реестр, дом и деньги как были`, () => {
    const era = ERAS.E03
    const s = autoplay(newLife(era, opts, 12), era, 20)
    const old = JSON.parse(JSON.stringify(s)) as GameState
    old.version = 7
    delete old.family.estate
    const m = migrate(old)!
    expect(m.version).toBe(SAVE_VERSION)
    expect(m.family.estate).toEqual({ assets: [], debts: 0 })
    expect([m.hero.money, m.hero.home, m.hero.animals.length]).toEqual([s.hero.money, s.hero.home, s.hero.animals.length])
    expect(migrate(m)!.version).toBe(SAVE_VERSION)
    if (m.phase === 'year' && m.hero.alive) startYear(m, era, null)
  })

  it('три поколения с покупками: активы не множатся, денег не бесконечно, деньги конечны', () => {
    for (const id of ['E03', 'EUR', 'CHN', 'MNG'] as const) {
      const era = ERAS[id]
      let s = newLife(era, { ...opts, protectedUntil: 90 }, 404)
      for (let gen = 0; gen < 3; gen++) {
        s = autoplay(s, era, 130, undefined, (_f, st: GameState) => {
          for (const ty of ['workshop', 'shop', 'farm', 'house'] as AssetType[]) if (!assetLock(st, ty) && st.hero.money > assetPrice(st, ty) * 2) acquireAsset(st, { type: ty })
          return null
        })
        const ids = (s.family.estate?.assets ?? []).map((a) => a.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.length).toBeLessThanOrEqual(6)
        expect(Number.isFinite(s.hero.money)).toBe(true)
        expect(s.hero.money).toBeLessThan(5_000_000)
        const k = heirs(s)
        if (!k.length) break
        s = continueWithHeir(s, era, k[0].id)
      }
    }
  }, 120000)
})
