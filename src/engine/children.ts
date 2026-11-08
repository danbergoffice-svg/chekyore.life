// Дети героя: воспитание и обучение (ТЗ семейной системы, этап 2). Родитель выбирает стиль воспитания и направление
// учёбы; учёба стоит денег и времени, результат зависит от характера ребёнка, воспитания и достатка, а подросток может
// бросить выбранный за него путь. Окончивший учёбу получает дело по своему направлению (в том числе такие, куда без учёбы
// не попасть: писец, лекарь), а став наследником - навык. Правила - src/content/education.json и поле education страны.
// Случайность - только rng.ts; детей, которых не учат, расчёт не трогает (поток случайностей прежний).
import RULES from '../content/education.json'
import MAR from '../content/marriage.json'
import { chance, pick as pickOne, weighted as weightedOne } from './rng'
import { changeParam, note, npcAge, sendAway } from './rules'
import type { MatchKind, ChildEducation, ChildUpbringing, EducationPath, EducationTrackDef, EraDef, EraMeta, GameState, Npc, ProfessionDef } from './types'

const TRACKS = RULES.tracks as EducationTrackDef[]
type Style = keyof typeof RULES.upbringing.styles
export const UPBRINGING_STYLES = Object.keys(RULES.upbringing.styles) as Style[]

/** Слушатель для аналитики (src/telemetry.ts). */
type ChildEvent = 'education_selected' | 'education_completed' | 'education_refused' | 'upbringing_changed'
type Listener = (kind: ChildEvent, child: Npc, state: GameState, extra?: Record<string, string | number>) => void
let listener: Listener | undefined
export function onChildEvent(fn: Listener | undefined): void {
  listener = fn
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)))

/** Направления обучения в стране: общие правила с поправками страны, без закрытых. */
export function educationTracks(era: EraMeta): EducationTrackDef[] {
  const local = era.education
  return TRACKS.filter((t) => !local?.exclude?.includes(t.id)).map((t) => ({ ...t, ...(local?.tracks?.[t.id] ?? {}) }) as EducationTrackDef)
}

export const trackOf = (era: EraMeta, path: EducationPath | undefined) => (path ? educationTracks(era).find((t) => t.id === path) : undefined)

/** Плата за год учёбы: доля расходов сословия семьи (у рабов и бедняков - не меньше 2 монет). */
export function educationCost(state: GameState, era: EraMeta, track: EducationTrackDef): number {
  const upkeep = era.classes.find((c) => c.id === state.hero.cls)?.upkeep ?? 150
  return Math.max(2, Math.round(Math.max(upkeep, 80) * track.cost))
}

/** Дела, к которым ведёт направление в этой стране (для пола ребёнка). */
function trackProfessions(era: EraMeta, track: EducationTrackDef, child: Npc): ProfessionDef[] {
  return era.professions.filter(
    (p) => !p.promotion_only && (!p.sex || p.sex === child.sex) && (track.professions ? track.professions.includes(p.id) : p.skill === track.skill),
  )
}

export const isStudying = (child: Npc) => !!child.education?.startedYear && !child.education.completedYear && !child.education.refusedYear

/** Почему направление сейчас недоступно (ключ текста) или undefined - можно выбрать. */
export function educationLock(state: GameState, era: EraMeta, child: Npc, track: EducationTrackDef): string | undefined {
  const age = npcAge(child, state.year)
  const e = child.education
  if (!child.alive || child.away || child.role !== 'child') return 'children.lock.away'
  if (e?.startedYear && !e.refusedYear) return 'children.lock.busy'
  if (e?.refusedYear) return 'children.lock.refused'
  if (track.sex && track.sex !== child.sex) return 'children.lock.sex'
  if (!track.classes.includes(state.hero.cls)) return 'children.lock.class'
  if (track.needs?.some((f) => !era.features.includes(f))) return 'children.lock.era'
  if (track.regions && !track.regions.includes(state.hero.region)) return 'children.lock.era'
  if (!trackProfessions(era, track, child).length) return 'children.lock.era'
  if (age < track.ages[0]) return 'children.lock.young'
  if (age > track.ages[1]) return 'children.lock.old'
  return undefined
}

/** Направления, которые можно выбрать ребёнку сейчас. */
export function availableEducation(state: GameState, era: EraMeta, child: Npc): EducationTrackDef[] {
  return educationTracks(era).filter((t) => !educationLock(state, era, child, t))
}

