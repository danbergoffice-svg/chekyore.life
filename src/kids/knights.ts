// Европа: «Задача о конях» (как задача Гуарини, Италия, 1512). Доска 3×3 … 4×4 с вырезанными клетками,
// белые и чёрные кони; поменять их местами ходами коня на свободные клетки.
// Генерация: случайная доска и расстановка, поиск в ширину; берём уровни с оптимумом в нужном диапазоне.
import type { Level, PuzzleLogic, Rng } from './types'
import { bfs, pickOne, randInt, shuffle } from './rng'

export interface KnightsState {
  w: number
  h: number
  /** По строкам: '#' - клетки нет, '.' - пусто, 'W' - белый конь, 'B' - чёрный. */
  cells: string
  /** Как должно стать (белые и чёрные поменялись местами). */
  goal: string
}

export interface KnightsMove {
  from: number
  to: number
}

/** Оптимум по уровням: ур. 1 4–8 … ур. 5 16–30 (docs/KIDS.md). */
const RANGE: [number, number][] = [[4, 8], [6, 12], [9, 16], [12, 22], [16, 30]]
/** Доски по уровням: [ширина, высота, сколько клеток вырезать (мин, макс), коней каждого цвета (мин, макс)]. */
const BOARDS: [number, number, number, number, number, number][][] = [
  [[3, 3, 0, 1, 1, 1]],
  [[3, 3, 0, 1, 1, 2], [4, 3, 1, 3, 1, 1]],
  [[3, 3, 0, 0, 2, 2], [4, 3, 1, 3, 2, 2]],
  [[4, 3, 0, 2, 2, 2], [4, 4, 3, 5, 2, 2]],
  [[4, 3, 0, 2, 3, 3], [4, 4, 3, 5, 2, 3]],
]
const KJ: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]

/** Куда может пойти конь с клетки i (только по доске, без учёта занятости). */
export function jumps(w: number, h: number, cells: string, i: number): number[] {
  const x = i % w, y = Math.floor(i / w)
  const out: number[] = []
  for (const [dx, dy] of KJ) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const j = ny * w + nx
    if (cells[j] !== '#') out.push(j)
  }
  return out
}

/** Куда может пойти конь с клетки i сейчас (свободные клетки). */
export const targets = (s: KnightsState, i: number) => (s.cells[i] === 'W' || s.cells[i] === 'B' ? jumps(s.w, s.h, s.cells, i).filter((j) => s.cells[j] === '.') : [])

// --- Быстрое ядро: состояние - число по основанию 3 (0 пусто, 1 белый, 2 чёрный) по живым клеткам.

interface Core {
  /** Номера клеток доски, которые есть. */
  live: number[]
  /** Соседи по ходу коня (в номерах live). */
  adj: number[][]
  pow: number[]
}

function coreOf(w: number, h: number, cells: string): Core {
  const live: number[] = []
  for (let i = 0; i < cells.length; i++) if (cells[i] !== '#') live.push(i)
  const at = new Map(live.map((c, k) => [c, k]))
  const adj = live.map((c) => jumps(w, h, cells, c).map((j) => at.get(j)!))
  const pow = live.map((_, k) => 3 ** k)
  return { live, adj, pow }
}

function keyOf(c: Core, cells: string): number {
  let k = 0
  c.live.forEach((cell, i) => (k += (cells[cell] === 'W' ? 1 : cells[cell] === 'B' ? 2 : 0) * c.pow[i]))
  return k
}

/** Соседние состояния: cb(ключ, откуда, куда) в номерах live. */
function eachNext(c: Core, key: number, vals: number[], cb: (k: number, a: number, b: number) => void) {
  let r = key
  for (let i = 0; i < vals.length; i++) {
    vals[i] = r % 3
    r = Math.floor(r / 3)
  }
  for (let a = 0; a < vals.length; a++) {
    const v = vals[a]
    if (!v) continue
    for (const b of c.adj[a]) if (!vals[b]) cb(key + v * (c.pow[b] - c.pow[a]), a, b)
  }
}

/** Расстояние от start до target поиском в ширину (null - недостижимо или больше cap состояний). */
function distance(c: Core, start: number, target: number, cap: number): number | null {
  if (start === target) return 0
  const seen = new Set<number>([start])
  const vals = new Array(c.live.length).fill(0)
  let frontier = [start]
  for (let d = 1; frontier.length && seen.size < cap; d++) {
    const next: number[] = []
    let hit = false
    for (const k of frontier) {
      eachNext(c, k, vals, (t) => {
        if (t === target) hit = true
        if (!seen.has(t)) {
          seen.add(t)
          next.push(t)
        }
      })
      if (hit) return d
    }
    frontier = next
  }
  return null
}

/** Расстояния до цели от всех состояний компоненты (для подсказок и эталона). */
function distMap(c: Core, target: number): Map<number, number> {
  const dist = new Map<number, number>([[target, 0]])
  const vals = new Array(c.live.length).fill(0)
  const queue = [target]
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]
    const d = dist.get(k)! + 1
    eachNext(c, k, vals, (t) => {
      if (!dist.has(t)) {
        dist.set(t, d)
        queue.push(t)
      }
    })
  }
  return dist
}

