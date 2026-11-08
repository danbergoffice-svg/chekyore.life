// Сватовство детей (src/engine/children.ts, src/content/marriage.json): предложение, решение игрока, приданое,
// побег при отказе любви, решение самого ребёнка через год, никаких повторных свадеб.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import { decideMatch, matchCost, matchYear, onMatchEvent } from '../src/engine/children'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { EraDef, GameState, MatchKind, Npc } from '../src/engine/types'

const ERAS = await loadAllEras()
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false } as const

function family(era: EraDef, cls = 'craftsman', seed = 4): GameState {
  const s = newLife(era, opts, seed)
  s.hero.age = 45
  s.hero.cls = cls
  s.hero.money = 5000
  s.hero.npcs = []
  return s
}
function kid(s: GameState, era: EraDef, sex: 'm' | 'f', age = 18, attitude = 40): Npc {
  const n = makeNpc(s, era, 'child', sex, s.year - age, attitude)
  if (!s.hero.npcs.includes(n)) s.hero.npcs.push(n)
  return n
}
/** Довести до сватовства нужного вида. */
function offer(s: GameState, era: EraDef, k: Npc, kind: MatchKind) {
  for (let i = 0; i < 200 && !k.match; i++) matchYear(s, era, k, 18)
  k.match = { year: s.year, suitor: 'x', sex: k.sex === 'm' ? 'f' : 'm', cls: s.hero.cls, ...k.match, kind }
}

describe('Сватовство детей', () => {
  it('к ребёнку в брачном возрасте сватаются; к малышу и женатому - нет', () => {
    const era = ERAS.EUR
    const s = family(era)
    const k = kid(s, era, 'f', 18)
    for (let i = 0; i < 50 && !k.match; i++) matchYear(s, era, k, 18)
    expect(k.match).toBeDefined()
    expect(k.match!.suitor).toBeTruthy()
    expect(k.match!.sex).toBe('m')
    const small = kid(s, era, 'm', 8)
    for (let i = 0; i < 50; i++) matchYear(s, era, small, 8)
    expect(small.match).toBeUndefined()
    const wed = kid(s, era, 'm', 20)
    wed.married = true
    for (let i = 0; i < 50; i++) matchYear(s, era, wed, 20)
    expect(wed.match).toBeUndefined()
  })

  it('согласие: свадьба и приданое за дочь; выгодная партия - дороже и почётнее', () => {
    const era = ERAS.EUR
    const s = family(era)
    const d = kid(s, era, 'f')
    offer(s, era, d, 'rich')
    const cost = matchCost(s, era, d, 'rich')
    expect(cost).toBeGreaterThan(matchCost(s, era, d, 'equal'))
    const m0 = s.hero.money
    const r0 = s.hero.hidden.reputation
    expect(decideMatch(s, era, d.id, true)).toBe(true)
    expect(d.married).toBe(true)
    expect(d.match).toBeUndefined()
    expect(s.hero.money).toBe(m0 - cost)
    expect(s.hero.hidden.reputation).toBeGreaterThan(r0)
    // За сына семья не платит приданое.
    const son = kid(s, era, 'm')
    expect(matchCost(s, era, son, 'rich')).toBeLessThanOrEqual(0)
  })

  it('отказ любви: обида, иногда побег; отказ равной партии - без побега', () => {
    const era = ERAS.RUS
    let eloped = 0
    for (let seed = 1; seed <= 40; seed++) {
      const s = family(era, 'craftsman', seed)
      const k = kid(s, era, 'f', 18, 50)
      offer(s, era, k, 'love')
      const a0 = k.attitude
      decideMatch(s, era, k.id, false)
      expect(k.attitude).toBeLessThan(a0)
      if (k.away?.reason === 'left' && k.married) eloped++
    }
    expect(eloped).toBeGreaterThan(3)
    expect(eloped).toBeLessThan(30)
    const s = family(era)
    const k = kid(s, era, 'm')
    offer(s, era, k, 'equal')
    decideMatch(s, era, k.id, false)
    expect(k.away).toBeUndefined()
    expect(k.married).toBeFalsy()
  })

  it('не решил за год - ребёнок решает сам и женится', () => {
    const era = ERAS.E03
    const s = family(era)
    const k = kid(s, era, 'm', 20)
    offer(s, era, k, 'equal')
    s.year += 1
    expect(matchYear(s, era, k, 21)).toBe(true)
    expect(k.married).toBe(true)
    expect(s.hero.diary.some((d) => d.key === 'diary.match_auto_equal')).toBe(true)
  })

  it('аналитика: предложение и решение', () => {
    const got: string[] = []
    onMatchEvent((kind) => got.push(kind))
    const era = ERAS.EUR
    const s = family(era)
    const k = kid(s, era, 'f')
    for (let i = 0; i < 50 && !k.match; i++) matchYear(s, era, k, 18)
    decideMatch(s, era, k.id, true)
    onMatchEvent(undefined)
    expect(got).toEqual(['match_offered', 'match_decided'])
  })

  it('в прожитых жизнях дети женятся (сами, через год), повторных свадеб нет', () => {
    let married = 0
    let kids = 0
    for (let i = 0; i < 70; i++) {
      const id = ERA_IDS[i % ERA_IDS.length]
      const s = autoplay(newLife(ERAS[id], { ...opts, protectedUntil: 90 }, 2000 + i), ERAS[id])
      for (const n of s.hero.npcs.filter((x) => x.role === 'child' && s.year - x.birthYear >= 30)) {
        kids++
        if (n.married) married++
      }
    }
    expect(kids).toBeGreaterThan(50)
    expect(married / kids).toBeGreaterThan(0.5)
  }, 200000)
})