/** Завести ребёнку воспитание и (пустое) обучение. Без случайности: старые сохранения после миграции живут как прежде. */
export function initializeChild(state: GameState, child: Npc): void {
  void state
  child.upbringing ??= { affection: clamp(50 + child.attitude / 4), discipline: 50, autonomy: 50, support: 50 }
  child.education ??= { level: 0, progress: 0 }
}

/** Выбрать направление учёбы. false - нельзя (возраст, сословие, страна, уже учится). */
export function setChildEducation(state: GameState, era: EraMeta, childId: string, path: EducationPath): boolean {
  const child = state.hero.npcs.find((n) => n.id === childId)
  const track = trackOf(era, path)
  if (!child || !track || educationLock(state, era, child, track)) return false
  initializeChild(state, child)
  child.education = { path, level: 0, progress: 0, startedYear: state.year }
  note(state, { key: 'diary.edu_start', params: { who: { name: child.name }, sex: child.sex, path: { key: `children.path.${path}` } }, topic: 'family', icon: 'child', score: 14, mood: 1 })
  listener?.('education_selected', child, state, { path, cost: educationCost(state, era, track) })
  return true
}

/** Поменять воспитание напрямую (сдвиги, 0–100). */
export function setChildUpbringing(state: GameState, childId: string, changes: Partial<ChildUpbringing>): boolean {
  const child = state.hero.npcs.find((n) => n.id === childId)
  if (!child || !child.alive) return false
  initializeChild(state, child)
  const u = child.upbringing!
  for (const k of ['affection', 'discipline', 'autonomy', 'support'] as const) if (changes[k] !== undefined) u[k] = clamp(changes[k]!)
  u.changedYear = state.year
  return true
}

/** Выбор стиля воспитания на этот год: ласка, строгость или свобода (один раз в год, до 16 лет). */
export function canUpbring(state: GameState, child: Npc): boolean {
  return child.alive && !child.away && child.role === 'child' && npcAge(child, state.year) < 16 && child.upbringing?.changedYear !== state.year
}

export function upbringStyle(state: GameState, childId: string, style: Style): boolean {
  const child = state.hero.npcs.find((n) => n.id === childId)
  if (!child || !canUpbring(state, child)) return false
  initializeChild(state, child)
  const u = child.upbringing!
  const d = RULES.upbringing.styles[style] as Partial<Record<keyof ChildUpbringing, number>>
  const step = RULES.upbringing.step
  setChildUpbringing(state, childId, {
    affection: u.affection + (d.affection ?? 0) * step,
    discipline: u.discipline + (d.discipline ?? 0) * step,
    autonomy: u.autonomy + (d.autonomy ?? 0) * step,
  })
  listener?.('upbringing_changed', child, state, { style })
  return true
}

/** Скорость учёбы ребёнка: характер, строгость воспитания и поддержка семьи. */
export function learnRate(child: Npc): number {
  const L = RULES.learn
  const u = child.upbringing ?? { affection: 50, discipline: 50, autonomy: 50, support: 50 }
  const traits = L.traits as Record<string, number>
  return Math.max(0.3, L.base + child.traits.reduce((s, t) => s + (traits[t] ?? 0), 0) + u.discipline * L.discipline + u.support * L.support)
}

/** Вероятность в этом году бросить учёбу: свобода - выше, ласка и хорошие отношения - ниже. */
export function refuseChance(child: Npc, age: number): number {
  const R = RULES.refuse
  if (age < R.from) return 0
  const u = child.upbringing ?? { affection: 50, discipline: 50, autonomy: 50, support: 50 }
  return Math.max(0, Math.min(R.max, R.base + u.autonomy * R.autonomy + u.affection * R.affection + child.attitude * R.attitude))
}

/** Раз в год: воспитание меняет отношения и (в 14) характер; учёба идёт, если есть чем платить. */
export function childrenYear(state: GameState, era: EraDef | EraMeta): void {
  const hero = state.hero
  const U = RULES.upbringing
  for (const child of hero.npcs) {
    if (child.role !== 'child' || !child.alive || child.away) continue
    initializeChild(state, child)
    const u = child.upbringing!
    const age = npcAge(child, state.year)
    if (state.lastFocus === 'family') u.support = clamp(u.support + U.familyFocusSupport)
    if (age < 18) {
      if (u.affection > U.attitude.affectionAbove) child.attitude = Math.min(100, child.attitude + U.attitude.perYear)
      if (u.discipline > U.attitude.disciplineAbove) child.attitude = Math.max(-100, child.attitude - U.attitude.perYear)
    }
    if (age === U.formAge && !u.formed) {
      u.formed = true
      for (const [k, trait] of Object.entries(U.formTraits)) {
        if (Number(u[k as keyof ChildUpbringing]) > U.formAbove && !child.traits.includes(trait)) {
          child.traits.push(trait)
          note(state, { key: 'diary.child_formed', params: { who: { name: child.name }, sex: child.sex, trait: { key: `trait.${trait}`, sex: child.sex } }, topic: 'family', icon: 'child', score: 10 })
          break
        }
      }
    }
    if (isStudying(child)) studyYear(state, era, child, age)
  }
}

