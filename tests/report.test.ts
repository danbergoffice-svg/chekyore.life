import { describe, expect, it } from 'vitest'
import { ERAS } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { buildReport, survivalTable } from '../src/engine/report'
import { AXES } from '../src/engine/types'

const era = ERAS.E03
const settings = { mode: 'full' as const, mortality: 'soft' as const, softenHeavy: false }

describe('Итоги жизни', () => {
  const lives = Array.from({ length: 300 }, (_, i) => autoplay(newLife(era, settings, 500 + i), era))

  it('для каждой жизни есть четыре оси и один из 16 архетипов', () => {
    for (const s of lives) {
      const r = s.family.lives[0].report
      for (const a of AXES) {
        expect(r.pattern.scores[a]).toBeGreaterThanOrEqual(-100)
        expect(r.pattern.scores[a]).toBeLessThanOrEqual(100)
      }
      expect(r.pattern.code).toMatch(/^[01]{4}$/)
    }
  })

  it('архетипы встречаются разные', () => {
    const codes = new Set(lives.map((s) => s.family.lives[0].report.pattern.code))
    expect(codes.size).toBeGreaterThanOrEqual(8)
  })

  it('ключевых моментов 10–16, с рождением и смертью, в трёх периодах жизни', () => {
    for (const s of lives.filter((x) => x.hero.age >= 30)) {
      const r = s.family.lives[0].report
      const diary = s.hero.diary
      expect(r.keyMoments.length).toBeGreaterThanOrEqual(10)
      expect(r.keyMoments.length).toBeLessThanOrEqual(16)
      expect(r.keyMoments[0]).toBe(0)
      expect(r.keyMoments[r.keyMoments.length - 1]).toBe(diary.length - 1)
      const periods = new Set(r.keyMoments.map((i) => (diary[i].age < 12 ? 0 : diary[i].age < 18 ? 1 : diary[i].age < 55 ? 2 : 3)))
      expect(periods.size).toBeGreaterThanOrEqual(3)
    }
  })

  it('таблица дожития эпохи убывает от 100%', () => {
    const l = survivalTable(era)
    expect(l[0]).toBe(1)
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeLessThanOrEqual(l[i - 1])
  })

  it('отчёт строится быстро', () => {
    const t = performance.now()
    for (const s of lives.slice(0, 50)) buildReport(s, era)
    expect((performance.now() - t) / 50).toBeLessThan(20)
  })
})
