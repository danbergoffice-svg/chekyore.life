// Ацтеки и инки: «Кипу». На главной верёвке висят шнуры, на шнуре узлы по ярусам: сотни, десятки, единицы.
// У каждого шнура табличка с числом; последний шнур на ур. 4–5 - «итоговый»: его число не написано, это сумма остальных.
// Ход - добавить или снять узел на ярусе шнура. Решено - каждый шнур показывает своё число.
import type { Level, PuzzleLogic, Task } from './types'
import { randInt } from './rng'

export interface Cord {
  /** Какое число должно быть на шнуре. */
  target: number
  /** Итоговый шнур: число на табличке не написано (сумма остальных). */
  total: boolean
  /** Узлы по ярусам, сверху вниз: [сотни,] десятки, единицы. */
  knots: number[]
}

export interface QuipuState {
  /** Сколько ярусов: 2 (десятки, единицы) или 3 (сотни, десятки, единицы). */
  tiers: number
  cords: Cord[]
  task: Task
}

/** Ход: шнур c, ярус t (0 - верхний), d = +1 завязать узел, -1 развязать. */
export interface QuipuMove {
  c: number
  t: number
  d: 1 | -1
}

/** Цифры числа по ярусам сверху вниз. */
export const digits = (n: number, tiers: number) => Array.from({ length: tiers }, (_, i) => Math.floor(n / 10 ** (tiers - 1 - i)) % 10)
/** Какое число сейчас завязано на шнуре. */
export const cordValue = (c: Cord) => c.knots.reduce((a, k) => a * 10 + k, 0)
export const cordOk = (c: Cord) => cordValue(c) === c.target

// Уровни: сколько шнуров с числами, есть ли итоговый, ярусов, диапазоны цифр [сотни, десятки, единицы].
interface Plan {
  plain: number
  total: boolean
  tiers: number
  h: [number, number]
  t: [number, number]
  u: [number, number]
  /** Не больше стольких узлов на уровне. */
  cap: number
}
const PLANS: Plan[] = [
  { plain: 2, total: false, tiers: 2, h: [0, 0], t: [1, 4], u: [1, 9], cap: 22 },
  { plain: 3, total: false, tiers: 2, h: [0, 0], t: [1, 6], u: [0, 9], cap: 32 },
  { plain: 3, total: false, tiers: 3, h: [1, 3], t: [0, 6], u: [0, 6], cap: 34 },
  { plain: 2, total: true, tiers: 3, h: [1, 3], t: [0, 6], u: [1, 9], cap: 40 },
  { plain: 3, total: true, tiers: 3, h: [1, 2], t: [0, 7], u: [1, 9], cap: 48 },
]

export const quipu: PuzzleLogic<QuipuState, QuipuMove> = {
  generate(difficulty, rng, task) {
    const p = PLANS[Math.max(0, Math.min(4, difficulty - 1))]
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const knotsOf = (n: number) => sum(digits(n, p.tiers))
    let nums: number[] = []
    for (;;) {
      nums = []
      while (nums.length < p.plain) {
        const n = randInt(rng, p.h[0], p.h[1]) * 100 + randInt(rng, p.t[0], p.t[1]) * 10 + randInt(rng, p.u[0], p.u[1])
        // Разные числа, чтобы шнуры не повторялись.
        if (n > 0 && !nums.includes(n)) nums.push(n)
      }
      // Узлов не слишком много: иначе на телефоне выйдет скучно и долго (тогда числа заново).
      const knots = sum(nums.map(knotsOf)) + (p.total ? knotsOf(sum(nums)) : 0)
      if (knots <= p.cap) break
    }
    const cords: Cord[] = nums.map((target) => ({ target, total: false, knots: Array(p.tiers).fill(0) }))
    if (p.total) cords.push({ target: sum(nums), total: true, knots: Array(p.tiers).fill(0) })
    const start: QuipuState = { tiers: p.tiers, cords, task }
    // Эталон: узлы по порядку - шнур за шнуром, ярус за ярусом.
    const solution: QuipuMove[] = []
    cords.forEach((c, ci) => digits(c.target, p.tiers).forEach((k, t) => {
      for (let i = 0; i < k; i++) solution.push({ c: ci, t, d: 1 })
    }))
    return { start, solution, par: solution.length } as Level<QuipuState, QuipuMove>
  },
  apply(s, m) {
    const c = s.cords[m.c]
    if (!c || m.t < 0 || m.t >= s.tiers || (m.d !== 1 && m.d !== -1)) return null
    const k = c.knots[m.t] + m.d
    if (k < 0 || k > 9) return null
    const knots = c.knots.slice()
    knots[m.t] = k
    const cords = s.cords.slice()
    cords[m.c] = { ...c, knots }
    return { ...s, cords }
  },
  solved(s) {
    return s.cords.every(cordOk)
  },
  hint(s) {
    // Первый неверный ярус: узел добавить или снять.
    for (let ci = 0; ci < s.cords.length; ci++) {
      const c = s.cords[ci]
      const want = digits(c.target, s.tiers)
      for (let t = 0; t < s.tiers; t++) if (c.knots[t] !== want[t]) return { c: ci, t, d: c.knots[t] < want[t] ? 1 : -1 }
    }
    return null
  },
}
