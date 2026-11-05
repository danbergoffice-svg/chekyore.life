// Продолжить род из мемориала (05.11): по итогу жизни собирается состояние, наследник находится и становится героем.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, memorialCanContinue, newLife, stateFromMemorial } from '../src/engine/life'

const era = await loadEra('RUS')
const settings = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }

describe('Род из мемориала', () => {
  it('у умершего героя с детьми - те же наследники, и наследник продолжает род с года смерти', () => {
    let s = autoplay(newLife(era, settings, 41), era)
    for (let i = 0; i < 30 && !heirs(s).length; i++) s = autoplay(newLife(era, settings, 500 + i), era)
    const life = s.family.lives[s.family.lives.length - 1]
    const memorial = [life]
    expect(memorialCanContinue(life, memorial, null)).toBe(true)
    const back = stateFromMemorial(era, life, memorial, settings)
    expect(heirs(back).map((n) => n.id)).toEqual(heirs(s).map((n) => n.id))
    const kid = heirs(back)[0]
    const next = continueWithHeir(back, era, kid.id)
    expect(next.hero.name).toBe(kid.name)
    expect(next.hero.generation).toBe(life.generation + 1)
    expect(next.year).toBe(life.deathYear)
    expect(next.family.lives.map((l) => l.heroId)).toContain(life.heroId)
    // Новые люди не получают id уже существующих близких.
    const ids = new Set(life.npcs.map((n) => n.id))
    expect(ids.has(next.hero.id)).toBe(false)
  })

  it('продолжить можно только последнюю жизнь рода', () => {
    const s = autoplay(newLife(era, settings, 42), era)
    const life = s.family.lives[s.family.lives.length - 1]
    const later = { ...life, heroId: 'h-later', generation: life.generation + 1 }
    expect(memorialCanContinue(life, [life, later], null)).toBe(false)
    expect(memorialCanContinue(later, [life, later], null)).toBe(true)
  })
})
