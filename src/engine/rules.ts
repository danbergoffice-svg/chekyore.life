import { ERA_META, eraById, isEraLoaded, RELIGION_BY_ID } from '../content'
import { MAX_PETS, makePet, petPossible, pets, randomPet } from './pets'
import { ABROAD_PARAMS, abroadChoice, canEmigrate, emigrate, naturalize, returnHome } from './abroad'
import type { AbroadParam } from './abroad'
import { chance, int, pick, weighted } from './rng'
import { ATTRIBUTES, HIDDEN } from './types'
import type { AncestorNames, AttrId, AwayReason, Condition, DiaryEntry, EraDef, EraMeta, Effect, GameState, Hero, HiddenId, Npc, NpcRole, NpcTarget, Op, ParamId, PatternDelta, RegionDef, Sex } from './types'

// ---------- Годы ----------
// Года хранятся исторически: -44 - это 44 г. до н.э., нулевого года нет.

export function addYears(year: number, n: number): number {
  let y = year + n
  if (year < 0 && y >= 0) y += 1
  if (year > 0 && y <= 0) y -= 1
  return y
}

export function yearsBetween(from: number, to: number): number {
  let d = to - from
  if (from < 0 && to > 0) d -= 1
  if (from > 0 && to < 0) d += 1
  return d
}

export function npcAge(npc: Npc, year: number): number {
  return yearsBetween(npc.birthYear, year)
}

/** Вероятность умереть в течение года в этом возрасте по таблице эпохи. */
export function qx(era: EraDef, age: number): number {
  let q = era.mortality.qx[0][1]
  for (const [from, value] of era.mortality.qx) if (age >= from) q = value
  return q
}

// ---------- Параметры ----------

export const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v))

export function getParam(hero: Hero, id: ParamId | string): number {
  if (id === 'money') return hero.money
  if ((ABROAD_PARAMS as readonly string[]).includes(id)) return hero.abroad?.[id as AbroadParam] ?? 0
  if ((ATTRIBUTES as readonly string[]).includes(id)) return hero.attrs[id as AttrId]
  if ((HIDDEN as readonly string[]).includes(id)) return hero.hidden[id as HiddenId]
  return hero.skills[id] ?? 0
}

export function changeParam(hero: Hero, id: ParamId, delta: number): void {
  if ((ABROAD_PARAMS as readonly string[]).includes(id)) {
    if (hero.abroad) hero.abroad[id as AbroadParam] = clamp(hero.abroad[id as AbroadParam] + delta)
  } else if (id === 'money') {
    hero.money = Math.round(hero.money + delta)
  } else if ((ATTRIBUTES as readonly string[]).includes(id)) {
    hero.attrs[id as AttrId] = clamp(hero.attrs[id as AttrId] + delta)
  } else {
    const min = id === 'reputation' ? -100 : 0
    hero.hidden[id as HiddenId] = clamp(hero.hidden[id as HiddenId] + delta, min, 100)
  }
}

export function changeSkill(hero: Hero, skill: string, delta: number): void {
  // Усердие ускоряет рост навыков, как и воспитание в семье с тем же ремеслом.
  let d = delta
  if (d > 0) {
    d *= 0.7 + hero.attrs.diligence / 170
    if (hero.tags.includes(`raised_${skill}`)) d *= 1.3
  }
  hero.skills[skill] = clamp((hero.skills[skill] ?? 0) + d)
}

function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case '>=': return a >= b
    case '<=': return a <= b
    case '>': return a > b
    case '<': return a < b
    case '==': return a === b
  }
}

/** Потомок в каком колене: 1 - ребёнок, 2 - внук, 3 - правнук (по цепочке parentId). */
export function descentOf(npcs: Npc[], npc: Npc): number {
  if (npc.role === 'child') return 1
  if (npc.role !== 'grandchild') return 0
  const parent = npcs.find((n) => n.id === npc.parentId)
  return parent?.role === 'grandchild' ? 3 : 2
}

/** Ключ роли для подписи: правнуки хранятся как внуки, но подписываются отдельно. */
export function roleKey(npcs: Npc[], npc: Npc): string {
  return npc.role === 'grandchild' && descentOf(npcs, npc) === 3 ? 'great_grandchild' : npc.role
}

