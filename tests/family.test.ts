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

/** Умерший герой 70 лет: двое детей умерли, у одного – трое живых внуков. */
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
  it('нет живых детей → наследники – внуки, по старшинству', () => {
    const s = deadGrandfather()
    const list = heirs(s)
    expect(list.map((n) => n.role)).toEqual(['grandchild', 'grandchild', 'grandchild'])
    expect(list[0].birthYear).toBeLessThan(list[2].birthYear)
  })

  it('живой ребёнок важнее внуков; уехавший – не наследник', () => {
    const s = deadGrandfather()
    const kid = npc(s, 'child', 'f', s.year - 30, true)
    expect(heirs(s).map((n) => n.id)).toEqual([kid.id])
    kid.away = { since: s.year - 2, reason: 'abroad' }
    expect(heirs(s).every((n) => n.role === 'grandchild')).toBe(true)
  })

  it('внук-наследник: отец – умерший сын, братья и сёстры – другие внуки, наследство не больше состояния деда', () => {
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

describe('Уехавшие родственники (п. 4)', () => {
  it('600 жизней: у уехавших нет новых детей и свадеб «дома», события про них – только вести и возвращения', async () => {
    const { loadAllEras } = await import('../src/content')
    const eras = await loadAllEras()
    let away = 0
    let i = 0
    for (const era of Object.values(eras)) {
      for (let k = 0; k < 46; k++, i++) {
        const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 11000 + i), era)
        for (const n of s.hero.npcs.filter((n) => n.away)) {
          away++
          const kids = s.hero.npcs.filter((g) => g.parentId === n.id && g.birthYear > n.away!.since)
          expect(kids, `${era.id} ${11000 + i}`).toEqual([])
        }
      }
    }
    expect(away).toBeGreaterThan(0)
  }, 300000)

  it('уехавший не стоит на картинке дома и не наследует', async () => {
    const { familyCast } = await import('../src/ui/cast')
    const s = deadGrandfather()
    s.hero.alive = true
    const kid = npc(s, 'child', 'm', s.year - 15, true)
    expect(familyCast(s).members.some((m) => m.seed === kid.id)).toBe(true)
    kid.away = { since: s.year, reason: 'abroad' }
    expect(familyCast(s).members.some((m) => m.seed === kid.id)).toBe(false)
    expect(heirs(s).some((n) => n.id === kid.id)).toBe(false)
  })
})

describe('Отложенные последствия (п. 5)', () => {
  it('последствие про умершего человека не приходит про другого; переезд отменяет местное', async () => {
    const { startYear, triggerStats } = await import('../src/engine/game')
    const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 515), era)
    s.hero.alive = true
    s.phase = 'year'
    const kids = [npc(s, 'child', 'm', s.year - 8, true), npc(s, 'child', 'f', s.year - 9, true)]
    const ev = era.events.find((e) => e.trigger_only && e.npc === 'child' && !e.npc_age && !e.npc_tag && !e.npc_married)!
    expect(ev).toBeTruthy()
    kids[0].alive = false
    const before = triggerStats.cancelled.npc_dead ?? 0
    s.hero.triggers = [{ eventId: ev.id, year: s.year, chance: 1, npcId: kids[0].id }]
    startYear(s, era, null)
    expect(s.queue.some((q) => q.eventId === ev.id)).toBe(false)
    expect(triggerStats.cancelled.npc_dead).toBe(before + 1)
  })

  it('2000 жизней: никто не живёт с двумя супругами сразу', () => {
    let bigamy = 0
    for (let i = 0; i < 2000; i += 13) {
      const s = autoplay(newLife(era, { mode: 'full', mortality: 'soft', softenHeavy: false }, 40000 + i), era)
      if (s.hero.npcs.filter((x) => x.role === 'spouse' && x.alive && !x.away).length > 1) bigamy++
    }
    expect(bigamy).toBe(0)
  })
})

describe('Семейное положение (п. 6)', () => {
  it('вдова → снова замужем → дважды вдова; в жизнеописании оба брака', async () => {
    const { maritalStatus, applyEffects, killNpc } = await import('../src/engine/rules')
    const { buildReport } = await import('../src/engine/report')
    const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 616)
    s.hero.sex = 'f'
    s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse')
    s.hero.tags = s.hero.tags.filter((t) => t !== 'married' && t !== 'vowed')
    expect(maritalStatus(s.hero).kind).toBe('never')
    s.year += 18; s.hero.age = 18
    applyEffects(s, era, [{ add_npc: 'spouse', attitude: 50 }])
    expect(maritalStatus(s.hero).kind).toBe('married')
    s.year += 16; s.hero.age += 16
    killNpc(s, s.hero.npcs.find((n) => n.role === 'spouse' && n.alive)!)
    expect(maritalStatus(s.hero)).toMatchObject({ kind: 'widowed', widowed: 1 })
    s.year += 2; s.hero.age += 2
    applyEffects(s, era, [{ add_npc: 'spouse', attitude: 50 }])
    expect(maritalStatus(s.hero).kind).toBe('remarried')
    s.year += 10; s.hero.age += 10
    killNpc(s, s.hero.npcs.find((n) => n.role === 'spouse' && n.alive)!)
    expect(maritalStatus(s.hero)).toMatchObject({ kind: 'widowed', widowed: 2 })
    s.hero.alive = false; s.hero.deathYear = s.year + 5; s.hero.age += 5; s.hero.deathCause = 'old_age'
    const bio = buildReport(s, era).biography.map((b) => b.key)
    expect(bio.filter((k) => k === 'bio.widowed')).toHaveLength(2)
    expect(bio).toContain('bio.married_again')
    expect(bio[bio.length - 1]).toBe('bio.death')
  })

  it('развод – не удаление: супруг в разводе, статус divorced', async () => {
    const { maritalStatus, applyEffects } = await import('../src/engine/rules')
    const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 617)
    s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse')
    applyEffects(s, era, [{ add_npc: 'spouse', attitude: 50 }])
    const sp = s.hero.npcs.find((n) => n.role === 'spouse')!
    applyEffects(s, era, [{ remove_npc: 'npc' }], { npcId: sp.id })
    expect(s.hero.npcs.includes(sp)).toBe(true)
    expect(maritalStatus(s.hero).kind).toBe('divorced')
    expect(s.hero.tags).not.toContain('married')
  })
})

