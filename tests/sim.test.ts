import { describe, expect, it } from 'vitest'
import { ERAS } from '../src/content'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import type { GameSettings } from '../src/engine/types'

const era = ERAS.E03
const historical: GameSettings = { mode: 'full', mortality: 'historical', softenHeavy: false }
const soft: GameSettings = { mode: 'full', mortality: 'soft', softenHeavy: false }

function run(settings: GameSettings, n: number) {
  const ages: number[] = []
  const causes: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const s = autoplay(newLife(era, settings, i + 1), era)
    expect(s.phase).toBe('dead')
    ages.push(s.hero.age)
    causes[s.hero.deathCause!] = (causes[s.hero.deathCause!] ?? 0) + 1
  }
  const mean = ages.reduce((a, b) => a + b, 0) / n
  const adult = ages.filter((a) => a >= 18).length / n
  return { mean, adult, causes }
}

describe('Симуляция E03', () => {
  it('одинаковый seed даёт одинаковую жизнь', () => {
    const a = autoplay(newLife(era, soft, 42), era)
    const b = autoplay(newLife(era, soft, 42), era)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('историческая смертность близка к ориентиру эпохи', () => {
    const r = run(historical, 2500)
    console.log('historical', r)
    expect(r.mean).toBeGreaterThan(era.lifeExpectancy - 5)
    expect(r.mean).toBeLessThan(era.lifeExpectancy + 5)
  })

  it('мягкий режим: большинство героев доживает до взрослого возраста', () => {
    const r = run(soft, 1500)
    console.log('soft', r)
    expect(r.adult).toBeGreaterThan(0.7)
  })

  it('род продолжается через наследника', () => {
    let continued = 0
    for (let i = 0; i < 300; i++) {
      const s = autoplay(newLife(era, soft, 1000 + i), era)
      const kids = heirs(s)
      if (kids.length === 0) continue
      const next = autoplay(continueWithHeir(s, era, kids[0].id), era)
      expect(next.family.lives.length).toBe(2)
      expect(next.hero.generation).toBe(2)
      continued++
    }
    expect(continued).toBeGreaterThan(60)
  })
})
