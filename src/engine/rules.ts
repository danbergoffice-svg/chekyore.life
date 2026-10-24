import { chance, int, pick } from './rng'
import { ATTRIBUTES, HIDDEN } from './types'
import type { AttrId, Condition, DiaryEntry, EraDef, Effect, GameState, Hero, HiddenId, Npc, NpcRole, NpcTarget, Op, ParamId, PatternDelta, Sex } from './types'

// ---------- Годы ----------
// Года хранятся исторически: -44 — это 44 г. до н.э., нулевого года нет.

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
  if ((ATTRIBUTES as readonly string[]).includes(id)) return hero.attrs[id as AttrId]
  if ((HIDDEN as readonly string[]).includes(id)) return hero.hidden[id as HiddenId]
  return hero.skills[id] ?? 0
}

export function changeParam(hero: Hero, id: ParamId, delta: number): void {
  if (id === 'money') {
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

export function aliveNpcs(hero: Hero, role: NpcRole): Npc[] {
  return hero.npcs.filter((n) => n.role === role && n.alive)
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
  if ('classes' in c) return c.classes.includes(hero.cls)
  if ('age' in c) return hero.age >= c.age[0] && hero.age <= c.age[1]
  if ('any' in c) return c.any.some((x) => check(state, x))
  return false
}

export function checkAll(state: GameState, conditions: Condition[] | undefined): boolean {
  return (conditions ?? []).every((c) => check(state, c))
}

// ---------- Персонажи ----------

export function regionOf(era: EraDef, id: string) {
  const r = era.regions.find((x) => x.id === id)
  if (!r) throw new Error(`Unknown region ${id}`)
  return r
}

export function makeNpc(state: GameState, era: EraDef, role: NpcRole, sex?: Sex, birthYear?: number, attitude = 30): Npc {
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
    name: pick(state, region.names[s]).id,
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
  hero.diary.push({ year: state.year, age: hero.age, ...entry })
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
    else if ('set_profession' in e) hero.profession = e.set_profession
    else if ('move' in e) {
      if (hero.places[hero.places.length - 1] !== e.move) hero.places.push(e.move)
      addPattern(hero, era.patternWeights.actions.move)
      note(state, { key: 'diary.moved', params: { place: { key: `place.${e.move}` } }, major: true, topic: 'life', icon: 'move', score: 30 })
    } else if ('npc_profession' in e) {
      const npc = hero.npcs.find((n) => n.id === ctx.npcId)
      if (npc) npc.profession = e.npc_profession
    } else if ('npc_married' in e) {
      const npc = hero.npcs.find((n) => n.id === ctx.npcId)
      if (npc) npc.married = e.npc_married
    } else if ('set_lifestyle' in e) {
      hero.lifestyle[e.set_lifestyle] = e.option
    } else if ('add_npc' in e) {
      const newborn = e.add_npc === 'child' || e.add_npc === 'grandchild' || e.newborn
      const npc = makeNpc(state, era, e.add_npc, undefined, newborn ? state.year : undefined, e.attitude ?? 30)
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
      const gone = new Set(targets(state, e.remove_npc, ctx).map((n) => n.id))
      if (hero.npcs.some((n) => gone.has(n.id) && n.role === 'spouse')) hero.tags = hero.tags.filter((t) => t !== 'married')
      hero.npcs = hero.npcs.filter((n) => !gone.has(n.id))
    } else if ('kill_npc' in e) {
      const npc = targets(state, e.kill_npc, ctx)[0]
      if (npc) killNpc(state, npc)
    } else if ('kill' in e) {
      if (hero.alive) {
        hero.alive = false
        hero.deathCause = e.kill
        hero.deathYear = state.year
      }
    } else if ('chance' in e) {
      if (chance(state, e.chance)) applyEffects(state, era, e.effects, ctx)
    }
  }
}

const CLOSE: NpcRole[] = ['father', 'mother', 'spouse', 'child', 'grandchild', 'sibling', 'friend']

export function killNpc(state: GameState, npc: Npc): void {
  const hero = state.hero
  npc.alive = false
  npc.deathYear = state.year
  if (npc.role === 'spouse') hero.tags = hero.tags.filter((t) => t !== 'married')
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

/** Положение в обществе эпохи, 0–100: сословие, достаток относительно расходов и репутация. */
export function statusOf(hero: Hero, era: EraDef): number {
  const cls = era.classes.find((c) => c.id === hero.cls)
  const base = cls?.status ?? 30
  const upkeep = Math.max(cls?.upkeep ?? 100, 100)
  const wealth = hero.money <= 0 ? -6 : Math.max(-6, Math.min(10, 6 * Math.log10(hero.money / upkeep)))
  return Math.round(clamp(base + wealth + hero.hidden.reputation * 0.1))
}
