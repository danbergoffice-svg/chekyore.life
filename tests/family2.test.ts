// Семья и смерти (20.11): болезни близких разнообразнее; лекарь за деньги; тяга к вину от праздников; наследник
// бездетного - племянник или ученик.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { adoptiveHeirs, continueWithHeir, heirs, newLife } from '../src/engine/life'
import { makeNpc, roleKey } from '../src/engine/rules'
import { pickIll } from '../src/engine/illness'
import { callDoctor, doctorCost } from '../src/engine/kin'
import { drinkChoice, thirstYear, THIRST } from '../src/engine/thirst'
import type { GameState } from '../src/engine/types'

const era = await loadEra('EUR')
const opts = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, protectedUntil: 90 }
function adult(seed: number): GameState {
  const s = autoplay(newLife(era, opts, seed), era, 6)
  s.hero.age = 40
  s.hero.money = 3000
  s.hero.tags = s.hero.tags.filter((t) => t !== 'drinker' && t !== 'epidemic')
  return s
}

describe('Болезни близких', () => {
  it('у взрослых - не только понос и лихорадка; у детей - не только «детская болезнь»', () => {
    const s = adult(1)
    const count = (age: number) => {
      const m = new Map<string, number>()
      for (let i = 0; i < 600; i++) {
        const c = pickIll(s, age)
        m.set(c, (m.get(c) ?? 0) + 1)
      }
      return m
    }
    const kids = count(3)
    expect(kids.size).toBeGreaterThanOrEqual(5)
    expect((kids.get('infant_illness') ?? 0) / 600).toBeLessThan(0.35)
    const adults = count(50)
    expect(adults.size).toBeGreaterThanOrEqual(10)
    expect((adults.get('flux') ?? 0) / 600).toBeLessThan(0.1)
  })

  it('лекарь к больному: плата (запись в дневнике), отметка у болезни', () => {
    const s = adult(2)
    const b = makeNpc(s, era, 'sibling', 'm', s.year - 38)
    b.ill = { cause: 'fever', since: s.year }
    const m = s.hero.money
    expect(callDoctor(s, b.id)).toBe(true)
    expect(b.ill.doctor).toBe(true)
    expect(m - s.hero.money).toBe(doctorCost(s))
    expect(s.hero.diary.at(-1)?.params?.money).toBe(doctorCost(s))
    expect(callDoctor(s, b.id)).toBe(false)
  })
})

describe('Тяга к вину', () => {
  it('частые «выпить» и «пир» ведут к пьянству; без них тяга гаснет; бросил - тяга сброшена', () => {
    const s = adult(3)
    drinkChoice(s, 'work')
    expect(s.hero.thirst ?? 0).toBe(0)
    for (let i = 0; i < 5; i++) drinkChoice(s, i % 2 ? 'feast' : 'drink')
    thirstYear(s)
    expect(s.hero.tags).toContain('drinker')
    expect(s.hero.diary.some((e) => e.key === 'diary.drink_habit')).toBe(true)
    s.hero.tags = s.hero.tags.filter((t) => t !== 'drinker')
    thirstYear(s)
    expect(s.hero.thirst).toBeLessThan(THIRST.habit)
    expect(s.hero.tags).not.toContain('drinker')
  })
})

describe('Наследник бездетного', () => {
  it('нет детей - племянник от живого брата или сестры и ученик (если было дело); род продолжается', () => {
    let s = autoplay(newLife(era, opts, 7), era, 6)
    s.hero.age = 60
    s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'child' && n.role !== 'grandchild')
    makeNpc(s, era, 'sibling', 'f', s.year - 55)
    s.hero.profession = s.hero.profession ?? era.professions[0].id
    const extra = adoptiveHeirs(s, era)
    expect(extra.length).toBeGreaterThanOrEqual(2)
    s.hero.npcs.push(...extra)
    const list = heirs(s)
    expect(list.map((n) => roleKey(s.hero.npcs, n))).toEqual(expect.arrayContaining(['nephew', 'apprentice']))
    s.hero.alive = false
    s.phase = 'dead'
    const ap = list.find((n) => n.tags?.includes('apprentice'))!
    const next = continueWithHeir(s, era, ap.id)
    expect(next.hero.diary.some((e) => e.key === 'diary.heir_apprentice')).toBe(true)
  })
})
