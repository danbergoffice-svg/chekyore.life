import { ERA_META, eraById, isEraLoaded } from '../content'
import { educationSkill } from './children'
import { estateForHeir } from './inheritance'
import { customHeir } from './dynasty'
import { bell, chance, int, pick, weighted } from './rng'
import { addYears, ancestorRule, childName, clamp, classKey, descentOf, HOME_TAGS, makeNpc, regionOf, rollReligion, yearsBetween } from './rules'
import { initHousehold } from './household'
import { isPet } from './pets'
import { buildReport } from './report'
import { ATTRIBUTES } from './types'
import type { AttrId, AwayReason, DiaryEntry, EraDef, EraMeta, Family, GameSettings, GameState, Hero, LifeSummary, Npc, RegionDef, Sex } from './types'
import { diceInherit } from './dice'

export const SAVE_VERSION = 9

/** Где, когда и кем родиться: результат лотереи рождения. */
export interface Birth {
  era: string
  region: string
  year: number
  cls: string
  sex: Sex
  /** Царская семья (награда за установку на главный экран и дар седьмого дня): знать, но богаче и почётнее. */
  royal?: boolean
  /** Дары за вход: прибавка к здоровью с рождения и во сколько раз богаче семья. */
  boons?: { health?: number; wealth?: number }
}

/** equal - все страны поровну; population - по числу жителей, как в жизни. */
export type Lottery = 'equal' | 'population'

/** Сколько лет до конца окна страны можно ещё родиться: так многие застают последние великие события (конкисту, падение Константинополя). */
export const BIRTH_MARGIN = 20

/** Регионы, где можно родиться в этой стране. */
function birthRegions(era: EraMeta): RegionDef[] {
  return era.regions.filter((r) => r.years[1] - r.years[0] >= 40)
}

/** Сначала год, потом край среди тех, что существуют в этот год: так город, открытый в 1500-м, не выпадает чаще, чем жил. */
function pickPlace(h: { rng: number }, era: EraMeta | EraDef): { region: RegionDef; year: number } {
  const regions = birthRegions(era)
  const from = Math.min(...regions.map((r) => r.years[0]))
  const to = Math.max(...regions.map((r) => r.years[1] - BIRTH_MARGIN))
  let year = int(h, from, to)
  if (year === 0) year = 1
  const open = regions.filter((r) => year >= r.years[0] && year <= r.years[1] - BIRTH_MARGIN)
  const region = weighted(h, open.length ? open : regions, (r) => r.weight)!
  if (!open.length) year = int(h, region.years[0], region.years[1] - BIRTH_MARGIN) || 1
  return { region, year }
}

/** Самое раннее время игры (ключ «Экстримал»): страна и год, с которых начинается самая ранняя хроника. */
export function earliestStart(eras: EraMeta[]): { era: string; year: number } {
  let best = { era: eras[0].id, year: Infinity }
  for (const e of eras) for (const r of birthRegions(e)) if (r.years[0] < best.year) best = { era: e.id, year: r.years[0] }
  return best
}

/** Рождение в самом раннем году игры: край - среди открытых в этот год (по весам), сословие и пол - жребием. Впереди
 *  вся хроника страны - самая долгая дорога для династии. */
export function earliestBirth(seed: number, eras: EraMeta[]): Birth {
  const start = earliestStart(eras)
  const era = eras.find((e) => e.id === start.era)!
  const h = { rng: (seed ^ 0x51ed270b) >>> 0 }
  const open = birthRegions(era).filter((r) => r.years[0] <= start.year)
  const region = weighted(h, open, (r) => r.weight)!
  const classes = era.classes.filter((c) => (region.classWeights[c.id] ?? 0) > 0)
  const cls = weighted(h, classes, (c) => region.classWeights[c.id])!.id
  return { era: era.id, region: region.id, year: start.year || 1, cls, sex: chance(h, 0.5) ? 'm' : 'f' }
}

/** Лотерея рождения. Отдельный поток случайных чисел, чтобы жизнь от того же seed не менялась. */
export function rollBirth(seed: number, lottery: Lottery, eras: EraMeta[]): Birth {
  const h = { rng: (seed ^ 0x5bd1e995) >>> 0 }
  const era = lottery === 'population' ? weighted(h, eras, (e) => e.population)! : pick(h, eras)
  const { region, year } = pickPlace(h, era)
  const classes = era.classes.filter((c) => (region.classWeights[c.id] ?? 0) > 0)
  const cls = weighted(h, classes, (c) => region.classWeights[c.id])!.id
  return { era: era.id, region: region.id, year, cls, sex: chance(h, 0.5) ? 'm' : 'f' }
}

/** Высокое положение при рождении (A/B второй жизни, вариант b): знать или землевладельцы края - по их долям;
 *  если в крае их нет - самое высокое из возможных сословий. Страна, край, год и пол - как выпало. */
