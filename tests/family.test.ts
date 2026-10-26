// ТЗ v3: наследники-внуки и правнуки (п. 3).
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import type { GameState, Npc, Sex } from '../src/engine/types'

const era = await loadEra('RUS')

function npc(state: GameState, role: Npc['role'], sex: Sex, birthYear: number, alive: boolean, parentId?: string): Npc {
  const n: Npc = { id: `n${state.nextId++}`, role, name: sex === 'm' ? 'ivan' : 'maria', sex, birthYear, traits: [], attitude: 50, alive, parentId, deathYear: alive ? undefined : state.year - 3 }
  state.hero.npcs.push(n)
  return n
}

/** Умерший герой 70 лет: двое детей умерли, у одного — трое живых внуков. */
function deadGrandfather(): GameState {
  const s = autoplay(newLife(era, { mode: 'quick', mortality: 'historical', softenHeavy: false }, 4242), era)
  s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'child' && n.role !== 'grandchild')
  const y = s.year
  const son = npc(s, 'child', 'm', y - 45, false)
  npc(s, 'child', 'f', y - 40, false)
  npc(s, 'grandchild', 'm', y - 20, true, son.id)
  npc(s, 'grandchild', 'f', y - 17, true, son.id)
  npc(s, 'grandchild', 'm', y - 9, true, son.id)
  s.hero.money = 600
  return s
}

describe('Наследники через внуков (п. 3)', () => {
  it('нет живых детей → наследники — внуки, по старшинству', () => {
    const s = deadGrandfather()
    const list = heirs(s)
    expect(list.map((n) => n.role)).toEqual(['grandchild', 'grandchild', 'grandchild'])
    expect(list[0].birthYear).toBeLessThan(list[2].birthYear)
  })

  it('живой ребёнок важнее внуков; уехавший — не наследник', () => {
    const s = deadGrandfather()
    const kid = npc(s, 'child', 'f', s.year - 30, true)
    expect(heirs(s).map((n) => n.id)).toEqual([kid.id])
    kid.away = { since: s.year - 2, reason: 'abroad' }
    expect(heirs(s).every((n) => n.role === 'grandchild')).toBe(true)
  })

  it('внук-наследник: отец — умерший сын, братья и сёстры — другие внуки, наследство не больше состояния деда', () => {
    const s = deadGrandfather()
    const heir = heirs(s)[1]
    const next = continueWithHeir(s, era, heir.id)
    const h = next.hero
    const father = h.npcs.find((n) => n.role === 'father')
    expect(father?.alive).toBe(false)
    expect(h.npcs.filter((n) => n.role === 'sibling')).toHaveLength(2)
    expect(h.money).toBeLessThanOrEqual(600)
    expect(h.generation).toBe(s.hero.generation + 1)
    expect(h.diary.some((d) => d.key === 'diary.heir_grand')).toBe(true)
    expect(h.ancestors).toContain(s.hero.name)
  })

  it('нет ни детей, ни внуков → правнуки', () => {
    const s = deadGrandfather()
    for (const n of s.hero.npcs) if (n.role === 'grandchild') n.alive = false
    const g = s.hero.npcs.find((n) => n.role === 'grandchild')!
    const gg = npc(s, 'grandchild', 'm', s.year - 2, true, g.id)
    expect(heirs(s).map((n) => n.id)).toEqual([gg.id])
    const next = continueWithHeir(s, era, gg.id)
    expect(next.hero.diary.some((d) => d.key === 'diary.heir_great')).toBe(true)
  })

  it('долгие жизни: у стариков появляются правнуки', () => {
    let found = 0
    for (let i = 0; i < 120 && !found; i++) {
      const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 7000 + i), era)
      if (s.hero.diary.some((d) => d.key.startsWith('diary.great_grandchild_born_'))) found++
    }
    expect(found).toBeGreaterThan(0)
  })
})
