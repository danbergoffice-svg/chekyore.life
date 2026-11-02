// Китай (Сун): «Столики для гостей». Силуэт зала из клеток надо целиком заставить столиками-прямоугольниками
// (1×2, 1×3, 2×2) без щелей и наложений. Генерация: фигура растёт из столиков, приставленных к уже лежащим.
import type { Level, PuzzleLogic, Rng, Task } from './types'
import { randInt, shuffle } from './rng'

/** Где стоит столик: левый верхний угол и поворот (1 - повернули на четверть: ширина и высота меняются). */
export interface Place {
  x: number
  y: number
  rot: number
}

export interface TablesState {
  w: number
  h: number
  /** Клетки зала: 1 - пол под столики, 0 - вне зала. */
  cells: number[]
  /** Столики в лотке: [ширина, высота] без поворота. */
  pieces: [number, number][]
  /** Куда поставлен каждый столик (null - ещё в лотке). */
  placed: (Place | null)[]
}

export type TablesMove = { piece: number; x: number; y: number; rot: number } | { remove: number }

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const dims = (p: [number, number], rot: number): [number, number] => (rot % 2 ? [p[1], p[0]] : [p[0], p[1]])
export const rectOf = (s: TablesState, i: number): Rect | null => {
  const pl = s.placed[i]
  if (!pl) return null
  const [w, h] = dims(s.pieces[i], pl.rot)
  return { x: pl.x, y: pl.y, w, h }
}
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Какой столик стоит на клетке (индекс столика, -1 - пусто). */
export function coverMap(s: TablesState): number[] {
  const m = new Array(s.w * s.h).fill(-1)
  s.placed.forEach((_, i) => {
    const r = rectOf(s, i)
    if (!r) return
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) m[y * s.w + x] = i
  })
  return m
}

const SHAPES: [number, number][] = [
  [2, 1],
  [3, 1],
  [2, 2],
]
const COUNT = [3, 4, 5, 6, 8]
/** Рамка, в которой растёт фигура: у каждого задания свой зал (работникам - длинный, учителю - квадратный, чиновнику - высокий). */
const BOX: Record<Task, [number, number][]> = {
  body: [[4, 3], [5, 3], [6, 4], [6, 4], [7, 5]],
  mind: [[4, 4], [4, 4], [5, 5], [5, 5], [6, 6]],
  people: [[3, 4], [4, 5], [4, 5], [5, 6], [5, 7]],
}
/** Какие столики чаще: работникам - длинные лавки, учителю - поровну, чиновнику - квадратные. */
const WEIGHTS: Record<Task, number[]> = { body: [2, 3, 1], mind: [2, 2, 2], people: [2, 1, 3] }

function weighted(rng: Rng, ws: number[]): number {
  let t = rng() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ws.length; i++) if ((t -= ws[i]) < 0) return i
  return ws.length - 1
}

/** Вырастить фигуру из n прямоугольников внутри рамки bw×bh; null - не вышло. */
function grow(rng: Rng, n: number, bw: number, bh: number, ws: number[]): Rect[] | null {
  const occ = new Array(bw * bh).fill(false)
  const rects: Rect[] = []
  const put = (r: Rect) => {
    rects.push(r)
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) occ[y * bw + x] = true
  }
  const fits = (r: Rect) => {
    if (r.x < 0 || r.y < 0 || r.x + r.w > bw || r.y + r.h > bh) return false
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (occ[y * bw + x]) return false
    return true
  }
  /** Сколько сторон клеток прямоугольника касаются уже лежащих. */
  const contact = (r: Rect) => {
    let c = 0
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < bw && y < bh && occ[y * bw + x]
    for (let x = r.x; x < r.x + r.w; x++) c += +at(x, r.y - 1) + +at(x, r.y + r.h)
    for (let y = r.y; y < r.y + r.h; y++) c += +at(r.x - 1, y) + +at(r.x + r.w, y)
    return c
  }
  for (let k = 0; k < n; k++) {
    let done = false
    for (let tries = 0; tries < 6 && !done; tries++) {
      const [sw, sh] = dims(SHAPES[weighted(rng, ws)], randInt(rng, 0, 1))
      const cand: { r: Rect; c: number }[] = []
      for (let y = 0; y + sh <= bh; y++)
        for (let x = 0; x + sw <= bw; x++) {
          const r = { x, y, w: sw, h: sh }
          if (!fits(r)) continue
          const c = k === 0 ? 1 : contact(r)
          if (c > 0) cand.push({ r, c })
        }
      if (!cand.length) continue
      // Плотнее прижатые - чаще: фигура выходит не змейкой, а залом.
      put(cand[weighted(rng, cand.map((e) => e.c * e.c))].r)
      done = true
    }
    if (!done) return null
  }
  return rects
}

/** Достроить расстановку перебором (первая пустая клетка - всегда левый верхний угол нового столика). */
function complete(s: TablesState): TablesMove[] | null {
  const cover = coverMap(s)
  const free = s.placed.map((p) => p === null)
  const out: TablesMove[] = []
  const fits = (x: number, y: number, w: number, h: number) => {
    if (x + w > s.w || y + h > s.h) return false
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!s.cells[yy * s.w + xx] || cover[yy * s.w + xx] >= 0) return false
    return true
  }
  const mark = (x: number, y: number, w: number, h: number, v: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) cover[yy * s.w + xx] = v
  }
  const go = (): boolean => {
    let c = -1
    for (let i = 0; i < cover.length; i++) if (s.cells[i] && cover[i] < 0) { c = i; break }
    if (c < 0) return true
    const x = c % s.w, y = Math.floor(c / s.w)
    const tried = new Set<string>()
    for (let i = 0; i < s.pieces.length; i++) {
      if (!free[i]) continue
      for (const rot of s.pieces[i][0] === s.pieces[i][1] ? [0] : [0, 1]) {
        const [w, h] = dims(s.pieces[i], rot)
        const key = `${w}x${h}`
        if (tried.has(key)) continue
        tried.add(key)
        if (!fits(x, y, w, h)) continue
        mark(x, y, w, h, i)
        free[i] = false
        out.push({ piece: i, x, y, rot })
        if (go()) return true
        out.pop()
        free[i] = true
        mark(x, y, w, h, -1)
      }
    }
    return false
  }
  return go() ? out : null
}

