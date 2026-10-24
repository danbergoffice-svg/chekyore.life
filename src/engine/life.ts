import { bell, chance, int, pick, weighted } from './rng'
import { addYears, aliveNpcs, clamp, makeNpc, regionOf, yearsBetween } from './rules'
import { buildReport } from './report'
import { ATTRIBUTES } from './types'
import type { AttrId, DiaryEntry, EraDef, Family, GameSettings, GameState, Hero, LifeSummary, Npc } from './types'

export const SAVE_VERSION = 3

function emptyHero(seed: number): Hero {
  return {
    id: '',
    name: '',
    sex: 'm',
    birthYear: 0,
    era: '',
    region: '',
    cls: '',
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
    lastTurning: 0,
    seed,
  }
}

function rollTraits(state: GameState, era: EraDef, inherited: string[] = []): string[] {
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

/** Новая случайная жизнь. */
export function newLife(era: EraDef, settings: GameSettings, seed: number, family?: Family): GameState {
  const hero = emptyHero(seed)
  const state: GameState = {
    version: SAVE_VERSION,
    year: 0,
    hero,
    family: family ?? { id: '', lives: [], flags: [] },
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

  const region = weighted(state, era.regions, (r) => r.weight)!
  hero.region = region.id
  hero.places = [region.id]
  hero.birthYear = int(state, region.years[0], region.years[1] - 40)
  if (hero.birthYear === 0) hero.birthYear = 1
  state.year = hero.birthYear

  const classes = era.classes.filter((c) => (region.classWeights[c.id] ?? 0) > 0)
  const cls = weighted(state, classes, (c) => region.classWeights[c.id])!
  hero.cls = cls.id
  hero.sex = chance(state, 0.5) ? 'm' : 'f'
  hero.name = pick(state, region.names[hero.sex]).id
  hero.money = int(state, cls.money[0], cls.money[1])
  hero.tags = [...(region.tags ?? []), ...(cls.tags ?? [])]
  if (cls.id === 'noble') hero.hidden.reputation = 20
  if (cls.id === 'slave') hero.hidden.reputation = -10
  rollAttrs(state, hero)
  hero.traits = rollTraits(state, era)

  makeNpc(state, era, 'father', 'm', undefined, int(state, 20, 60))
  makeNpc(state, era, 'mother', 'f', undefined, int(state, 40, 80))
  const siblings = int(state, 0, 3)
  for (let i = 0; i < siblings; i++) {
    makeNpc(state, era, 'sibling', undefined, addYears(hero.birthYear, -int(state, 1, 10)), int(state, 10, 60))
  }
  hero.diary.push({ year: state.year, age: 0, key: 'diary.born', params: { region: { key: `region.${hero.region}` }, cls: { key: `class.${hero.cls}` } }, major: true, topic: 'family', icon: 'birth', score: 100 })
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
  return {
    heroId: h.id,
    familyId: state.family.id,
    generation: h.generation,
    name: h.name,
    sex: h.sex,
    era: h.era,
    region: h.region,
    cls: h.cls,
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
  }
}

export function heirs(state: GameState): Npc[] {
  return aliveNpcs(state.hero, 'child')
}

/** Доля наследства, которую получит этот ребёнок. */
export function inheritanceShare(state: GameState, era: EraDef, child: Npc): number {
  const kids = heirs(state)
  const money = Math.max(0, state.hero.money)
  if ((regionOf(era, state.hero.region).inheritance ?? era.inheritance) === 'sons_first') {
    const sons = kids.filter((k) => k.sex === 'm')
    if (sons.length > 0) {
      // Сыновья делят имущество, дочерям — приданое примерно в десятую часть.
      const daughters = kids.length - sons.length
      const dowry = Math.round(money * 0.1)
      if (child.sex === 'f') return dowry
      return Math.round((money - dowry * daughters) / sons.length)
    }
  }
  return Math.round(money / Math.max(1, kids.length))
}

/** Продолжение рода: наследник становится новым героем, время идёт дальше. */
export function continueWithHeir(prev: GameState, era: EraDef, childId: string): GameState {
  const parent = prev.hero
  const child = parent.npcs.find((n) => n.id === childId && n.role === 'child' && n.alive)
  if (!child) throw new Error('Heir not found')

  const hero = emptyHero(parent.seed)
  const state: GameState = {
    ...prev,
    hero,
    queue: [],
    phase: 'year',
    lastFocus: null,
  }
  hero.id = `h${prev.nextId++}`
  state.nextId = prev.nextId
  hero.era = parent.era
  hero.region = parent.region
  hero.places = [parent.places[parent.places.length - 1] ?? parent.region]
  hero.cls = parent.cls
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
  hero.flags = parent.flags.filter((f) => f.startsWith('family_'))
  // Навыки, которые ребёнок успел получить в семье.
  for (const skill of era.skills) hero.skills[skill] = 0
  if (prof && hero.age >= 8) hero.skills[prof.skill] = Math.min(30, hero.age * 1.5)

  // Родители: умерший герой и второй родитель, если он есть; братья и сёстры — остальные дети.
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
  hero.diary.push({ year: prev.year, age: hero.age, key: 'diary.heir', params: { parent: { name: parent.name }, psex: parent.sex, money: hero.money }, major: true, topic: 'family', icon: 'birth', score: 100 })
  return state
}
