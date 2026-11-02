// Эфиопия: «Гебета» (рассев). Две строки по 6 лунок, твои - нижняя. Ход - взять все семена из своей лунки
// и класть по одному против часовой стрелки (нижняя строка слева направо, верхняя справа налево).
// Если последнее семя сделало в лунке ровно 4 - эти 4 твои. Цель - собрать T семян не больше чем за K ходов.
import type { Level, PuzzleLogic, Task } from './types'
import { randInt } from './rng'

/** Лунки 0..5 - нижняя строка слева направо, 6..11 - верхняя справа налево: так рассев идёт просто i + 1. */
export const PITS = 12

export interface GebetaState {
  pits: number[]
  /** Сколько семян уже собрано. */
  score: number
  /** Сколько ходов осталось. */
  left: number
  /** Цель: собрать не меньше. */
  goal: number
  /** Начало уровня - для хода «заново», когда ходы кончились. */
  init: number[]
  moves: number
  /** Куда упало последнее семя прошлого хода (-1 - ещё не ходили) и сколько забрали. */
  last: number
  took: number
  task: Task
}

/** Ход: номер своей лунки 0..5 или 'reset' - начать уровень заново (тоже ход). */
export type GebetaMove = number | 'reset'

/** Рассев из лунки i: новые лунки, где упало последнее семя, сколько забрали. */
export function sow(pits: number[], i: number): { pits: number[]; last: number; took: number } {
  const p = pits.slice()
  let seeds = p[i]
  p[i] = 0
  let j = i
  while (seeds > 0) {
    j = (j + 1) % PITS
    if (j === i) continue // свою опустевшую лунку пропускаем, если семян на круг
    p[j]++
    seeds--
  }
  if (p[j] === 4) {
    p[j] = 0
    return { pits: p, last: j, took: 4 }
  }
  return { pits: p, last: j, took: 0 }
}

/**
 * Перебор: кратчайшая последовательность не длиннее k ходов, которая соберёт need семян.
 * Возвращает ходы или null, если так не собрать.
 */
function shortest(pits: number[], k: number, need: number): number[] | null {
  if (need <= 0) return []
  const go = (p: number[], left: number, got: number): number[] | null => {
    if (got >= need) return []
    if (left === 0) return null
    for (let i = 0; i < 6; i++) {
      if (!p[i]) continue
      const r = sow(p, i)
      const rest = go(r.pits, left - 1, got + r.took)
      if (rest) return [i, ...rest]
    }
    return null
  }
  // Сначала ищем решение в 1 ход, потом в 2... - первое найденное и есть кратчайшее.
  for (let len = 1; len <= k; len++) {
    const path = go(pits, len, 0)
    if (path) return path
  }
  return null
}

/** Лучший сбор не больше чем за k ходов. */
function bestScore(p: number[], k: number): number {
  if (k === 0) return 0
  let best = 0
  for (let i = 0; i < 6; i++) {
    if (!p[i]) continue
    const r = sow(p, i)
    best = Math.max(best, r.took + bestScore(r.pits, k - 1))
  }
  return best
}

// Уровни: ходов, семян в лунке, сколько ходов должно быть в кратчайшем решении (минимум).
const PLANS = [
  { k: 1, max: 5, minPar: 1 },
  { k: 2, max: 5, minPar: 1 },
  { k: 2, max: 6, minPar: 2 },
  { k: 3, max: 6, minPar: 2 },
  { k: 3, max: 7, minPar: 3 },
]

export const gebeta: PuzzleLogic<GebetaState, GebetaMove> = {
  generate(difficulty, rng, task) {
    const p = PLANS[Math.max(0, Math.min(4, difficulty - 1))]
    for (let attempt = 0; ; attempt++) {
      const pits = Array.from({ length: PITS }, () => randInt(rng, 0, p.max))
      if (pits.slice(0, 6).filter((x) => x > 0).length < 4) continue
      const goal = bestScore(pits, p.k)
      if (goal <= 0) continue
      const solution = shortest(pits, p.k, goal)!
      const strict = attempt < 300
      if (strict && solution.length < p.minPar) continue
      // Чтобы был выбор: подходящих первых ходов немного.
      const good = [0, 1, 2, 3, 4, 5].filter((i) => pits[i] > 0 && (() => {
        const r = sow(pits, i)
        return shortest(r.pits, p.k - 1, goal - r.took) !== null
      })()).length
      if (strict && good > (difficulty === 1 ? 2 : 1)) continue
      const start: GebetaState = { pits, score: 0, left: p.k, goal, init: pits, moves: p.k, last: -1, took: 0, task }
      return { start, solution, par: solution.length } as Level<GebetaState, GebetaMove>
    }
  },
  apply(s, m) {
    if (m === 'reset') return { ...s, pits: s.init.slice(), score: 0, left: s.moves, last: -1, took: 0 }
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 5 || s.left <= 0 || !s.pits[m] || s.score >= s.goal) return null
    const r = sow(s.pits, m)
    return { ...s, pits: r.pits, score: s.score + r.took, left: s.left - 1, last: r.last, took: r.took }
  },
  solved(s) {
    return s.score >= s.goal
  },
  hint(s) {
    if (s.score >= s.goal) return null
    const path = shortest(s.pits, s.left, s.goal - s.score)
    // Отсюда уже не собрать - начать заново.
    return path && path.length ? path[0] : 'reset'
  },
}