const HIGH_CLASSES = ['noble', 'landowner']
const CLASS_RANK = ['noble', 'landowner', 'trader', 'craftsman', 'peasant', 'slave']
export function highBirth(seed: number, birth: Birth, era: EraMeta): Birth {
  const region = era.regions.find((r) => r.id === birth.region)
  if (!region) return birth
  const w = region.classWeights
  const h = { rng: (seed ^ 0x2c1b3c6d) >>> 0 }
  const high = HIGH_CLASSES.filter((c) => (w[c] ?? 0) > 0)
  const cls = high.length ? weighted(h, high, (c) => w[c])! : (CLASS_RANK.find((c) => (w[c] ?? 0) > 0) ?? birth.cls)
  return { ...birth, cls }
}

/** Награда за установку на главный экран: царская семья - знать края с отметкой royal. Знать есть во всех краях;
 *  если когда-нибудь не будет - просто высокое положение. */
export function royalBirth(seed: number, birth: Birth, era: EraMeta): Birth {
  const region = era.regions.find((r) => r.id === birth.region)
  if (!region || !((region.classWeights.noble ?? 0) > 0)) return highBirth(seed, birth, era)
  return { ...birth, cls: 'noble', royal: true }
}

function emptyHero(seed: number): Hero {
  return {
    id: '',
    name: '',
    sex: 'm',
    birthYear: 0,
    era: '',
    region: '',
    cls: '',
    religion: '',
    age: 0,
    alive: true,
    generation: 1,
    attrs: { health: 50, intellect: 50, strength: 50, charisma: 50, diligence: 50, risk_tolerance: 50 },
    hidden: { happiness: 55, stress: 20, loneliness: 20, reputation: 0, self_esteem: 50, faith: 50 },
    money: 0,
    traits: [],
    skills: {},
    tags: [],
    flags: [],
    profession: null,
    npcs: [],
    triggers: [],
    seen: {},
    diary: [],
    history: [],
    pattern: { craft_power: 0, home_road: 0, faith_reason: 0, memory_future: 0 },
    places: [],
    lifestyle: {},
    home: 1,
    animals: [],
    lastTurning: 0,
    seed,
  }
}

function rollTraits(state: GameState, era: EraDef | EraMeta, inherited: string[] = []): string[] {
  const traits = inherited.filter(() => chance(state, 0.4))
  const want = int(state, 2, 3)
  let guard = 0
  while (traits.length < want && guard++ < 50) {
    const t = pick(state, era.traits)
    if (!traits.includes(t)) traits.push(t)
  }
  return traits
}

function rollAttrs(state: GameState, hero: Hero, parent?: Hero): void {
  for (const id of ATTRIBUTES) {
    const own = bell(state, id === 'health' ? 62 : 50, 30)
    const value = parent ? own * 0.7 + parent.attrs[id as AttrId] * 0.3 : own
    hero.attrs[id] = Math.round(clamp(value, 5, 95))
  }
}

/** Новая жизнь. Без birth место, время и сословие выбираются случайно внутри страны. */
export function newLife(era: EraDef | EraMeta, settings: GameSettings, seed: number, family?: Family, birth?: Birth): GameState {
  const hero = emptyHero(seed)
  const state: GameState = {
    version: SAVE_VERSION,
    year: 0,
    hero,
    family: family ?? { id: '', lives: [], flags: [], estate: { assets: [], debts: 0 }, trade: { inventory: { goods: [], capacity: 20 }, businesses: [] } },
    rng: seed,
    phase: 'year',
    queue: [],
    settings,
    lastFocus: null,
    nextId: 1,
    reveal: {},
  }
  state.family.id ||= `f${seed.toString(36)}`
  hero.id = `h${seed.toString(36)}`
  hero.era = era.id

  const place = birth ? { region: regionOf(era, birth.region), year: birth.year } : pickPlace(state, era)
  const region = place.region
  hero.region = region.id
  hero.places = [region.id]
  hero.birthYear = place.year
  state.year = hero.birthYear

  const classes = era.classes.filter((c) => (region.classWeights[c.id] ?? 0) > 0)
  const cls = (birth && era.classes.find((c) => c.id === birth.cls)) || weighted(state, classes, (c) => region.classWeights[c.id])!
  hero.cls = cls.id
  hero.sex = birth?.sex ?? (chance(state, 0.5) ? 'm' : 'f')
  hero.religion = rollReligion(state, region, hero.birthYear, cls.id)
  hero.name = pick(state, region.names[hero.sex]).id
  hero.money = int(state, cls.money[0], cls.money[1])
  hero.tags = [...(region.tags ?? []), ...(cls.tags ?? [])]
  if (cls.id === 'noble') hero.hidden.reputation = 20
  if (cls.id === 'slave') hero.hidden.reputation = -10
  // Царская семья: после бросков, чтобы остальная жизнь от того же seed не менялась.
  if (birth?.royal && cls.id === 'noble') {
    hero.tags.push('royal')
    hero.money = cls.money[1] * 2
    hero.hidden.reputation = 40
  }
  if (birth?.boons?.wealth) hero.money = Math.round(hero.money * birth.boons.wealth)
  rollAttrs(state, hero)
  if (birth?.boons?.health) hero.attrs.health = Math.min(95, hero.attrs.health + birth.boons.health)
  hero.traits = rollTraits(state, era)
  initHousehold(state)

  makeNpc(state, era, 'father', 'm', undefined, int(state, 20, 60))
  makeNpc(state, era, 'mother', 'f', undefined, int(state, 40, 80))
  const siblings = int(state, 0, 3)
  for (let i = 0; i < siblings; i++) {
    makeNpc(state, era, 'sibling', undefined, addYears(hero.birthYear, -int(state, 1, 10)), int(state, 10, 60))
  }
  hero.birthCls = hero.cls
  hero.diary.push({ year: state.year, age: 0, key: 'diary.born', params: { region: { key: `region.${hero.region}` }, cls: { key: `class.${classKey(hero.cls, hero.tags)}` } }, reg: hero.region, rel: hero.religion, major: true, topic: 'family', icon: 'birth', score: 100 })
  return state
}