export type MaritalKind = 'never' | 'married' | 'remarried' | 'widowed' | 'divorced' | 'vowed'

export interface Marital {
  kind: MaritalKind
  /** Супруг сейчас (married, remarried) или последний (widowed, divorced). */
  spouse?: Npc
  /** Год, когда брак закончился (вдовство, развод). */
  since?: number
  /** Сколько всего было браков и сколько раз овдовел(а). */
  count: number
  widowed: number
}

/** Семейное положение героя: не был в браке, в браке, снова в браке, вдовец/вдова, в разводе, обет. */
export function maritalStatus(hero: Hero): Marital {
  const all = hero.npcs.filter((n) => n.role === 'spouse').sort((a, b) => (a.since ?? 0) - (b.since ?? 0))
  const widowed = all.filter((n) => !n.alive && !n.away).length
  const now = all.find((n) => n.alive && !n.away)
  if (now) return { kind: all.length > 1 ? 'remarried' : 'married', spouse: now, count: all.length, widowed }
  const last = all[all.length - 1]
  if (!last) return { kind: hero.tags.includes('vowed') ? 'vowed' : 'never', count: 0, widowed: 0 }
  if (last.away) return { kind: 'divorced', spouse: last, since: last.away.since, count: all.length, widowed }
  return { kind: 'widowed', spouse: last, since: last.deathYear, count: all.length, widowed }
}

/** Живые и рядом: уехавшие (`away`) в событиях, дома и в наследстве не участвуют. */
export function aliveNpcs(hero: Hero, role: NpcRole): Npc[] {
  return hero.npcs.filter((n) => n.role === role && n.alive && !n.away)
}

/** Живые, но вдали - по ролям или все. */
export function awayNpcs(hero: Hero, role?: NpcRole): Npc[] {
  return hero.npcs.filter((n) => n.alive && n.away && (!role || n.role === role))
}

/** Родные, которых нельзя просто «удалить»: они уходят вдаль, а не исчезают из родословной. */
const KIN: NpcRole[] = ['father', 'mother', 'spouse', 'child', 'grandchild', 'sibling']

/** Отправить человека вдаль: супруг - развод, остальные - уехал/ушёл. */
export function sendAway(state: GameState, npc: Npc, reason: AwayReason, silent = false): void {
  const hero = state.hero
  if (!npc.alive || npc.away) return
  npc.away = { since: state.year, reason: npc.role === 'spouse' && reason === 'left' ? 'divorced' : reason }
  if (npc.role === 'spouse') hero.tags = hero.tags.filter((t) => t !== 'married')
  if (silent) return
  const key = npc.away.reason === 'divorced' ? 'diary.divorced' : `diary.away_${npc.away.reason}`
  note(state, { key, params: { who: { name: npc.name }, sex: npc.sex }, topic: 'family', icon: 'move', score: 20, major: npc.role === 'spouse' || npc.role === 'child' })
}

export function check(state: GameState, c: Condition): boolean {
  const hero = state.hero
  if ('param' in c) return compare(getParam(hero, c.param), c.op, c.value)
  if ('skill' in c) return compare(hero.skills[c.skill] ?? 0, c.op, c.value)
  if ('tag' in c) return hero.tags.includes(c.tag)
  if ('tag_absent' in c) return !hero.tags.includes(c.tag_absent)
  if ('trait' in c) return hero.traits.includes(c.trait)
  if ('trait_absent' in c) return !hero.traits.includes(c.trait_absent)
  if ('flag' in c) return hero.flags.includes(c.flag) || state.family.flags.includes(c.flag)
  if ('flag_absent' in c) return !hero.flags.includes(c.flag_absent) && !state.family.flags.includes(c.flag_absent)
  if ('sex' in c) return hero.sex === c.sex
  if ('profession' in c) return hero.profession !== null && c.profession.includes(hero.profession)
  if ('no_profession' in c) return hero.profession === null
  if ('has_npc' in c) {
    return aliveNpcs(hero, c.has_npc).some((n) => {
      const age = npcAge(n, state.year)
      return age >= (c.age_min ?? 0) && age <= (c.age_max ?? 200)
    })
  }
  if ('no_npc' in c) return aliveNpcs(hero, c.no_npc).length === 0
  if ('has_pet' in c) return pets(state).some((p) => p.kind === c.has_pet)
  if ('pet_possible' in c) return pets(state).length < MAX_PETS && !pets(state).some((p) => p.kind === c.pet_possible) && petPossible(state, c.pet_possible)
  if ('pets_below' in c) return pets(state).length < c.pets_below
  if ('abroad' in c) return !!hero.abroad === c.abroad
  if ('naturalized' in c) return !!hero.abroad?.naturalized === c.naturalized
  if ('can_emigrate' in c) return canEmigrate(state, c.can_emigrate)
  if ('homeland' in c) return !!hero.abroad && c.homeland.includes(hero.abroad.homeland.era)
  if ('classes' in c) return c.classes.includes(hero.cls)
  if ('age' in c) return hero.age >= c.age[0] && hero.age <= c.age[1]
  if ('religion' in c) return faithMatches(hero.religion, c.religion)
  if ('religion_absent' in c) return !faithMatches(hero.religion, c.religion_absent)
  if ('minority' in c) return isMinority(state) === c.minority
  if ('region' in c) return c.region.includes(hero.region)
  if ('any' in c) return c.any.some((x) => check(state, x))
  return false
}