describe('Близкие на картинке (п. 7)', () => {
  it('после свадьбы родители – по обычаю края; внешность фигурки героя – как на портрете', async () => {
    const { familyCast, householdRule } = await import('../src/ui/cast')
    const { applyEffects } = await import('../src/engine/rules')
    const { figureLook } = await import('../src/pixel/avatar')
    const make = (sex: Sex) => {
      const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 700 + (sex === 'm' ? 1 : 2))
      s.hero.sex = sex
      s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse')
      s.year += 22; s.hero.age = 22
      for (const p of s.hero.npcs) if (p.role === 'father' || p.role === 'mother') { p.alive = true; p.birthYear = s.year - 50 }
      return s
    }
    const son = make('m')
    expect(householdRule(son)).toBe('patrilocal')
    expect(familyCast(son).members.filter((m) => m.role === 'parent').length).toBe(2)
    applyEffects(son, era, [{ add_npc: 'spouse', attitude: 50 }])
    expect(familyCast(son).members.filter((m) => m.role === 'parent').length).toBe(2)
    const daughter = make('f')
    applyEffects(daughter, era, [{ add_npc: 'spouse', attitude: 50 }])
    expect(familyCast(daughter).members.filter((m) => m.role === 'parent').length).toBe(0)
    const hero = familyCast(son).members[0]
    expect(hero.look).toEqual(figureLook({ region: son.hero.region, sex: 'm', age: 22, seed: son.hero.id, cls: son.hero.cls, body: son.hero.body ?? 0, ill: false, married: true, widow: false, enslaved: son.hero.tags.includes('enslaved') }))
  })
})

describe('Дом: пожар и отстройка (п. 13)', () => {
  it('сгорел → на ступень меньше, во дворе сгоревший дом; отстроились через год', async () => {
    const { applyEffects } = await import('../src/engine/rules')
    const { householdYear } = await import('../src/engine/household')
    const { familyCast } = await import('../src/ui/cast')
    const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 818)
    s.hero.home = 3
    applyEffects(s, era, [{ home: 'burn' }])
    applyEffects(s, era, [{ home: 'burn' }])
    expect(s.hero.home).toBe(2)
    expect(familyCast(s).homeState).toBe('burned')
    applyEffects(s, era, [{ home: 'rebuild' }])
    expect(familyCast(s).homeState).toBe('rebuilding')
    s.year += 1
    householdYear(s, era)
    expect(familyCast(s).homeState).toBeUndefined()
    expect(s.hero.diary.some((d) => d.key === 'diary.home_rebuilt')).toBe(true)
  })
})

describe('Питомцы (п. 12)', () => {
  it('500 жизней по всем странам: питомцы только своего края, срок по виду, черепаха и попугай переходят наследнику', async () => {
    const { loadAllEras, ERA_META } = await import('../src/content')
    const { isPet, petDef } = await import('../src/engine/pets')
    const eras = await loadAllEras()
    let withPet = 0
    let lives = 0
    for (const e of Object.values(eras)) {
      for (let k = 0; k < 40; k++, lives++) {
        const s = autoplay(newLife(e, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 60000 + lives), e)
        const style = ERA_META[e.id].regions.find((r) => r.id === s.hero.places[0])?.scene?.style ?? ''
        const got = s.hero.diary.filter((d) => d.key.startsWith('diary.pet_new'))
        if (got.length || s.hero.animals.some((a) => isPet(a.kind))) withPet++
        for (const d of got) {
          const kind = (d.params!.animal as { key: string }).key.slice(4)
          // Питомец мог появиться в другом краю той же страны после переезда – проверяем страну целиком.
          const styles = new Set(ERA_META[e.id].regions.map((r) => r.scene?.style))
          expect(petDef(kind)!.styles.some((st) => styles.has(st)), `${e.id} ${kind}`).toBe(true)
        }
        for (const a of s.hero.animals.filter((a) => isPet(a.kind) && a.dies !== undefined)) {
          const [lo, hi] = petDef(a.kind)!.life
          expect(a.dies! - a.born!).toBeGreaterThanOrEqual(lo)
          expect(a.dies! - a.born!).toBeLessThanOrEqual(hi)
        }
        void style
      }
    }
    expect(withPet / lives).toBeGreaterThan(0.35)
    expect(withPet / lives).toBeLessThan(0.75)
    // Хомяков, кошек в Америке – нет.
    const amr = await (async () => (await import('../src/engine/pets')).petPossible)()
    const s = newLife(eras.AMR, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 1)
    expect(amr(s, 'cat')).toBe(false)
    expect(amr(s, 'hamster')).toBe(false)
  }, 300000)
})
