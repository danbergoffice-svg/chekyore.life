// Индия: «Ранголи у порога». Узор из цветного порошка должен быть симметричным:
// ур. 1–2 - зеркало слева направо, 3–4 - четыре четверти, 5 - ещё и по диагонали. Часть узора дана, остальное дорисовать.
import type { PuzzleLogic, Task } from './types'
import { randInt, shuffle } from './rng'

export type Sym = 'lr' | 'quad' | 'd4'

export interface RangoliState {
  n: number
  sym: Sym
  /** Число цветов в палитре. */
  k: number
  /** Цвет клетки 0..k-1, -1 - пусто. */
  cells: number[]
  /** Данные клетки (нарисовала мама) - не трогать. */
  given: boolean[]
  /** Эталон - для подсказки. */
  goal: number[]
  /** Где рисуем - от него палитра. */
  task: Task
}

/** Ход: поставить цвет c в клетку i (если там уже c - стереть). */
export interface RangoliMove {
  i: number
  c: number
}

const CONF: { n: number; sym: Sym; k: number; extra: number }[] = [
  { n: 4, sym: 'lr', k: 3, extra: 2 },
  { n: 4, sym: 'lr', k: 4, extra: 1 },
  { n: 6, sym: 'quad', k: 3, extra: 3 },
  { n: 6, sym: 'quad', k: 4, extra: 2 },
  { n: 8, sym: 'd4', k: 4, extra: 6 },
]

/** Зеркальные отражения клетки по осям симметрии (образующие). */
function mirrors(n: number, sym: Sym, i: number): number[] {
  const r = Math.floor(i / n), c = i % n
  const out = [r * n + (n - 1 - c)]
  if (sym !== 'lr') out.push((n - 1 - r) * n + c)
  if (sym === 'd4') out.push(c * n + r)
  return out
}

/** Все клетки, которые обязаны быть одного цвета с клеткой i. */
export function orbit(n: number, sym: Sym, i: number): number[] {
  const seen = new Set([i])
  const stack = [i]
  while (stack.length) {
    for (const j of mirrors(n, sym, stack.pop()!)) {
      if (seen.has(j)) continue
      seen.add(j)
      stack.push(j)
    }
  }
  return [...seen].sort((a, b) => a - b)
}

/** Данная часть: левая половина, левая верхняя четверть или её треугольник над диагональю. */
function inGiven(n: number, sym: Sym, i: number): boolean {
  const r = Math.floor(i / n), c = i % n, h = n / 2
  if (sym === 'lr') return c < h
  if (sym === 'quad') return r < h && c < h
  return r < h && c < h && c >= r
}

export const rangoli: PuzzleLogic<RangoliState, RangoliMove> = {
  generate(difficulty, rng, task) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
    const { n, sym, k, extra } = CONF[d]
    const all = Array.from({ length: n * n }, (_, i) => i)
    const reps = all.filter((i) => orbit(n, sym, i)[0] === i)
    // Узор: цвет по «кольцу» от центра (квадратом или ромбом), часть орбит перекрашена случайно - как у настоящего ранголи.
    let goal: number[] = []
    for (let attempt = 0; attempt < 50; attempt++) {
      const ring = shuffle(rng, Array.from({ length: n }, (_, j) => j % k))
      const diamond = rng() < 0.5
      const c0 = (n - 1) / 2
      goal = new Array(n * n).fill(0)
      for (const rep of reps) {
        const dr = Math.abs(Math.floor(rep / n) - c0), dc = Math.abs((rep % n) - c0)
        const m = Math.floor(diamond ? (dr + dc) / 2 : Math.max(dr, dc))
        const col = rng() < 0.35 ? randInt(rng, 0, k - 1) : ring[m % ring.length]
        for (const j of orbit(n, sym, rep)) goal[j] = col
      }
      const used = new Set(goal)
      // Нужны все цвета палитры и не слишком однообразный узор.
      const most = Math.max(...Array.from({ length: k }, (_, c) => goal.filter((x) => x === c).length))
      if (used.size === k && most <= n * n * 0.5) break
    }
    const cells = all.map((i) => (inGiven(n, sym, i) ? goal[i] : -1))
    // Несколько подсказанных клеток в других частях - из разных орбит.
    const taken = new Set<number>()
    for (const i of shuffle(rng, all.filter((i) => cells[i] < 0))) {
      if (taken.size >= extra) break
      const o = orbit(n, sym, i)[0]
      if (taken.has(o)) continue
      taken.add(o)
      cells[i] = goal[i]
    }
    const start: RangoliState = { n, sym, k, cells, given: cells.map((c) => c >= 0), goal, task }
    const solution = all.filter((i) => cells[i] < 0).map((i) => ({ i, c: goal[i] }))
    return { start, solution, par: solution.length }
  },
  apply(s, m) {
    if (!m || m.i < 0 || m.i >= s.cells.length || s.given[m.i]) return null
    if (!Number.isInteger(m.c) || m.c < 0 || m.c >= s.k) return null
    const cells = s.cells.slice()
    cells[m.i] = cells[m.i] === m.c ? -1 : m.c
    return { ...s, cells }
  },
  solved(s) {
    // Всё заполнено и каждая клетка совпадает со своими отражениями.
    return s.cells.every((c, i) => c >= 0 && mirrors(s.n, s.sym, i).every((j) => s.cells[j] === c))
  },
  hint(s) {
    // Первая пустая или неверная клетка - верный цвет.
    for (let i = 0; i < s.cells.length; i++) if (s.cells[i] !== s.goal[i]) return { i, c: s.goal[i] }
    return null
  },
}

