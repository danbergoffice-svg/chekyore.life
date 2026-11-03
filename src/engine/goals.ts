// Цель жизни (docs/TZ_goal.md): после лотереи рождения герой выбирает одну из трёх целей, у цели 4 шага.
// Шаги считаются по состоянию героя в конце каждого года (goalYear) - нового контента не нужно.
// goalImpact оценивает вариант события по его эффектам: ▲ к цели, ▼ от цели (метки на кнопках и вес событий).
// Трудность цели для сословия - доля исполнивших в симуляции (src/content/goal_tiers.json, npm run goals).
// Тексты: goal.<id>.title, goal.<id>.wish, goal.<id>.step.1–4, goal.tier.1–3, diary.goal_step, diary.goal_done.
import tiers from '../content/goal_tiers.json'
import { aliveNpcs, note } from './rules'
import type { ChoiceDef, Effect, EraDef, EraMeta, EventDef, GameState, Hero, ParamId } from './types'

export type GoalId = 'freedom' | 'rise' | 'wealth' | 'keep' | 'family' | 'long' | 'master' | 'learning' | 'glory' | 'faith' | 'world' | 'love'
/** 1 - спокойная, 2 - смелая, 3 - почти невозможная. */
export type GoalTier = 1 | 2 | 3

export interface HeroGoal {
  id: GoalId
  /** Возраст, в котором выполнен каждый шаг (по порядку); длина - сколько шагов выполнено. */
  steps: number[]
  /** Трудность на карточке, когда цель выбрали. */
  tier: GoalTier
  /** Возраст, когда цель выбрана (0 - при рождении, 16 - смена цели, у наследника - его возраст). */
  since: number
  /** Цель досталась от родителя: его шаги уже засчитаны. */
  inherited?: boolean
  /** Цель сменили в юности (один раз за жизнь). */
  changed?: boolean
}

/** Что известно для проверки шагов. */
interface Ctx {
  state: GameState
  hero: Hero
  era: EraDef | EraMeta
  /** Место сословия героя и сословия при рождении в лестнице страны (0 - низшее). */
  rank: number
  birthRank: number
  /** Расходы на жизнь в год по нынешнему сословию. */
  upkeep: number
}

/** Вклад эффекта в цель: 1 - заметный шаг к цели, −1 - заметный шаг назад. */
type Weigh = (e: Effect) => number

interface GoalDef {
  id: GoalId
  /** Кому предлагать (сословие при рождении); без списка - всем. */
  classes?: string[]
  /** Кому не предлагать. */
  notClasses?: string[]
  steps: [(c: Ctx) => boolean, (c: Ctx) => boolean, (c: Ctx) => boolean, (c: Ctx) => boolean]
  weigh: Weigh
  /** Фокусы года, которыми игрок идёт к цели (по убыванию пользы): по ним играет бот калибровки. */
  focus: string[]
}

export const GOAL_STEPS = 4

const SCHOLAR = ['scribe', 'physician', 'exam_scholar', 'translator', 'priest', 'monk', 'official', 'magistrate']
const OFFICE = ['official', 'magistrate', 'officer', 'knight', 'druzhinnik', 'landholder', 'overseer', 'strelets']
const HOLY = ['priest', 'monk']
const HOLY_TAGS = ['vowed', 'hajji', 'on_hajj', 'sufi', 'initiated', 'eur_beguine']

/** Дальняя дорога без переезда: хадж, плавание в Индию. */
const FAR_TAGS = ['hajji', 'india_voyage']
const has = (h: Hero, tag: string) => h.tags.includes(tag)
const children = (h: Hero) => h.npcs.filter((n) => n.role === 'child')
const adultKids = (c: Ctx) => children(c.hero).filter((n) => n.alive && c.state.year - n.birthYear >= 15).length
/** Сколько разных мест повидал герой (возврат в прежнее место - не новое). */
const placesSeen = (h: Hero) => new Set(h.places).size
/** Поездки без переезда: паломничества, хадж, плавание, караван, поездка на лечение (выбор «отправиться»). */
const JOURNEY = /^ev\.(?:(?:a_voyage|f_pilgrimage_\w+|f_healing_shrine|ane_d_caravan|may_d_salt_trip|isl_d_hajj|byz_d_pilgrimage|byz_mv_silk_road|chn_f_pilgrimage|chn_j_junk_voyage|rus_d_pilgrimage|eur_d_pilgrimage|eth_zeila_caravan|jpn_d_ise|ind_d_pilgrimage|ind_d_hajj|waf_d_hajj)\.(?:go|go_poor)|c_h_cough\.voyage|isl_t_sea_voyage\.sail|waf_h_musa_hajj\.join|jpn_t_ming_voyage\.(?:big|small))$/
const journeys = (h: Hero) => h.diary.filter((d) => { const ch = d.params?.choice; return !!ch && typeof ch === 'object' && 'key' in ch && JOURNEY.test(ch.key) }).length
const yearsAbroad = (c: Ctx) => (c.hero.abroad ? c.state.year - c.hero.abroad.since : 0)
const skillOfWork = (c: Ctx) => {
  const prof = c.era.professions.find((p) => p.id === c.hero.profession)
  return prof ? (c.hero.skills[prof.skill] ?? 0) : 0
}
/** Сколько лет герой в браке с нынешним супругом. */
const marriedYears = (c: Ctx) => {
  const s = aliveNpcs(c.hero, 'spouse')[0]
  return s?.since !== undefined ? c.state.year - s.since : -1
}

