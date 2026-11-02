// Византия: «Гавань Золотого Рога». Корабли длиной 2–3 стоят вдоль или поперёк и ходят только вдоль своей длины.
// Пурпурный корабль с грузом (корабль 0, длина 2) в строке выхода должен дойти до причала у правого края.
// Генерация: случайная расстановка → вся компонента состояний поиском в ширину → расстояния от решённых состояний →
// берём состояние с оптимумом в нужном диапазоне (так быстро получаются и трудные уровни).
import type { Level, PuzzleLogic, Rng } from './types'
import { bfs, randInt } from './rng'

export interface Ship {
  x: number
  y: number
  len: number
  /** Стоит поперёк (вертикально). */
  v: boolean
}

export interface HarborState {
  n: number
  /** Строка выхода (причал справа). */
  exit: number
  ships: Ship[]
}

/** Ход: корабль ship встаёт так, что его левый (верхний) конец - в клетке to на своей линии. */
export interface HarborMove {
  ship: number
  to: number
}

/** Оптимум по уровням (как в docs/KIDS.md). */
const RANGE: [number, number][] = [[3, 5], [5, 8], [8, 12], [12, 16], [15, 22]]
/** Размер поля и число кораблей (вместе с пурпурным). */
const SETUP: { n: number; ships: [number, number] }[] = [
  { n: 5, ships: [4, 6] },
  { n: 5, ships: [6, 8] },
  { n: 6, ships: [9, 12] },
  { n: 6, ships: [12, 15] },
  { n: 6, ships: [13, 16] },
]
const CAP = 4000

// --- Быстрое ядро: позиции кораблей - массив чисел, состояние - число (позиции по основанию n).

interface Core {
  n: number
  len: number[]
  v: boolean[]
  /** Неподвижная координата: y для лежащих вдоль, x для стоящих поперёк. */
  line: number[]
}

const coreOf = (s: HarborState): Core => ({
  n: s.n,
  len: s.ships.map((sh) => sh.len),
  v: s.ships.map((sh) => sh.v),
  line: s.ships.map((sh) => (sh.v ? sh.x : sh.y)),
})
const posOf = (s: HarborState) => s.ships.map((sh) => (sh.v ? sh.y : sh.x))

function encode(pos: number[], n: number): number {
  let k = 0
  for (let i = pos.length - 1; i >= 0; i--) k = k * n + pos[i]
  return k
}
function decode(k: number, n: number, out: number[]) {
  for (let i = 0; i < out.length; i++) {
    out[i] = k % n
    k = Math.floor(k / n)
  }
}

const isSolved = (c: Core, pos: number[]) => pos[0] === c.n - c.len[0]

/** Вся компонента от позиции: ключи, рёбра (с ходами) и расстояние до ближайшего решённого. */
interface Graph {
  keys: Float64Array
  off: Int32Array
  to: Int32Array
  mv: Int32Array
  dist: Int16Array
  /** Ключ → номер состояния (строится, когда нужен для подсказки). */
  index?: Map<number, number>
}

// Общие буферы поиска (генерация перебирает сотни расстановок - без лишних выделений памяти).
const HBITS = 14
const HSIZE = 1 << HBITS
const MAXE = 96
let buf: { hkey: Float64Array; hval: Int32Array; hstamp: Int32Array; stamp: number; keys: Float64Array; off: Int32Array; to: Int32Array; mv: Int32Array } | null = null

function hashOf(k: number): number {
  const lo = k % 16777216
  const hi = Math.floor(k / 16777216)
  return (Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi + 0x7f4a7c15, 0x85ebca77)) >>> (32 - HBITS)
}