interface Cache {
  core: Core
  dist: Map<number, number>
}
/** Расстояния уровня (ключ - начальное состояние уровня). */
const CACHE = new WeakMap<KnightsState, Cache>()

function cacheFor(s: KnightsState, level: Level<KnightsState, KnightsMove>): Cache {
  let c = CACHE.get(level.start)
  if (!c) {
    const core = coreOf(s.w, s.h, s.cells)
    c = { core, dist: distMap(core, keyOf(core, s.goal)) }
    CACHE.set(level.start, c)
  }
  return c
}

/** Лучший ход по карте расстояний (null - состояние не в карте). */
function stepFrom(c: Cache, s: KnightsState): KnightsMove | null {
  const k = keyOf(c.core, s.cells)
  const d = c.dist.get(k)
  if (d === undefined || d === 0) return null
  const vals = new Array(c.core.live.length).fill(0)
  let best: KnightsMove | null = null
  eachNext(c.core, k, vals, (t, a, b) => {
    if (!best && c.dist.get(t) === d - 1) best = { from: c.core.live[a], to: c.core.live[b] }
  })
  return best
}

/** Доска связна по ходам коня (иначе там лишние клетки, куда не попасть). */
function connected(w: number, h: number, cells: string): boolean {
  const live: number[] = []
  for (let i = 0; i < cells.length; i++) if (cells[i] !== '#') live.push(i)
  const seen = new Set([live[0]])
  const stack = [live[0]]
  while (stack.length) for (const j of jumps(w, h, cells, stack.pop()!)) if (!seen.has(j)) (seen.add(j), stack.push(j))
  return seen.size === live.length
}

function randomBoard(d: number, rng: Rng): { w: number; h: number; cells: string; pairs: number } | null {
  const [bw, bh, cutMin, cutMax, pMin, pMax] = pickOne(rng, BOARDS[d])
  const [w, h] = rng() < 0.5 ? [bw, bh] : [bh, bw]
  const cells = Array<string>(w * h).fill('.')
  // Клетки, откуда конь никуда не ходит (центр 3×3), вырезаем всегда.
  for (let i = 0; i < cells.length; i++) if (!jumps(w, h, cells.join(''), i).length) cells[i] = '#'
  const cut = randInt(rng, cutMin, cutMax)
  for (const i of shuffle(rng, cells.map((_, i) => i)).slice(0, cut)) cells[i] = '#'
  const str = cells.join('')
  if (!connected(w, h, str)) return null
  const pairs = randInt(rng, pMin, pMax)
  if (str.split('').filter((c) => c === '.').length < pairs * 2 + 1) return null
  return { w, h, cells: str, pairs }
}

const swapWB = (cells: string) => cells.replace(/[WB]/g, (c) => (c === 'W' ? 'B' : 'W'))

function allMoves(s: KnightsState): KnightsMove[] {
  const out: KnightsMove[] = []
  for (let i = 0; i < s.cells.length; i++) for (const to of targets(s, i)) out.push({ from: i, to })
  return out
}

export const knights: PuzzleLogic<KnightsState, KnightsMove> = {
  generate(difficulty, rng) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
    const [lo, hi] = RANGE[d]
    let best: { s: KnightsState; dist: number } | null = null
    for (let attempt = 0; attempt < 400 && !(best && best.dist >= lo); attempt++) {
      const b = randomBoard(d, rng)
      if (!b) continue
      const free: number[] = []
      for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === '.') free.push(i)
      const pick = shuffle(rng, free).slice(0, b.pairs * 2)
      const cells = b.cells.split('')
      pick.forEach((i, k) => (cells[i] = k < b.pairs ? 'W' : 'B'))
      const start = cells.join('')
      const goal = swapWB(start)
      const core = coreOf(b.w, b.h, b.cells)
      const dist = distance(core, keyOf(core, start), keyOf(core, goal), 60000)
      if (dist === null || dist > hi) continue
      if (!best || dist > best.dist) best = { s: { w: b.w, h: b.h, cells: start, goal }, dist }
    }
    const start = best!.s
    const level: Level<KnightsState, KnightsMove> = { start, solution: [], par: 0 }
    const c = cacheFor(start, level)
    let s = start
    for (let m = stepFrom(c, s); m; m = stepFrom(c, s)) {
      level.solution.push(m)
      s = knights.apply(s, m)!
    }
    level.par = level.solution.length
    return level
  },
  apply(s, m) {
    if (!m || !targets(s, m.from).includes(m.to)) return null
    const cells = s.cells.split('')
    cells[m.to] = cells[m.from]
    cells[m.from] = '.'
    return { ...s, cells: cells.join('') }
  },
  solved(s) {
    return s.cells === s.goal
  },
  hint(s, level) {
    if (knights.solved(s)) return null
    const m = stepFrom(cacheFor(level.start, level), s)
    if (m) return m
    const path = bfs(s, (x) => x.cells, allMoves, knights.apply, knights.solved, 200000)
    return path && path.length ? path[0] : null
  },
}
