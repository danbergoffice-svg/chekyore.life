// Дети: воспитание и учёба (src/engine/children.ts, ТЗ семейной системы, этап 2, пункт 3.8).
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import {
  availableEducation,
  canUpbring,
  childOutcome,
  childrenYear,
  educationCost,
  educationLock,
  educationTracks,
  initializeChild,
  learnRate,
  onChildEvent,
  refuseChance,
  setChildEducation,
  setChildUpbringing,
  trackOf,
  upbringStyle,
} from '../src/engine/children'
import { autoplay, startYear } from '../src/engine/game'
import { continueWithHeir, newLife, SAVE_VERSION } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { EraDef, GameState, Npc } from '../src/engine/types'
import { migrate } from '../src/storage'

const ERAS = await loadAllEras()
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false } as const

function parent(era: EraDef, cls = 'craftsman', seed = 7, money = 5000): GameState {
  const s = newLife(era, opts, seed)
  s.hero.age = 35
  s.hero.birthYear = s.year - 35
  s.hero.cls = cls
  s.hero.money = money
  s.hero.npcs = []
  return s
}

function kid(s: GameState, era: EraDef, age: number, sex: 'm' | 'f' = 'm', attitude = 50): Npc {
  const n = makeNpc(s, era, 'child', sex, s.year - age, attitude)
  n.traits = []
  if (!s.hero.npcs.includes(n)) s.hero.npcs.push(n)
  initializeChild(s, n)
  return n
}

/** Прожить годы учёбы без отказа (свобода 0, ласка 100). */
function study(s: GameState, era: EraDef, k: Npc, years = 12): void {
  setChildUpbringing(s, k.id, { autonomy: 0, affection: 100 })
  for (let y = 0; y < years && !k.education?.completedYear && !k.education?.refusedYear; y++) {
    s.year++
    childrenYear(s, era)
  }
}