/** Главные записи дневника: начало жизни и последние важные события. */
function biography(h: Hero): DiaryEntry[] {
  const major = h.diary.filter((d) => d.major)
  return major.length <= 12 ? major : [major[0], ...major.slice(-11)]
}

/** Сводка прожитой жизни для мемориала и родословной. */
export function summarize(state: GameState, era: EraDef): LifeSummary {
  const h = state.hero
  // Переехал в другую страну - отчёт по ней (её края, сословия); передали страну рождения - берём нынешнюю.
  if (h.era !== era.id && isEraLoaded(h.era)) era = eraById(h.era)
  return {
    heroId: h.id,
    familyId: state.family.id,
    generation: h.generation,
    name: h.name,
    sex: h.sex,
    era: h.era,
    region: h.region,
    cls: h.cls,
    religion: h.religion,
    profession: h.profession,
    birthYear: h.birthYear,
    deathYear: h.deathYear ?? state.year,
    age: h.age,
    cause: h.deathCause ?? 'unknown',
    children: h.npcs.filter((n) => n.role === 'child').length,
    biography: biography(h),
    money: h.money,
    diary: h.diary,
    npcs: h.npcs,
    history: h.history,
    places: h.places,
    traits: h.traits,
    report: buildReport(state, era),
    offChronicle: state.offChronicle,
    erasLived: h.erasLived,
    dreamSeen: h.dreamSeen,
    goal: h.goal,
    abroad: h.abroad,
    returned: h.returned,
    mortality: state.settings.mortality,
    protectedLife: state.settings.protectedUntil !== undefined,
    tags: h.tags,
    skills: h.skills,
    animals: h.animals,
    home: h.home,
    rent: h.rent,
    land: h.land,
    slaves: h.slaves,
    estateSnapshot: state.family.estate?.assets.length ? structuredClone(state.family.estate) : undefined,
    house: state.family.house,
    familyGoal: state.family.goal ? { ...state.family.goal } : undefined,
    tradeSnapshot: state.family.trade && (state.family.trade.businesses.length || state.family.trade.inventory.goods.length) ? structuredClone(state.family.trade) : undefined,
  }
}

/**
 * Продолжить род из мемориала (отзыв владельца 05.11). Мемориал хранит итог жизни, а не всё состояние игры: умерший
 * герой собирается заново по итогу - близкие, деньги, края, метки, навыки, скот, цель. Этого хватает, чтобы выбрать
 * наследника и передать ему жизнь (continueWithHeir). Род продолжается с года смерти героя.
 */
