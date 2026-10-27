// Сон о будущем (docs/TZ_dreams.md): раз за жизнь, со второй жизни, герою снится школьная задача.
// Три шага — вспомнить, найти в своём мире, применить или переспорить мудрецов; очки 0–3 решают исход:
// прорыв (скачок по сословиям, занятие сна), частичный успех или провал (вплоть до смерти — «плохо учился в школе»).
// У снов свой поток случайности: появление сна, его параметры и исход не трогают остальную жизнь.
import { ERA_META } from '../content'
import DREAMS from '../content/dreams.json'
import { evaluate } from './formula'
import { newLife } from './life'
import { applyEffects, changeParam, note } from './rules'
import { DEFAULT_FLAGS } from '../platform/types'
import type { DreamDef, DreamInput, DreamOutcome, DreamState, DreamTheme, EraDef, EraMeta, GameState } from './types'

export const DREAM_DEFS = DREAMS.dreams as unknown as DreamDef[]
const BY_ID = new Map(DREAM_DEFS.map((d) => [d.id, d]))

export function dreamDef(id: string): DreamDef | undefined {
  return BY_ID.get(id)
}

/** Шанс сна в год, если флаг не задан. */
export const DREAM_CHANCE = DEFAULT_FLAGS.dream_chance

// ---------- Свой поток случайности ----------

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Генератор снов: зависит от героя, года и назначения, а не от общего state.rng. */
export function dreamRng(state: GameState, salt: string): () => number {
  let a = hash(`${state.hero.seed}:${state.hero.id}:${state.year}:${salt}`)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Когда и какой сон ----------

/** Сны, возможные в стране и краю героя. */
export function dreamsAvailable(state: GameState): DreamDef[] {
  const region = ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)
  return DREAM_DEFS.filter((d) => (!d.eras || d.eras.includes(state.hero.era)) && (!d.region_tags || d.region_tags.every((t) => region?.tags?.includes(t))))
}

/**
 * Пора ли сну: 15–40 лет, раз за жизнь, не в год экрана-главы и не вместе с историческим событием.
 * В первой жизни сон приходит наверняка к dreamFirstBy годам (шанс растёт с каждым годом), дальше — dream_chance в год.
 */
export function dreamDue(state: GameState, historicalThisYear: boolean): boolean {
  const h = state.hero
  const first = (state.settings.livesBefore ?? 0) < 1 && h.generation < 2
  const firstBy = state.settings.dreamFirstBy ?? 0
  if (first && firstBy < 15) return false
  if (h.age < 15 || h.age > 40 || h.dreamSeen || state.dream || historicalThisYear) return false
  if (DEFAULT_FLAGS.chapter_ages.includes(h.age)) return false
  if (!dreamsAvailable(state).length) return false
  const chance = first ? (h.age >= firstBy ? 1 : 1 / (firstBy - h.age + 1)) : (state.settings.dreamChance ?? DREAM_CHANCE)
  return dreamRng(state, 'due')() < chance
}

const WAR_JOBS = ['soldier', 'officer', 'legionary', 'centurion', 'druzhinnik', 'strelets', 'knight', 'samurai', 'mamluk', 'janissary', 'akrites', 'eagle_warrior', 'maryannu']
const SCHOLAR_JOBS = ['priest', 'scribe', 'monk', 'hegumen', 'astronomer', 'exam_scholar', 'debtera', 'marabout', 'qazi', 'physician', 'rhetor', 'translator']
const SEA_JOBS = ['sailor', 'shipowner']
const BUILD_JOBS = ['artisan', 'cathedral_mason', 'stone_carver', 'church_carver', 'tomb_builder', 'mita_builder', 'workshop_owner']

