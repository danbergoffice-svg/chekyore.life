// Египет и Двуречье: «Каналы на разливе». Поле из плиток с каналами; тап поворачивает плитку на четверть.
// Вода идёт от Нила (левый край, строка src) по совпадающим концам; цель - край поля у выбранной цели (поле, школа, храм).
import type { Level, PuzzleLogic, Rng, Task } from './types'
import { pickOne, randInt, shuffle } from './rng'

/** Стороны: север 1, восток 2, юг 4, запад 8. */
export const N = 1, E = 2, S = 4, W = 8
const DIRS = [N, E, S, W]
const OPP: Record<number, number> = { [N]: S, [S]: N, [E]: W, [W]: E }
const STEP: Record<number, [number, number]> = { [N]: [0, -1], [S]: [0, 1], [E]: [1, 0], [W]: [-1, 0] }

export type Kind = 'I' | 'L' | 'T'
const BASE: Record<Kind, number> = { I: N | S, L: N | E, T: N | E | S }

export interface Tile {
  kind: Kind
  /** Сколько раз повернули (по часовой) - копится, чтобы поворот на доске всегда шёл вперёд. */
  turns: number
}

export interface CanalState {
  w: number
  h: number
  tiles: Tile[]
  /** Строка, где в поле входит Нил. */
  src: number
  /** Строки целей у правого края: тело - поле, ум - школа, люди - храм. */
  targets: Record<Task, number>
  goal: number
  /** Нужные концы на эталонном пути (для подсказки): индекс плитки → маска. */
  need: Record<number, number>
}

export const rotate = (mask: number, k: number) => {
  let m = mask
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15
  return m
}
export const openings = (t: Tile) => rotate(BASE[t.kind], t.turns)

/** Куда дошла вода: множество индексов плиток. */
export function flood(s: CanalState): Set<number> {
  const wet = new Set<number>()
  const first = s.src * s.w
  if (!(openings(s.tiles[first]) & W)) return wet
  const stack = [first]
  wet.add(first)
  while (stack.length) {
    const i = stack.pop()!
    const x = i % s.w, y = Math.floor(i / s.w)
    const o = openings(s.tiles[i])
    for (const d of DIRS) {
      if (!(o & d)) continue
      const [dx, dy] = STEP[d]
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue
      const j = ny * s.w + nx
      if (wet.has(j) || !(openings(s.tiles[j]) & OPP[d])) continue
      wet.add(j)
      stack.push(j)
    }
  }
  return wet
}

const SIZES: [number, number][] = [[4, 3], [5, 3], [5, 4], [6, 4], [6, 5]]

/** Случайный путь без самопересечений от (0, sy) до (w-1, gy) - поиск в глубину со случайным порядком соседей. */
function randomPath(w: number, h: number, sy: number, gy: number, rng: Rng, minLen: number): number[] | null {
  const seen = new Set<number>()
  const path: number[] = []
  let budget = 20000
  const go = (x: number, y: number): boolean => {
    if (--budget < 0) return false
    const i = y * w + x
    seen.add(i)
    path.push(i)
    if (x === w - 1 && y === gy && path.length >= minLen) return true
    for (const d of shuffle(rng, DIRS)) {
      const [dx, dy] = STEP[d]
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(ny * w + nx)) continue
      if (go(nx, ny)) return true
    }
    seen.delete(i)
    path.pop()
    return false
  }
  return go(0, sy) ? path : null
}

const kindFor = (mask: number): Kind => ((mask & (N | S)) === (N | S) || (mask & (E | W)) === (E | W) ? 'I' : 'L')
/** Сколько поворотов нужно плитке, чтобы в ней были все концы need (минимум; -1 - никак). */
export function turnsNeeded(t: Tile, need: number): number {
  for (let k = 0; k < 4; k++) if ((rotate(BASE[t.kind], t.turns + k) & need) === need) return k
  return -1
}

export const canals: PuzzleLogic<CanalState, number> = {
  generate(difficulty, rng, task) {
    const [w, h] = SIZES[Math.max(0, Math.min(4, difficulty - 1))]
    for (let attempt = 0; ; attempt++) {
      const rows = shuffle(rng, Array.from({ length: h }, (_, i) => i))
      const targets: Record<Task, number> = { body: rows[0], mind: rows[1 % h], people: rows[2 % h] }
      const goal = targets[task]
      const src = randInt(rng, 0, h - 1)
      const minLen = w + Math.floor(((w * h) / 3) * (difficulty / 5))
      const path = randomPath(w, h, src, goal, rng, attempt > 30 ? w : minLen)
      if (!path) continue
      const need: Record<number, number> = {}
      path.forEach((i, k) => {
        const x = i % w, y = Math.floor(i / w)
        const dirTo = (j: number) => {
          const jx = j % w, jy = Math.floor(j / w)
          return jx > x ? E : jx < x ? W : jy > y ? S : N
        }
        const a = k === 0 ? W : dirTo(path[k - 1])
        const b = k === path.length - 1 ? E : dirTo(path[k + 1])
        need[i] = a | b
      })
      const tiles: Tile[] = Array.from({ length: w * h }, (_, i) => {
        const kind: Kind = need[i] !== undefined ? (difficulty >= 3 && rng() < 0.25 ? 'T' : kindFor(need[i])) : pickOne(rng, difficulty >= 3 ? (['I', 'L', 'T', 'L'] as Kind[]) : (['I', 'L', 'L'] as Kind[]))
        return { kind, turns: 0 }
      })
      // Эталон: каждую плитку пути - в нужное положение; потом всё поле крутим случайно.
      for (const [i, m] of Object.entries(need)) tiles[+i].turns = turnsNeeded({ kind: tiles[+i].kind, turns: 0 }, m)
      for (const t of tiles) t.turns += randInt(rng, 0, 3)
      for (const t of tiles) t.turns %= 4
      const state: CanalState = { w, h, tiles, src, targets, goal, need }
      if (canals.solved(state)) continue
      const solution: number[] = []
      for (const i of path) for (let k = turnsNeeded(tiles[i], need[i]); k > 0; k--) solution.push(i)
      if (solution.length < Math.min(3, path.length)) continue
      return { start: state, solution, par: solution.length }
    }
  },
  apply(s, i) {
    if (i < 0 || i >= s.tiles.length) return null
    const tiles = s.tiles.slice()
    tiles[i] = { ...tiles[i], turns: tiles[i].turns + 1 }
    return { ...s, tiles }
  },
  solved(s) {
    const last = s.goal * s.w + s.w - 1
    return flood(s).has(last) && !!(openings(s.tiles[last]) & E)
  },
  hint(s) {
    // Плитка эталонного пути, которая ещё не повёрнута как надо.
    for (const [i, m] of Object.entries(s.need)) if (turnsNeeded(s.tiles[+i], m) > 0) return +i
    return null
  },
}