/** Поиск в ширину по всей компоненте; null - состояний больше CAP. */
function explore(c: Core, start: number[]): Graph | null {
  if (!buf) {
    const m = CAP + 200
    buf = { hkey: new Float64Array(HSIZE), hval: new Int32Array(HSIZE), hstamp: new Int32Array(HSIZE), stamp: 0, keys: new Float64Array(m), off: new Int32Array(m + 1), to: new Int32Array(m * MAXE), mv: new Int32Array(m * MAXE) }
  }
  const B = buf
  const st = ++B.stamp
  const n = c.n
  const k = c.len.length
  const pow: number[] = []
  const base: number[] = []
  const stride: number[] = []
  for (let i = 0, p = 1; i < k; i++, p *= n) {
    pow.push(p)
    stride.push(c.v[i] ? n : 1)
    base.push(c.v[i] ? c.line[i] : c.line[i] * n)
  }
  const pos = start.slice()
  const grid = new Int8Array(n * n)
  // Найти или добавить ключ; вернуть номер состояния.
  let count = 0
  const find = (key: number): number => {
    let h = hashOf(key)
    for (;;) {
      if (B.hstamp[h] !== st) {
        B.hstamp[h] = st
        B.hkey[h] = key
        B.hval[h] = count
        B.keys[count] = key
        return count++
      }
      if (B.hkey[h] === key) return B.hval[h]
      h = (h + 1) & (HSIZE - 1)
    }
  }
  let k0 = 0
  for (let i = k - 1; i >= 0; i--) k0 = k0 * n + pos[i]
  find(k0)
  let e = 0
  const solved: number[] = []
  for (let i = 0; i < count; i++) {
    const key = B.keys[i]
    let r = key
    for (let j = 0; j < k; j++) {
      pos[j] = r % n
      r = Math.floor(r / n)
    }
    if (pos[0] === n - c.len[0]) solved.push(i)
    B.off[i] = e
    grid.fill(0)
    for (let j = 0; j < k; j++) for (let t = 0; t < c.len[j]; t++) grid[base[j] + (pos[j] + t) * stride[j]] = 1
    for (let j = 0; j < k; j++) {
      const p = pos[j]
      for (let t = p - 1; t >= 0 && !grid[base[j] + t * stride[j]]; t--) {
        B.to[e] = find(key + (t - p) * pow[j])
        B.mv[e++] = j * 16 + t
      }
      for (let t = p + c.len[j]; t < n && !grid[base[j] + t * stride[j]]; t++) {
        const q = t - c.len[j] + 1
        B.to[e] = find(key + (q - p) * pow[j])
        B.mv[e++] = j * 16 + q
      }
    }
    if (count > CAP) return null
  }
  B.off[count] = e
  const off = B.off.slice(0, count + 1)
  const to = B.to.slice(0, e)
  const dist = new Int16Array(count).fill(-1)
  const queue = new Int32Array(count)
  let qn = 0
  for (const i of solved) {
    dist[i] = 0
    queue[qn++] = i
  }
  for (let q = 0; q < qn; q++) {
    const i = queue[q]
    for (let x = off[i]; x < off[i + 1]; x++) {
      const j = to[x]
      if (dist[j] < 0) {
        dist[j] = dist[i] + 1
        queue[qn++] = j
      }
    }
  }
  return { keys: B.keys.slice(0, count), off, to, mv: B.mv.slice(0, e), dist }
}

/** Первый ход к решению из состояния i графа (по убыванию расстояния). */
function stepFrom(g: Graph, i: number): { move: HarborMove; next: number } | null {
  const d = g.dist[i]
  if (d <= 0) return null
  for (let e = g.off[i]; e < g.off[i + 1]; e++) {
    if (g.dist[g.to[e]] === d - 1) return { move: { ship: g.mv[e] >> 4, to: g.mv[e] & 15 }, next: g.to[e] }
  }
  return null
}

/** Граф уровня - для мгновенных подсказок (ключ - начальное состояние уровня). */
const GRAPHS = new WeakMap<HarborState, Graph>()

/** Дополнить расстановку случайными кораблями до count (вдоль в строке выхода - нельзя: там не разминуться). */
function addShips(n: number, exit: number, base: Ship[], count: number, rng: Rng): Ship[] {
  const grid = new Uint8Array(n * n)
  const ships: Ship[] = []
  const put = (sh: Ship) => {
    for (let t = 0; t < sh.len; t++) grid[sh.v ? (sh.y + t) * n + sh.x : sh.y * n + sh.x + t] = 1
    ships.push(sh)
  }
  base.forEach(put)
  for (let tries = 0; ships.length < count && tries < 200; tries++) {
    const v = rng() < 0.55
    const len = rng() < 0.3 ? 3 : 2
    const x = randInt(rng, 0, v ? n - 1 : n - len)
    const y = randInt(rng, 0, v ? n - len : n - 1)
    if (!v && y === exit) continue
    let free = true
    for (let t = 0; t < len && free; t++) if (grid[v ? (y + t) * n + x : y * n + x + t]) free = false
    if (free) put({ x, y, len, v })
  }
  return ships
}

const withPos = (s: HarborState, pos: number[]): HarborState => ({
  ...s,
  ships: s.ships.map((sh, i) => (sh.v ? { ...sh, y: pos[i] } : { ...sh, x: pos[i] })),
})

function occupied(s: HarborState, skip: number): Set<number> {
  const set = new Set<number>()
  s.ships.forEach((sh, i) => {
    if (i === skip) return
    for (let t = 0; t < sh.len; t++) set.add(sh.v ? (sh.y + t) * s.n + sh.x : sh.y * s.n + sh.x + t)
  })
  return set
}

