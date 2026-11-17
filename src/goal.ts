// Цель жизни в интерфейсе (docs/TZ_goal.md): кому она есть (A/B), какие карточки показать, наследство цели.
// Движок целей - src/engine/goals.ts; здесь только то, что зависит от игрока и флагов.
import { GOAL_STEPS, heroGoalOffers } from './engine/goals'
import type { GoalOffer, HeroGoal } from './engine/goals'
import type { GameState } from './engine/types'

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

/** Эксперимент XT (аудит 18.11): обучение по шагу «по ходу жизни» вместо шести карточек подряд; ?tour=wall|drip - проверить руками. */
export function tourDrip(playerId: string, flags: { tour_drip_share?: number }): boolean {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('tour') : null
  if (forced === 'wall' || forced === 'drip') return forced === 'drip'
  return share(playerId, 'tour_drip', flags.tour_drip_share ?? 0)
}

/** Эксперимент XG (аудит 18.11): с какого возраста героя спрашивать цель - 0 (сразу) или goal_late_age; ?goalat=0|6 - проверить руками. */
export function goalAge(playerId: string, flags: { goal_late_share?: number; goal_late_age?: number }): number {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('goalat') : null
  if (forced !== null && /^\d+$/.test(forced)) return Number(forced)
  return share(playerId, 'goal_late', flags.goal_late_share ?? 0) ? (flags.goal_late_age ?? 6) : 0
}

/**
 * Пора спросить цель: у героя её нет и в этой жизни ещё не спрашивали. Раньше - только между годами (phase 'year'),
 * и старое сохранение посреди года (жизнь начата до появления целей, 02.11) оставалось без цели до конца года;
 * теперь окно открывается сразу и останавливает время, как любое событие. fromAge - рукав XG: до этого возраста не спрашивать.
 */
export function goalDue(state: GameState, group: GoalGroup, fromAge = 0): boolean {
  // Счётчики жизни (telemetry.lifeStats) - у прошлого героя свои: его «уже спрашивали» к наследнику не относится.
  const asked = state.stats?.heroId === state.hero.id && !!state.stats.goalAsked
  return group > 0 && state.phase !== 'dead' && state.hero.alive && !state.hero.goal && !asked && state.hero.age >= fromAge
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
  return heroGoalOffers(state.hero, exclude as GoalOffer['id'][])
}

/** Эксперимент XC: перелом сорокалетия (engine/crisis.ts); ?crisis=0|1 - проверить руками. */
export function crisisOn(playerId: string, flags: { crisis_share?: number }): boolean {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('crisis') : null
  if (forced === '0' || forced === '1') return forced === '1'
  return share(playerId, 'crisis', flags.crisis_share ?? 0)
}

/** Эксперимент XM: новая музыка (public/music/v2); ?music=old|new - проверить руками. */
export function musicNew(playerId: string, flags: { music_share?: number }): boolean {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('music') : null
  if (forced === 'old' || forced === 'new') return forced === 'new'
  return share(playerId, 'music', flags.music_share ?? 0)
}

/** Новые треки (12.11.2026): у Египта свой, у империи ацтеков и инков нового нет - там играет старый. */
const MUSIC_V2 = new Set(['menu', 'ane', 'e03', 'byz', 'chn', 'eth', 'eur', 'ind', 'isl', 'jpn', 'may', 'mng', 'rus', 'waf'])
const EGYPT = new Set(['egypt', 'thebes', 'memphis'])

/** Какой трек играть: 'menu' или id страны; в группе новой музыки - 'v2/<id>' (Египет - 'v2/egy'). */
export function musicTrack(era: string | null, region: string | undefined, fresh: boolean): string {
  const id = era ? era.toLowerCase() : 'menu'
  if (!fresh) return id
  if (era && region && EGYPT.has(region)) return 'v2/egy'
  return MUSIC_V2.has(id) ? `v2/${id}` : id
}

/** Живописные сцены из слоёв (src/pixel/painted.ts): у всех, где слои есть (флаг painted_share > 0 - свой сайт);
 *  игрок может вернуть пиксельную графику в настройках (prefs.art = 'pixel'). */
export function paintedOn(art: 'painted' | 'pixel' | undefined, flags: { painted_share?: number }): boolean {
  return (flags.painted_share ?? 0) > 0 && art !== 'pixel'
}
