// Античность: «Мозаика из смальты». Латинский квадрат N×N: в каждой строке и каждом столбце все цвета разные.
// Часть клеток выложил мастер (в рамке, не трогать), остальные ребёнок заполняет сам.
import type { PuzzleLogic, Rng, Task } from './types'
import { shuffle } from './rng'

export interface MosaicState {
  n: number
  /** Цвет клетки 0..n-1, -1 - пусто. */
  cells: number[]
  /** Клетки мастера (в рамке) - их не трогать. */
  given: boolean[]
  /** Эталон - для подсказки. */
  goal: number[]
  /** Чей пол - от него палитра. */
  task: Task
}

/** Ход: поставить цвет c в клетку i (если там уже c - стереть). */
export interface MosaicMove {
  i: number
  c: number
}

const SIZE = [3, 4, 4, 5, 5]
const HOLES = [4, 7, 10, 13, 16]

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Случайный латинский квадрат: циклический (r + c) mod n, перемешаны строки, столбцы и цвета. */
function randomSquare(n: number, rng: Rng): number[] {
  const rows = shuffle(rng, range(n))
  const cols = shuffle(rng, range(n))
  const sym = shuffle(rng, range(n))
  return range(n * n).map((i) => sym[(rows[Math.floor(i / n)] + cols[i % n]) % n])
}

/** Цвета, которых ещё нет в строке и столбце клетки i. */
function candidates(n: number, g: number[], i: number): number[] {
  const r = Math.floor(i / n), c = i % n
  const used = new Set<number>()
  for (let k = 0; k < n; k++) {
    used.add(g[r * n + k])
    used.add(g[k * n + c])
  }
  return range(n).filter((x) => !used.has(x))
}

/**
 * Решается ли поле простыми рассуждениями (ребёнку по силам): «в клетку подходит один цвет»
 * или «этот цвет в строке / столбце встаёт только сюда». Если да - решение к тому же единственное.
 */
export function logicSolvable(n: number, cells: number[]): boolean {
  const g = cells.slice()
  for (;;) {
    let progress = false
    let empty = 0
    for (let i = 0; i < n * n; i++) {
      if (g[i] >= 0) continue
      empty++
      const cand = candidates(n, g, i)
      if (!cand.length) return false
      if (cand.length === 1) {
        g[i] = cand[0]
        progress = true
      }
    }
    if (!empty) return true
    // Цвет, которому в строке (или столбце) осталось одно место.
    for (let line = 0; line < n; line++) {
      for (const byRow of [true, false]) {
        const idx = range(n).map((k) => (byRow ? line * n + k : k * n + line))
        const have = new Set(idx.map((i) => g[i]))
        for (let x = 0; x < n; x++) {
          if (have.has(x)) continue
          const spots = idx.filter((i) => g[i] < 0 && candidates(n, g, i).includes(x))
          if (spots.length === 0) return false
          if (spots.length === 1) {
            g[spots[0]] = x
            have.add(x)
            progress = true
          }
        }
      }
    }
    if (!progress) return false
  }
}

export const mosaic: PuzzleLogic<MosaicState, MosaicMove> = {
  generate(difficulty, rng, task) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
    const n = SIZE[d]
    const want = HOLES[d]
    let best: { goal: number[]; cells: number[]; holes: number[] } | null = null
    for (let attempt = 0; attempt < 12; attempt++) {
      const goal = randomSquare(n, rng)
      const cells = goal.slice()
      const holes: number[] = []
      for (const i of shuffle(rng, range(n * n))) {
        if (holes.length >= want) break
        cells[i] = -1
        if (logicSolvable(n, cells)) holes.push(i)
        else cells[i] = goal[i]
      }
      if (!best || holes.length > best.holes.length) best = { goal, cells, holes }
      if (holes.length >= want) break
    }
    const { goal, cells, holes } = best!
    holes.sort((a, b) => a - b)
    const start: MosaicState = { n, cells, given: cells.map((c) => c >= 0), goal, task }
    const solution = holes.map((i) => ({ i, c: goal[i] }))
    return { start, solution, par: solution.length }
  },
  apply(s, m) {
    if (!m || m.i < 0 || m.i >= s.cells.length || s.given[m.i]) return null
    if (!Number.isInteger(m.c) || m.c < 0 || m.c >= s.n) return null
    const cells = s.cells.slice()
    cells[m.i] = cells[m.i] === m.c ? -1 : m.c
    return { ...s, cells }
  },
  solved(s) {
    if (s.cells.some((c) => c < 0)) return false
    return conflicts(s).size === 0
  },
  hint(s) {
    // Первая клетка, где цвет не как в эталоне (пусто или ошибка), - верный цвет.
    for (let i = 0; i < s.cells.length; i++) if (s.cells[i] !== s.goal[i]) return { i, c: s.goal[i] }
    return null
  },
}

/** Клетки, у которых в строке или столбце есть такой же цвет. */
export function conflicts(s: MosaicState): Set<number> {
  const bad = new Set<number>()
  const { n, cells } = s
  for (let i = 0; i < n * n; i++) {
    if (cells[i] < 0) continue
    const r = Math.floor(i / n), c = i % n
    for (let k = 0; k < n; k++) {
      const a = r * n + k, b = k * n + c
      if (a !== i && cells[a] === cells[i]) bad.add(i)
      if (b !== i && cells[b] === cells[i]) bad.add(i)
    }
  }
  return bad
}