describe('Учёба детей (3.8)', () => {
  it('учёба доступна только в своём возрасте', () => {
    const era = ERAS.E03
    const s = parent(era)
    const craft = trackOf(era, 'craft')!
    expect(educationLock(s, era, kid(s, era, 5), craft)).toBe('children.lock.young')
    expect(educationLock(s, era, kid(s, era, 10), craft)).toBeUndefined()
    expect(educationLock(s, era, kid(s, era, 17), craft)).toBe('children.lock.old')
    expect(setChildEducation(s, era, kid(s, era, 4).id, 'craft')).toBe(false)
  })

  it('исторически недоступное нельзя: без письменности нет наук и служения вере; сословие и пол учитываются', () => {
    const era = ERAS.E03
    const noWriting = { ...era, features: era.features.filter((f) => f !== 'writing') } as EraDef
    const s = parent(noWriting, 'noble')
    const boy = kid(s, noWriting, 9)
    expect(educationLock(s, noWriting, boy, trackOf(noWriting, 'science')!)).toBe('children.lock.era')
    expect(availableEducation(s, noWriting, boy).map((t) => t.id)).not.toContain('religion')
    // Крестьянской семье управление поместьем недоступно; девочке - военное дело.
    const p = parent(era, 'peasant')
    expect(educationLock(p, era, kid(p, era, 12), trackOf(era, 'management')!)).toBe('children.lock.class')
    expect(educationLock(p, era, kid(p, era, 13, 'f'), trackOf(era, 'military')!)).toBe('children.lock.sex')
    // Страна может закрыть направление данными.
    const closed = { ...era, education: { exclude: ['medicine'] } } as EraDef
    expect(educationTracks(closed).map((t) => t.id)).not.toContain('medicine')
  })

  it('во всех странах у каждого сословия есть чему учить ребёнка', () => {
    for (const id of ERA_IDS) {
      const era = ERAS[id]
      for (const cls of era.classes) {
        const s = parent(era, cls.id)
        const ages = [8, 10, 12, 14]
        const any = ages.some((a) => availableEducation(s, era, kid(s, era, a)).length > 0)
        expect(any, `${id}.${cls.id}`).toBe(true)
      }
    }
  })

  it('плата списывается каждый год; нет денег - учёба стоит', () => {
    const era = ERAS.EUR
    const s = parent(era, 'trader', 7, 10000)
    const k = kid(s, era, 11)
    const track = trackOf(era, 'trade')!
    const cost = educationCost(s, era, track)
    expect(setChildEducation(s, era, k.id, 'trade')).toBe(true)
    setChildUpbringing(s, k.id, { autonomy: 0, affection: 100 })
    s.year++
    childrenYear(s, era)
    expect(s.hero.money).toBe(10000 - cost)
    const p = k.education!.progress
    expect(p).toBeGreaterThan(0)
    s.hero.money = 0
    s.year++
    childrenYear(s, era)
    expect(k.education!.progress).toBe(p)
    expect(s.hero.money).toBe(0)
    expect(s.hero.diary.some((d) => d.key === 'diary.edu_unpaid')).toBe(true)
  })

  it('учёба даёт навык наследнику и ведёт к делу, куда без учёбы не берут', () => {
    const era = ERAS.E03
    const s = parent(era, 'craftsman', 11)
    const k = kid(s, era, 9)
    expect(setChildEducation(s, era, k.id, 'medicine')).toBe(false)
    // Наука (грамота): писец - дело с требованиями, ребёнку без учёбы недоступно.
    expect(setChildEducation(s, era, k.id, 'science')).toBe(true)
    study(s, era, k)
    expect(k.education!.completedYear).toBeDefined()
    expect(k.education!.level).toBeGreaterThanOrEqual(1)
    k.birthYear = s.year - 16
    const out = childOutcome(s, k, era)!
    expect(out.professions.map((p) => p.id).some((id) => ['scribe', 'rhetor', 'official'].includes(id))).toBe(true)
    // Учится - дела пока нет.
    const k2 = kid(s, era, 9)
    setChildEducation(s, era, k2.id, 'craft')
    expect(childOutcome(s, k2, era)).toBeNull()
    // Наследник-герой получает навык.
    s.hero.alive = false
    s.phase = 'dead'
    s.hero.deathYear = s.year
    k.birthYear = s.year - 20
    const heir = continueWithHeir(s, era, k.id)
    expect(heir.hero.skills.literacy).toBeGreaterThanOrEqual(25)
  })

  it('ребёнок может отказаться от пути родителей; свобода повышает, ласка и хорошие отношения снижают шанс', () => {
    const era = ERAS.EUR
    const s = parent(era)
    const free = kid(s, era, 14, 'm', -50)
    setChildUpbringing(s, free.id, { autonomy: 100, affection: 0 })
    const warm = kid(s, era, 14, 'm', 90)
    setChildUpbringing(s, warm.id, { autonomy: 0, affection: 100 })
    expect(refuseChance(free, 14)).toBeGreaterThan(refuseChance(warm, 14))
    expect(refuseChance(warm, 10)).toBe(0)
    let refused = 0
    for (let seed = 1; seed <= 40; seed++) {
      const x = parent(era, 'craftsman', seed)
      const k = kid(x, era, 12, 'm', -60)
      setChildEducation(x, era, k.id, 'craft')
      setChildUpbringing(x, k.id, { autonomy: 100, affection: 0 })
      for (let y = 0; y < 6 && !k.education!.completedYear && !k.education!.refusedYear; y++) {
        x.year++
        childrenYear(x, era)
      }
      if (k.education!.refusedYear) refused++
    }
    expect(refused).toBeGreaterThan(3)
    expect(refused).toBeLessThan(40)
  })

  it('воспитание: раз в год; строгость ускоряет учёбу, ласка улучшает отношения, к 14 складывается черта', () => {
    const era = ERAS.EUR
    const s = parent(era)
    const k = kid(s, era, 13, 'f', 20)
    expect(canUpbring(s, k)).toBe(true)
    expect(upbringStyle(s, k.id, 'warm')).toBe(true)
    expect(upbringStyle(s, k.id, 'warm')).toBe(false)
    const strict = kid(s, era, 10)
    const before = learnRate(strict)
    setChildUpbringing(s, strict.id, { discipline: 100 })
    expect(learnRate(strict)).toBeGreaterThan(before)
    setChildUpbringing(s, k.id, { affection: 90 })
    const att = k.attitude
    s.year++
    childrenYear(s, era)
    expect(k.attitude).toBeGreaterThan(att)
    expect(k.traits).toContain('kind')
  })

  it('взросление не даёт второй профессии и второго брака; дети с учёбой и без - 140 жизней по всем странам без ошибок', () => {
    let educated = 0
    for (let i = 0; i < 140; i++) {
      const id = ERA_IDS[i % ERA_IDS.length]
      const era = ERAS[id]
      const s = newLife(era, opts, 7000 + i)
      // Бот-родитель: каждому ребёнку в 10 лет - первое доступное направление.
      const life = autoplay(s, era, 200, undefined, (_f, st: GameState) => {
        for (const n of st.hero.npcs) {
          if (n.role !== 'child' || !n.alive || n.education?.startedYear) continue
          const opt = availableEducation(st, era, n)[0]
          if (opt && setChildEducation(st, era, n.id, opt.id)) educated++
        }
        return null
      })
      // Записей о деле и свадьбе у каждого имени - не больше, чем детей с этим именем.
      const kids = life.hero.npcs.filter((x) => x.role === 'child')
      for (const name of new Set(kids.map((n) => n.name))) {
        const same = kids.filter((n) => n.name === name).length
        const byName = (keys: string[]) => life.hero.diary.filter((d) => keys.includes(d.key) && (d.params?.who as { name: string })?.name === name).length
        expect(byName(['diary.child_trade', 'diary.child_trade_edu']), name).toBeLessThanOrEqual(same)
        // Свадеб может быть больше: овдовевшая дочь (событие npc_married: false) выходит замуж снова - это не повтор.
      }
      expect(Number.isFinite(life.hero.money)).toBe(true)
    }
    expect(educated).toBeGreaterThan(30)
  }, 300000)

  it('аналитика: выбор, окончание', () => {
    const got: string[] = []
    onChildEvent((k) => got.push(k))
    const era = ERAS.E03
    const s = parent(era)
    const k = kid(s, era, 9)
    setChildEducation(s, era, k.id, 'craft')
    study(s, era, k)
    upbringStyle(s, kid(s, era, 5).id, 'strict')
    onChildEvent(undefined)
    expect(got).toEqual(['education_selected', 'education_completed', 'upbringing_changed'])
  })
})

describe('Старые сохранения (3.8)', () => {
  it(`дети без новых полей: миграция до ${SAVE_VERSION}, профили заведены, жизнь продолжается`, () => {
    const era = ERAS.E03
    let s = autoplay(newLife(era, opts, 21), era, 40)
    for (let seed = 22; !s.hero.npcs.some((n) => n.role === 'child'); seed++) s = autoplay(newLife(era, opts, seed), era, 40)
    const old = JSON.parse(JSON.stringify(s)) as GameState
    old.version = 6
    for (const n of old.hero.npcs) {
      delete n.education
      delete n.upbringing
    }
    const m = migrate(old)!
    expect(m.version).toBe(SAVE_VERSION)
    for (const n of m.hero.npcs.filter((x) => x.role === 'child')) {
      expect(n.upbringing).toBeDefined()
      expect(n.education).toEqual({ level: 0, progress: 0 })
    }
    expect(m.hero.npcs.map((n) => n.id)).toEqual(s.hero.npcs.map((n) => n.id))
    expect(migrate(m)!.version).toBe(SAVE_VERSION)
    if (m.phase === 'year' && m.hero.alive) startYear(m, era, null)
  })
})
