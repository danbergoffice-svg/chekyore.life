// Свой поток случайности для детской игры: уровень зависит только от зерна, жизнь от игры не меняется.
import type { Rng } from './types'

export function makeRng(seed: number): Rng {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randInt = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1))
export const pickOne = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
export function shuffle<T>(r: Rng, xs: T[]): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Поиск в ширину для подсказок и эталона: кратчайший путь от s до решённого состояния.
 * key - строка состояния, moves - все ходы из состояния. limit - сколько состояний смотреть (чтобы не зависнуть).
 */
export function bfs<S, M>(start: S, key: (s: S) => string, moves: (s: S) => M[], apply: (s: S, m: M) => S | null, solved: (s: S) => boolean, limit = 200000): M[] | null {
  if (solved(start)) return []
  const seen = new Map<string, { prev: string | null; move: M | null }>()
  const k0 = key(start)
  seen.set(k0, { prev: null, move: null })
  let frontier: [S, string][] = [[start, k0]]
  while (frontier.length && seen.size < limit) {
    const next: [S, string][] = []
    for (const [s, k] of frontier) {
      for (const m of moves(s)) {
        const t = apply(s, m)
        if (!t) continue
        const tk = key(t)
        if (seen.has(tk)) continue
        seen.set(tk, { prev: k, move: m })
        if (solved(t)) {
          const path: M[] = []
          let cur: string | null = tk
          while (cur !== null) {
            const e: { prev: string | null; move: M | null } = seen.get(cur)!
            if (e.move !== null) path.push(e.move)
            cur = e.prev
          }
          return path.reverse()
        }
        next.push([t, tk])
      }
    }
    frontier = next
  }
  return null
}
