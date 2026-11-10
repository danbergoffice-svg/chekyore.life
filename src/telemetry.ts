// События аналитики игры (ТЗ A1). Всё уходит через platform.track: в Метрику и в свой приёмник.
import type { LifeSummary } from './engine/types'
import type { EventDef, GameState, LifeStats } from './engine/types'
import { heirs } from './engine/life'
import { platform } from './platform'
import { onEmotion } from './engine/emotions'
import { onChildEvent, onMatchEvent } from './engine/children'
import { onEstateEvent } from './engine/estate'
import { onTradeEvent } from './engine/trade'
import { onBusinessEvent } from './engine/business'

// Торговля и дела рода.
onTradeEvent((kind, state, params) => platform.track(kind, { ...params, age: state.hero.age, region: state.hero.region }))
onBusinessEvent((kind, state, params) => platform.track(kind, { ...params, age: state.hero.age, region: state.hero.region, generation: state.hero.generation }))

// Имущество: покупка, продажа, завещание, раздел наследства.
onEstateEvent((kind, state, params) => {
  platform.track(kind, { ...params, age: state.hero.age, region: state.hero.region, generation: state.hero.generation })
})

onMatchEvent((kind, child, state, params) => platform.track(`child_${kind}`, { ...params, child_age: state.year - child.birthYear, region: state.hero.region }))

// Дети: выбор учёбы и воспитания (действия игрока), окончание и отказ.
onChildEvent((kind, child, state, extra = {}) => {
  platform.track(`child_${kind}`, { ...extra, child_age: state.year - child.birthYear, age: state.hero.age, region: state.hero.region })
})

// Эмоциональная память (engine/emotions.ts): след появился и утих.
onEmotion((kind, m, state) => {
  const params = { type: m.type, role: m.role ?? '', intensity: m.intensity, cause: m.cause ?? '', age: state.hero.age, region: state.hero.region }
  if (kind === 'created') platform.track('emotional_event_created', params)
  else platform.track('emotional_event_resolved', { ...params, years: (m.resolved ?? state.year) - m.year })
})

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

export function trackLifeStart(state: GameState, lottery: string, isProtected: boolean, respins = 0, high = false, royal = false, gifts: string[] = []): void {
  const h = state.hero
  lifeStats(state)
  platform.track('life_start', { era: h.era, region: h.region, cls: h.cls, sex: h.sex, lottery, protected: isProtected, generation: h.generation, respins, ...(high ? { high: 1 } : {}), ...(royal ? { royal: 1 } : {}), ...(gifts.length ? { gifts: gifts.join(',') } : {}) })
}

/** Выбор в событии: сразу после choose(), пока событие ещё в очереди с итогом. */
export function trackChoice(state: GameState, extra: Record<string, string | number> = {}): void {
  const active = state.queue[0]
  if (!active?.outcome) return
  const s = lifeStats(state)
  s.choices++
  if (s.choices === 1) platform.track('first_choice', { sec_from_start: Math.round(s.sec) })
  platform.track('choice_made', { event_id: active.eventId, option: active.outcome.choiceId, age: state.hero.age, success: active.outcome.result !== 'failure', ...extra })
}

/** Тип окна события для аналитики: исторические, кости, перелом, дело, имя, покупки, долги, сон; иначе - тип события. */
export function eventKind(ev: EventDef): string {
  if (ev.type === 'global_historical') return 'historical'
  if (ev.dynamic) return ev.dynamic
  if (ev.id.startsWith('estate_')) return 'estate'
  if (ev.id.startsWith('debt_')) return 'debt'
  if (ev.id.startsWith('dream')) return 'dream'
  return ev.type
}

/** Окно события открылось (один раз на окно): тип, возраст, сколько ещё событий ждёт в очереди. В session_end - счётчиками. */
export function trackEventShown(state: GameState, ev: EventDef): void {
  const s = lifeStats(state)
  if (s.yearWinAge !== state.hero.age) {
    s.yearWin = 0
    s.yearWinAge = state.hero.age
  }
  s.yearWin = (s.yearWin ?? 0) + 1
  platform.track('event_shown', { event_id: ev.id, type: eventKind(ev), age: state.hero.age, queue_len: Math.max(0, state.queue.length - 1) })
}

/** Окно утраты близкого (карточка смерти): родство. Болезнь окна больше не открывает (решение владельца 10.11). */
export function trackLossShown(role: string, isDeath = true): void {
  platform.track('loss_shown', { npc_role: role, is_death: isDeath ? 1 : 0 })
}

/** После каждого года: отметки возраста 5, 10, 15, 20, 30 … 70. */
export function trackYear(state: GameState): void {
  const s = lifeStats(state)
  // Сколько окон было в прошедшем году (возраст уже прибавился): гистограмма year_windows в session_end.
  const n = s.yearWinAge === state.hero.age - 1 ? (s.yearWin ?? 0) : 0
  platform.track('year_windows', { n: Math.min(n, 9) })
  s.yearWin = 0
  s.yearWinAge = state.hero.age
  for (const age of MILESTONES) {
    if (state.hero.age >= age && !s.milestones.includes(age)) {
      s.milestones.push(age)
      platform.track('age_milestone', { age, sec_in_life: Math.round(s.sec) })
    }
  }
}

export function trackLifeEnd(state: GameState, life: LifeSummary): void {
  const s = lifeStats(state)
  // Кости: сколько партий, до какой ставки дошёл, сколько «на волю судьбы», разорился ли (ТЗ, что смотреть на тестах).
  const dice = state.hero.dice
  const diceParams = dice?.games ? { dice_games: dice.games, dice_max_stake: dice.maxStake, dice_fate: dice.fate, dice_ruined: dice.ruined ? 1 : 0, dice_net: Math.round(dice.net) } : {}
  platform.track('life_end', { age: life.age, cause: life.cause, region: life.region, era: life.era, sec_in_life: Math.round(s.sec), choices: s.choices, rescued: s.rescued, generation: life.generation, heirs: heirs(state).length, ...diceParams })
  if (life.goal) platform.track('goal_end', { goal: life.goal.id, steps: life.goal.steps.length, done: life.goal.steps.length >= 4 ? 1 : 0, age: life.age, tier: life.goal.tier, ...(life.goal.inherited ? { inherited: 1 } : {}), ...(life.goal.changed ? { changed: 1 } : {}) })
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

/** Метки рекламы из адреса (utm_source, utm_medium, utm_campaign) и первый источник игрока: он запоминается
 *  при первом заходе с меткой и дальше идёт во все события (context.utm) - видно, откуда пришли вернувшиеся. */
export function utmParams(search: string): { utm_source?: string; utm_medium?: string; utm_campaign?: string; first: string } {
  const q = new URLSearchParams(search)
  const clean = (v: string | null) => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)
  const out: { utm_source?: string; utm_medium?: string; utm_campaign?: string; first: string } = { first: '' }
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const v = clean(q.get(k))
    if (v) out[k] = v
  }
  const KEY = 'thousands.utm_first'
  let first = platform.kvGet(KEY) ?? ''
  if (!first && out.utm_source) {
    first = out.utm_source
    platform.kvSet(KEY, first)
  }
  out.first = first
  return out
}