// Веса эффектов: param - на единицу изменения (обычные дельты 2–10).
const param = (w: Partial<Record<ParamId, number>>): Weigh => (e) => ('param' in e && 'delta' in e ? (w[e.param] ?? 0) * e.delta : 0)
const tag = (w: Record<string, number>): Weigh => (e) => ('add_tag' in e ? (w[e.add_tag] ?? 0) : 'remove_tag' in e ? -(w[e.remove_tag] ?? 0) : 0)
const money = (k: number): Weigh => (e) => ('money_pct' in e ? (k * e.money_pct) / 25 : 'money_years' in e ? k * e.money_years : 0)
const rank = (k: number): Weigh => (e) => ('class_up' in e ? k * e.class_up : 0)
const work = (k: number, only?: string[]): Weigh => (e) => ('set_profession' in e ? (e.set_profession === null ? -k : !only || only.includes(e.set_profession) ? k : 0) : 0)
const family = (w: { spouse?: number; child?: number; loseSpouse?: number; loseChild?: number }): Weigh => (e) => {
  if ('add_npc' in e) return e.add_npc === 'spouse' ? (w.spouse ?? 0) : e.add_npc === 'child' ? (w.child ?? 0) : 0
  const who = 'kill_npc' in e ? e.kill_npc : 'remove_npc' in e ? e.remove_npc : 'npc_away' in e ? (e.who ?? 'npc') : null
  return who === 'spouse' ? -(w.loseSpouse ?? 0) : who === 'child' ? -(w.loseChild ?? 0) : 0
}
const travel = (k: number): Weigh => (e) => ('emigrate' in e ? 2 * k : 'migrate' in e || 'move' in e ? k : 0)
const home = (k: number): Weigh => (e) => ('home' in e ? (e.home === 'rebuild' ? k : -k) : 0)
const sum = (...ws: Weigh[]): Weigh => (e) => ws.reduce((a, w) => a + w(e), 0)

