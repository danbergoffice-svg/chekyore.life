// Русь: «Сани по льду». Сани толкнули - едут по льду, пока не упрутся в сугроб, край поля или не доедут до цели
// (изба, церковь или терем - цель останавливает). Проехать по полынье нельзя - провалишься (ход недопустим).
// Генерация: случайные сугробы и полыньи, поиск в ширину; берём поля с оптимумом в нужном диапазоне и без тупиков
// (из любой клетки, куда можно доехать, до цели ещё можно добраться - подсказка всегда поможет).
import type { PuzzleLogic } from './types'
import { bfs, randInt, shuffle } from './rng'

export type IceMove = 'N' | 'E' | 'S' | 'W'
export const ICE_DIRS: IceMove[] = ['N', 'E', 'S', 'W']
const STEP: Record<IceMove, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

export interface IceState {
  w: number
  h: number
  /** По строкам: '.' - лёд, '#' - сугроб, 'o' - полынья. */
  cells: string
  sled: number
  /** Цель (изба / церковь / терем). */
  home: number
}

/** Куда доедут сани толчком в сторону dir: клетка остановки и провалились ли (по пути - полынья). */
export function slide(s: IceState, dir: IceMove): { to: number; fell: boolean; path: number[] } {
  const [dx, dy] = STEP[dir]
  let x = s.sled % s.w, y = Math.floor(s.sled / s.w)
  const path: number[] = []
  for (;;) {
    if (y * s.w + x === s.home && path.length) break
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) break
    const c = s.cells[ny * s.w + nx]
    if (c === '#') break
    x = nx
    y = ny
    path.push(y * s.w + x)
    if (c === 'o') return { to: y * s.w + x, fell: true, path }
  }
  return { to: y * s.w + x, fell: false, path }
}

/** Размер поля, сугробы (мин, макс), полыньи (мин, макс), оптимум (мин, макс) по уровням. */
const SETUP: [number, number, number, number, number, number, number][] = [
  [6, 4, 6, 1, 2, 3, 4],
  [6, 5, 7, 2, 3, 4, 6],
  [7, 6, 9, 3, 4, 5, 8],
  [7, 8, 10, 4, 5, 7, 10],
  [8, 10, 13, 5, 7, 8, 12],
]

const at = (s: IceState, sled: number): IceState => ({ ...s, sled })

/** Все клетки, куда можно доехать, и ходы между ними. */
function graph(s: IceState): Map<number, number[]> {
  const g = new Map<number, number[]>()
  const stack = [s.sled]
  g.set(s.sled, [])
  while (stack.length) {
    const p = stack.pop()!
    if (p === s.home) continue
    for (const d of ICE_DIRS) {
      const r = slide(at(s, p), d)
      if (r.fell || r.to === p) continue
      g.get(p)!.push(r.to)
      if (!g.has(r.to)) {
        g.set(r.to, [])
        stack.push(r.to)
      }
    }
  }
  return g
}

/** Оптимум от s и есть ли тупики (клетки, откуда до цели уже не добраться). */
function analyse(s: IceState): { dist: number; deadEnds: boolean } | null {
  const g = graph(s)
  if (!g.has(s.home)) return null
  // Обратный поиск от цели.
  const back = new Map<number, number[]>()
  for (const [p, outs] of g) for (const q of outs) back.set(q, [...(back.get(q) ?? []), p])
  const dist = new Map<number, number>([[s.home, 0]])
  const queue = [s.home]
  for (let i = 0; i < queue.length; i++) {
    for (const p of back.get(queue[i]) ?? []) {
      if (dist.has(p)) continue
      dist.set(p, dist.get(queue[i])! + 1)
      queue.push(p)
    }
  }
  return { dist: dist.get(s.sled)!, deadEnds: dist.size < g.size }
}

const moves = () => ICE_DIRS

export const ice: PuzzleLogic<IceState, IceMove> = {
  generate(difficulty, rng) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
    const [n, dMin, dMax, hMin, hMax, lo, hi] = SETUP[d]
    let best: { s: IceState; dist: number; score: number } | null = null
    for (let attempt = 0; attempt < 3000 && !(best && best.score >= 2); attempt++) {
      const corner = randInt(rng, 0, 3)
      const sled = (corner & 1 ? n - 1 : 0) + (corner & 2 ? (n - 1) * n : 0)
      const free = shuffle(rng, Array.from({ length: n * n }, (_, i) => i).filter((i) => i !== sled))
      const home = free[0]
      const cells = Array<string>(n * n).fill('.')
      const drifts = randInt(rng, dMin, dMax)
      const holes = randInt(rng, hMin, hMax)
      free.slice(1, 1 + drifts).forEach((i) => (cells[i] = '#'))
      free.slice(1 + drifts, 1 + drifts + holes).forEach((i) => (cells[i] = 'o'))
      const s: IceState = { w: n, h: n, cells: cells.join(''), sled, home }
      const a = analyse(s)
      if (!a || a.dist < 1 || a.dist > hi) continue
      // Лучше всего: в диапазоне и без тупиков; потом - в диапазоне; потом - самый длинный.
      const score = a.dist >= lo ? (a.deadEnds ? 1 : 2) : 0
      if (!best || score > best.score || (score === best.score && a.dist > best.dist)) best = { s, dist: a.dist, score }
    }
    const start = best!.s
    const solution = bfs(start, (x) => String(x.sled), moves, ice.apply, ice.solved)!
    return { start, solution, par: solution.length }
  },
  apply(s, m) {
    if (!STEP[m] || s.sled === s.home) return null
    const r = slide(s, m)
    if (r.fell || r.to === s.sled) return null
    return { ...s, sled: r.to }
  },
  solved(s) {
    return s.sled === s.home
  },
  hint(s) {
    if (ice.solved(s)) return null
    const path = bfs(s, (x) => String(x.sled), moves, ice.apply, ice.solved)
    return path && path.length ? path[0] : null
  },
}