export function checkAll(state: GameState, conditions: Condition[] | undefined): boolean {
  return (conditions ?? []).every((c) => check(state, c))
}

// ---------- Вера ----------

/** Вера героя подходит под список: id религии, её семья (christian, islamic…) или признак (monks, fasting…). */
export function faithMatches(religion: string, list: string[]): boolean {
  if (list.includes(religion)) return true
  const def = RELIGION_BY_ID.get(religion)
  return !!def && (list.includes(def.group) || (def.tags ?? []).some((t) => list.includes(t)))
}

/** Вера жителей края в этот год (и для этого сословия, если оно верит иначе). */
export function religionWeights(region: RegionDef, year: number, cls?: string): Record<string, number> {
  if (cls && region.classReligions?.[cls]) return region.classReligions[cls]
  let w = region.religions
  for (const e of region.religionEras ?? []) if (year >= e.from) w = e.religions
  return w
}

function regionMeta(hero: Hero): RegionDef | undefined {
  return ERA_META[hero.era]?.regions.find((r) => r.id === hero.region)
}

/** Веры края по убыванию распространённости. */
export function localFaiths(state: GameState): string[] {
  const region = regionMeta(state.hero)
  if (!region) return []
  const w = religionWeights(region, state.year)
  return Object.keys(w).filter((k) => w[k] > 0).sort((a, b) => w[b] - w[a])
}

/** Вера меньшинства: меньше четверти жителей края. */
export function isMinority(state: GameState): boolean {
  const region = regionMeta(state.hero)
  if (!region) return false
  const w = religionWeights(region, state.year)
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  return total > 0 && (w[state.hero.religion] ?? 0) / total < 0.25
}

/** Во что обратиться: 'majority' - главная вера края, 'other' - самая распространённая из чужих. */
export function resolveFaith(state: GameState, target: string): string | undefined {
  if (target !== 'other' && target !== 'majority') return target
  const faiths = localFaiths(state)
  if (target === 'majority') return faiths[0]
  return faiths.find((f) => f !== state.hero.religion)
}

export function rollReligion(state: GameState, region: RegionDef, year: number, cls: string): string {
  const w = religionWeights(region, year, cls)
  const ids = Object.keys(w).filter((k) => w[k] > 0)
  return weighted(state, ids, (id) => w[id]) ?? ids[0] ?? 'roman_gods'
}

/**
 * Общие параметры текстов, которые зависят от края, веры и года: {faith} - вера героя, {other_faith} - самая
 * распространённая чужая вера края, {capital} - столица страны. Не хранятся в дневнике, а считаются при показе.
 */
export function contextParams(region: string, religion: string, year: number): Record<string, { key: string }> {
  const p: Record<string, { key: string }> = {}
  if (religion) p.faith = { key: `religion.${religion}` }
  const era = Object.values(ERA_META).find((e) => e.regions.some((r) => r.id === region))
  const def = era?.regions.find((r) => r.id === region)
  if (!era || !def) return p
  const w = religionWeights(def, year)
  const other = Object.keys(w).filter((k) => k !== religion && w[k] > 0).sort((a, b) => w[b] - w[a])[0]
  if (other) p.other_faith = { key: `religion.${other}` }
  const capital = capitalFor(era, def, year)
  if (capital) p.capital = { key: `region.${capital.id}` }
  return p
}