/** Что сейчас происходит с героем — темы снов, у которых вес ×3. */
export function dreamThemes(state: GameState): Set<DreamTheme> {
  const h = state.hero
  const out = new Set<DreamTheme>()
  const prof = h.profession ?? ''
  const recent = h.diary.filter((d) => d.year >= state.year - 3)
  if (h.tags.includes('epidemic') || h.tags.includes('ill') || h.npcs.some((n) => n.alive && n.tags?.includes('ill'))) out.add('medicine')
  if (WAR_JOBS.includes(prof) || (h.skills.military ?? 0) >= 30 || recent.some((d) => d.icon === 'war')) out.add('war')
  if (h.cls === 'trader' || h.tags.includes('in_debt')) out.add('trade')
  if (h.cls === 'peasant' || recent.some((d) => /hunger|famine|harvest/.test(d.eventId ?? ''))) out.add('farming')
  if (h.cls === 'craftsman' || BUILD_JOBS.includes(prof)) out.add('building')
  if (SCHOLAR_JOBS.includes(prof) || (h.skills.literacy ?? 0) >= 40) out.add('scholar')
  const region = ERA_META[h.era]?.regions.find((r) => r.id === h.region)
  if (SEA_JOBS.includes(prof) || region?.tags?.includes('port')) out.add('sea')
  return out
}

/** Сон по судьбе героя: темы, которые ему сейчас близки, — втрое вероятнее. */
export function pickDream(state: GameState): DreamDef | undefined {
  const list = dreamsAvailable(state)
  const themes = dreamThemes(state)
  // Во время мора сны о лечении приходят почти всегда: это то, о чём герой думает днём и ночью.
  const plague = state.hero.tags.includes('epidemic')
  const w = list.map((d) => (plague && d.themes.includes('medicine') ? 8 : d.themes.some((t) => themes.has(t)) ? 3 : 1))
  const total = w.reduce((a, b) => a + b, 0)
  let x = dreamRng(state, 'pick')() * total
  for (let i = 0; i < list.length; i++) if ((x -= w[i]) < 0) return list[i]
  return list[list.length - 1]
}

// ---------- Параметры и проверка ответов ----------

/** Числа сна: из сетки [от, до, шаг] и вычисляемые из них. */
export function dreamParams(def: DreamDef, r: () => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, [lo, hi, step]] of Object.entries(def.params ?? {})) {
    const n = Math.round((hi - lo) / step)
    out[k] = Math.round((lo + Math.floor(r() * (n + 1)) * step) * 1000) / 1000
  }
  for (const [k, f] of Object.entries(def.derived ?? {})) out[k] = Math.round(evaluate(f, out) * 1000) / 1000
  return out
}

/** Верный ответ на ввод (для карточки «Как было на самом деле»). */
export function expectedAnswer(input: DreamInput, params: Record<string, number>, era: string): string[] | Record<string, number> | number {
  if (input.kind === 'pick') return input.answer_by_era?.[era] ?? input.answer
  if (input.kind === 'ratio') return input.answer
  if (input.kind === 'order') return input.answer
  return evaluate(input.formula, params)
}

/** Число из поля ввода: запятая и точка, пробелы. */
export function parseNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw
  return Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.'))
}

/** Верен ли ответ: pick — ровно нужное; ratio — каждая доля в допуске; order — нужные шаги по порядку; number — в допуске. */
export function checkInput(input: DreamInput, value: unknown, params: Record<string, number>, era: string): boolean {
  if (input.kind === 'pick') {
    const want = new Set(expectedAnswer(input, params, era) as string[])
    const got = new Set(Array.isArray(value) ? (value as string[]) : [])
    return want.size === got.size && [...want].every((x) => got.has(x))
  }
  if (input.kind === 'ratio') {
    const got = (value ?? {}) as Record<string, unknown>
    return Object.entries(input.answer).every(([k, v]) => Math.abs(parseNumber(got[k]) - v) <= input.tolerance) && Object.keys(got).every((k) => k in input.answer)
  }
  if (input.kind === 'order') {
    const got = Array.isArray(value) ? (value as string[]) : []
    return got.length === input.answer.length && got.every((x, i) => x === input.answer[i])
  }
  const want = evaluate(input.formula, params)
  const v = parseNumber(value)
  if (!Number.isFinite(v)) return false
  const tol = Math.max(input.abs ?? 0, Math.abs(want) * (input.tolerance ?? 0.02))
  return Math.abs(v - want) <= tol + 1e-9
}

