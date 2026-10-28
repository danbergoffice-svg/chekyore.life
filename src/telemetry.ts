// События аналитики игры (ТЗ A1). Всё уходит через platform.track: в Метрику и в свой приёмник.
import type { LifeSummary } from './engine/types'
import type { GameState, LifeStats } from './engine/types'
import { platform } from './platform'

const MILESTONES = [5, 10, 15, 20, 30, 40, 50, 60, 70]

/** Счётчики текущей жизни; у нового героя (наследника) начинаются заново. */
export function lifeStats(state: GameState): LifeStats {
  if (!state.stats || state.stats.heroId !== state.hero.id) state.stats = { heroId: state.hero.id, sec: 0, choices: 0, rescued: 0, milestones: [] }
  return state.stats
}

/** Секунда игры на экране жизни. */
export function tickLife(state: GameState, sec: number): void {
  lifeStats(state).sec += sec
}

export function trackLifeStart(state: GameState, lottery: string, isProtected: boolean, respins = 0, high = false, royal = false): void {
  const h = state.hero
  lifeStats(state)
  platform.track('life_start', { era: h.era, region: h.region, cls: h.cls, sex: h.sex, lottery, protected: isProtected, generation: h.generation, respins, ...(high ? { high: 1 } : {}), ...(royal ? { royal: 1 } : {}) })
}

/** Выбор в событии: сразу после choose(), пока событие ещё в очереди с итогом. */
export function trackChoice(state: GameState): void {
  const active = state.queue[0]
  if (!active?.outcome) return
  const s = lifeStats(state)
  s.choices++
  if (s.choices === 1) platform.track('first_choice', { sec_from_start: Math.round(s.sec) })
  platform.track('choice_made', { event_id: active.eventId, option: active.outcome.choiceId, age: state.hero.age, success: active.outcome.result !== 'failure' })
}

/** После каждого года: отметки возраста 5, 10, 15, 20, 30 … 70. */
export function trackYear(state: GameState): void {
  const s = lifeStats(state)
  for (const age of MILESTONES) {
    if (state.hero.age >= age && !s.milestones.includes(age)) {
      s.milestones.push(age)
      platform.track('age_milestone', { age, sec_in_life: Math.round(s.sec) })
    }
  }
}

export function trackLifeEnd(state: GameState, life: LifeSummary): void {
  const s = lifeStats(state)
  platform.track('life_end', { age: life.age, cause: life.cause, region: life.region, era: life.era, sec_in_life: Math.round(s.sec), choices: s.choices, rescued: s.rescued, generation: life.generation })
}

/** Параметры игрока в Метрике: сколько жизней, когда пришёл, лучший возраст. */
export function trackUserParams(memorial: LifeSummary[]): void {
  const KEY = 'thousands.first_seen'
  let first = platform.kvGet(KEY)
  if (!first) {
    first = new Date().toISOString().slice(0, 10)
    platform.kvSet(KEY, first)
  }
  platform.userParams({ lives_total: memorial.length, first_seen: first, best_age: memorial.reduce((m, l) => Math.max(m, l.age), 0) })
}