/** Столица страны в этот год; если столиц несколько (ацтеки и инки), - та, что в той же культуре, что и край. */
export function capitalFor(era: EraMeta, here: RegionDef, year: number): RegionDef | undefined {
  const isCapital = (r: RegionDef) => (r.capital ? year >= r.capital[0] && year <= r.capital[1] : !!r.tags?.includes('capital') && year >= r.years[0] && year <= r.years[1])
  const all = era.regions.filter(isCapital)
  return all.find((r) => r.scene?.style === here.scene?.style) ?? all[0]
}

/** Куда переехать: id региона или '@capital', '@port', '@other' (первый подходящий регион, кроме текущего). */
export function resolveRegion(state: GameState, era: EraMeta, target: string): string | undefined {
  const here = state.hero.region
  const open = era.regions.filter((r) => r.id !== here && state.year >= r.years[0] && state.year <= r.years[1])
  if (!target.startsWith('@')) return open.some((r) => r.id === target) ? target : undefined
  const tag = target.slice(1)
  if (tag === 'other') return [...open].sort((a, b) => b.weight - a.weight)[0]?.id
  if (tag === 'capital') {
    const home = era.regions.find((r) => r.id === here)
    const capital = home && capitalFor(era, home, state.year)
    return capital && capital.id !== here ? capital.id : undefined
  }
  return open.find((r) => r.tags?.includes(tag))?.id
}

// ---------- Персонажи ----------

/** Слово для сословия: знать с отметкой royal (награда за главный экран и её наследники) - «царская семья». */
export function classKey(cls: string, tags?: string[]): string {
  return cls === 'noble' && tags?.includes('royal') ? 'royal' : cls
}

export function regionOf(era: EraDef | EraMeta, id: string) {
  const r = era.regions.find((x) => x.id === id)
  if (!r) throw new Error(`Unknown region ${id}`)
  return r
}

/** Имя, которого ещё нет у героя и его близких: так в одной семье не бывает двух Марков. */
export function freshName(state: GameState, names: { id: string }[]): string {
  const used = new Set([state.hero.name, ...state.hero.npcs.filter((n) => n.alive).map((n) => n.name)])
  for (let i = 0; i < 12; i++) {
    const id = pick(state, names).id
    if (!used.has(id)) return id
  }
  return pick(state, names).id
}

/** Защищена ли первая жизнь сейчас (до возраста из флага first_life_min_age). */
export function isProtected(state: GameState): boolean {
  return (state.settings.protectedUntil ?? 0) > state.hero.age
}

/** Группы причин для текстов «выжил чудом». */
export const RESCUE_GROUP: Record<string, string> = {
  war: 'war', rus_raid: 'war', epidemic: 'epidemic', childbirth: 'childbirth',
  shipwreck: 'accident', rus_fire: 'accident', rus_frost: 'accident', mine_collapse: 'accident', hunt: 'accident', desert: 'accident', hunger: 'accident',
}
export const RESCUE_VARIANTS = 5

/** Смертельный исход в защищённой жизни: герой выживает с последствиями - здоровье −15 (не ниже 10) и черта «выжил чудом». */
export function rescue(state: GameState, cause: string): void {
  const hero = state.hero
  hero.attrs.health = Math.max(10, hero.attrs.health - 15)
  if (!hero.traits.includes('survivor')) hero.traits.push('survivor')
  if (state.stats) state.stats.rescued++
  const group = RESCUE_GROUP[cause] ?? 'other'
  note(state, { key: `diary.rescued.${group}`, params: { v: int(state, 1, RESCUE_VARIANTS), cause: { key: `cause.${cause}` } }, major: true, topic: 'health', icon: 'find', score: 60 })
}

/** Правило имён предков в регионе героя. */
export function ancestorRule(era: EraDef | EraMeta, region: string): AncestorNames {
  return era.regions.find((r) => r.id === region)?.ancestorNames ?? era.ancestorNames ?? 'allow'
}

