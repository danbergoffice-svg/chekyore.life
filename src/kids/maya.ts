// Майя: «Числа майя». Точка - 1, черта - 5, ракушка - 0; ярус выше считает двадцатки.
// В каждой корзине табличка с числом: выложить его фишками. Запас фишек ровно на правильную запись всех чисел.
import type { PuzzleLogic } from './types'
import { randInt, shuffle } from './rng'

export type Chip = 'dot' | 'bar' | 'shell'
export const CHIPS: Chip[] = ['dot', 'bar', 'shell']
export type Pile = Record<Chip, number>

export interface MayaState {
  /** Числа на табличках корзин. */
  nums: number[]
  /** Ярусов в корзине: 1 (числа до 19) или 2 (20–99). */
  tiers: number
  /** bins[корзина][ярус]: ярус 0 - нижний (единицы), 1 - верхний (двадцатки). */
  bins: Pile[][]
  /** Запас фишек. */
  supply: Pile
}

/** Ход: положить (add) или снять фишку k в ярусе t корзины b. */
export interface MayaMove {
  b: number
  t: number
  k: Chip
  add: boolean
}

/** Почему ход нельзя - для подсказки на доске. */
export type MayaWhy = 'bad' | 'empty' | 'none' | 'shell' | 'onshell' | 'dots' | 'bars'

const CONF = [
  { count: 2, min: 1, max: 10, tiers: 1 },
  { count: 3, min: 1, max: 12, tiers: 1 },
  { count: 3, min: 6, max: 19, tiers: 1 },
  { count: 2, min: 20, max: 99, tiers: 2 },
  { count: 3, min: 21, max: 99, tiers: 2 },
]

/** Не меньше стольких фишек на уровне - чтобы не было слишком просто. */
const MIN_CHIPS = [4, 7, 9, 9, 13]

const pile = (dot = 0, bar = 0, shell = 0): Pile => ({ dot, bar, shell })
const total = (p: Pile) => p.dot + p.bar + p.shell

/** Как правильно записать ярус t числа n. */
export function target(n: number, t: number): Pile {
  const d = t === 0 ? n % 20 : Math.floor(n / 20)
  return d === 0 ? pile(0, 0, 1) : pile(d % 5, Math.floor(d / 5), 0)
}

/** Сколько значит ярус (ракушка - 0). */
export const tierValue = (p: Pile) => p.dot + 5 * p.bar

const sameTier = (a: Pile, b: Pile) => a.dot === b.dot && a.bar === b.bar && a.shell === b.shell
export const basketOk = (s: MayaState, b: number) => s.bins[b].every((p, t) => sameTier(p, target(s.nums[b], t)))

/** Проверка хода: null - можно, иначе причина. */
export function mayaWhy(s: MayaState, m: MayaMove): MayaWhy | null {
  if (!m || !CHIPS.includes(m.k) || m.b < 0 || m.b >= s.bins.length || m.t < 0 || m.t >= s.tiers) return 'bad'
  const p = s.bins[m.b][m.t]
  if (!m.add) return p[m.k] > 0 ? null : 'none'
  if (s.supply[m.k] <= 0) return 'empty'
  if (m.k === 'shell') return total(p) > 0 ? 'shell' : null
  if (p.shell > 0) return 'onshell'
  if (m.k === 'dot' && p.dot >= 4) return 'dots'
  if (m.k === 'bar' && p.bar >= 3) return 'bars'
  return null
}

export const maya: PuzzleLogic<MayaState, MayaMove> = {
  generate(difficulty, rng) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty))) - 1
    const { count, min, max, tiers } = CONF[d]
    let nums: number[] = []
    for (let attempt = 0; attempt < 100; attempt++) {
      nums = []
      // На ур. 5 одно число - ровно двадцатки (внизу ракушка), на ур. 4 - через раз.
      if (d === 4 || (d === 3 && rng() < 0.5)) nums.push(20 * randInt(rng, 1, 4))
      while (nums.length < count) {
        const x = randInt(rng, min, max)
        if (!nums.includes(x)) nums.push(x)
      }
      // Хотя бы одно число с чертой (и на ур. 3 - с двумя чертами).
      const lowMax = Math.max(...nums.map((n) => (tiers === 1 ? n : n % 20)))
      const chips = nums.reduce((a, n) => a + Array.from({ length: tiers }, (_, t) => total(target(n, t))).reduce((x, y) => x + y, 0), 0)
      if (lowMax >= (d === 2 ? 10 : 5) && chips >= MIN_CHIPS[d]) break
    }
    nums = shuffle(rng, nums)
    const supply = pile()
    const solution: MayaMove[] = []
    nums.forEach((n, b) => {
      for (let t = tiers - 1; t >= 0; t--) {
        const want = target(n, t)
        for (const k of CHIPS) {
          supply[k] += want[k]
          for (let j = 0; j < want[k]; j++) solution.push({ b, t, k, add: true })
        }
      }
    })
    const bins = nums.map(() => Array.from({ length: tiers }, () => pile()))
    return { start: { nums, tiers, bins, supply }, solution, par: solution.length }
  },
  apply(s, m) {
    if (mayaWhy(s, m)) return null
    const dk = m.add ? 1 : -1
    const bins = s.bins.map((tiers, b) => (b === m.b ? tiers.map((p, t) => (t === m.t ? { ...p, [m.k]: p[m.k] + dk } : p)) : tiers))
    return { ...s, bins, supply: { ...s.supply, [m.k]: s.supply[m.k] - dk } }
  },
  solved(s) {
    return CHIPS.every((k) => s.supply[k] >= 0) && s.nums.every((_, b) => basketOk(s, b))
  },
  hint(s) {
    // Первая неверная корзина: снять лишнюю фишку или добавить нужную.
    for (let b = 0; b < s.nums.length; b++) {
      if (basketOk(s, b)) continue
      const order = Array.from({ length: s.tiers }, (_, i) => s.tiers - 1 - i)
      for (const t of order) {
        const p = s.bins[b][t], want = target(s.nums[b], t)
        for (const k of CHIPS) if (p[k] > want[k]) return { b, t, k, add: false }
      }
      for (const t of order) {
        const p = s.bins[b][t], want = target(s.nums[b], t)
        for (const k of CHIPS) {
          if (p[k] >= want[k]) continue
          if (s.supply[k] > 0) return { b, t, k, add: true }
          // Таких фишек в запасе нет - значит, лишняя лежит в другой корзине: снять её.
          for (let b2 = 0; b2 < s.nums.length; b2++)
            for (let t2 = 0; t2 < s.tiers; t2++) if (s.bins[b2][t2][k] > target(s.nums[b2], t2)[k]) return { b: b2, t: t2, k, add: false }
        }
      }
    }
    return null
  },
}
