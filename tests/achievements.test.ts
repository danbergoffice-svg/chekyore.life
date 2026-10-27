// ТЗ v3, п. 8–10: награды — выдаются по итогам жизни, задним числом по мемориалу, трудные — только при исторической смертности.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { ACHIEVEMENTS, checkLife, checkLive, checkMemorial, nearMisses, nextGoals } from '../src/engine/achievements'
import { autoplay } from '../src/engine/game'
import { newLife, summarize } from '../src/engine/life'
import { createT } from '../src/i18n'

const era = await loadEra('RUS')

function lifeAt(age: number, mortality: 'soft' | 'historical' = 'historical') {
  const s = autoplay(newLife(era, { mode: 'quick', mortality, softenHeavy: false }, 123), era)
  const life = summarize(s, era)
  return { ...life, age, mortality }
}

describe('Награды', () => {
  it('у каждой награды есть название, условие и подсказка на двух языках', () => {
    for (const lang of ['ru', 'en'] as const) {
      const t = createT(lang)
      for (const a of ACHIEVEMENTS) for (const part of ['title', 'desc', 'hint']) expect(t(`ach.${a.id}.${part}`), `${lang} ${a.id}.${part}`).not.toBe(`ach.${a.id}.${part}`)
    }
  })

  it('долголетие: 85 в Средневековье — «Долгий век»; 100 — только при исторической смертности', () => {
    expect(checkLife(lifeAt(86), [], new Set())).toEqual(expect.arrayContaining(['age_60', 'age_70', 'age_80', 'long_medieval']))
    expect(checkLife(lifeAt(101, 'soft'), [], new Set())).not.toContain('century')
    expect(checkLife(lifeAt(101, 'historical'), [], new Set())).toContain('century')
  })

  it('задним числом по мемориалу и без повторов', () => {
    const memorial = [lifeAt(72)]
    const got = checkMemorial(memorial, new Set())
    expect(got.map((e) => e.id)).toContain('age_70')
    expect(checkMemorial(memorial, new Set(got.map((e) => e.id)))).toEqual([])
  })

  it('по ходу жизни: 60 лет — награда сразу', () => {
    const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 5), era)
    s.hero.alive = true
    s.hero.age = 61
    expect(checkLive(s, new Set())).toContain('age_60')
  })

  it('«Почти получилось» и цели на следующую жизнь', () => {
    const near = nearMisses(lifeAt(55), [], new Set())
    expect(near.some((n) => n.id === 'age_60' && n.progress > 0.9)).toBe(true)
    expect(nextGoals(lifeAt(55), new Set())).toHaveLength(3)
  })
})