/** Имена предков ребёнка героя: родители (герой и супруги), деды (родители героя), прадеды (деды героя). */
export function ancestorNamesOf(hero: Hero): string[] {
  const roles = new Set(['spouse', 'father', 'mother'])
  return [hero.name, ...hero.npcs.filter((n) => roles.has(n.role)).map((n) => n.name), ...(hero.ancestors ?? [])]
}

/** Имя новорождённого с учётом обычаев: в Китае нельзя имя предка, в Европе и Византии часто называют в честь деда. */
export function childName(state: GameState, era: EraDef | EraMeta, sex: Sex): string {
  const names = regionOf(era, state.hero.region).names[sex]
  const rule = ancestorRule(era, state.hero.region)
  const ancestors = new Set(ancestorNamesOf(state.hero))
  if (rule === 'prefer' && chance(state, 0.45)) {
    const own = names.filter((n) => ancestors.has(n.id))
    if (own.length) return pick(state, own).id
  }
  if (rule !== 'forbid') return freshName(state, names)
  const allowed = names.filter((n) => !ancestors.has(n.id))
  return freshName(state, allowed.length ? allowed : names)
}

export function makeNpc(state: GameState, era: EraDef | EraMeta, role: NpcRole, sex?: Sex, birthYear?: number, attitude = 30): Npc {
  const hero = state.hero
  const s: Sex =
    sex ?? (role === 'father' ? 'm' : role === 'mother' ? 'f' : role === 'spouse' ? (hero.sex === 'm' ? 'f' : 'm') : chance(state, 0.5) ? 'm' : 'f')
  const region = regionOf(era, hero.region)
  const ageOffset: Record<NpcRole, [number, number]> = {
    father: [22, 40],
    mother: [16, 32],
    sibling: [-8, 8],
    friend: [-2, 2],
    spouse: hero.sex === 'm' ? [-15, -3] : [3, 15],
    child: [0, 0],
    grandchild: [0, 0],
    mentor: [18, 35],
    rival: [-3, 3],
    patron: [10, 30],
  }
  const [a, b] = ageOffset[role]
  const npc: Npc = {
    id: `n${state.nextId++}`,
    role,
    name: role === 'child' ? childName(state, era, s) : freshName(state, region.names[s]),
    sex: s,
    birthYear: birthYear ?? addYears(hero.birthYear, -int(state, a, b)),
    traits: [pick(state, era.traits)],
    attitude,
    alive: true,
    since: state.year,
  }
  hero.npcs.push(npc)
  return npc
}

// ---------- Дневник и узор ----------

/** Добавить запись в дневник и вернуть её номер. */
export function note(state: GameState, entry: Omit<DiaryEntry, 'year' | 'age'>): number {
  const hero = state.hero
  hero.diary.push({ year: state.year, age: hero.age, reg: hero.region, rel: hero.religion, ...entry })
  return hero.diary.length - 1
}

export function addPattern(hero: Hero, delta: PatternDelta | undefined, times = 1): void {
  if (!delta) return
  for (const [axis, v] of Object.entries(delta)) hero.pattern[axis as keyof Hero['pattern']] += (v ?? 0) * times
}

/** Контекст события: к какому персонажу оно привязано. */
export interface EffectContext {
  npcId?: string
}

function targets(state: GameState, role: NpcTarget, ctx: EffectContext): Npc[] {
  if (role === 'npc') return state.hero.npcs.filter((n) => n.id === ctx.npcId && n.alive)
  return aliveNpcs(state.hero, role)
}

// ---------- Эффекты ----------

