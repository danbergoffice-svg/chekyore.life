// Воспроизводимый генератор случайных чисел (mulberry32). Состояние — одно 32-битное число,
// оно хранится в сохранении, поэтому после загрузки жизнь продолжается так же, как шла бы без неё.

export interface RngHolder {
  rng: number
}

export function next(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0
  let t = h.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function chance(h: RngHolder, p: number): boolean {
  return next(h) < p
}

/** Целое в диапазоне [min, max] включительно. */
export function int(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(next(h) * (max - min + 1))
}

export function pick<T>(h: RngHolder, items: readonly T[]): T {
  return items[Math.floor(next(h) * items.length)]
}

export function weighted<T>(h: RngHolder, items: readonly T[], weight: (item: T) => number): T | undefined {
  let total = 0
  for (const item of items) total += Math.max(0, weight(item))
  if (total <= 0) return undefined
  let r = next(h) * total
  for (const item of items) {
    r -= Math.max(0, weight(item))
    if (r < 0) return item
  }
  return items[items.length - 1]
}

/** Примерно нормальное распределение (сумма трёх равномерных). */
export function bell(h: RngHolder, mean: number, spread: number): number {
  return mean + ((next(h) + next(h) + next(h)) / 3 - 0.5) * 2 * spread
}

export function newSeed(): number {
  return (Math.random() * 4294967296) >>> 0
}