export function stateFromMemorial(era: EraDef, life: LifeSummary, memorial: LifeSummary[], settings: GameSettings): GameState {
  const seed = [...life.heroId].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0
  const s = newLife(era, settings, seed)
  const h = s.hero
  Object.assign(h, {
    id: life.heroId,
    name: life.name,
    sex: life.sex,
    era: life.era,
    region: life.region,
    cls: life.cls,
    religion: life.religion ?? h.religion,
    profession: life.profession,
    birthYear: life.birthYear,
    deathYear: life.deathYear,
    deathCause: life.cause,
    age: life.age,
    alive: false,
    generation: life.generation,
    money: life.money,
    diary: life.diary,
    npcs: structuredClone(life.npcs),
    history: life.history,
    places: life.places,
    traits: life.traits,
    tags: life.tags ?? [],
    skills: { ...h.skills, ...life.skills },
    animals: life.animals ?? [],
    // Хозяйство: старые записи мемориала его не хранят - тогда дом по сословию (как при рождении), без земли и рабов.
    home: life.home ?? h.home,
    rent: life.rent,
    land: life.land,
    slaves: life.slaves,
    abroad: life.abroad,
    returned: life.returned,
    erasLived: life.erasLived ?? [life.era],
    goal: life.goal,
    dreamSeen: life.dreamSeen,
  })
  s.family = { id: life.familyId, lives: memorial.filter((l) => l.familyId === life.familyId), flags: [], house: life.house, goal: life.familyGoal ? { ...life.familyGoal } : undefined, estate: life.estateSnapshot ? structuredClone(life.estateSnapshot) : { assets: [], debts: 0 }, trade: life.tradeSnapshot ? structuredClone(life.tradeSnapshot) : { inventory: { goods: [], capacity: 20 }, businesses: [] } }
  s.year = life.deathYear
  s.offChronicle = life.offChronicle
  s.phase = 'dead'
  s.queue = []
  // Новые люди и наследник получают id, которых ещё не было в этом роду.
  const nums = [...life.npcs.map((n) => n.id), ...s.family.lives.map((l) => l.heroId)].map((id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0))
  s.nextId = Math.max(0, ...nums) + 1
  return s
}

/** Можно ли продолжить род этой жизни из мемориала: она последняя в своём роду и род не продолжается сейчас в игре. */
export function memorialCanContinue(life: LifeSummary, memorial: LifeSummary[], current: GameState | null): boolean {
  if (current && current.family.id === life.familyId && current.phase !== 'dead') return false
  return !memorial.some((l) => l.familyId === life.familyId && l.generation > life.generation)
}

/** Год, когда кончается хроника края героя (годы страны или края, что раньше). */
export function chronicleEnd(state: GameState): number {
  const meta = ERA_META[state.hero.era]
  const region = meta?.regions.find((r) => r.id === state.hero.region)
  return Math.min(meta?.years[1] ?? Infinity, region?.years[1] ?? Infinity)
}

/**
 * Куда история уводит семью, когда хроника края кончается (отзыв владельца 05.11): после монголов из Багдада бегут
 * в Дамаск и Каир, двор Сун уходит из Кайфэна в Ханчжоу, Константинополь становится Стамбулом. Только переходы,
 * у которых есть историческая причина; где продолжения в игре нет (Европа после 1500, ацтеки, майя) - хроника кончается.
 */
const SUCCESSORS: Record<string, { era?: string; to: string[] }> = {
  baghdad: { to: ['damascus', 'cairo'] },
  cordoba: { to: ['cairo', 'damascus'] },
  kaifeng: { to: ['hangzhou'] },
  thessalonica: { to: ['constantinople'] },
  nicaea: { to: ['constantinople', 'trebizond'] },
  constantinople: { era: 'ISL', to: ['istanbul'] },
  trebizond: { era: 'ISL', to: ['istanbul'] },
  kamakura: { to: ['kyoto'] },
  kiev: { to: ['vladimir', 'novgorod'] },
  vladimir: { to: ['moscow'] },
  palenque: { to: ['tikal', 'calakmul'] },
  copan: { to: ['tikal', 'calakmul'] },
}

/** Край, куда переберётся семья, если хроника здешнего края кончится раньше, чем через `ahead` лет (или уже кончилась). */
export function chronicleSuccessor(state: GameState, ahead = 20): { era: string; region: string; from: string } | null {
  const hero = state.hero
  if (state.offChronicle !== undefined || state.year + ahead <= chronicleEnd(state)) return null
  const s = SUCCESSORS[hero.region]
  if (!s) return null
  const era = ERA_META[s.era ?? hero.era]
  const region = s.to.map((id) => era?.regions.find((r) => r.id === id)).find((r) => r && r.years[0] <= state.year + ahead && Math.min(r.years[1], era.years[1]) > state.year)
  return region ? { era: era.id, region: region.id, from: hero.region } : null
}

/** Наследник прожил бы большую часть жизни после конца хроники: род «ждёт продолжения» (п. 9 ТЗ v3) - если только
 *  история не уводит семью в край, где хроника продолжается (chronicleSuccessor). */
export function eraEnding(state: GameState): boolean {
  return state.offChronicle === undefined && heirs(state).length > 0 && state.year + 20 > chronicleEnd(state) && !chronicleSuccessor(state)
}

/**
 * Кто может продолжить род: живые дети, которые рядом (не уехали); если детей нет - внуки,
 * если и внуков нет - правнуки. Внутри колена - по старшинству.
 */
/** Кто вдали от героя, но может продолжить род: оставшийся на родине, когда герой уехал на чужбину
 * (род продолжается там). Уехавший неизвестно куда, проданный, сосланный, ушедший в монастырь - нет. */
