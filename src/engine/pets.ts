// Домашние питомцы: кто бывал в каком краю и эпохе, сколько живёт, как зовут.
// Таблица – src/content/pets.json (виды, срок жизни, края, сословия, цена, имена по краям).
import { ERA_META } from '../content'
import PETS from '../content/pets.json'
import { int, pick, weighted } from './rng'
import type { Animal, GameState } from './types'

export interface PetDef {
  id: string
  /** Срок жизни в годах [от, до]. */
  life: [number, number]
  /** Стили краёв (scene.style), где такого питомца держали. */
  styles: string[]
  /** Где держали редко (вес меньше). */
  rare?: string[]
  /** Только для этих сословий (везде или по стилю края). */
  classes?: string[]
  classes_by_style?: Record<string, string[]>
  /** Только в эти годы по стилю края (золотые рыбки: Китай с 960, Япония с 1502). */
  years?: Record<string, [number, number]>
  weight: number
  price: number
  /** Питомец ребёнка (мышь, сверчок). */
  owner?: 'child'
}

const DEFS = PETS.pets as PetDef[]
const BY_ID = new Map(DEFS.map((d) => [d.id, d]))
const NAMES = PETS.names as Record<string, Record<string, { id: string; ru: string; en: string }[]>>

/** Все имена питомцев (для словаря имён в i18n). */
export const PET_NAMES = Object.values(NAMES).flatMap((byKind) => Object.values(byKind).flat())

/** Не больше стольких питомцев сразу. */
export const MAX_PETS = 3

export function isPet(kind: string): boolean {
  return BY_ID.has(kind)
}

export function petDef(kind: string): PetDef | undefined {
  return BY_ID.get(kind)
}

export function styleOf(state: GameState): string {
  return ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.scene?.style ?? ''
}

/** Мог ли такой питомец быть у героя: край, годы, сословие. */
export function petPossible(state: GameState, kind: string): boolean {
  const d = BY_ID.get(kind)
  if (!d) return false
  const style = styleOf(state)
  if (!d.styles.includes(style)) return false
  const years = d.years?.[style]
  if (years && (state.year < years[0] || state.year > years[1])) return false
  const classes = d.classes_by_style?.[style] ?? d.classes
  if (classes && !classes.includes(state.hero.cls)) return false
  return state.hero.cls !== 'slave' || d.price === 0
}

export function pets(state: GameState): Animal[] {
  return (state.hero.animals ?? []).filter((a) => isPet(a.kind))
}

/** Случайный питомец, какого здесь могли держать (и какого ещё нет). */
export function randomPet(state: GameState, only?: string[]): string | undefined {
  const owned = new Set(pets(state).map((p) => p.kind))
  const style = styleOf(state)
  const list = DEFS.filter((d) => (!only || only.includes(d.id)) && !owned.has(d.id) && petPossible(state, d.id))
  return weighted(state, list, (d) => d.weight * (d.rare?.includes(style) ? 0.3 : 1))?.id
}

/** Новый питомец: возраст (детёныш или взрослый), срок жизни по виду, имя по краю. */
export function makePet(state: GameState, kind: string, owner?: string): Animal {
  const d = BY_ID.get(kind)!
  // Короткоживущих (мышь, сверчок) берут молодыми; остальных – детёнышем или уже взрослыми.
  const young = d.life[1] <= 5 || int(state, 0, 2) > 0
  const born = state.year - (young ? 0 : int(state, 1, Math.max(1, Math.floor(d.life[0] / 3))))
  const dies = born + int(state, d.life[0], d.life[1])
  const names = NAMES[styleOf(state)]?.[kind] ?? []
  const taken = new Set(pets(state).map((p) => p.name))
  const free = names.filter((n) => !taken.has(n.id))
  return { kind, since: state.year, born, dies, name: free.length ? pick(state, free).id : undefined, owner }
}