export function applyEffects(state: GameState, era: EraDef, effects: Effect[] | undefined, ctx: EffectContext = {}): void {
  const hero = state.hero
  for (const e of effects ?? []) {
    if ('param' in e) changeParam(hero, e.param, e.delta)
    else if ('money_pct' in e) hero.money = Math.round(hero.money + (Math.max(hero.money, 0) * e.money_pct) / 100)
    else if ('skill' in e) changeSkill(hero, e.skill, e.delta)
    else if ('add_tag' in e) { if (!hero.tags.includes(e.add_tag)) hero.tags.push(e.add_tag) }
    else if ('remove_tag' in e) hero.tags = hero.tags.filter((t) => t !== e.remove_tag)
    else if ('set_flag' in e) { if (!hero.flags.includes(e.set_flag)) hero.flags.push(e.set_flag) }
    else if ('clear_flag' in e) hero.flags = hero.flags.filter((t) => t !== e.clear_flag)
    else if ('add_trait' in e) { if (!hero.traits.includes(e.add_trait)) hero.traits.push(e.add_trait) }
    else if ('set_class' in e) hero.cls = e.set_class
    else if ('set_profession' in e) {
      hero.profession = e.set_profession
      // Монахи и монахини дают обет безбрачия: свадебные события их обходят.
      if (e.set_profession === 'monk' && !hero.tags.includes('vowed')) hero.tags.push('vowed')
    }
    else if ('move' in e) {
      if (hero.places[hero.places.length - 1] !== e.move) hero.places.push(e.move)
      addPattern(hero, era.patternWeights.actions.move)
      note(state, { key: 'diary.moved', params: { place: { key: `place.${e.move}` } }, major: true, topic: 'life', icon: 'move', score: 30 })
    } else if ('npc_profession' in e) {
      const npc = hero.npcs.find((n) => n.id === ctx.npcId)
      if (npc) npc.profession = e.npc_profession
    } else if ('npc_tag' in e || 'npc_untag' in e) {
      const npc = hero.npcs.find((n) => n.id === ctx.npcId)
      if (npc) {
        const tags = new Set(npc.tags ?? [])
        if ('npc_tag' in e) tags.add(e.npc_tag)
        else tags.delete(e.npc_untag)
        npc.tags = [...tags]
      }
    } else if ('npc_married' in e) {
      const npc = hero.npcs.find((n) => n.id === ctx.npcId)
      if (npc) npc.married = e.npc_married
    } else if ('set_lifestyle' in e) {
      hero.lifestyle[e.set_lifestyle] = e.option
    } else if ('add_npc' in e) {
      const newborn = e.add_npc === 'child' || e.add_npc === 'grandchild' || e.newborn
      const born = newborn ? state.year : e.age_offset ? addYears(hero.birthYear, -int(state, e.age_offset[0], e.age_offset[1])) : undefined
      const npc = makeNpc(state, era, e.add_npc, undefined, born, e.attitude ?? 30)
      if (e.add_npc === 'spouse') {
        if (!hero.tags.includes('married')) hero.tags.push('married')
        addPattern(hero, era.patternWeights.actions.marriage)
        note(state, { key: 'diary.married', params: { who: { name: npc.name }, sex: npc.sex }, major: true, topic: 'family', icon: 'wedding', score: 45 })
      }
      if (e.add_npc === 'child') {
        addPattern(hero, era.patternWeights.actions.child)
        const key = e.adopted ? `diary.adopted_${npc.sex}` : `diary.child_born_${npc.sex}`
        note(state, { key, params: { child: { name: npc.name } }, major: true, topic: 'family', icon: 'child', score: 40, mood: 10 })
      }
    } else if ('npc_attitude' in e) {
      for (const n of targets(state, e.npc_attitude, ctx)) n.attitude = clamp(n.attitude + e.delta, -100, 100)
    } else if ('remove_npc' in e) {
      // Родные не исчезают из родословной: развод или «ушёл из семьи». Чужие (друг, покровитель) - уходят совсем.
      const list = targets(state, e.remove_npc, ctx)
      for (const n of list.filter((n) => KIN.includes(n.role))) sendAway(state, n, 'left')
      const gone = new Set(list.filter((n) => !KIN.includes(n.role)).map((n) => n.id))
      hero.npcs = hero.npcs.filter((n) => !gone.has(n.id))
    } else if ('npc_away' in e) {
      for (const n of targets(state, e.who ?? 'npc', ctx)) sendAway(state, n, e.npc_away)
    } else if ('npc_return' in e) {
      const who = e.who ?? 'npc'
      const list = who === 'npc' ? hero.npcs.filter((n) => n.id === ctx.npcId && n.alive) : awayNpcs(hero, who)
      for (const n of list.filter((n) => n.away)) {
        const wasSpouse = n.role === 'spouse'
        n.away = undefined
        if (wasSpouse && !hero.tags.includes('married')) hero.tags.push('married')
        note(state, { key: 'diary.returned', params: { who: { name: n.name }, sex: n.sex }, topic: 'family', icon: 'move', score: 24, mood: 6, major: true })
      }
    } else if ('kill_npc' in e) {
      const npc = targets(state, e.kill_npc, ctx)[0]
      if (npc) killNpc(state, npc)
    } else if ('kill' in e) {
      if (hero.alive && isProtected(state)) rescue(state, e.kill)
      else if (hero.alive) {
        hero.alive = false
        hero.deathCause = e.kill
        hero.deathYear = state.year
      }
    } else if ('set_religion' in e) {
      const faith = resolveFaith(state, e.set_religion)
      if (faith && faith !== hero.religion) {
        const from = hero.religion
        hero.religion = faith
        note(state, { key: 'diary.converted', params: { from: { key: `religion.${from}` }, faith: { key: `religion.${faith}` } }, major: true, topic: 'life', icon: 'find', score: 40 })
      }
    } else if ('migrate' in e) {
      const target = resolveRegion(state, era, e.migrate)
      if (target) {
        // На новом месте - новое жильё: сгоревший дом остаётся позади.
        hero.tags = hero.tags.filter((t) => !HOME_TAGS.includes(t))
        hero.region = target
        if (hero.places[hero.places.length - 1] !== target) hero.places.push(target)
        addPattern(hero, era.patternWeights.actions.move)
        note(state, { key: 'diary.migrated', params: { place: { key: `region.${target}` } }, major: true, topic: 'life', icon: 'move', score: 35 })
      }
    } else if ('home' in e) {
      homeEffect(state, e.home)
    } else if ('add_pet' in e) {
      const kind = e.add_pet === '@any' ? randomPet(state) : e.add_pet === '@stray' ? randomPet(state, ['dog', 'cat']) : petPossible(state, e.add_pet) ? e.add_pet : undefined
      if (kind && pets(state).length < MAX_PETS) {
        const kid = e.owner === 'child' ? aliveNpcs(hero, 'child').sort((a, b) => b.birthYear - a.birthYear)[0] : e.owner === 'npc' ? hero.npcs.find((n) => n.id === ctx.npcId) : undefined
        const pet = makePet(state, kind, kid?.id)
        hero.animals = [...(hero.animals ?? []), pet]
        note(state, { key: pet.name ? 'diary.pet_new_named' : 'diary.pet_new', params: { animal: { key: `pet.${kind}` }, name: { name: pet.name ?? '' } }, topic: 'life', icon: 'find', score: 18, mood: 5 })
        changeParam(hero, 'happiness', 4)
        changeParam(hero, 'loneliness', -4)
      }
    } else if ('emigrate' in e) {
      // Дальше в том же списке эффектов - уже правила новой страны (имена, края, сословия).
      if (emigrate(state, e.emigrate, e.reason, e.family) && isEraLoaded(hero.era)) era = eraById(hero.era)
    } else if ('return_home' in e) {
      if (returnHome(state) && isEraLoaded(hero.era)) era = eraById(hero.era)
    } else if ('abroad_choice' in e) {
      abroadChoice(state, e.abroad_choice)
    } else if ('naturalize' in e) {
      naturalize(state)
    } else if ('class_up' in e) {
      // Скачок по сословиям (сон о будущем): не выше землевладельца, а громкие открытия - до знати.
      const order = ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']
      const cap = order.indexOf(e.max ?? 'landowner')
      const at = order.indexOf(hero.cls)
      if (at >= 0 && at < cap) hero.cls = order[Math.min(cap, at + e.class_up)]
    } else if ('money_years' in e) {
      // Деньги в годовых доходах героя: по занятию, а без занятия - по расходам сословия.
      const prof = era.professions.find((p) => p.id === hero.profession)
      const cls = era.classes.find((c) => c.id === hero.cls)
      const year = prof ? (prof.income[0] + prof.income[1]) / 2 : Math.max(100, (cls?.upkeep ?? 100) * 1.2)
      hero.money = Math.round(hero.money + year * e.money_years)
    } else if ('dream_start' in e) {
      // Сон начинает движок сам (выбор «Попробовать вспомнить» в dream_intro).
    } else if ('remove_pet' in e) {
      const pet = pets(state).find((p) => p.kind === e.remove_pet)
      if (pet) hero.animals = hero.animals.filter((a) => a !== pet)
    } else if ('chance' in e) {
      if (chance(state, e.chance)) applyEffects(state, era, e.effects, ctx)
    }
  }
}

