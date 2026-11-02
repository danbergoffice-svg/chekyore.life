// Исламский мир: «Весы на базаре». На левой чаше товар весом W, у купца гири. Тап по гире переносит её по кругу:
// стол → правая чаша → левая чаша (к товару) → стол (на ур. 1–2 только стол ↔ правая). Чаши равны - товар взвешен,
// на чашу сам ложится следующий товар, гири остаются где лежат. Решено - взвешены все товары.
import type { Level, PuzzleLogic, Task } from './types'
import { randInt } from './rng'

/** Где гиря: 0 - на столе, 1 - правая чаша, 2 - левая чаша (к товару). */
export type Spot = 0 | 1 | 2

export interface ScalesState {
  weights: number[]
  at: Spot[]
  /** Можно ли класть гири к товару (ур. 3+). */
  left: boolean
  /** Веса товаров по раундам. */
  goods: number[]
  /** Какой товар сейчас на весах; = goods.length - всё взвешено. */
  round: number
  task: Task
}

const spots = (s: ScalesState) => (s.left ? 3 : 2)
/** Перевес левой чаши: товар + гири слева − гири справа. */
export function tilt(s: ScalesState): number {
  const g = s.goods[Math.min(s.round, s.goods.length - 1)]
  return s.weights.reduce((a, w, i) => a + (s.at[i] === 2 ? w : s.at[i] === 1 ? -w : 0), g)
}

/**
 * Раскладка гирь для веса w: на ур. 1–2 - двоичная запись (гири 1, 2, 4 справа), на ур. 3+ - уравновешенная
 * троичная (1, 3, 9, 27: справа или к товару). Она единственная, поэтому равновесие бывает только на ней.
 */
export function layout(weights: number[], left: boolean, w: number): Spot[] {
  let n = w
  return weights.map(() => {
    if (!left) {
      const bit = n % 2
      n = (n - bit) / 2
      return bit as Spot
    }
    const r = n % 3
    n = (r === 2 ? n + 1 : n - r) / 3
    return (r === 0 ? 0 : r === 1 ? 1 : 2) as Spot
  })
}

/** Сколько тапов перевести гирю из a в b по кругу. */
const dist = (a: Spot, b: Spot, k: number) => (b - a + k) % k

// Уровни: гири, можно ли к товару, число товаров, диапазон веса.
const PLANS = [
  { weights: [1, 2, 4], left: false, rounds: 2, min: 3, max: 7 },
  { weights: [1, 2, 4], left: false, rounds: 3, min: 2, max: 7 },
  { weights: [1, 3, 9], left: true, rounds: 3, min: 2, max: 13 },
  { weights: [1, 3, 9, 27], left: true, rounds: 3, min: 5, max: 40 },
  { weights: [1, 3, 9, 27], left: true, rounds: 4, min: 5, max: 40 },
]

const advance = (s: ScalesState): ScalesState => {
  let t = s
  while (t.round < t.goods.length && tilt(t) === 0) t = { ...t, round: t.round + 1 }
  return t
}

export const scales: PuzzleLogic<ScalesState, number> = {
  generate(difficulty, rng, task) {
    const p = PLANS[Math.max(0, Math.min(4, difficulty - 1))]
    const goods: number[] = []
    let needLeft = false
    while (goods.length < p.rounds) {
      const w = randInt(rng, p.min, p.max)
      // Соседние товары разные (иначе следующий сразу взвешен), и не повторяются.
      if (goods.includes(w)) continue
      goods.push(w)
      if (layout(p.weights, p.left, w).includes(2)) needLeft = true
      // На ур. 3+ хотя бы один товар должен требовать гирю к товару.
      if (goods.length === p.rounds && p.left && !needLeft) {
        goods.length = 0
        needLeft = false
      }
    }
    const start: ScalesState = { weights: p.weights, at: p.weights.map(() => 0 as Spot), left: p.left, goods, round: 0, task }
    // Эталон: по раундам каждую гирю - в свою чашу кратчайшим числом тапов (сначала тяжёлые).
    const solution: number[] = []
    let at = start.at
    for (const w of goods) {
      const want = layout(p.weights, p.left, w)
      for (let i = p.weights.length - 1; i >= 0; i--) for (let k = dist(at[i], want[i], spots(start)); k > 0; k--) solution.push(i)
      at = want
    }
    return { start, solution, par: solution.length } as Level<ScalesState, number>
  },
  apply(s, i) {
    if (s.round >= s.goods.length || i < 0 || i >= s.weights.length || !Number.isInteger(i)) return null
    const at = s.at.slice()
    at[i] = ((at[i] + 1) % spots(s)) as Spot
    return advance({ ...s, at })
  },
  solved(s) {
    return s.round >= s.goods.length
  },
  hint(s) {
    if (s.round >= s.goods.length) return null
    const want = layout(s.weights, s.left, s.goods[s.round])
    for (let i = s.weights.length - 1; i >= 0; i--) if (s.at[i] !== want[i]) return i
    return null
  },
}