export const GOALS: GoalDef[] = [
  {
    id: 'freedom',
    classes: ['slave'],
    steps: [
      (c) => c.hero.hidden.reputation >= 0 || c.hero.profession !== null,
      (c) => c.hero.money >= 2 * c.upkeep || c.rank > 0,
      (c) => c.hero.cls !== 'slave' && !has(c.hero, 'enslaved'),
      (c) => c.rank > 0 && c.hero.money >= 10 * c.upkeep && c.hero.home >= 2,
    ],
    weigh: sum(rank(3), tag({ freedman: 3, fugitive: 1, mukataba: 2, enslaved: -3 }), money(0.5), param({ reputation: 0.1 })),
    focus: ['work', 'savings'],
  },
  {
    id: 'rise',
    notClasses: ['noble', 'landowner', 'slave'],
    steps: [
      (c) => c.hero.profession !== null,
      (c) => c.hero.money >= 6 * c.upkeep,
      (c) => c.rank > c.birthRank || c.hero.home >= 3,
      (c) => c.rank > c.birthRank && c.hero.money >= 12 * c.upkeep,
    ],
    weigh: sum(rank(3), money(1), work(0.5), tag({ enslaved: -3, in_debt: -1, wealthy: 1 }), param({ reputation: 0.05 }), home(1)),
    focus: ['work', 'trade', 'savings'],
  },
  {
    id: 'wealth',
    notClasses: ['slave'],
    steps: [
      (c) => c.hero.money >= 4 * c.upkeep,
      (c) => c.hero.money >= 10 * c.upkeep,
      (c) => c.hero.home >= 3 || c.hero.money >= 20 * c.upkeep,
      (c) => c.hero.money >= 25 * c.upkeep,
    ],
    weigh: sum(money(1.5), rank(1), tag({ in_debt: -1.5, wealthy: 2, gambler: -1 }), home(1.5)),
    focus: ['trade', 'savings', 'work'],
  },
  {
    id: 'keep',
    classes: ['landowner', 'noble'],
    steps: [
      (c) => aliveNpcs(c.hero, 'spouse').length > 0,
      (c) => children(c.hero).length > 0,
      (c) => c.hero.age >= 40 && c.rank >= c.birthRank,
      (c) => c.hero.age >= 40 && c.rank >= c.birthRank && c.hero.npcs.some((n) => n.role === 'grandchild'),
    ],
    weigh: sum(rank(2), family({ spouse: 1, child: 1, loseChild: 1 }), money(0.5), param({ reputation: 0.05 }), tag({ in_debt: -1 })),
    focus: ['family', 'work'],
  },
  {
    id: 'family',
    steps: [
      (c) => aliveNpcs(c.hero, 'spouse').length > 0,
      (c) => children(c.hero).length >= 1,
      (c) => children(c.hero).length >= 2,
      (c) => adultKids(c) >= 2 || c.hero.npcs.some((n) => n.role === 'grandchild'),
    ],
    weigh: sum(family({ spouse: 1.5, child: 1.5, loseSpouse: 1, loseChild: 1.5 })),
    focus: ['family'],
  },
  {
    id: 'long',
    steps: [(c) => c.hero.age >= 30, (c) => c.hero.age >= 40, (c) => c.hero.age >= 50, (c) => c.hero.age >= 60],
    weigh: sum(param({ health: 0.12, stress: -0.05 }), tag({ ill: -1, drinker: -1, opium: -1.5 })),
    focus: ['health', 'rest'],
  },
  {
    id: 'master',
    notClasses: ['noble'],
    steps: [
      (c) => c.hero.profession !== null && skillOfWork(c) >= 35,
      (c) => skillOfWork(c) >= 65,
      (c) => skillOfWork(c) >= 90 && c.hero.hidden.reputation >= 15,
      (c) => skillOfWork(c) >= 100 && c.hero.hidden.reputation >= 40 && c.hero.age >= 35,
    ],
    weigh: sum(work(1), param({ diligence: 0.1 }), (e) => ('skill' in e && 'delta' in e ? e.delta / 8 : 0)),
    focus: ['work', 'help_family'],
  },
  {
    id: 'learning',
    notClasses: ['slave'],
    steps: [
      (c) => c.hero.attrs.intellect >= 60,
      (c) => has(c.hero, 'schooled') || SCHOLAR.includes(c.hero.profession ?? ''),
      (c) => c.hero.attrs.intellect >= 85 && SCHOLAR.includes(c.hero.profession ?? ''),
      (c) => (c.hero.attrs.intellect >= 95 && c.hero.age >= 45 && c.hero.hidden.reputation >= 30) || (!!c.hero.dreamSeen && c.hero.dreamSeen.outcome !== 'failure' && !c.hero.dreamSeen.skipped),
    ],
    weigh: sum(param({ intellect: 0.15 }), tag({ schooled: 1.5, philosophy: 1, juren: 2 }), work(1, SCHOLAR), (e) => ('dream_start' in e ? 1 : 0)),
    focus: ['study', 'learn'],
  },
  {
    id: 'glory',
    steps: [
      (c) => c.hero.hidden.reputation >= 15,
      (c) => c.hero.hidden.reputation >= 30,
      (c) => OFFICE.includes(c.hero.profession ?? '') || c.hero.hidden.reputation >= 50,
      (c) => c.hero.hidden.reputation >= 60,
    ],
    weigh: sum(param({ reputation: 0.15 }), work(1, OFFICE), tag({ arrested: -2, criminal: -2, public_figure: 2, outlaw: -2 }), rank(1)),
    focus: ['service', 'work'],
  },
  {
    id: 'faith',
    steps: [
      (c) => c.hero.age >= 12 && c.hero.hidden.faith >= 80,
      (c) => HOLY_TAGS.some((t) => has(c.hero, t)) || HOLY.includes(c.hero.profession ?? '') || c.hero.hidden.reputation >= 30,
      (c) => c.hero.age >= 40 && c.hero.hidden.faith >= 85,
      (c) => c.hero.age >= 55 && c.hero.hidden.faith >= 90,
    ],
    weigh: sum(param({ faith: 0.12, reputation: 0.03 }), work(1.5, HOLY), tag({ vowed: 2, hajji: 2, on_hajj: 1.5, sufi: 1.5, drinker: -0.5, gambler: -0.5 })),
    focus: ['religion'],
  },
  {
    id: 'world',
    steps: [
      (c) => placesSeen(c.hero) >= 2 || journeys(c.hero) >= 1,
      (c) => placesSeen(c.hero) >= 3 || !!c.hero.abroad || !!c.hero.returned || FAR_TAGS.some((t) => has(c.hero, t)) || journeys(c.hero) >= 2,
      (c) => placesSeen(c.hero) >= 4 || yearsAbroad(c) >= 2 || !!c.hero.returned || (c.hero.erasLived?.length ?? 0) >= 2 || (placesSeen(c.hero) >= 3 && FAR_TAGS.some((t) => has(c.hero, t))) || journeys(c.hero) >= 3 || (journeys(c.hero) >= 2 && placesSeen(c.hero) >= 2),
      (c) => !!c.hero.returned || c.hero.abroad?.naturalized !== undefined || placesSeen(c.hero) >= 5 || (journeys(c.hero) >= 3 && placesSeen(c.hero) >= 3),
    ],
    weigh: sum(travel(1.5), tag({ india_voyage: 2, on_hajj: 1, exile: 0.5 }), work(1, ['sailor', 'merchant', 'shipowner', 'translator', 'soldier'])),
    focus: ['trade', 'service'],
  },
  {
    id: 'love',
    steps: [
      (c) => marriedYears(c) >= 0,
      (c) => marriedYears(c) >= 5,
      (c) => marriedYears(c) >= 15 && (aliveNpcs(c.hero, 'spouse')[0]?.attitude ?? 0) >= 40,
      (c) => marriedYears(c) >= 25,
    ],
    weigh: sum(family({ spouse: 2, loseSpouse: 2 }), (e) => ('npc_attitude' in e && (e.npc_attitude === 'spouse' || e.npc_attitude === 'npc') ? e.delta / 15 : 0)),
    focus: ['family'],
  },
]

