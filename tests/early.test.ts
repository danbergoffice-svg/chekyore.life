// Ранняя детская игра (src/kids/early.ts): выбор занятий, трудность головоломок по жизням, ротация, тексты стран, A/B.
import { describe, expect, it } from 'vitest'
import { earlyOffer, kidsGroup, PUZZLE_TIER, puzzleOpen, TIER_FROM } from '../src/kids/early'
import { KIDS_BY_ERA, KIDS_PUZZLES } from '../src/kids'
import { TODDLER_GAMES } from '../src/kids/toddler'
import { SKINS } from '../src/kids/toddler/skins'
import { makeLevel, shortest } from '../src/kids/toddler/Path'
import { makeRng } from '../src/kids/rng'

const ERAS = Object.keys(KIDS_BY_ERA)

describe('Ранняя игра', () => {
  it('у каждой головоломки есть трудность', () => {
    for (const p of KIDS_PUZZLES) expect(PUZZLE_TIER[p.id], p.id).toBeDefined()
  })

  it('трудные головоломки - не раньше пятой жизни, средние - не раньше третьей', () => {
    for (const era of ERAS) {
      const tier = PUZZLE_TIER[KIDS_BY_ERA[era].id]
      for (let lives = 0; lives < 10; lives++) {
        const offered = earlyOffer(era, lives, []).some((c) => c.kind === 'puzzle')
        expect(offered, `${era} жизнь ${lives + 1}`).toBe(lives >= TIER_FROM[tier])
        expect(puzzleOpen(era, lives)).toBe(lives >= TIER_FROM[tier])
      }
    }
    expect(TIER_FROM[3]).toBe(4)
  })

  it('всегда три занятия, по одному на Тело / Ум / Люди, если хватает игр', () => {
    for (const era of ERAS)
      for (const lives of [0, 2, 4, 9]) {
        const cards = earlyOffer(era, lives, [])
        expect(cards.length).toBe(3)
        expect(new Set(cards.map((c) => c.task)).size).toBe(3)
      }
  })

  it('первые 7 жизней без повторов, какую бы карточку игрок ни брал', () => {
    for (const era of ['CHN', 'EUR', 'AMR', 'RUS'])
      for (const pick of [0, 1, 2]) {
        const seen: string[] = []
        for (let life = 0; life < 7; life++) {
          const cards = earlyOffer(era, life, seen)
          const fresh = cards.filter((c) => !seen.includes(c.id))
          expect(fresh.length, `${era} жизнь ${life + 1}`).toBeGreaterThan(0)
          const c = !seen.includes(cards[pick]?.id) && cards[pick] ? cards[pick] : fresh[0]
          seen.push(c.id)
        }
        expect(new Set(seen).size, `${era} ${seen.join(',')}`).toBe(7)
      }
  })

  it('когда всё сыграно - предлагает давно забытое', () => {
    const all = TODDLER_GAMES.map((g) => g.id)
    const cards = earlyOffer('EUR', 3, all)
    expect(cards.length).toBe(3)
    expect(cards.map((c) => c.id)).toContain(all[0])
  })

  it('у всех 13 стран есть обёртки всех ранних игр на трёх языках', () => {
    for (const era of ERAS) {
      const s = SKINS[era] as unknown as Record<string, { card: Record<string, string> }>
      expect(s, era).toBeDefined()
      for (const g of TODDLER_GAMES)
        for (const lang of ['ru', 'en', 'tr']) expect(s[g.id]?.card?.[lang], `${era}.${g.id}.${lang}`).toBeTruthy()
    }
    for (const g of TODDLER_GAMES) for (const lang of ['ru', 'en', 'tr'] as const) expect(g.rule[lang], `${g.id}.${lang}`).toBeTruthy()
  })

  it('«Домой»: 2000 раскладов проходимы, путь 6+ шагов', () => {
    for (let s = 1; s <= 2000; s++) {
      const lv = makeLevel(makeRng(s))
      const d = shortest(lv.start, lv.home, lv.block)
      expect(d).toBe(lv.best)
      expect(d).toBeGreaterThanOrEqual(6)
      expect(d).toBeLessThan(Infinity)
    }
  })

  it('A/B: доля игроков с ранней игрой близка к kids_share и не зависит от ab_buckets', () => {
    let on = 0
    for (let i = 0; i < 4000; i++) if (kidsGroup(`player-${i}`, 0.5)) on++
    expect(on / 4000).toBeGreaterThan(0.45)
    expect(on / 4000).toBeLessThan(0.55)
    expect(kidsGroup('x', 1)).toBe(true)
    expect(kidsGroup('x', 0)).toBe(false)
  })
})
