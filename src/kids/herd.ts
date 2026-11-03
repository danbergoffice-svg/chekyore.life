// Монголы: «Отара». Всадник на поле с камнями загоняет овец в загон: овца, рядом с которой встал конь,
// шарахается на клетку дальше от него (если там свободно). Ходы - шаг всадника в четыре стороны.
// Генерация: случайное поле, поиск в ширину; берём уровни с оптимумом в нужном диапазоне.
import type { Level, PuzzleLogic, Rng, Task } from './types'
import { bfs, randInt, shuffle } from './rng'

export interface HerdState {
  w: number
  h: number
  /** По строкам: '#' - камень, '.' - трава. */
  cells: string
  rider: number
  /** Овцы вне загона (номера клеток, по возрастанию). */
  sheep: number[]
  pen: number
}

/** Ход - сторона: 0 север, 1 восток, 2 юг, 3 запад. */
export type HerdMove = 0 | 1 | 2 | 3
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]

/** Оптимум по уровням. */
const RANGE: [number, number][] = [[3, 8], [5, 12], [7, 16], [9, 22], [11, 28]]
/** Поле по уровням: ширина, высота, камней (мин, макс), овец (мин, макс). */
const FIELDS: [number, number, number, number, number, number][] = [
  [4, 4, 0, 1, 1, 1],
  [5, 4, 1, 2, 1, 2],
  [5, 5, 2, 3, 2, 2],
  [5, 5, 2, 4, 2, 3],
  [6, 5, 3, 5, 3, 3],
]

function step(s: HerdState, i: number, d: number): number {
  const x = (i % s.w) + DIRS[d][0]
  const y = Math.floor(i / s.w) + DIRS[d][1]
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return -1
  const j = y * s.w + x
  return s.cells[j] === '#' ? -1 : j
}

function apply(s: HerdState, m: HerdMove): HerdState | null {
  const to = step(s, s.rider, m)
  if (to < 0 || to === s.pen || s.sheep.includes(to)) return null
  let sheep = s.sheep.slice()
  for (let d = 0; d < 4; d++) {
    const at = step(s, to, d)
    if (at < 0 || !sheep.includes(at)) continue
    // Овца бежит от коня в ту же сторону.
    const away = step(s, at, d)
    if (away < 0 || away === to || sheep.includes(away)) continue
    sheep = sheep.filter((x) => x !== at)
    if (away !== s.pen) sheep.push(away)
  }
  sheep.sort((a, b) => a - b)
  return { ...s, rider: to, sheep }
}

const solved = (s: HerdState) => s.sheep.length === 0
const key = (s: HerdState) => `${s.rider}|${s.sheep.join(',')}`
const moves = (): HerdMove[] => [0, 1, 2, 3]
const solve = (s: HerdState, limit = 60000) => bfs<HerdState, HerdMove>(s, key, moves, apply, solved, limit)

function generate(difficulty: number, rng: Rng, _task: Task): Level<HerdState, HerdMove> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
  const [lo, hi] = RANGE[d]
  const [w, h, r0, r1, s0, s1] = FIELDS[d]
  const t0 = Date.now()
  let best: Level<HerdState, HerdMove> | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    if (best && Date.now() - t0 > 700) break
    const cells = Array<string>(w * h).fill('.')
    const order = shuffle(rng, [...Array(w * h).keys()])
    const pen = order[0]
    const rocks = randInt(rng, r0, r1)
    for (const i of order.slice(1, 1 + rocks)) cells[i] = '#'
    const free = order.slice(1 + rocks)
    const rider = free[0]
    const sheep = free.slice(1, 1 + randInt(rng, s0, s1)).sort((a, b) => a - b)
    const start: HerdState = { w, h, cells: cells.join(''), rider, sheep, pen }
    const sol = solve(start)
    if (!sol || sol.length === 0) continue
    const level = { start, solution: sol, par: sol.length }
    if (sol.length >= lo && sol.length <= hi) return level
    if (!best || Math.abs(sol.length - (lo + hi) / 2) < Math.abs(best.par - (lo + hi) / 2)) best = level
  }
  if (best) return best
  // Запасной уровень: одна овца на прямой к загону.
  const start: HerdState = { w: 4, h: 1, cells: '....', rider: 0, sheep: [2], pen: 3 }
  return { start, solution: [1], par: 1 }
}

export const herd: PuzzleLogic<HerdState, HerdMove> = {
  generate,
  apply,
  solved,
  hint(s) {
    const path = solve(s, 200000)
    return path && path.length ? path[0] : null
  },
}
