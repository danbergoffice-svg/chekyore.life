// Первые жизни игрока уникальны (флаг unique_lives): события прошлых жизней не повторяются (кроме узлов жизни -
// имя ребёнку, ремесло, свадьба, вход в сон), а детей в каждой жизни - своё число.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, pickKidsTarget } from '../src/engine/life'
import type { GameSettings, LifeSummary } from '../src/engine/types'

const era = await loadEra('RUS')
const STRUCTURAL = /^(birth_naming|profession_choice|dream_intro|marriage_.*|ab_homesick|d_grief_year)$/

describe('Уникальные первые жизни', () => {
  it('события прошлых жизней не повторяются', () => {
    const memorial: LifeSummary[] = []
    let repeats = 0
    let total = 0
    for (let i = 0; i < 5; i++) {
      const eventsSeen = [...new Set(memorial.flatMap((l) => l.diary.map((d) => d.eventId).filter((x): x is string => !!x)))]
      const settings: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false, livesBefore: i, eventsSeen }
      const s = autoplay(newLife(era, settings, 500 + i), era)
      const life = s.family.lives[s.family.lives.length - 1]
      for (const d of life.diary) {
        if (!d.eventId || STRUCTURAL.test(d.eventId)) continue
        total++
        if (eventsSeen.includes(d.eventId)) repeats++
      }
      memorial.push(life)
    }
    expect(total).toBeGreaterThan(50)
    expect(repeats).toBe(0)
  })

  it('число детей - то, которого ещё не было; когда были все - любое', () => {
    const r = () => 0.5
    for (let k = 0; k < 9; k++) expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== k)).toContain(pickKidsTarget([k], r))
    expect(pickKidsTarget([0, 1, 2, 3, 4, 6, 7, 8, 9], r)).toBe(5)
    expect(pickKidsTarget([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], r)).toBeGreaterThanOrEqual(0)
  })
})