const BY_ID = new Map(GOALS.map((g) => [g.id, g]))
export const goalDef = (id: GoalId) => BY_ID.get(id)!

function ctxOf(state: GameState, era: EraDef | EraMeta): Ctx {
  const hero = state.hero
  const order = [...era.classes].sort((a, b) => a.status - b.status).map((c) => c.id)
  const at = (cls: string) => Math.max(0, order.indexOf(cls))
  return {
    state,
    hero,
    era,
    rank: at(hero.cls),
    birthRank: at(hero.birthCls ?? hero.cls),
    upkeep: Math.max(1, era.classes.find((c) => c.id === hero.cls)?.upkeep ?? 1),
  }
}

/** Подходит ли цель герою по рождению. */
export function goalFits(g: GoalDef, cls: string): boolean {
  return (!g.classes || g.classes.includes(cls)) && !g.notClasses?.includes(cls)
}

/** Доля исполнивших цель (при игре по меткам) для сословия; нет данных - середина. */
export function goalRate(id: GoalId, cls: string): number {
  const t = (tiers as Record<string, Record<string, number>>)[id]
  return t?.[cls] ?? t?.all ?? 0.4
}

export function tierOf(rate: number): GoalTier {
  return rate >= 0.45 ? 1 : rate >= 0.2 ? 2 : 3
}

export interface GoalOffer {
  id: GoalId
  tier: GoalTier
}

/**
 * Три цели на выбор: по одной каждой трудности, если получается; иначе - самые разные по трудности.
 * r - случайность карточек (свой поток, чтобы выбор цели не менял остальную жизнь).
 */
