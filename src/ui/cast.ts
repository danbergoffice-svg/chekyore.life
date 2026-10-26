// Кто и что на картинке: герой, его семья, животные и дом — по состоянию игры.
import { npcAge } from '../engine/rules'
import type { GameState, Npc } from '../engine/types'
import type { Cast, CastMember } from '../pixel/scene'

function member(state: GameState, n: Npc, role: CastMember['role']): CastMember {
  return { role, sex: n.sex, age: Math.max(0, npcAge(n, state.year)), seed: n.id }
}

function heroMember(state: GameState): CastMember {
  const h = state.hero
  return { role: 'hero', sex: h.sex, age: h.age, seed: h.id }
}

/** Семья, которая живёт с героем: супруг и дети, пока не выросли и не завели свою семью; у ребёнка — родители, братья и сёстры. */
export function familyCast(state: GameState): Cast {
  const h = state.hero
  const alive = (role: Npc['role']) => h.npcs.filter((n) => n.role === role && n.alive && !n.away)
  const members: CastMember[] = [heroMember(state)]
  for (const s of alive('spouse')) members.push(member(state, s, 'spouse'))
  if (h.age < 16) {
    for (const p of [...alive('father'), ...alive('mother')]) members.push(member(state, p, 'parent'))
    for (const s of alive('sibling').filter((s) => npcAge(s, state.year) < 18)) members.push(member(state, s, 'sibling'))
  }
  const kids = alive('child')
    .filter((c) => !c.married && npcAge(c, state.year) < 20)
    .sort((a, b) => a.birthYear - b.birthYear)
  for (const c of kids) members.push(member(state, c, 'child'))
  return { members, animals: (h.animals ?? []).map((a) => a.kind), home: h.home ?? 2 }
}

/** Картинка события: герой и человек, о котором событие; дома — вся семья. */
export function eventCast(state: GameState, npcId: string | undefined, place: string | undefined): Cast {
  if (place === 'home' || place === 'yard') return familyCast(state)
  const members: CastMember[] = [heroMember(state)]
  const npc = state.hero.npcs.find((n) => n.id === npcId)
  if (npc) members.push(member(state, npc, 'npc'))
  return { members, animals: (state.hero.animals ?? []).map((a) => a.kind), home: state.hero.home }
}