function studyYear(state: GameState, era: EraDef | EraMeta, child: Npc, age: number): void {
  const hero = state.hero
  const e = child.education as ChildEducation
  if (e.startedYear === state.year) return
  const track = trackOf(era, e.path)
  if (!track) return
  const opts = { who: { name: child.name }, sex: child.sex }
  // Подросток может не принять путь, выбранный родителями.
  if (chance(state, refuseChance(child, age))) {
    e.refusedYear = state.year
    child.attitude = Math.max(-100, child.attitude - 5)
    note(state, { key: 'diary.edu_refused', params: { ...opts, path: { key: `children.path.${track.id}` } }, topic: 'family', icon: 'child', score: 26, mood: -3, major: true })
    listener?.('education_refused', child, state, { path: track.id, progress: Math.round(e.progress * 100) })
    return
  }
  const cost = educationCost(state, era, track)
  if (hero.money < cost) {
    if (e.unpaidYear !== state.year - 1) note(state, { key: 'diary.edu_unpaid', params: { ...opts, money: cost }, topic: 'money', score: 12, mood: -2 })
    e.unpaidYear = state.year
    return
  }
  hero.money -= cost
  const rate = learnRate(child)
  e.progress = Math.min(1, e.progress + rate / track.years)
  if (e.progress >= 1) {
    e.completedYear = state.year
    e.level = rate >= RULES.learn.level3 ? 3 : rate >= RULES.learn.level2 ? 2 : 1
    child.attitude = Math.min(100, child.attitude + 3)
    changeParam(hero, 'happiness', 3)
    note(state, { key: `diary.edu_done.${e.level}`, params: { ...opts, path: { key: `children.path.${track.id}` } }, topic: 'family', icon: 'child', score: 30, mood: 4, major: true })
    listener?.('education_completed', child, state, { path: track.id, level: e.level, years: state.year - (e.startedYear ?? state.year) })
  }
}

/**
 * К какому делу ведёт жизнь ребёнка: учится - пока никакого (null), окончил - дела его направления
 * (в том числе те, куда без учёбы не берут; с уровнем 2–3 - и выше сословия семьи), иначе - undefined (как раньше).
 */
export function childOutcome(state: GameState, child: Npc, era: EraDef | EraMeta): { professions: ProfessionDef[] } | null | undefined {
  if (isStudying(child)) return null
  const e = child.education
  if (!e?.completedYear) return undefined
  const track = trackOf(era, e.path)
  if (!track) return undefined
  const age = npcAge(child, state.year)
  const list = trackProfessions(era, track, child).filter((p) => p.minAge <= age && (e.level >= 2 || !p.classes || p.classes.includes(state.hero.cls)))
  return list.length ? { professions: list } : undefined
}

/** Навык, который даёт оконченная учёба (для наследника-героя): 0, если не учился. */
export function educationSkill(era: EraMeta, child: Npc): { skill: string; value: number } | undefined {
  const e = child.education
  const track = trackOf(era, e?.path)
  if (!e || !track || !(e.completedYear || e.progress > 0)) return undefined
  return { skill: track.skill, value: Math.round(e.completedYear ? 10 + e.level * RULES.skillPerLevel : e.progress * RULES.skillPerLevel) }
}

// ---------- Сватовство (отзывы игроков 05–08.11: «хочу выбирать, за кого выходят дети - с настоящим выбором») ----------
// К ребёнку в брачном возрасте сватаются: по любви (ниже по положению), равная партия, выгодная (выше, приданое больше).
// Игрок соглашается или отказывает в панели «Дети»; отказ любви может кончиться побегом. Не решил за год - ребёнок
// решает сам (как раньше: управление детьми не обязательно). Правила - src/content/marriage.json.

const M = MAR as typeof MAR & { weights: Record<string, Record<MatchKind, number>> }
const RANK = ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']

type MatchEvent = 'match_offered' | 'match_decided'
let matchListener: ((kind: MatchEvent, child: Npc, state: GameState, params: Record<string, string | number>) => void) | undefined
export function onMatchEvent(fn: typeof matchListener): void {
  matchListener = fn
}

