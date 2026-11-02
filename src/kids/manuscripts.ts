// Мали и Сонгай: «Рукописи Тимбукту». Сундуки-стопки с книгами разных цветов; переложить так, чтобы в каждом сундуке
// были книги одного цвета (полный сундук или пустой). Ход - верхнюю книгу на книгу того же цвета или в пустой сундук.
// Последнюю переложенную книгу можно вернуть назад (это тоже ход) - так подсказка выводит из тупика.
import type { Level, PuzzleLogic, Rng } from './types'
import { bfs, pickOne } from './rng'

export interface MsMove {
  from: number
  to: number
}

export interface MsState {
  /** Вместимость сундука. */
  cap: number
  /** Сундуки: книги снизу вверх (номер цвета). */
  stacks: number[][]
  /** Сделанные ходы (для «вернуть назад»). */
  hist: MsMove[]
}

/** [цветов, вместимость, пустых сундуков, обратных ходов при перемешивании]. */
const PARAMS: [number, number, number, number][] = [
  [3, 3, 2, 10],
  [4, 3, 2, 18],
  [4, 4, 2, 26],
  [5, 4, 2, 34],
  [5, 4, 2, 60],
]

const top = (a: number[]) => a[a.length - 1]
const keyOf = (st: number[][]) => st.map((a) => a.join('')).join('|')
const canon = (st: number[][]) => st.map((a) => a.join('')).sort().join('|')

/** Обычный ход по правилам (без «вернуть назад»); null - нельзя. */
function step(st: number[][], cap: number, from: number, to: number): number[][] | null {
  if (from === to || from < 0 || to < 0 || from >= st.length || to >= st.length) return null
  const a = st[from], b = st[to]
  if (!a.length || b.length >= cap) return null
  if (b.length && top(b) !== top(a)) return null
  const out = st.slice()
  out[from] = a.slice(0, -1)
  out[to] = [...b, top(a)]
  return out
}

const isSolved = (st: number[][], cap: number) => st.every((a) => !a.length || (a.length === cap && a.every((c) => c === a[0])))

/** Сколько книг точно придётся переложить: всё, что лежит выше одноцветного низа сундука. */
function misplaced(st: number[][]): number {
  let n = 0
  for (const a of st) {
    let k = 0
    while (k < a.length && a[k] === a[0]) k++
    n += a.length - k
  }
  return n
}

/** Разумные ходы: без перекладывания одноцветного сундука в пустой и только в первый пустой. */
function sensibleMoves(st: number[][], cap: number): MsMove[] {
  const out: MsMove[] = []
  const firstEmpty = st.findIndex((a) => !a.length)
  for (let f = 0; f < st.length; f++) {
    const a = st[f]
    if (!a.length) continue
    const uniform = a.every((c) => c === a[0])
    for (let t = 0; t < st.length; t++) {
      if (t === f) continue
      const b = st[t]
      if (!b.length && (t !== firstEmpty || uniform)) continue
      if (b.length >= cap || (b.length && top(b) !== top(a))) continue
      out.push({ from: f, to: t })
    }
  }
  return out
}

/**
 * Поиск с углублением (IDA*) без памяти посещённых: зависит только от текущего состояния и прошлого хода, поэтому
 * если из A нашёлся путь через B, то из B он найдётся не дороже - подсказки подряд не ходят по кругу.
 */
function search(st0: number[][], cap: number, last: MsMove | null, budget: number, maxDepth = 40): MsMove[] | null {
  let left = budget
  const path: MsMove[] = []
  const dfs = (st: number[][], g: number, limit: number, prev: MsMove | null): boolean => {
    if (isSolved(st, cap)) return true
    if (--left < 0) return false
    if (g + misplaced(st) > limit) return false
    const kids = sensibleMoves(st, cap)
      .filter((m) => !prev || !(m.from === prev.to && m.to === prev.from))
      .map((m) => ({ m, st: step(st, cap, m.from, m.to)! }))
      .map((e) => ({ ...e, h: misplaced(e.st) }))
      .sort((a, b) => a.h - b.h || a.m.from - b.m.from || a.m.to - b.m.to)
    for (const e of kids) {
      path.push(e.m)
      if (dfs(e.st, g + 1, limit, e.m)) return true
      path.pop()
      if (left < 0) return false
    }
    return false
  }
  for (let limit = misplaced(st0); limit <= maxDepth; limit++) {
    if (dfs(st0, 0, limit, last)) return path
    if (left < 0) return null
  }
  return null
}

