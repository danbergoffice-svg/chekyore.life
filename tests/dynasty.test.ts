// Род как целое (src/engine/dynasty.ts): имя и герб после двух жизней, цель рода по первой жизни, наследник по обычаю.
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { canNameHouse, checkFamilyGoal, customHeir, familyGoalOffers, familyGoalProgress, HOUSE_IDS, setFamilyGoal, setHouse } from '../src/engine/dynasty'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife, summarize } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { EraDef, GameState } from '../src/engine/types'

const ERAS = await loadAllEras()
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 90 } as const

/** Жизнь с наследниками (прожитая до конца). */
function lived(era: EraDef, seed: number): GameState {
  let s = autoplay(newLife(era, opts, seed), era)
  for (let k = seed + 1; !heirs(s).length; k++) s = autoplay(newLife(era, opts, k), era)
  return s
}

describe('Имя рода и герб', () => {
  it('20 вариантов; выбор - когда прожиты две жизни, и только один раз', () => {
    expect(HOUSE_IDS).toHaveLength(20)
    const era = ERAS.EUR
    let s = lived(era, 10)
    expect(s.family.lives.length).toBe(1)
    expect(canNameHouse(s)).toBe(false)
    s = autoplay(continueWithHeir(s, era, heirs(s)[0].id), era)
    for (let i = 0; i < 20 && !heirs(s).length; i++) s = lived(era, 30 + i)
    if (s.family.lives.length >= 2) {
      expect(canNameHouse(s)).toBe(true)
      expect(setHouse(s, 'nope')).toBe(false)
      expect(setHouse(s, 'falcon')).toBe(true)
      expect(setHouse(s, 'oak')).toBe(false)
      expect(s.family.house).toBe('falcon')
      // Имя рода переходит наследнику и в итог жизни.
      if (heirs(s).length) expect(continueWithHeir(s, era, heirs(s)[0].id).family.house).toBe('falcon')
      expect(summarize(s, era).house).toBe('falcon')
    }
  })
})

describe('Цель рода', () => {
  it('три цели по первой жизни: «выбиться наверх» - не знати; «сберечь наследие» - если есть владения', () => {
    const era = ERAS.EUR
    const s = lived(era, 50)
    const life = s.family.lives[0]
    const offers = familyGoalOffers({ ...life, cls: 'peasant' }, era)
    expect(offers).toHaveLength(3)
    expect(offers[0].id).toBe('rise')
    expect(familyGoalOffers({ ...life, cls: 'noble' }, era).some((g) => g.id === 'rise')).toBe(false)
    const withAssets = { ...life, cls: 'noble', estateSnapshot: { assets: [{ id: 'a1' } as never], debts: 0 } }
    expect(familyGoalOffers(withAssets, era).map((g) => g.id)).toContain('heirloom')
    // Богатство - втрое больше оставленного (не меньше 2000).
    const w = familyGoalOffers({ ...life, cls: 'noble' }, era).find((g) => g.id === 'wealth')!
    expect(w.target).toBeGreaterThanOrEqual(2000)
  })

  it('прогресс и исполнение: «Долгая линия» на 2 поколения исполняется на второй жизни, один раз', () => {
    const era = ERAS.RUS
    let s = lived(era, 70)
    setFamilyGoal(s, { id: 'line', kind: 'generations', target: 2, since: 2 })
    expect(familyGoalProgress(s.family.goal!, s.family.lives)).toBe(1)
    expect(checkFamilyGoal(s)).toBe(false)
    s = autoplay(continueWithHeir(s, era, heirs(s)[0].id), era)
    expect(s.family.goal?.id).toBe('line')
    expect(checkFamilyGoal(s)).toBe(true)
    expect(s.family.goal?.done).toBeDefined()
    expect(checkFamilyGoal(s)).toBe(false)
  })
})

describe('Наследник по обычаю', () => {
  function kids(era: EraDef, region: string) {
    const s = newLife(era, opts, 3)
    s.hero.region = region
    s.hero.npcs = []
    const add = (sex: 'm' | 'f', age: number) => {
      const n = makeNpc(s, era, 'child', sex, s.year - age, 50)
      if (!s.hero.npcs.includes(n)) s.hero.npcs.push(n)
      return n
    }
    return { s, d: add('f', 30), old: add('m', 28), young: add('m', 20) }
  }

  it('старший сын, у степняков - младший; где делят поровну - старший ребёнок', () => {
    const eur = ERAS.EUR
    const sonsRegion = eur.regions.find((r) => (r.inheritance ?? eur.inheritance) === 'sons_first')
    if (sonsRegion) {
      const k = kids(eur, sonsRegion.id)
      expect(customHeir([k.d, k.old, k.young], eur, sonsRegion.id)!.id).toBe(k.old.id)
    }
    const mng = ERAS.MNG
    const steppe = mng.regions.find((r) => (r.inheritance ?? mng.inheritance) === 'youngest_hearth')
    if (steppe) {
      const k = kids(mng, steppe.id)
      expect(customHeir([k.d, k.old, k.young], mng, steppe.id)!.id).toBe(k.young.id)
    }
  })

  it('наследник не по обычаю: обойдённый обижен, запись в дневнике', () => {
    const era = ERAS.EUR
    for (let seed = 90; seed < 200; seed++) {
      const s = autoplay(newLife(era, opts, seed), era)
      const list = heirs(s)
      const custom = customHeir(list, era, s.hero.region)
      const other = list.find((k) => k.id !== custom?.id && k.parentId === undefined)
      if (!custom || !other || list.some((k) => k.parentId)) continue
      const a0 = custom.attitude
      const next = continueWithHeir(s, era, other.id)
      const passed = next.hero.npcs.find((n) => n.id === custom.id)!
      expect(passed.attitude).toBeLessThan(a0)
      expect(next.hero.diary.some((d) => d.key.startsWith('diary.heir_not_custom'))).toBe(true)
      return
    }
    throw new Error('не нашлось семьи с двумя наследниками')
  })
})
