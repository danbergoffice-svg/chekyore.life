import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { BIRTH_MARGIN, continueWithHeir, heirs, newLife, rollBirth } from '../src/engine/life'
import type { EraDef, GameSettings } from '../src/engine/types'

const ERAS = await loadAllEras()
const historical: GameSettings = { mode: 'full', mortality: 'historical', softenHeavy: false }
const soft: GameSettings = { mode: 'full', mortality: 'soft', softenHeavy: false }

function run(era: EraDef, settings: GameSettings, n: number) {
  const ages: number[] = []
  for (let i = 0; i < n; i++) {
    const s = autoplay(newLife(era, settings, i + 1), era)
    expect(s.phase).toBe('dead')
    ages.push(s.hero.age)
  }
  const mean = ages.reduce((a, b) => a + b, 0) / n
  const adult = ages.filter((a) => a >= 18).length / n
  return { mean, adult }
}

describe('Симуляция', () => {
  it('одинаковый seed даёт одинаковую жизнь', () => {
    const era = ERAS.E03
    const a = autoplay(newLife(era, soft, 42), era)
    const b = autoplay(newLife(era, soft, 42), era)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('лотерея рождения: поровну — все страны, по населению — чаще многолюдные', () => {
    const metas = ERA_IDS.map((id) => ERA_META[id])
    const count = (mode: 'equal' | 'population') => {
      const c: Record<string, number> = {}
      for (let i = 0; i < 4000; i++) {
        const b = rollBirth(i + 1, mode, metas)
        c[b.era] = (c[b.era] ?? 0) + 1
        const region = ERA_META[b.era].regions.find((r) => r.id === b.region)!
        expect(b.year).toBeGreaterThanOrEqual(region.years[0])
        expect(b.year).toBeLessThanOrEqual(region.years[1] - BIRTH_MARGIN)
      }
      return c
    }
    const equal = count('equal')
    expect(Object.keys(equal).length).toBe(ERA_IDS.length)
    const pop = count('population')
    const biggest = [...ERA_IDS].sort((a, b) => ERA_META[b].population - ERA_META[a].population)[0]
    expect(pop[biggest]).toBeGreaterThan(equal[biggest])
  })

  for (const era of Object.values(ERAS)) {
    it(`${era.id}: историческая смертность близка к ориентиру, мягкая — большинство взрослеет`, () => {
      const h = run(era, historical, 400)
      expect(h.mean).toBeGreaterThan(era.lifeExpectancy - 5)
      expect(h.mean).toBeLessThan(era.lifeExpectancy + 5)
      const s = run(era, soft, 200)
      expect(s.adult).toBeGreaterThan(0.65)
    })

    it(`${era.id}: род продолжается через наследника`, () => {
      let continued = 0
      for (let i = 0; i < 80; i++) {
        const s = autoplay(newLife(era, soft, 1000 + i), era)
        const kids = heirs(s)
        if (kids.length === 0) continue
        const next = autoplay(continueWithHeir(s, era, kids[0].id), era)
        expect(next.hero.generation).toBe(2)
        expect(next.hero.religion).toBeTruthy()
        continued++
      }
      expect(continued).toBeGreaterThan(15)
    })
  }
})
