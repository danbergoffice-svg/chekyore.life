import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { buildReport, survivalTable } from '../src/engine/report'
import { statusOf } from '../src/engine/rules'
import { AXES } from '../src/engine/types'

const ERAS = await loadAllEras()
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

describe('Сословие в итогах (B1)', () => {
  const ids = Object.keys(ERAS)
  const lives = Array.from({ length: 50 }, (_, i) => {
    const e = ERAS[ids[i % ids.length]]
    return { e, s: autoplay(newLife(e, settings, 9000 + i), e) }
  })

  it('шапка и жизнеописание берут сословие при рождении из одного поля', () => {
    for (const { s } of lives) {
      const f = s.family.lives[s.family.lives.length - 1].report.facts
      const born = s.hero.diary.find((d) => d.key === 'diary.born')!.params!.cls as { key: string }
      expect(born.key).toBe(`class.${f.birthCls}`)
      expect(f.cls).toBe(s.hero.cls)
    }
  })

  it('положение в обществе растёт вместе с итоговым положением героя', () => {
    for (const { e, s } of lives) {
      const f = s.family.lives[s.family.lives.length - 1].report.facts
      expect(f.status).toBe(statusOf(s.hero, e))
      expect(f.percentile).toBeGreaterThanOrEqual(0)
      expect(f.percentile).toBeLessThanOrEqual(99)
    }
    // Внутри одного региона процент монотонен по положению.
    const byRegion = new Map<string, { status: number; p: number }[]>()
    for (const { s } of lives) {
      const f = s.family.lives[s.family.lives.length - 1].report.facts
      byRegion.set(s.hero.region, [...(byRegion.get(s.hero.region) ?? []), { status: f.status, p: f.percentile }])
    }
    for (const rows of byRegion.values()) {
      rows.sort((a, b) => a.status - b.status)
      for (let i = 1; i < rows.length; i++) expect(rows[i].p).toBeGreaterThanOrEqual(rows[i - 1].p)
    }
  })
})
