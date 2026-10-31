// ТЗ v3, п. 8–10: награды – выдаются по итогам жизни, задним числом по мемориалу, трудные – только при исторической смертности.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { ACHIEVEMENTS, checkLife, checkLive, checkMemorial, dreamLadder, nearMisses, nextGoals, schoolProgram } from '../src/engine/achievements'
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

  it('долголетие: 85 в Средневековье – «Долгий век»; 100 – только при исторической смертности', () => {
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

  it('по ходу жизни: 60 лет – награда сразу', () => {
    const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 5), era)
    s.hero.alive = true
    s.hero.age = 61
    expect(checkLive(s, new Set())).toContain('age_60')
  })

  it('сны о будущем: прорыв, без шпаргалки, «уже знали», тайная гибель и «Школьная программа»', () => {
    type Seen = NonNullable<ReturnType<typeof lifeAt>['dreamSeen']>
    const withDream = (d: Partial<Seen>, era = 'RUS') => ({ ...lifeAt(40), dreamSeen: { id: 'eratosthenes', year: 1200, era, score: 3, outcome: 'breakthrough', params: {}, ...d } as Seen })
    expect(checkLife(withDream({}), [], new Set())).toEqual(expect.arrayContaining(['dream_first', 'dream_no_hint']))
    expect(checkLife(withDream({ hint: true }), [], new Set())).not.toContain('dream_no_hint')
    // в «Высоте храма» нет спора с мудрецами
    expect(checkLife(withDream({ id: 'thales' }), [], new Set())).not.toContain('dream_no_hint')
    expect(checkLife(withDream({ outcome: 'partial', known: true }), [], new Set())).toEqual(expect.arrayContaining(['dream_known']))
    expect(checkLife(withDream({ outcome: 'death', score: 0 }), [], new Set())).toContain('secret_dream_boom')
    expect(checkLife(withDream({ skipped: true, outcome: 'failure', score: 0 }), [], new Set()).some((id) => id.startsWith('dream') || id === 'secret_dream_boom')).toBe(false)
    const five = ['RUS', 'EUR', 'BYZ', 'ISL', 'CHN'].map((e, i) => ({ ...withDream({}, e), heroId: `h${i}` }))
    expect(checkLife(five[4], five, new Set())).toContain('dream_5')
    expect(checkLife(five[3], five.slice(0, 4), new Set())).not.toContain('dream_5')
    const school = schoolProgram([withDream({}), withDream({ id: 'thales', score: 1, outcome: 'failure' })])
    expect(school.solved).toEqual(new Set(['eratosthenes']))
    expect(school.seen).toEqual(new Set(['eratosthenes', 'thales']))
    expect(school.subjects.reduce((n, x) => n + x.ids.length, 0)).toBe(20)
    // Лестница снов: уровень растёт с каждым сном, решённым хотя бы частично; провал и отказ не поднимают.
    expect(dreamLadder([])).toEqual({ level: 1, seen: [] })
    expect(dreamLadder([withDream({ id: 'thales', score: 1, outcome: 'failure' })]).level).toBe(1)
    expect(dreamLadder([withDream({ skipped: true, outcome: 'failure', score: 0 })]).level).toBe(1)
    expect(dreamLadder([withDream({}), withDream({ id: 'thales', outcome: 'partial', score: 2 })])).toEqual({ level: 3, seen: ['eratosthenes', 'thales'] })
    expect(dreamLadder(five.concat(five)).level).toBe(5)
  })

  it('«Почти получилось» и цели на следующую жизнь', () => {
    const near = nearMisses(lifeAt(55), [], new Set())
    expect(near.some((n) => n.id === 'age_60' && n.progress > 0.9)).toBe(true)
    expect(nextGoals(lifeAt(55), new Set())).toHaveLength(3)
  })
})

describe('Конец эпохи (п. 9)', () => {
  it('род на Руси у 1600: «продолжение следует», вне хроники – без исторических событий и вестей', async () => {
    const { chronicleEnd, eraEnding, continueWithHeir, heirs } = await import('../src/engine/life')
    const { applyEffects } = await import('../src/engine/rules')
    const { startYear } = await import('../src/engine/game')
    const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 77)
    s.year = chronicleEnd(s) - 10
    applyEffects(s, era, [{ add_npc: 'child', attitude: 50 }])
    s.hero.npcs[s.hero.npcs.length - 1].birthYear = s.year - 20
    expect(eraEnding(s)).toBe(true)
    s.hero.alive = false
    s.phase = 'dead'
    const next = continueWithHeir(s, era, heirs(s)[0].id)
    next.offChronicle = s.year
    for (let i = 0; i < 15 && next.hero.alive; i++) {
      next.phase = 'year'
      startYear(next, era, null)
      next.year++
      next.hero.age++
    }
    expect(next.hero.diary.some((d) => d.news || d.primer)).toBe(false)
    expect(next.hero.diary.some((d) => d.eventId && era.events.find((e) => e.id === d.eventId)?.type === 'global_historical')).toBe(false)
    expect(eraEnding(next)).toBe(false)
  })
})
