// Япония: «Сад камней». Поле гравия с камнями; от входа провести граблями одну борозду через все клетки гравия,
// не заходя дважды и обходя камни. Генерация: гамильтонов путь по всему полю (змейка + перестройки «backbite»),
// концы пути (1–4 клетки) становятся камнями.
import type { Level, PuzzleLogic, Rng, Task } from './types'
import { randInt } from './rng'

export interface GardenState {
  w: number
  h: number
  /** Клетки с камнями. */
  rocks: number[]
  /** Борозда: клетки по порядку, первая - вход. */
  path: number[]
}

const SIZES: [number, number][] = [[4, 4], [4, 5], [5, 5], [5, 6], [6, 7]]
/** Сколько камней: от и до. */
const ROCKS: [number, number][] = [[1, 2], [2, 2], [2, 3], [3, 4], [3, 4]]

export function neighbors(w: number, h: number, i: number): number[] {
  const x = i % w, y = Math.floor(i / w)
  const out: number[] = []
  if (y > 0) out.push(i - w)
  if (x < w - 1) out.push(i + 1)
  if (y < h - 1) out.push(i + w)
  if (x > 0) out.push(i - 1)
  return out
}

/** Гамильтонов путь по всему полю: змейка, потом много случайных «откусываний» (backbite) с обоих концов. */
function hamiltonPath(w: number, h: number, rng: Rng): number[] {
  let path: number[] = []
  for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) path.push(y * w + (y % 2 ? w - 1 - k : k))
  const n = w * h
  for (let it = 0; it < n * 40; it++) {
    if (rng() < 0.5) path.reverse()
    const end = path[n - 1]
    const nb = neighbors(w, h, end).filter((c) => c !== path[n - 2])
    const c = nb[Math.floor(rng() * nb.length)]
    const j = path.indexOf(c)
    // Конец «откусывает» соседа: хвост после него разворачивается.
    path = path.slice(0, j + 1).concat(path.slice(j + 1).reverse())
  }
  return path
}

export const gravelCount = (s: GardenState) => s.w * s.h - s.rocks.length

/** Досчитать борозду до конца перебором (с отсечениями и лимитом); null - не нашлось. */
function complete(s: GardenState, budget = 20000): number[] | null {
  const rock = new Set(s.rocks)
  const used = new Set(s.path)
  const total = gravelCount(s)
  const path = s.path.slice()
  let left = budget
  const free = (c: number) => !rock.has(c) && !used.has(c)
  /** Всё оставшееся связано с головой, и тупиков (клеток с одним выходом) не больше одного. */
  const ok = (head: number) => {
    const rest = total - path.length
    if (rest === 0) return true
    const seen = new Set<number>()
    const stack = neighbors(s.w, s.h, head).filter(free)
    for (const c of stack) seen.add(c)
    let ends = 0
    while (stack.length) {
      const c = stack.pop()!
      const nb = neighbors(s.w, s.h, c)
      const deg = nb.filter((d) => free(d) || d === head).length
      if (deg <= 1) ends++
      for (const d of nb) if (free(d) && !seen.has(d)) { seen.add(d); stack.push(d) }
    }
    return seen.size === rest && ends <= 1
  }
  const go = (): boolean => {
    if (path.length === total) return true
    if (--left < 0) return false
    const head = path[path.length - 1]
    // Порядок Варнсдорфа: сначала клетки, откуда меньше выходов.
    const next = neighbors(s.w, s.h, head)
      .filter(free)
      .map((c) => [c, neighbors(s.w, s.h, c).filter(free).length] as const)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    for (const [c] of next) {
      used.add(c)
      path.push(c)
      if (ok(c) && go()) return true
      path.pop()
      used.delete(c)
    }
    return false
  }
  if (!ok(path[path.length - 1])) return null
  return go() ? path.slice(s.path.length) : null
}

export const garden: PuzzleLogic<GardenState, number> = {
  generate(difficulty, rng, task: Task) {
    const d = Math.max(1, Math.min(5, difficulty)) - 1
    const [w, h] = SIZES[d]
    const path = hamiltonPath(w, h, rng)
    const nRocks = randInt(rng, ROCKS[d][0], ROCKS[d][1])
    // Тело (большой сад) - камни одной группой в конце; Ум и Люди - две группы, у начала и у конца (если камней больше одного).
    const head = task !== 'body' && nRocks > 1 ? randInt(rng, 1, Math.min(nRocks - 1, task === 'people' ? 2 : nRocks - 1)) : 0
    const tail = nRocks - head
    const rocks = [...path.slice(0, head), ...path.slice(path.length - tail)].sort((a, b) => a - b)
    const route = path.slice(head, path.length - tail)
    const start: GardenState = { w, h, rocks, path: [route[0]] }
    const solution = route.slice(1)
    return { start, solution, par: solution.length }
  },
  apply(s, c) {
    const n = s.path.length
    if (n >= 2 && c === s.path[n - 2]) return { ...s, path: s.path.slice(0, -1) }
    if (c < 0 || c >= s.w * s.h || s.rocks.includes(c) || s.path.includes(c)) return null
    if (!neighbors(s.w, s.h, s.path[n - 1]).includes(c)) return null
    return { ...s, path: [...s.path, c] }
  },
  solved(s) {
    return s.path.length === gravelCount(s)
  },
  hint(s, level: Level<GardenState, number>) {
    const ref = [level.start.path[0], ...level.solution]
    const n = s.path.length
    if (s.path.every((c, i) => ref[i] === c)) return n < ref.length ? ref[n] : null
    // Своя дорога: если её ещё можно довести до конца - следующий шаг, иначе шаг назад.
    const rest = complete(s)
    if (rest && rest.length) return rest[0]
    return n >= 2 ? s.path[n - 2] : null
  },
}