const CLOSE: NpcRole[] = ['father', 'mother', 'spouse', 'child', 'grandchild', 'sibling', 'friend']

/** Метки состояния дома: повреждён (общая метка для событий), сгорел, разрушен, отстраивается. */
export const HOME_TAGS = ['home_damaged', 'home_burned', 'home_ruined', 'home_rebuilding']

/** Дом сгорел или разрушен: на ступень меньше и стоит повреждённым, пока не отстроятся; или начали отстраиваться. */
function homeEffect(state: GameState, kind: 'burn' | 'ruin' | 'rebuild'): void {
  const hero = state.hero
  const tags = new Set(hero.tags)
  if (kind === 'rebuild') {
    if (!tags.has('home_damaged')) return
    hero.tags = hero.tags.filter((t) => !HOME_TAGS.includes(t)).concat('home_rebuilding')
    hero.homeSince = state.year
    note(state, { key: 'diary.home_rebuilding', topic: 'money', icon: 'move', score: 18, mood: 3 })
    return
  }
  // Второй пожар в тот же год (огонь из соседнего события) дом второй раз не уменьшает.
  if (tags.has('home_damaged') && hero.homeSince === state.year) return
  hero.home = Math.max(0, (hero.home ?? 1) - 1)
  hero.tags = hero.tags.filter((t) => !HOME_TAGS.includes(t)).concat('home_damaged', kind === 'burn' ? 'home_burned' : 'home_ruined')
  hero.homeSince = state.year
  changeParam(hero, 'happiness', -6)
  changeParam(hero, 'stress', 6)
  note(state, { key: kind === 'burn' ? 'diary.home_burned' : 'diary.home_ruined', topic: 'money', icon: 'disaster', score: 32, mood: -8, major: true })
}