/** Куда может встать корабль (позиции его левого/верхнего конца) - для доски. */
export function reachable(s: HarborState, ship: number): number[] {
  const sh = s.ships[ship]
  const busy = occupied(s, ship)
  const cell = (t: number) => (sh.v ? t * s.n + sh.x : sh.y * s.n + t)
  const p = sh.v ? sh.y : sh.x
  const out: number[] = []
  for (let t = p - 1; t >= 0 && !busy.has(cell(t)); t--) out.push(t)
  for (let t = p + sh.len; t < s.n && !busy.has(cell(t)); t++) out.push(t - sh.len + 1)
  return out
}

function allMoves(s: HarborState): HarborMove[] {
  const out: HarborMove[] = []
  s.ships.forEach((_, i) => reachable(s, i).forEach((to) => out.push({ ship: i, to })))
  return out
}

export const harbor: PuzzleLogic<HarborState, HarborMove> = {
  generate(difficulty, rng) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
    const { n, ships: [cMin, cMax] } = SETUP[d]
    const [lo, hi] = RANGE[d]
    // Подъём на гору: случайная расстановка, потом мелкие перестройки (убрать корабль, поставить новые), пока самое
    // дальнее от решения состояние не станет достаточно далёким. Всё от rng - детерминировано.
    let cur: { s: HarborState; g: Graph; max: number } | null = null
    let best: { s: HarborState; g: Graph; max: number } | null = null
    for (let attempt = 0; attempt < 700 && !(best && best.max >= lo); attempt++) {
      let s0: HarborState
      if (!cur || attempt % 50 === 0) {
        cur = null
        const exit = randInt(rng, 1, n - 2)
        s0 = { n, exit, ships: addShips(n, exit, [{ x: randInt(rng, 0, n - 3), y: exit, len: 2, v: false }], randInt(rng, cMin, cMax), rng) }
      } else {
        const ships = cur.s.ships.slice()
        const drop = randInt(rng, 1, 2)
        for (let k = 0; k < drop && ships.length > 2; k++) ships.splice(randInt(rng, 1, ships.length - 1), 1)
        s0 = { ...cur.s, ships: addShips(n, cur.s.exit, ships, Math.min(cMax, ships.length + randInt(rng, 1, 2)), rng) }
      }
      const g = explore(coreOf(s0), posOf(s0))
      if (!g) continue
      let max = 0
      for (let i = 0; i < g.dist.length; i++) if (g.dist[i] > max) max = g.dist[i]
      if (!cur || max >= cur.max) cur = { s: s0, g, max }
      if (!best || cur.max > best.max) best = cur
    }
    // Нужное расстояние: случайное в диапазоне (не больше достижимого), состояние - случайное с таким расстоянием.
    const { s: s0, g, max } = best!
    const top = Math.min(hi, max)
    const want = top >= lo ? randInt(rng, lo, top) : top
    const cands: number[] = []
    for (let i = 0; i < g.dist.length; i++) if (g.dist[i] === want) cands.push(i)
    const i = cands[Math.floor(rng() * cands.length)]
    const pos = posOf(s0)
    decode(g.keys[i], n, pos)
    const start = withPos(s0, pos)
    const solution: HarborMove[] = []
    for (let cur = i; ; ) {
      const st = stepFrom(g, cur)
      if (!st) break
      solution.push(st.move)
      cur = st.next
    }
    GRAPHS.set(start, g)
    return { start, solution, par: solution.length }
  },
  apply(s, m) {
    const sh = s.ships[m?.ship]
    if (!sh || !Number.isInteger(m.to)) return null
    if (!reachable(s, m.ship).includes(m.to)) return null
    return { ...s, ships: s.ships.map((x, i) => (i === m.ship ? (x.v ? { ...x, y: m.to } : { ...x, x: m.to }) : x)) }
  },
  solved(s) {
    const sh = s.ships[0]
    return sh.x + sh.len === s.n
  },
  hint(s, level: Level<HarborState, HarborMove>) {
    if (harbor.solved(s)) return null
    // Быстро - по графу уровня (все состояния уже посчитаны), иначе - поиск в ширину из текущего.
    const g = GRAPHS.get(level.start)
    if (g) {
      if (!g.index) g.index = new Map(Array.from(g.keys, (key, j) => [key, j]))
      const i = g.index.get(encode(posOf(s), s.n))
      if (i !== undefined) {
        const st = stepFrom(g, i)
        if (st) return st.move
      }
    }
    const path = bfs(s, (x) => posOf(x).join(','), allMoves, harbor.apply, harbor.solved, 200000)
    return path && path.length ? path[0] : null
  },
}