const HEIR_AWAY: AwayReason[] = ['homeland']

export function heirs(state: GameState): Npc[] {
  const npcs = state.hero.npcs
  for (const gen of [1, 2, 3]) {
    const list = npcs.filter((n) => n.alive && (!n.away || HEIR_AWAY.includes(n.away.reason)) && descentOf(npcs, n) === gen).sort((a, b) => a.birthYear - b.birthYear)
    if (list.length) return list
  }
  return []
}

/** Где живёт наследник, оставшийся на родине, когда герой уехал на чужбину; null - там же, где герой. */
export function heirHome(state: GameState, child: Npc): { era: string; region: string } | null {
  const home = state.hero.abroad?.homeland
  if (!home) return null
  // Внук или правнук - там же, где его родитель (ребёнок героя).
  let n: Npc | undefined = child
  while (n && n.role !== 'child') n = state.hero.npcs.find((x) => x.id === n!.parentId)
  return n?.away?.reason === 'homeland' ? home : null
}

/** Доля наследства, которую получит этот ребёнок. */
/**
 * Доля наследника в земле и рабах: где наследуют сыновья - всё хозяйство остаётся сыну (дочь при братьях не получает),
 * где делят поровну - каждому ребёнку его часть (округляя в пользу того, кто остаётся в доме).
 */
export function estateShare(state: GameState, era: EraDef, child: Npc): { land: number; slaves: number } {
  const hero = state.hero
  const land = hero.land ?? 0
  const slaves = hero.slaves ?? 0
  if (!land && !slaves) return { land: 0, slaves: 0 }
  const kids = heirs(state)
  if ((era.regions.find((r) => r.id === hero.region)?.inheritance ?? era.inheritance) === 'sons_first' && kids.some((k) => k.sex === 'm')) {
    return child.sex === 'm' ? { land, slaves } : { land: 0, slaves: 0 }
  }
  const n = Math.max(1, kids.length)
  return { land: Math.ceil(land / n), slaves: Math.ceil(slaves / n) }
}

export function inheritanceShare(state: GameState, era: EraDef, child: Npc): number {
  const kids = heirs(state)
  const money = Math.max(0, state.hero.money)
  // Наследник на родине делит имущество по её обычаю: края уехавшего героя в этой стране может не быть.
  const custom = era.regions.find((r) => r.id === state.hero.region)?.inheritance ?? era.inheritance
  if (custom === 'youngest_hearth') {
    // Степной обычай: младший сын - отчигин, «хранитель очага» - получает отцовскую юрту и двойную долю,
    // старшие сыновья - по доле стада, дочерям - приданое.
    const sons = kids.filter((k) => k.sex === 'm')
    if (sons.length > 0) {
      const daughters = kids.length - sons.length
      const dowry = Math.round(money * 0.1)
      if (child.sex === 'f') return dowry
      const share = (money - dowry * daughters) / (sons.length + 1)
      const youngest = sons.reduce((a, b) => (b.birthYear > a.birthYear ? b : a))
      return Math.round(child.id === youngest.id ? share * 2 : share)
    }
  }
  if (custom === 'sons_first') {
    const sons = kids.filter((k) => k.sex === 'm')
    if (sons.length > 0) {
      // Сыновья делят имущество, дочерям - приданое примерно в десятую часть.
      const daughters = kids.length - sons.length
      const dowry = Math.round(money * 0.1)
      if (child.sex === 'f') return dowry
      return Math.round((money - dowry * daughters) / sons.length)
    }
  }
  return Math.round(money / Math.max(1, kids.length))
}

/**
 * Семья внука или правнука, ставшего героем: родители - умерший ребёнок (внук) героя и второй родитель
 * (если жив - опекун), братья и сёстры - дети того же родителя.
 */
function familyOfDescendant(state: GameState, era: EraDef, prevHero: Hero, heir: Npc): void {
  const hero = state.hero
  const via = prevHero.npcs.find((n) => n.id === heir.parentId)
  if (via) {
    hero.npcs.push({ ...via, role: via.sex === 'm' ? 'father' : 'mother', attitude: 60, alive: false, deathYear: via.deathYear ?? state.year, parentId: undefined })
    // Второй родитель: жив примерно в половине случаев - он и растит сироту.
    const age = yearsBetween(via.birthYear, state.year)
    if (age < 70 && chance(state, 0.55)) {
      const other = makeNpc(state, era, via.sex === 'm' ? 'mother' : 'father', via.sex === 'm' ? 'f' : 'm', addYears(via.birthYear, int(state, -4, 6)), 55)
      other.married = true
    }
  }
  for (const n of prevHero.npcs) {
    if (n.role === 'grandchild' && n.parentId === heir.parentId && n.id !== heir.id && n.alive && !n.away) hero.npcs.push({ ...n, role: 'sibling', attitude: 30, parentId: undefined })
  }
}

