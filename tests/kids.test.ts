import { describe, expect, it } from 'vitest'
import { KIDS_PUZZLES } from '../src/kids'
import { makeRng } from '../src/kids/rng'
import { TASKS } from '../src/kids/types'

const SEEDS = Number(process.env.KIDS_SEEDS ?? 12)

describe('Детские головоломки', () => {
  it('у каждой из 13 стран - своя', () => {
    expect(new Set(KIDS_PUZZLES.map((p) => p.era)).size).toBe(KIDS_PUZZLES.length)
    if (!process.env.KIDS_ONLY) expect(KIDS_PUZZLES.length).toBe(13)
  })
  const only = process.env.KIDS_ONLY?.split(',')
  for (const p of KIDS_PUZZLES.filter((x) => !only || only.includes(x.id))) {
    describe(p.id, () => {
      it('тексты на трёх языках', () => {
        for (const lang of ['ru', 'en', 'tr'] as const) {
          const t = p.text[lang]
          expect(t.title && t.story && t.rule).toBeTruthy()
          expect(t.tasks.length).toBe(3)
          expect(`${t.title} ${t.story} ${t.rule} ${t.tasks.join(' ')}`).not.toMatch(/—/)
        }
      })
      it('каждый уровень решаем: эталон решает, длина = par, подсказки доводят до конца', () => {
        for (let d = 1; d <= 5; d++) {
          for (const task of TASKS) {
            for (let i = 0; i < SEEDS; i++) {
              const seed = 1000 * d + 31 * i + TASKS.indexOf(task)
              const t0 = performance.now()
              const level = p.logic.generate(d, makeRng(seed), task)
              const ms = performance.now() - t0
              const where = `${p.id} d=${d} ${task} seed=${seed}`
              expect(ms, `${where}: генерация ${Math.round(ms)} мс`).toBeLessThan(1500)
              expect(p.logic.solved(level.start), `${where}: уже решено`).toBe(false)
              expect(level.par, where).toBe(level.solution.length)
              expect(level.par, where).toBeGreaterThan(0)
              let s = level.start
              for (const m of level.solution) {
                const next = p.logic.apply(s, m)
                expect(next, `${where}: эталонный ход нельзя`).not.toBeNull()
                s = next!
              }
              expect(p.logic.solved(s), `${where}: эталон не решает`).toBe(true)
              // Только подсказки: от начала до решения.
              s = level.start
              let steps = 0
              while (!p.logic.solved(s) && steps < level.par * 4 + 40) {
                const m = p.logic.hint(s, level)
                expect(m, `${where}: нет подсказки на шаге ${steps}`).not.toBeNull()
                const next = p.logic.apply(s, m!)
                expect(next, `${where}: подсказанный ход нельзя`).not.toBeNull()
                s = next!
                steps++
              }
              expect(p.logic.solved(s), `${where}: подсказки не довели`).toBe(true)
            }
          }
        }
      })
    })
  }
})