/** Сословие жениха или невесты по виду партии: на ступень ниже, такое же, на ступень выше (в пределах страны). */
function suitorClass(era: EraDef | EraMeta, cls: string, kind: MatchKind): string {
  const have = RANK.filter((c) => era.classes.some((x) => x.id === c))
  const i = Math.max(0, have.indexOf(cls))
  const j = kind === 'love' ? Math.max(0, i - 1) : kind === 'rich' ? Math.min(have.length - 1, i + 1) : i
  return have[j] ?? cls
}

/** Приданое (дочь) или выкуп (сын, со знаком минус - семья получает): сколько стоит партия деньгами. */
export function matchCost(state: GameState, era: EraDef | EraMeta, child: Npc, kind: MatchKind): number {
  const upkeep = Math.max(80, era.classes.find((c) => c.id === state.hero.cls)?.upkeep ?? 150)
  return Math.round(child.sex === 'f' ? upkeep * M.dowry[kind] : -upkeep * M.sons[kind])
}

/** Год сватовства для ребёнка (из background вместо прежней тихой свадьбы). Возвращает true, если ребёнок женился. */
export function matchYear(state: GameState, era: EraDef | EraMeta, child: Npc, age: number): boolean {
  const [m0, m1] = era.marriageAge[child.sex]
  if (child.married || child.away || !child.alive) return false
  const m = child.match
  if (m) {
    // Не решили за год - решает сам: любовь - женится по любви, иначе соглашается на сватовство.
    if (state.year - m.year >= M.autoAfter) return decideMatch(state, era, child.id, true, true)
    return false
  }
  if (age < m0 || age > m1 + 6 || isStudying(child)) return false
  if (!chance(state, M.offerChance)) return false
  const w = M.weights[state.hero.cls] ?? M.weights.peasant
  const kind = weightedOne(state, ['love', 'equal', 'rich'] as MatchKind[], (k) => w[k])!
  const sex = child.sex === 'm' ? 'f' : 'm'
  const names = era.regions.find((r) => r.id === state.hero.region)?.names[sex] ?? []
  const suitor = names.length ? pickOne(state, names).id : ''
  child.match = { year: state.year, kind, suitor, sex, cls: suitorClass(era, state.hero.cls, kind) }
  note(state, { key: `diary.match_offer_${kind}`, params: { who: { name: child.name }, sex: child.sex, suitor: { name: suitor }, ssex: sex, from: { key: `match.from.${child.match.cls}` } }, topic: 'family', icon: 'wedding', score: 20 })
  matchListener?.('match_offered', child, state, { kind })
  return false
}

/**
 * Решение о сватовстве: согласие - свадьба (приданое или выкуп, отношения, слава); отказ - обида, при любви - может
 * сбежать к любимому. auto - решил сам ребёнок (игрок не успел).
 */
export function decideMatch(state: GameState, era: EraDef | EraMeta, childId: string, accept: boolean, auto = false): boolean {
  const hero = state.hero
  const child = hero.npcs.find((n) => n.id === childId)
  const m = child?.match
  if (!child || !m) return false
  const opts = { who: { name: child.name }, sex: child.sex, suitor: { name: m.suitor }, ssex: m.sex }
  child.match = undefined
  matchListener?.('match_decided', child, state, { kind: m.kind, accept: accept ? 1 : 0, auto: auto ? 1 : 0 })
  if (accept) {
    const a = M.accept[m.kind]
    hero.money -= matchCost(state, era, child, m.kind)
    child.attitude = Math.max(-100, Math.min(100, child.attitude + a.attitude))
    changeParam(hero, 'reputation', a.reputation)
    changeParam(hero, 'happiness', 4)
    child.married = true
    note(state, { key: auto ? `diary.match_auto_${m.kind}` : `diary.match_wed_${m.kind}`, params: opts, topic: 'family', icon: 'wedding', score: 28, mood: 4, major: true })
    return true
  }
  const r = M.refuse[m.kind]
  child.attitude = Math.max(-100, child.attitude + r.attitude)
  if (r.elope && chance(state, r.elope)) {
    child.married = true
    sendAway(state, child, 'left', true)
    changeParam(hero, 'happiness', -6)
    note(state, { key: 'diary.match_eloped', params: opts, topic: 'family', icon: 'wedding', score: 34, mood: -6, major: true })
    return true
  }
  note(state, { key: `diary.match_refused_${m.kind}`, params: opts, topic: 'family', score: 16, mood: -1 })
  return false
}