/**
 * Своя семья и дело наследника, если он уже взрослый: супруг (если был в браке), его дети и внуки, ремесло -
 * переходят к нему как к герою. Раньше наследник 26+ лет начинал холостым, бездетным и без дела, а выбор ремесла
 * (до 25 лет) и свадьба по возрасту ему уже не выпадали.
 */
function ownFamily(state: GameState, era: EraDef, prevHero: Hero, heir: Npc): void {
  const hero = state.hero
  const fits = (id?: string) => {
    const p = era.professions.find((x) => x.id === id)
    return p && !p.promotion_only && (!p.sex || p.sex === hero.sex) && (!p.classes || p.classes.includes(hero.cls)) && (!p.regions || p.regions.includes(hero.region)) && p.minAge <= hero.age ? p : undefined
  }
  // Дело: своё (им он уже занимается - даже если сословие родителя с тех пор сменилось), а если его не было - семейное.
  const own = era.professions.find((x) => x.id === heir.profession && (!x.sex || x.sex === hero.sex))
  const prof = own ?? (hero.age >= 16 ? fits(prevHero.profession ?? undefined) : undefined)
  if (prof) {
    hero.profession = prof.id
    hero.skills[prof.skill] = Math.max(hero.skills[prof.skill] ?? 0, Math.min(55, 15 + (hero.age - 14) * 2))
  }
  // Его дети (внуки умершего героя) - теперь дети героя, их дети - внуки.
  const kids = prevHero.npcs.filter((n) => n.role === 'grandchild' && n.parentId === heir.id)
  const ids = new Set(kids.map((k) => k.id))
  for (const k of kids) hero.npcs.push({ ...k, role: 'child', parentId: undefined, attitude: Math.max(k.attitude, 50) })
  for (const g of prevHero.npcs) if (g.role === 'grandchild' && g.parentId && ids.has(g.parentId)) hero.npcs.push({ ...g })
  // Супруг - после детей: его имя не должно совпасть с именем ребёнка или внука (в Китае - имя предка).
  if (heir.married) {
    const spouse = makeNpc(state, era, 'spouse', undefined, undefined, 45)
    spouse.since = addYears(state.year, -Math.max(0, Math.min(hero.age - era.marriageAge[hero.sex][0], int(state, 1, 15))))
    if (!hero.tags.includes('married')) hero.tags.push('married')
  }
}

/** Долгоживущие питомцы (попугай, черепаха) и все, кто живёт в доме, переходят к наследнику - запись в дневник. */
function inheritPets(hero: Hero, year: number): void {
  for (const pet of hero.animals.filter((a) => isPet(a.kind) && (a.born ?? a.since) < hero.birthYear)) {
    hero.diary.push({ year, age: hero.age, key: pet.name ? 'diary.pet_inherited_named' : 'diary.pet_inherited', params: { animal: { key: `pet.${pet.kind}` }, name: { name: pet.name ?? '' }, n: Math.max(1, year - pet.since) }, reg: hero.region, rel: hero.religion, topic: 'life', score: 12 })
  }
}

/** Где имя предка запрещено (Китай): дети наследника, названные ещё при прошлом герое, не носят имени деда или прадеда. */
function noAncestorNames(state: GameState, era: EraDef): void {
  if (ancestorRule(era, state.hero.region) !== 'forbid') return
  const hero = state.hero
  const bad = new Set([hero.name, ...(hero.ancestors ?? []), ...hero.npcs.filter((n) => n.role === 'father' || n.role === 'mother').map((n) => n.name)])
  for (const c of hero.npcs.filter((n) => n.role === 'child' && bad.has(n.name))) c.name = childName(state, era, c.sex, [...bad])
}

