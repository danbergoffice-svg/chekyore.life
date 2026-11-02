import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { autoplay, heroMortality } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'

const ERAS = await loadAllEras()
const soft = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }

describe('Взрослый наследник', () => {
  it('получает своё дело, супруга и своих детей (раньше начинал холостым, бездетным и без дела)', () => {
    const era = ERAS.EUR
    let adults = 0
    let withKids = 0
    for (let i = 0; i < 400 && adults < 40; i++) {
      const s = autoplay(newLife(era, soft, 5100 + i), era)
      const h = heirs(s).find((n) => n.married && n.profession && s.year - n.birthYear >= 26)
      if (!h) continue
      adults++
      const kids = s.hero.npcs.filter((n) => n.role === 'grandchild' && n.parentId === h.id)
      const next = continueWithHeir(s, era, h.id)
      expect(next.hero.profession).toBe(h.profession)
      expect(next.hero.npcs.some((n) => n.role === 'spouse' && n.alive)).toBe(true)
      expect(next.hero.tags).toContain('married')
      const mine = next.hero.npcs.filter((n) => n.role === 'child')
      expect(mine.map((n) => n.id).sort()).toEqual(kids.map((n) => n.id).sort())
      if (kids.length) withKids++
    }
    expect(adults).toBeGreaterThan(20)
    expect(withKids).toBeGreaterThan(5)
  })
})

describe('Глубокая старость', () => {
  it('после 90 лет даже богатый и здоровый знатный не живёт десятилетиями', () => {
    const era = ERAS.EUR
    const s = newLife(era, soft, 77)
    s.hero.cls = 'noble'
    s.hero.money = 5000
    s.hero.attrs.health = 95
    for (const l of era.lifestyle) {
      const best = l.options.find((o) => ['varied', 'walks', 'physician', 'daily'].includes(o.id))
      if (best) s.hero.lifestyle[l.id] = best.id
    }
    s.hero.age = 95
    const q95 = heroMortality(s, era)
    s.hero.age = 105
    const q105 = heroMortality(s, era)
    expect(q95).toBeGreaterThan(0.25)
    expect(q105).toBeGreaterThan(q95)
  })
})