// ---------- Ход сна ----------

/** Герой решил «попробовать вспомнить»: сон открыт, числа сгенерированы. */
export function startDream(state: GameState, id: string): void {
  const def = BY_ID.get(id)
  if (!def) return
  state.dream = { id, params: dreamParams(def, dreamRng(state, 'params')), step: 0, item: 0, answers: [[], [], []], correct: [[], [], []] }
}

/** Отказ («это просто сон»): ничего не происходит, но второго сна в этой жизни не будет. */
export function skipDream(state: GameState, id: string): void {
  state.hero.dreamSeen = { id, year: state.year, score: 0, outcome: 'failure', params: {}, hint: false, skipped: true }
}

/** Текущий ввод сна. */
export function currentInput(state: GameState): DreamInput | undefined {
  const d = state.dream
  if (!d || d.done) return undefined
  return BY_ID.get(d.id)?.steps[d.step]?.items[d.item]
}

/** Ответ на текущий ввод: шаги идут до конца, верность не показывается до итога. Вернёт, верен ли ответ. */
export function answerDream(state: GameState, value: unknown): boolean {
  const d = state.dream
  const def = d && BY_ID.get(d.id)
  const input = currentInput(state)
  if (!d || !def || !input) return false
  const ok = checkInput(input, value, d.params, state.hero.era)
  d.answers[d.step].push(value)
  d.correct[d.step].push(ok)
  if (d.item + 1 < def.steps[d.step].items.length) d.item++
  else if (d.step < 2) {
    d.step++
    d.item = 0
  } else {
    d.done = true
    // Очко за шаг — только если верны все его вводы (в споре — оба возражения).
    d.score = d.correct.filter((c) => c.length > 0 && c.every(Boolean)).length
  }
  return ok
}

/** Как в краю относятся к учёным: welcoming, neutral, hostile. */
export function scholarClimate(state: GameState): string {
  const meta = ERA_META[state.hero.era]
  return meta?.regions.find((r) => r.id === state.hero.region)?.scholar_climate ?? meta?.scholar_climate ?? 'neutral'
}

/** Знали ли это уже здесь и сейчас («изобрёл изобретённое»). */
export function knownHere(def: DreamDef, state: GameState): boolean {
  return !!def.known_in?.some((k) => k.era === state.hero.era && state.year >= k.from)
}

/**
 * Итог сна: прорыв, частичный успех, провал или смерть. Эффекты исхода, занятие сна, запись в дневник
 * и карточка «Как было на самом деле». Смерть — причина «плохо учился (училась) в школе».
 */
