// Цель жизни в интерфейсе (docs/TZ_goal.md): кому она есть (A/B), какие карточки показать, наследство цели.
// Движок целей - src/engine/goals.ts; здесь только то, что зависит от игрока и флагов.
import { GOAL_STEPS, offerGoals } from './engine/goals'
import type { GoalOffer, HeroGoal } from './engine/goals'
import type { GameState } from './engine/types'
import { makeRng } from './kids/rng'

/** 0 - без цели, 1 - цель без меток ▲▼, 2 - цель с метками. */
export type GoalGroup = 0 | 1 | 2

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
export const share = (id: string, salt: string, p: number) => p >= 1 || (p > 0 && hash(`${id}:${salt}`) / 4294967296 < p)

/** Группа игрока: доля goal_share с целью, среди них goal_marks_share - с метками; ?goal=0|1|2 - проверить руками. */
export function goalGroup(playerId: string, flags: { goal_share: number; goal_marks_share: number }): GoalGroup {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('goal') : null
  if (forced === '0' || forced === '1' || forced === '2') return Number(forced) as GoalGroup
  if (!share(playerId, 'goal', flags.goal_share)) return 0
  return share(playerId, 'marks', flags.goal_marks_share) ? 2 : 1
}

/** Эксперимент X0: короткие первые события жизни; ?short=0|1 - проверить руками. */
export function shortFirst(playerId: string, flags: { short_first_share: number }): boolean {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('short') : null
  if (forced === '0' || forced === '1') return forced === '1'
  return share(playerId, 'short_first', flags.short_first_share)
}

/** Эксперимент XA: новая раскладка экрана жизни; ?layout=a|b - проверить руками. */
export function layoutB(playerId: string, flags: { layout_share: number }): boolean {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('layout') : null
  if (forced === 'a' || forced === 'b') return forced === 'b'
  return share(playerId, 'layout', flags.layout_share)
}

/**
 * Пора спросить цель: у героя её нет и в этой жизни ещё не спрашивали. Раньше - только между годами (phase 'year'),
 * и старое сохранение посреди года (жизнь начата до появления целей, 02.11) оставалось без цели до конца года;
 * теперь окно открывается сразу и останавливает время, как любое событие.
 */
export function goalDue(state: GameState, group: GoalGroup): boolean {
  // Счётчики жизни (telemetry.lifeStats) - у прошлого героя свои: его «уже спрашивали» к наследнику не относится.
  const asked = state.stats?.heroId === state.hero.id && !!state.stats.goalAsked
  return group > 0 && state.phase !== 'dead' && state.hero.alive && !state.hero.goal && !asked
}

/** Цель видна в интерфейсе: полоса цели (GoalBar) в шапке/над лентой и строка в карточке «Продолжить». */
export const goalShown = (state: GameState): boolean => !!state.hero.goal

/** Незаконченная цель родителя, которую может взять наследник. */
export function inheritable(state: GameState): (HeroGoal & { from: string }) | null {
  const prev = state.family.lives[state.family.lives.length - 1]
  if (!prev?.goal || state.hero.generation < 2 || prev.generation !== state.hero.generation - 1) return null
  return prev.goal.steps.length < GOAL_STEPS ? { ...prev.goal, from: prev.name } : null
}

/** Карточки целей героя (зерно - от героя: после перезагрузки те же). */
export function goalOffers(state: GameState, exclude: string[] = []): GoalOffer[] {
  return offerGoals(state.hero, makeRng(hash(`${state.hero.id}:goal:${exclude.join(',')}`)), exclude as GoalOffer['id'][])
}
