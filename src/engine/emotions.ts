// Эмоциональная память героя (ТЗ семейной системы, этап 1). Сильные события - пока смерть близких - оставляют след:
// сразу бьют по счастью и стрессу (Hero.hidden, своих шкал у эмоций нет), потом годами тихо тянут вниз и затухают.
// Сила зависит от родства, возраста и характера героя, отношений с умершим, причины смерти и того, был ли он рядом.
// Правила - данными в src/content/emotions.json. Случайность - только через rng.ts.
import RULES from '../content/emotions.json'
import { next } from './rng'
import { changeParam, note, npcAge } from './rules'
import type { EmotionalEventType, EmotionalMemory, GameState, Hero, Npc } from './types'

type Mults = Record<string, number>
const R = RULES as typeof RULES & { grief: { base: Mults; cause: Mults; traits: Mults }; decay: { traits: Mults } }

/** Слушатель для аналитики (src/telemetry.ts): движок сам ничего не отправляет. */
type Listener = (kind: 'created' | 'resolved', m: EmotionalMemory, state: GameState) => void
let listener: Listener | undefined
export function onEmotion(fn: Listener | undefined): void {
  listener = fn
}

export interface EmotionContext {
  cause?: string
  /** Умер вдали: только весть. */
  far?: boolean
}

function traitMult(hero: Hero, table: Mults): number {
  return hero.traits.reduce((m, t) => m * (table[t] ?? 1), 1)
}

/** Сила горя 0–100 без случайного разброса: родство × возраст героя × характер × отношения × причина × вдали. */
export function emotionalImpact(state: GameState, npc: Npc, ctx: EmotionContext = {}): number {
  const g = R.grief
  const hero = state.hero
  let v = g.base[npc.role] ?? 0
  if (!v) return 0
  if (npc.role === 'child' && npcAge(npc, npc.deathYear ?? state.year) < g.infantAge) v *= g.infant
  if (npc.role === 'father' || npc.role === 'mother') {
    if (hero.age < g.parentWhileYoung.age) v *= g.parentWhileYoung.mult
    else if (hero.age >= g.parentWhenOld.age) v *= g.parentWhenOld.mult
  } else {
    const young = g.heroAge.find((a) => hero.age < a.under)
    if (young) v *= young.mult
  }
  v *= traitMult(hero, g.traits)
  // Отношения −100…100: любимый - до ×1.5, в ссоре - до ×0.5.
  v *= 1 + Math.max(-100, Math.min(100, npc.attitude)) / 200
  if (ctx.cause) v *= g.cause[ctx.cause] ?? 1
  if (ctx.far) v *= g.far
  // Не утихшие прежние утраты делают новую тяжелее (до +30%).
  v *= 1 + Math.min(R.previous.max, emotionalLoad(hero) / R.previous.per)
  return Math.max(0, Math.min(100, v))
}

/** Запомнить событие: сила с разбросом, сразу удар по счастью и стрессу, запись в память. */
export function rememberEmotion(state: GameState, type: EmotionalEventType, npc: Npc, ctx: EmotionContext = {}): EmotionalMemory | undefined {
  const hero = state.hero
  const base = emotionalImpact(state, npc, ctx)
  if (base <= 0) return undefined
  const intensity = Math.round(Math.min(100, base * (1 - R.grief.jitter + 2 * R.grief.jitter * next(state))))
  const m: EmotionalMemory = { type, year: state.year, npcId: npc.id, role: npc.role, name: npc.name, sex: npc.sex, intensity, current: intensity }
  if (ctx.cause) m.cause = ctx.cause
  changeParam(hero, 'happiness', Math.round(intensity * R.apply.happiness))
  changeParam(hero, 'stress', Math.round(intensity * R.apply.stress))
  // Вдовство - ещё и одиночество.
  if (npc.role === 'spouse') changeParam(hero, 'loneliness', Math.round(intensity * R.apply.spouseLoneliness))
  const list = (hero.emotionalMemories ??= [])
  list.push(m)
  // Старые утихшие воспоминания не копим без конца.
  while (list.length > R.keep) {
    const i = list.findIndex((x) => x.resolved !== undefined)
    list.splice(i >= 0 ? i : 0, 1)
  }
  listener?.('created', m, state)
  return m
}

/** Раз в год: живые воспоминания тянут счастье вниз и затухают; угасшие - отпускают. */
export function emotionsYear(state: GameState): void {
  const hero = state.hero
  // Поддержка семьи: рядом супруг или дети - горе отпускает быстрее; совсем один - дольше и тоскливее.
  const near = hero.npcs.some((n) => n.alive && !n.away && (n.role === 'spouse' || n.role === 'child' || n.role === 'mother' || n.role === 'father'))
  const grieving = (hero.emotionalMemories ?? []).some((m) => m.resolved === undefined && m.year < state.year && m.current >= R.linger.from)
  if (grieving && !near) changeParam(hero, 'loneliness', R.linger.aloneLoneliness)
  for (const m of hero.emotionalMemories ?? []) {
    if (m.resolved !== undefined || m.year >= state.year) continue
    if (m.current >= R.linger.from) {
      changeParam(hero, 'happiness', Math.round(m.current * R.linger.happiness))
      changeParam(hero, 'stress', Math.round(m.current * R.linger.stress))
    }
    let rate = (R.decay as Record<string, unknown>)[m.type] as number | undefined
    rate = (rate ?? 0.7) * traitMult(hero, R.decay.traits)
    if (hero.hidden.faith > R.decay.faith.above) rate *= R.decay.faith.mult
    rate *= near ? R.decay.support : R.decay.alone
    m.current = Math.round(m.current * Math.min(0.98, rate) * 10) / 10
    if (m.current < R.resolve.below || state.year - m.year >= R.resolve.years) resolveEmotion(state, m)
  }
}

/** Память утихла: отметка года, тихая запись в дневник (только о самых близких), событие аналитики. */
export function resolveEmotion(state: GameState, m: EmotionalMemory): void {
  if (m.resolved !== undefined) return
  m.resolved = state.year
  m.current = 0
  if (m.type === 'grief' && m.role && R.diaryRoles.includes(m.role) && m.intensity >= 40) {
    note(state, { key: 'diary.grief_eased', params: { who: { name: m.name ?? '' }, sex: m.sex ?? 'm', role: { key: `rel.${m.role}`, sex: m.sex } }, topic: 'family', icon: 'death', score: 8, mood: 2 })
  }
  listener?.('resolved', m, state)
}

/** Сколько ещё болит: сумма текущей силы неутихших воспоминаний (для тестов и будущих экранов). */
export function emotionalLoad(hero: Hero): number {
  return (hero.emotionalMemories ?? []).reduce((s, m) => s + (m.resolved === undefined ? m.current : 0), 0)
}