export function resolveDream(state: GameState, era: EraDef): DreamOutcome {
  const d = state.dream
  const def = d && BY_ID.get(d.id)
  if (!d || !def) return 'failure'
  const hero = state.hero
  const score = d.score ?? 0
  const known = knownHere(def, state)
  const climate = scholarClimate(state)
  const r = dreamRng(state, 'outcome')
  let outcome: DreamOutcome = score >= 3 ? (known ? 'partial' : 'breakthrough') : score === 2 ? 'partial' : 'failure'
  if (outcome === 'failure') {
    let p = def.death_chance?.[Math.min(score, 1)] ?? 0
    if (def.hostile_only && climate !== 'hostile') p = 0
    if (def.debate && climate === 'hostile') p = Math.min(0.9, p * 2)
    if (p > 0 && r() < p) outcome = 'death'
  }
  if (outcome === 'breakthrough') {
    const effects = [...def.outcomes.breakthrough]
    // Знание храмов (Египет, Вавилон, майя): учёный становится жрецом.
    const templeLand = (era.id === 'ANE' || era.id === 'MAY') && def.themes.some((t) => t === 'scholar' || t === 'medicine')
    // Раб получает свободу, знатный — влияние при дворе: вместо скачка по сословиям.
    const special = hero.cls === 'slave' || hero.cls === 'noble'
    if (hero.cls === 'slave') {
      hero.cls = 'peasant'
      hero.tags = hero.tags.filter((t) => t !== 'enslaved')
      if (!hero.tags.includes('freedman')) hero.tags.push('freedman')
    } else if (hero.cls === 'noble') changeParam(hero, 'reputation', 30)
    applyEffects(state, era, special ? effects.filter((e) => !('class_up' in e)) : effects)
    if (templeLand) {
      hero.profession = 'priest'
      changeParam(hero, 'faith', 10)
    } else if (def.profession && era.professions.some((p) => p.id === def.profession)) hero.profession = def.profession
    if (climate === 'welcoming') changeParam(hero, 'reputation', 10)
  } else if (outcome === 'partial') {
    applyEffects(state, era, def.outcomes.partial)
  } else {
    applyEffects(state, era, def.outcomes.failure)
    if (def.debate && r() < 0.3 && !hero.tags.includes('suspected_witch')) hero.tags.push('suspected_witch')
  }
  if (outcome === 'death' && hero.alive) {
    hero.alive = false
    hero.deathCause = 'dream_failure'
    hero.deathYear = state.year
  }
  d.outcome = outcome
  d.known = known
  hero.dreamSeen = { id: d.id, year: state.year, era: hero.era, score, outcome, known, hint: !!d.hint, params: d.params }
  note(state, {
    key: 'diary.dream',
    params: { dream: { key: `dream.${d.id}.title` }, result: { key: `dream.result.${outcome}` }, n: score },
    major: true,
    topic: 'life',
    icon: outcome === 'breakthrough' ? 'find' : outcome === 'death' ? 'death' : 'study',
    score: outcome === 'breakthrough' ? 80 : 40,
    mood: outcome === 'breakthrough' ? 15 : outcome === 'partial' ? 5 : -10,
  })
  state.dream = undefined
  return outcome
}

/** Случайные ответы — для autoplay и калибровки (свой поток случайности). */
export function autoDream(state: GameState): void {
  const r = dreamRng(state, 'auto')
  for (let guard = 0; guard < 20 && state.dream && !state.dream.done; guard++) {
    const input = currentInput(state)!
    let value: unknown
    if (input.kind === 'pick') value = input.options.filter(() => r() < 0.45)
    else if (input.kind === 'order') value = [...input.options].sort(() => r() - 0.5).slice(0, input.answer.length)
    else if (input.kind === 'ratio') value = Object.fromEntries(Object.keys(input.answer).map((k) => [k, Math.round(r() * 100)]))
    else {
      // Половина «помнит» порядок величины: случайное число вокруг верного.
      const want = evaluate(input.formula, state.dream.params)
      value = r() < 0.35 ? want : want * (0.3 + r() * 1.7)
    }
    answerDream(state, value)
  }
}

// ---------- Тренировка из меню ----------

/** Тренировка: уже приснившийся сон с новыми числами в той стране и том году, где он приснился.
 *  Состояние одноразовое — жизнь, мемориал и награды не меняются. */
export function trainingState(meta: EraMeta, id: string, year: number, seed: number): GameState {
  const state = newLife(meta, { mode: 'quick', mortality: 'soft', softenHeavy: false }, seed)
  state.year = year
  startDream(state, id)
  return state
}

/** Итог тренировки — только по очкам: без гибели и без «уже знали». */
export function trainingOutcome(score: number): DreamOutcome {
  return score >= 3 ? 'breakthrough' : score === 2 ? 'partial' : 'failure'
}