export const tables: PuzzleLogic<TablesState, TablesMove> = {
  generate(difficulty, rng, task) {
    const d = Math.max(1, Math.min(5, difficulty)) - 1
    const n = COUNT[d]
    const [bw, bh] = BOX[task][d]
    for (let attempt = 0; ; attempt++) {
      const rects = grow(rng, n, attempt > 40 ? bw + 1 : bw, attempt > 40 ? bh + 1 : bh, WEIGHTS[task])
      if (!rects) continue
      const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y))
      const w = Math.max(...rects.map((r) => r.x + r.w)) - x0
      const h = Math.max(...rects.map((r) => r.y + r.h)) - y0
      const cells = new Array(w * h).fill(0)
      for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[(y - y0) * w + x - x0] = 1
      // Почти ровный прямоугольник - слишком просто (кроме самого первого уровня).
      if (d > 0 && attempt < 40 && cells.filter((c) => c).length > cells.length * 0.9) continue
      // В лотке - те же столики в случайном порядке и случайно повёрнутые (поворот в лотке не важен).
      const order = shuffle(rng, rects.map((_, i) => i))
      const pieces: [number, number][] = []
      const refs: { piece: number; r: Rect }[] = []
      order.forEach((ri, pi) => {
        const r = rects[ri]
        const flip = r.w !== r.h && rng() < 0.5
        pieces.push(flip ? [r.h, r.w] : [r.w, r.h])
        refs.push({ piece: pi, r: { x: r.x - x0, y: r.y - y0, w: r.w, h: r.h } })
      })
      // Эталон - по порядку чтения: сверху вниз, слева направо.
      refs.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x)
      const solution: TablesMove[] = refs.map(({ piece, r }) => ({ piece, x: r.x, y: r.y, rot: pieces[piece][0] === r.w ? 0 : 1 }))
      const start: TablesState = { w, h, cells, pieces, placed: pieces.map(() => null) }
      return { start, solution, par: solution.length }
    }
  },
  apply(s, m) {
    if ('remove' in m) {
      if (!s.placed[m.remove]) return null
      const placed = s.placed.slice()
      placed[m.remove] = null
      return { ...s, placed }
    }
    const { piece, x, y, rot } = m
    if (piece < 0 || piece >= s.pieces.length || (rot !== 0 && rot !== 1)) return null
    const cur = s.placed[piece]
    if (cur && cur.x === x && cur.y === y && cur.rot === rot) return null
    const [w, h] = dims(s.pieces[piece], rot)
    if (x < 0 || y < 0 || x + w > s.w || y + h > s.h) return null
    const cover = coverMap(s)
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const i = yy * s.w + xx
        if (!s.cells[i] || (cover[i] >= 0 && cover[i] !== piece)) return null
      }
    const placed = s.placed.slice()
    placed[piece] = { x, y, rot }
    return { ...s, placed }
  },
  solved(s) {
    const cover = coverMap(s)
    return s.cells.every((c, i) => !c || cover[i] >= 0)
  },
  hint(s, level: Level<TablesState, TablesMove>) {
    const refRects: Rect[] = []
    for (const m of level.solution) {
      if ('remove' in m) continue
      const [w, h] = dims(level.start.pieces[m.piece], m.rot)
      refRects.push({ x: m.x, y: m.y, w, h })
    }
    const mine = s.placed.map((_, i) => rectOf(s, i))
    const wrong = mine.findIndex((r) => r && !refRects.some((q) => sameRect(q, r)))
    if (wrong < 0) {
      // Всё стоящее - как в эталоне: поставить следующий столик эталона (любой подходящий из лотка).
      for (const q of refRects) {
        if (mine.some((r) => r && sameRect(r, q))) continue
        for (let i = 0; i < s.pieces.length; i++) {
          if (s.placed[i]) continue
          for (const rot of [0, 1]) {
            const [w, h] = dims(s.pieces[i], rot)
            if (w === q.w && h === q.h) return { piece: i, x: q.x, y: q.y, rot }
          }
        }
      }
      return null
    }
    // Стоит не как в эталоне: если всё равно можно достроить - достраиваем, иначе этот столик мешает - убрать.
    const rest = complete(s)
    if (rest && rest.length) return rest[0]
    return { remove: wrong }
  },
}

/** Для доски: куда поставить столик, чтобы он накрыл клетку (сначала - угол в этой клетке). */
export function placeAt(s: TablesState, piece: number, rot: number, cx: number, cy: number): TablesMove | null {
  const [w, h] = dims(s.pieces[piece], rot)
  const opts: [number, number][] = [[cx, cy]]
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (dx || dy) opts.push([cx - dx, cy - dy])
  for (const [x, y] of opts) {
    const m = { piece, x, y, rot }
    if (tables.apply(s, m)) return m
  }
  return null
}