export function killNpc(state: GameState, npc: Npc): void {
  const hero = state.hero
  npc.alive = false
  npc.deathYear = state.year
  if (npc.role === 'spouse' && !npc.away) hero.tags = hero.tags.filter((t) => t !== 'married')
  if (npc.away) {
    // Умер вдали: только весть, горе тише.
    if (KIN.includes(npc.role) && npc.away.reason !== 'divorced') {
      note(state, { key: 'diary.death_far', params: { who: { name: npc.name }, sex: npc.sex, role: { key: `rel.${npc.role}`, sex: npc.sex } }, topic: 'family', icon: 'death', score: 18, mood: -6, major: npc.role === 'child' })
      changeParam(hero, 'happiness', -6)
    }
    return
  }
  if (CLOSE.includes(npc.role)) {
    const close = ['father', 'mother', 'spouse', 'child'].includes(npc.role)
    note(state, {
      key: `diary.death_${npc.role}`,
      params: { who: { name: npc.name }, sex: npc.sex },
      major: close && (npc.role !== 'child' || npcAge(npc, state.year) > 1),
      topic: 'family',
      icon: 'death',
      score: close ? 35 : 15,
      mood: close ? -15 : -6,
    })
    changeParam(hero, 'happiness', close ? -15 : -6)
    changeParam(hero, 'stress', close ? 10 : 4)
  }
}

/** Положение в обществе эпохи, 0–100: сословие или занятие (что выше), достаток относительно расходов и репутация. */
export function statusOf(hero: Hero, era: EraDef | EraMeta): number {
  const cls = era.classes.find((c) => c.id === hero.cls)
  // Занятие поднимает положение до самого низкого сословия, которому оно доступно: крестьянин-судья - уже не крестьянин.
  const prof = hero.profession ? era.professions.find((p) => p.id === hero.profession) : undefined
  const profBase = prof?.classes?.length ? Math.min(...prof.classes.map((id) => era.classes.find((c) => c.id === id)?.status ?? 0)) : 0
  const base = Math.max(cls?.status ?? 30, profBase)
  const upkeep = Math.max(cls?.upkeep ?? 100, 100)
  const wealth = hero.money <= 0 ? -6 : Math.max(-6, Math.min(10, 6 * Math.log10(hero.money / upkeep)))
  return Math.round(clamp(base + wealth + hero.hidden.reputation * 0.1))
}