function scramble(rng: Rng, colors: number, cap: number, empty: number, steps: number): number[][] {
  let st: number[][] = [...Array.from({ length: colors }, (_, c) => new Array(cap).fill(c)), ...Array.from({ length: empty }, () => [])]
  let prev: MsMove | null = null
  for (let i = 0; i < steps; i++) {
    // Обратный ход: книга, под которой тот же цвет (или она одна), - в любой сундук со свободным местом.
    const opts: MsMove[] = []
    for (let f = 0; f < st.length; f++) {
      const a = st[f]
      if (!a.length || (a.length > 1 && a[a.length - 2] !== top(a))) continue
      for (let t = 0; t < st.length; t++) if (t !== f && st[t].length < cap && !(prev && prev.from === t && prev.to === f)) opts.push({ from: f, to: t })
    }
    if (!opts.length) break
    const m = pickOne(rng, opts)
    const out = st.slice()
    out[m.to] = [...st[m.to], top(st[m.from])]
    out[m.from] = st[m.from].slice(0, -1)
    st = out
    prev = m
  }
  return st
}

export const manuscripts: PuzzleLogic<MsState, MsMove> = {
  generate(difficulty, rng) {
    const d = Math.max(1, Math.min(5, difficulty)) - 1
    const [colors, cap, empty, steps] = PARAMS[d]
    const minPar = [4, 6, 9, 12, 15][d]
    let best: { stacks: number[][]; sol: MsMove[] } | null = null
    for (let attempt = 0; attempt < 30; attempt++) {
      const stacks = scramble(rng, colors, cap, empty, steps)
      if (isSolved(stacks, cap)) continue
      // Эталон: кратчайший путь поиском в ширину (сундуки одинаковы - ключ без порядка); не уложились - поиск IDA*.
      const sol = bfs(stacks, canon, (st) => sensibleMoves(st, cap), (st, m) => step(st, cap, m.from, m.to), (st) => isSolved(st, cap), d < 3 ? 120000 : 40000) ?? search(stacks, cap, null, 60000)
      if (!sol) continue
      if (!best || sol.length > best.sol.length) best = { stacks, sol }
      if (sol.length >= minPar) break
    }
    // На всякий случай (не бывает): простое перемешивание в два хода.
    if (!best) {
      const stacks = [...Array.from({ length: colors }, (_, c) => new Array(cap).fill(c)), ...Array.from({ length: empty }, () => [])]
      stacks[colors] = [top(stacks[0])]
      stacks[0] = stacks[0].slice(0, -1)
      best = { stacks, sol: [{ from: colors, to: 0 }] }
    }
    return { start: { cap, stacks: best.stacks, hist: [] }, solution: best.sol, par: best.sol.length }
  },
  apply(s, m) {
    const last = s.hist[s.hist.length - 1]
    if (last && m.from === last.to && m.to === last.from) {
      // Вернуть последнюю книгу назад - можно всегда.
      const a = s.stacks[m.from], b = s.stacks[m.to]
      if (!a.length || b.length >= s.cap) return null
      const stacks = s.stacks.slice()
      stacks[m.from] = a.slice(0, -1)
      stacks[m.to] = [...b, top(a)]
      return { ...s, stacks, hist: s.hist.slice(0, -1) }
    }
    const stacks = step(s.stacks, s.cap, m.from, m.to)
    return stacks ? { ...s, stacks, hist: [...s.hist, { from: m.from, to: m.to }] } : null
  },
  solved(s) {
    return isSolved(s.stacks, s.cap)
  },
  hint(s, level: Level<MsState, MsMove>) {
    if (isSolved(s.stacks, s.cap)) return null
    // 1) Стоим на эталонном пути - следующий ход эталона.
    const k = keyOf(s.stacks)
    let st = level.start.stacks
    let at = -1
    for (let i = 0; i <= level.solution.length; i++) {
      if (keyOf(st) === k) at = i
      if (i === level.solution.length) break
      const m = level.solution[i]
      st = step(st, s.cap, m.from, m.to) ?? st
    }
    if (at >= 0 && at < level.solution.length) return level.solution[at]
    // 2) Ищем путь к порядку из текущего состояния (с лимитом).
    const last = s.hist[s.hist.length - 1] ?? null
    const path = search(s.stacks, s.cap, last, 25000)
    if (path && path.length) return path[0]
    // 3) Не нашли - вернуть последнюю книгу назад (так в конце концов придём к началу, а оно на эталонном пути).
    return last ? { from: last.to, to: last.from } : null
  },
}

/** Можно ли сейчас переложить верхнюю книгу (для доски). */
export const canMove = (s: MsState, from: number, to: number) => manuscripts.apply(s, { from, to }) !== null