export function offerGoals(hero: Hero, r: () => number, exclude: GoalId[] = []): GoalOffer[] {
  const cls = hero.birthCls ?? hero.cls
  const fit = GOALS.filter((g) => goalFits(g, cls) && !exclude.includes(g.id)).map((g) => ({ id: g.id, tier: tierOf(goalRate(g.id, cls)) }))
  const shuffled = fit.map((g) => ({ g, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.g)
  // Особая цель сословия (свобода у раба, честь рода у знати) - всегда среди трёх.
  const own = shuffled.filter((g) => goalDef(g.id).classes)
  const picked: GoalOffer[] = [...own]
  for (const tier of [1, 2, 3] as GoalTier[]) {
    if (picked.length >= 3 || picked.some((g) => g.tier === tier)) continue
    const g = shuffled.find((x) => x.tier === tier && !picked.includes(x))
    if (g) picked.push(g)
  }
  for (const g of shuffled) if (picked.length < 3 && !picked.includes(g)) picked.push(g)
  return picked.slice(0, 3).sort((a, b) => a.tier - b.tier)
}

/** Назначить цель (выбор игрока, смена в юности, наследник). Уже выполненные сейчас шаги засчитываются сразу. */
export function setGoal(state: GameState, era: EraDef | EraMeta, id: GoalId, opts: { tier?: GoalTier; inherited?: number[]; changed?: boolean } = {}): void {
  const hero = state.hero
  hero.goal = {
    id,
    steps: opts.inherited ? [...opts.inherited] : [],
    tier: opts.tier ?? tierOf(goalRate(id, hero.birthCls ?? hero.cls)),
    since: hero.age,
    ...(opts.inherited ? { inherited: true } : {}),
    ...(opts.changed ? { changed: true } : {}),
  }
  goalYear(state, era, true)
}

/** Проверка шагов в конце года: возвращает номера только что выполненных шагов (1–4). */
export function goalYear(state: GameState, era: EraDef | EraMeta, silent = false): number[] {
  const goal = state.hero.goal
  if (!goal || goal.steps.length >= GOAL_STEPS) return []
  const def = goalDef(goal.id)
  const c = ctxOf(state, era)
  const done: number[] = []
  while (goal.steps.length < GOAL_STEPS && def.steps[goal.steps.length](c)) {
    goal.steps.push(state.hero.age)
    done.push(goal.steps.length)
  }
  if (!silent)
    for (const n of done) {
      const last = n === GOAL_STEPS
      note(state, {
        key: last ? 'diary.goal_done' : 'diary.goal_step',
        params: { goal: { key: `goal.${goal.id}.title` }, step: { key: `goal.${goal.id}.step.${n}` }, n },
        major: true,
        topic: 'life',
        icon: last ? 'find' : undefined,
        score: last ? 70 : 30,
      })
    }
  return done
}

/** Итог цели: 'done' - все шаги, 'almost' - 3 из 4, 'partial' - 1–2, 'none' - ни одного. */
export function goalResult(goal: HeroGoal | undefined): 'done' | 'almost' | 'partial' | 'none' | null {
  if (!goal) return null
  const n = goal.steps.length
  return n >= GOAL_STEPS ? 'done' : n === GOAL_STEPS - 1 ? 'almost' : n > 0 ? 'partial' : 'none'
}

// ---------- Метки вариантов ----------

/** Смерть героя - против любой цели. */
const DEATH = -4

function effectsScore(def: GoalDef, effects: Effect[] | undefined): number {
  let s = 0
  for (const e of effects ?? []) {
    if ('kill' in e) s += DEATH
    else if ('chance' in e && 'effects' in e) s += e.chance * effectsScore(def, e.effects)
    else s += def.weigh(e)
  }
  return s
}

const cache = new Map<GoalId, WeakMap<ChoiceDef, number>>()

/** Вклад варианта в цель по эффектам (риск - по ожиданию при базовом шансе). Не зависит от героя - кэшируется. */
export function goalImpact(id: GoalId, choice: ChoiceDef): number {
  let m = cache.get(id)
  if (!m) cache.set(id, (m = new WeakMap()))
  let v = m.get(choice)
  if (v === undefined) {
    const def = goalDef(id)
    v = effectsScore(def, choice.effects)
    const roll = choice.risk_roll
    if (roll) v += roll.success_chance_base * effectsScore(def, roll.on_success) + (1 - roll.success_chance_base) * effectsScore(def, roll.on_failure)
    m.set(choice, v)
  }
  return v
}

export type GoalMark = 'up' | 'down' | null
export const MARK_AT = 0.5

/** Метка на кнопке варианта: только направление, без чисел. */
export function goalMark(id: GoalId, choice: ChoiceDef): GoalMark {
  const v = goalImpact(id, choice)
  return v >= MARK_AT ? 'up' : v <= -MARK_AT ? 'down' : null
}

/** Есть ли в событии вариант к цели (такие события выпадают чаще, флаг goal_weight). */
export function eventHelpsGoal(id: GoalId, ev: EventDef, choices: ChoiceDef[] = ev.choices ?? []): boolean {
  return choices.some((c) => goalImpact(id, c) >= MARK_AT)
}
