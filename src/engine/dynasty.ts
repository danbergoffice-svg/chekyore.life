// Род как целое (просьба владельца 09.11): имя рода и герб - после двух прожитых жизней; цель рода - после первой,
// исходя из того, что оставил герой (сословие, богатство, дети, имущество, страны); выбор наследника с последствиями.
import HOUSES from '../content/houses.json'
import { cleanArms, legacyArms } from './arms'
import type { ArmsSpec } from './arms'
import { familyMeasure } from './chronicle'
import type { EraDef, FamilyGoal, GameState, LifeSummary, Npc } from './types'

export const HOUSE_IDS = HOUSES.houses.map((h) => h.id)

/** Можно дать роду имя: прожиты две жизни, имени ещё нет. */
export const canNameHouse = (state: GameState) => !state.family.house && state.family.lives.length >= 2

export function setHouse(state: GameState, id: string): boolean {
  const arms = legacyArms(id)
  return !!arms && setArms(state, arms)
}

/** Утвердить герб из конструктора (один раз): house - знак (для имени «Дом …» и метки «род назван»). */
export function setArms(state: GameState, spec: ArmsSpec): boolean {
  const arms = cleanArms(spec)
  if (!arms || state.family.house) return false
  state.family = { ...state.family, house: arms.charge, arms }
  return true
}

const RANK = ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']

/** Цели рода, которые подходят по первой жизни (три, по порядку важности). */
export function familyGoalOffers(first: LifeSummary, era: EraDef): FamilyGoal[] {
  const out: FamilyGoal[] = []
  const add = (id: string, kind: string, target: number) => out.push({ id, kind, target, since: first.generation + 1 })
  const rank = RANK.indexOf(first.cls)
  const top = RANK.filter((c) => era.classes.some((x) => x.id === c)).length - 1
  if (rank >= 0 && rank < top) add('rise', 'rank', Math.min(top, rank + 2))
  const wealth = familyMeasure('wealth', [first])
  add('wealth', 'wealth', Math.max(2000, Math.round((wealth * 3) / 100) * 100))
  if ((first.estateSnapshot?.assets.length ?? 0) > 0) add('heirloom', 'asset_generations', 3)
  if (first.children >= 2) add('big', 'descendants', Math.max(20, first.children * 4))
  add('line', 'generations', 5)
  add('learned', 'educated', 3)
  add('wanderers', 'countries', Math.max(2, (first.erasLived?.length ?? 1) + 1))
  return out.slice(0, 3)
}

export function setFamilyGoal(state: GameState, goal: FamilyGoal): void {
  state.family = { ...state.family, goal: { ...goal } }
}

/** Сколько уже есть по цели рода (по прожитым жизням рода). */
export function familyGoalProgress(goal: FamilyGoal, lives: LifeSummary[]): number {
  return familyMeasure(goal.kind, lives)
}

/**
 * Проверить цель рода после очередной жизни: исполнена - отметить год. Возвращает true, если исполнена только что
 * (интерфейс даёт награду - сундук-дар и плашку).
 */
export function checkFamilyGoal(state: GameState): boolean {
  const g = state.family.goal
  if (!g || g.done !== undefined) return false
  if (familyGoalProgress(g, state.family.lives) < g.target) return false
  state.family.goal = { ...g, done: state.year }
  return true
}

/** Наследник по обычаю края: старший сын (sons_first), младший сын (степь), иначе старший ребёнок. */
export function customHeir(kids: Npc[], era: EraDef, region: string): Npc | undefined {
  const custom = era.regions.find((r) => r.id === region)?.inheritance ?? era.inheritance
  const sons = kids.filter((k) => k.sex === 'm')
  const byAge = (list: Npc[]) => [...list].sort((a, b) => a.birthYear - b.birthYear)
  if (custom === 'youngest_hearth' && sons.length) return byAge(sons)[sons.length - 1]
  if (custom === 'sons_first' && sons.length) return byAge(sons)[0]
  return byAge(kids)[0]
}