/** Продолжение рода: наследник становится новым героем, время идёт дальше. */
export function continueWithHeir(prev: GameState, era: EraDef, childId: string): GameState {
  const parent = prev.hero
  // Род мог переехать в другую страну: наследник живёт по её правилам.
  if (parent.era !== era.id && isEraLoaded(parent.era)) era = eraById(parent.era)
  const child = heirs(prev).find((n) => n.id === childId)
  if (!child) throw new Error('Heir not found')
  // Наследник остался на родине: род продолжается там (страну загружает интерфейс заранее).
  const left = heirHome(prev, child)
  const home = left && isEraLoaded(left.era) ? left : null
  if (home) era = eraById(home.era)
  // Хроника края кончается - семья перебирается туда, где история продолжается (страну загружает интерфейс заранее).
  const next = !home ? chronicleSuccessor(prev) : null
  const moved = next && isEraLoaded(next.era) ? next : null
  if (moved) era = eraById(moved.era)
  const gen = descentOf(parent.npcs, child)

  const hero = emptyHero(parent.seed)
  const state: GameState = {
    ...prev,
    hero,
    queue: [],
    phase: 'year',
    lastFocus: null,
    // Защиту наследнику ставит игра (если он - одна из первых protected_lives жизней), сама она не переходит.
    settings: { ...prev.settings, protectedUntil: undefined },
  }
  // id наследника - с семьёй: счётчик nextId у каждой семьи свой, без неё id повторялись (storage.uniqueHeroIds).
  hero.id = `h${prev.family.id.replace(/^f/, '')}-${prev.nextId++}`
  state.nextId = prev.nextId
  hero.era = home || moved ? era.id : parent.era
  hero.region = home ? home.region : moved ? moved.region : parent.region
  hero.places = home ? [home.region] : moved ? [moved.region] : [parent.places[parent.places.length - 1] ?? parent.region]
  // Сословие чужбины может не найтись на родине - тогда то, в котором родился родитель.
  hero.cls = era.classes.some((c) => c.id === parent.cls) ? parent.cls : (parent.birthCls ?? era.classes[0].id)
  hero.birthCls = hero.cls
  // Деды наследника - родители умершего героя (для детей наследника это прадеды);
  // у внука деды - сам умерший герой и его супруг.
  hero.ancestors =
    gen === 1 ? parent.npcs.filter((n) => n.role === 'father' || n.role === 'mother').map((n) => n.name) : [parent.name, ...parent.npcs.filter((n) => n.role === 'spouse').map((n) => n.name)]
  hero.religion = parent.religion
  // Наследник остаётся в родительском доме и с тем же хозяйством.
  hero.home = parent.home ?? 1
  // Съёмное жильё переходит наследнику вместе с платой, своего дома у него нет.
  hero.rent = parent.rent ? { ...parent.rent } : undefined
  hero.animals = (parent.animals ?? []).map((a) => ({ ...a }))
  // Земля и рабы - по обычаю наследования (estateShare); наследник на чужой родине их не получает - они остались там.
  const share = left ? { land: 0, slaves: 0 } : estateShare(prev, era, child)
  if (share.land) hero.land = share.land
  if (share.slaves) hero.slaves = share.slaves
  hero.generation = parent.generation + 1
  hero.name = child.name
  hero.sex = child.sex
  hero.birthYear = child.birthYear
  hero.age = yearsBetween(child.birthYear, prev.year)
  hero.money = inheritanceShare(prev, era, child)
  rollAttrs(state, hero, parent)
  hero.traits = rollTraits(state, era, child.traits.concat(parent.traits))
  hero.hidden.reputation = Math.round(parent.hidden.reputation * 0.5)
  hero.hidden.happiness = 45
  hero.hidden.stress = 30
  const cls = era.classes.find((c) => c.id === hero.cls)
  hero.tags = [...(regionOf(era, hero.region).tags ?? []), ...(cls?.tags ?? [])]
  const prof = era.professions.find((p) => p.id === parent.profession)
  if (prof) hero.tags.push(`raised_${prof.skill}`)
  if (parent.tags.includes('freedman') || parent.tags.includes('freeborn_heir')) hero.tags.push('freeborn_heir')
  // Царский род продолжается, пока наследник остаётся в знати.
  if (parent.tags.includes('royal') && hero.cls === 'noble') hero.tags.push('royal')
  // Чужбина: ребёнок, привезённый из родной страны, - ещё немного чужой; рождённый здесь - здешний.
  const pa = parent.abroad
  if (pa && !home && !pa.naturalized && child.birthYear < pa.since) {
    hero.abroad = { ...pa, integration: Math.max(pa.integration, 55), homesick: 20, refusals: 0, nextAsk: prev.year + 3, planned: false }
  }
  hero.erasLived = [hero.era]
  // Сгоревший или отстраивающийся дом достаётся наследнику таким, какой есть.
  hero.tags.push(...parent.tags.filter((t) => HOME_TAGS.includes(t)))
  hero.homeSince = parent.homeSince
  hero.flags = parent.flags.filter((f) => f.startsWith('family_'))
  // Навыки, которые ребёнок успел получить в семье.
  for (const skill of era.skills) hero.skills[skill] = 0
  if (prof && hero.age >= 8) hero.skills[prof.skill] = Math.min(30, hero.age * 1.5)
  // Учёба, которую дал родитель.
  const edu = educationSkill(era, child)
  if (edu) hero.skills[edu.skill] = Math.max(hero.skills[edu.skill] ?? 0, edu.value)

  ownFamily(state, era, parent, child)
  if (moved) {
    hero.diary.push({ year: prev.year, age: hero.age, key: 'diary.chronicle_move', params: { why: { key: `chronicle.why.${moved.from}` }, to: { key: `region.${moved.region}` } }, reg: hero.region, rel: hero.religion, major: true, topic: 'history', icon: 'move', score: 60 })
  }
  diceInherit(state, parent)

  // Что из хозяйства досталось наследнику - строкой в дневник сразу после записи о наследстве.
  const estateNote = () => {
    if (hero.land || hero.slaves) hero.diary.push({ year: prev.year, age: hero.age, key: `diary.estate_inherited_${hero.land && hero.slaves ? 'both' : hero.land ? 'land' : 'slaves'}`, params: { land: hero.land ?? 0, slaves: hero.slaves ?? 0 }, reg: hero.region, rel: hero.religion, topic: 'money', score: 30 })
    // Семейные активы - по завещанию или обычаю (inheritance.ts).
    estateForHeir(prev, state, era, heirs(prev), child.id)
    // Дела рода (товарищества) и торговый запас остаются роду - ведёт их наследник.
    const deals = (prev.family.trade?.businesses ?? []).filter((b) => b.active).length
    if (deals) hero.diary.push({ year: prev.year, age: hero.age, key: 'diary.inherit_business', params: { n: deals }, reg: hero.region, rel: hero.religion, topic: 'money', score: 26 })
  }
  if (gen > 1) {
    familyOfDescendant(state, era, parent, child)
    inheritPets(hero, prev.year)
    const via = parent.npcs.find((n) => n.id === child.parentId)
    hero.diary.push({ year: prev.year, age: hero.age, key: gen === 2 ? 'diary.heir_grand' : 'diary.heir_great', params: { parent: { name: parent.name }, psex: parent.sex, via: { name: via?.name ?? '' }, vsex: via?.sex ?? 'm', money: hero.money }, reg: hero.region, rel: hero.religion, major: true, topic: 'family', icon: 'birth', score: 100 })
    estateNote()
    noAncestorNames(state, era)
    return state
  }

  // Родители: умерший герой и второй родитель, если он есть; братья и сёстры - остальные дети.
  const parentNpc: Npc = {
    id: `n${state.nextId++}`,
    role: parent.sex === 'm' ? 'father' : 'mother',
    name: parent.name,
    sex: parent.sex,
    birthYear: parent.birthYear,
    traits: parent.traits.slice(0, 1),
    attitude: 60,
    alive: false,
    deathYear: prev.year,
  }
  hero.npcs.push(parentNpc)
  for (const n of parent.npcs) {
    if (n.role === 'spouse') hero.npcs.push({ ...n, role: n.sex === 'm' ? 'father' : 'mother', attitude: 50 })
    if (n.role === 'child' && n.id !== child.id && n.alive) hero.npcs.push({ ...n, role: 'sibling', attitude: 30 })
  }
  inheritPets(hero, prev.year)
  // Наследник не по обычаю (не старший сын, у степняков - не младший): обойдённый обижен, в краях строгого обычая
  // люди судачат (просьба владельца 09.11: выбор наследника с последствиями).
  const custom = customHeir(heirs(prev), era, parent.region)
  const passed = custom && custom.id !== child.id ? hero.npcs.find((n) => n.id === custom.id) : undefined
  if (passed) {
    passed.attitude = Math.max(-100, passed.attitude - 25)
    const strict = (era.regions.find((r) => r.id === parent.region)?.inheritance ?? era.inheritance) !== 'equal'
    if (strict) hero.hidden.reputation = Math.max(0, hero.hidden.reputation - 4)
    hero.diary.push({ year: prev.year, age: hero.age, key: strict ? 'diary.heir_not_custom_strict' : 'diary.heir_not_custom', params: { who: { name: passed.name }, sex: passed.sex }, reg: hero.region, rel: hero.religion, topic: 'family', score: 26, major: strict })
  }
  hero.diary.push({ year: prev.year, age: hero.age, key: 'diary.heir', params: { parent: { name: parent.name }, psex: parent.sex, money: hero.money }, reg: hero.region, rel: hero.religion, major: true, topic: 'family', icon: 'birth', score: 100 })
  estateNote()
  noAncestorNames(state, era)
  return state
}

/**
 * Первые жизни игрока: сколько детей будет в этой - число, которого ещё не было в прошлых (у кого жизнь была взрослой).
 * Чаще 2–5, реже без детей или 8–9; когда все числа уже были - любое по тем же весам.
 */
export function pickKidsTarget(before: number[], r: () => number): number {
  const weights = [0.6, 1, 2, 3, 3, 3, 2, 1.5, 1, 0.7]
  const used = new Set(before)
  let options = weights.map((w, n) => [n, w] as const).filter(([n]) => !used.has(n))
  if (!options.length) options = weights.map((w, n) => [n, w] as const)
  let x = r() * options.reduce((a, [, w]) => a + w, 0)
  for (const [n, w] of options) if ((x -= w) < 0) return n
  return options[options.length - 1][0]
}
