// Кто и что на картинке: герой, его семья, животные и дом — по состоянию игры.
// Внешность человечков — как на портрете (figureLook): та же кожа, седина, одежда и убор.
import { ERA_META } from '../content'
import { descentOf, maritalStatus, npcAge } from '../engine/rules'
import type { EventDef, GameState, Household, Npc, NpcRole } from '../engine/types'
import { figureLook } from '../pixel/avatar'
import type { Cast, CastMember } from '../pixel/scene'

/** Сколько человек помещается на картинке; остальные — подписью «+N». */
const MAX_PEOPLE = 8

/** Места, где на картинке вся семья, а не только герой и человек события. */
const FAMILY_PLACES = ['home', 'yard', 'market']

function member(state: GameState, n: Npc, role: CastMember['role']): CastMember {
  const h = state.hero
  const age = Math.max(0, npcAge(n, state.year))
  return {
    role,
    sex: n.sex,
    age,
    seed: n.id,
    look: figureLook({ region: h.region, sex: n.sex, age, seed: n.id, cls: h.cls, married: !!n.married || role === 'spouse' || role === 'parent' }),
  }
}

function heroMember(state: GameState): CastMember {
  const h = state.hero
  return {
    role: 'hero',
    sex: h.sex,
    age: h.age,
    seed: h.id,
    look: figureLook({
      region: h.region,
      sex: h.sex,
      age: h.age,
      seed: h.id,
      cls: h.cls,
      body: h.body ?? 0,
      ill: h.tags.includes('ill'),
      married: h.npcs.some((n) => n.role === 'spouse'),
      widow: maritalStatus(h).kind === 'widowed',
      enslaved: h.tags.includes('enslaved'),
    }),
  }
}

/** Обычай края: после свадьбы семья живёт у родителей мужа, отдельно или у родителей жены. */
export function householdRule(state: GameState): Household {
  const meta = ERA_META[state.hero.era]
  return meta?.regions.find((r) => r.id === state.hero.region)?.household ?? meta?.household ?? 'patrilocal'
}

/** Живут ли с героем его родители: до свадьбы — да, после — по обычаю края. */
function parentsAtHome(state: GameState): boolean {
  const h = state.hero
  if (h.age < 16 || maritalStatus(h).kind === 'never' || maritalStatus(h).kind === 'vowed') return true
  const rule = householdRule(state)
  return (rule === 'patrilocal' && h.sex === 'm') || (rule === 'matrilocal' && h.sex === 'f')
}

/**
 * Семья, которая живёт с героем: супруг; дети, пока не выросли и не завели свою семью (у родителей мужа женатые
 * сыновья с детьми остаются в доме); родители — до свадьбы героя и после неё по обычаю края; у ребёнка — братья
 * и сёстры. Уехавших (away) нет.
 */
export function familyCast(state: GameState): Cast {
  const h = state.hero
  const here = (n: Npc) => n.alive && !n.away
  const alive = (role: Npc['role']) => h.npcs.filter((n) => n.role === role && here(n))
  const members: CastMember[] = [heroMember(state)]
  for (const s of alive('spouse')) members.push(member(state, s, 'spouse'))
  if (parentsAtHome(state)) for (const p of [...alive('father'), ...alive('mother')]) members.push(member(state, p, 'parent'))
  if (h.age < 16) for (const s of alive('sibling').filter((s) => npcAge(s, state.year) < 18)) members.push(member(state, s, 'sibling'))
  const patri = householdRule(state) === 'patrilocal'
  const kids = alive('child')
    .filter((c) => (!c.married && npcAge(c, state.year) < 20) || (patri && c.sex === 'm' && c.married))
    .sort((a, b) => a.birthYear - b.birthYear)
  for (const c of kids) members.push(member(state, c, 'child'))
  // Внуки от сыновей, которые живут в доме.
  if (patri) {
    const sons = new Set(kids.filter((c) => c.married).map((c) => c.id))
    for (const g of h.npcs.filter((n) => n.role === 'grandchild' && here(n) && sons.has(n.parentId ?? '') && descentOf(h.npcs, n) === 2)) members.push(member(state, g, 'child'))
  }
  return { members: members.slice(0, MAX_PEOPLE), more: Math.max(0, members.length - MAX_PEOPLE), animals: (h.animals ?? []).map((a) => a.kind), home: h.home ?? 2 }
}

/** Роли людей, о которых событие: человек события и те, кого проверяют условия (упомянутые в тексте). */
export function eventRoles(ev: EventDef | undefined): NpcRole[] {
  if (!ev) return []
  const roles = new Set<NpcRole>()
  for (const c of ev.conditions ?? []) if ('has_npc' in c) roles.add(c.has_npc)
  return [...roles]
}

/**
 * Картинка события: дома, во дворе и на рынке — вся семья; в остальных местах — герой, человек события
 * и все, кто упомянут в тексте события (по одному человеку на роль).
 */
export function eventCast(state: GameState, npcId: string | undefined, place: string | undefined, roles: NpcRole[] = []): Cast {
  if (place && FAMILY_PLACES.includes(place)) {
    const cast = familyCast(state)
    // Человек события, если он не из домашних (друг, наставник), тоже на картинке.
    const npc = state.hero.npcs.find((n) => n.id === npcId && n.alive)
    if (npc && !cast.members.some((m) => m.seed === npc.id)) cast.members.splice(1, 0, member(state, npc, 'npc'))
    cast.members = cast.members.slice(0, MAX_PEOPLE)
    return cast
  }
  const h = state.hero
  const members: CastMember[] = [heroMember(state)]
  const npc = h.npcs.find((n) => n.id === npcId)
  if (npc) members.push(member(state, npc, 'npc'))
  for (const role of roles) {
    if (npc?.role === role) continue
    const other = h.npcs.find((n) => n.role === role && n.alive && !n.away)
    if (other) members.push(member(state, other, role === 'father' || role === 'mother' ? 'parent' : role === 'spouse' || role === 'child' || role === 'sibling' ? role : 'npc'))
  }
  return { members, animals: (h.animals ?? []).map((a) => a.kind), home: h.home }
}
