// Жалоба игроков 08.11 «цель жизни появляется не у всех»: каждый путь, которым начинается или продолжается жизнь,
// должен приводить к окну выбора цели (goalDue), а после выбора цель видна (goalShown → GoalBar и карточка меню).
// Причины, найденные 08.11: контрольная группа A/B без цели (goal_share 0.8 → 1) и старые сохранения посреди года.
import { describe, expect, it } from 'vitest'
import flags from '../public/flags.json'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { emigrate } from '../src/engine/abroad'
import { autoplay } from '../src/engine/game'
import { GOALS, goalFits, setGoal } from '../src/engine/goals'
import { chronicleSuccessor, continueWithHeir, heirs, newLife, rollBirth, stateFromMemorial } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { EraDef, GameSettings, GameState } from '../src/engine/types'
import { goalDue, goalGroup, goalOffers, goalShown, inheritable } from '../src/goal'
import { DEFAULT_FLAGS } from '../src/platform/types'
import { migrate } from '../src/storage'

const ERAS = await loadAllEras()
const quick: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }
const full: GameSettings = { mode: 'full', mortality: 'soft', softenHeavy: false }

/** То, что делает App.onGoal после нажатия на первую карточку окна выбора. */
function pickFirst(s: GameState, era: EraDef) {
  expect(goalDue(s, 1), `${s.hero.era}.${s.hero.cls}: окно цели не открылось`).toBe(true)
  const offers = goalOffers(s)
  expect(offers.length, `${s.hero.era}.${s.hero.cls}: пустой выбор цели`).toBe(3)
  for (const g of offers) expect(goalFits(GOALS.find((x) => x.id === g.id)!, s.hero.birthCls ?? s.hero.cls)).toBe(true)
  setGoal(s, era, offers[0].id, { tier: offers[0].tier })
  s.stats = { heroId: s.hero.id, sec: 0, choices: 0, rescued: 0, milestones: [], goalAsked: true }
  expect(goalShown(s)).toBe(true)
  expect(goalDue(s, 1)).toBe(false)
}

/** Прожить жизнь до смерти с наследником (перебирая seed). */
function deadWithHeir(era: EraDef, seed: number): GameState {
  for (let i = 0; i < 40; i++) {
    const s = autoplay(newLife(era, quick, seed + i), era)
    if (heirs(s).length) return s
  }
  throw new Error(`нет наследника в ${era.id}`)
}

describe('Цель у всех игроков (жалоба 08.11)', () => {
  it('группа без цели больше не выпадает: ни по флагам сайта, ни по флагам по умолчанию (CrazyGames, Яндекс)', () => {
    expect(flags.goal_share).toBe(1)
    expect(DEFAULT_FLAGS.goal_share).toBe(1)
    for (let i = 0; i < 2000; i++) {
      expect(goalGroup(`p${i}-${i * 7919}`, flags)).toBeGreaterThan(0)
      expect(goalGroup(`x${i}`, DEFAULT_FLAGS)).toBeGreaterThan(0)
    }
  })

  it('новая жизнь: все 13 стран, все сословия, быстрый и полный режим, с лотереей и без', () => {
    for (const id of ERA_IDS) {
      const era = ERAS[id]
      for (const cls of era.classes)
        for (const settings of [quick, full]) {
          const s = newLife(era, settings, 7)
          s.hero.birthCls = s.hero.cls = cls.id
          pickFirst(s, era)
          if (cls.id === 'slave') expect(goalOffers(s).map((g) => g.id)).toContain('freedom')
        }
    }
    // Лотерея рождения (выбор края и сословия) и пропуск выбора - обе дороги идут через newLife с готовым рождением или без.
    for (let i = 0; i < 60; i++) {
      const birth = rollBirth(300 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
      const era = ERAS[birth.era]
      pickFirst(newLife(era, i % 2 ? quick : full, 400 + i, undefined, birth), era)
    }
  })

  it('год идёт, цель не выбрана - окно открыто; выбор без цели (с 4-й жизни) больше не спрашивается', () => {
    const era = ERAS.E03
    const s = autoplay(newLife(era, quick, 21, undefined, undefined), era, 2)
    s.phase = 'running'
    expect(goalDue(s, 1)).toBe(true)
    expect(goalDue(s, 0)).toBe(false)
    s.stats = { heroId: s.hero.id, sec: 0, choices: 0, rescued: 0, milestones: [], goalAsked: true }
    expect(goalDue(s, 1)).toBe(false)
  })

  it('наследник (continueWithHeir): своя цель или незаконченная цель родителя', () => {
    for (const id of ['E03', 'RUS', 'CHN', 'ISL'] as const) {
      const era = ERAS[id]
      const dead = deadWithHeir(era, 70)
      // У родителя была цель и «уже спросили» - наследника это не касается.
      const next = continueWithHeir(dead, era, heirs(dead)[0].id)
      expect(next.hero.goal).toBeUndefined()
      pickFirst(next, ERAS[next.hero.era])
    }
  })

  it('наследник, у которого родитель взял цель: карточка «Доделать за…» и три своих', () => {
    const era = ERAS.RUS
    const s = autoplay(newLife(era, quick, 90), era, 3)
    setGoal(s, era, 'long', { tier: 2 })
    s.stats = { heroId: s.hero.id, sec: 0, choices: 0, rescued: 0, milestones: [], goalAsked: true }
    let dead = autoplay(s, era)
    for (let i = 0; i < 30 && !heirs(dead).length; i++) {
      const t = autoplay(newLife(era, quick, 600 + i), era, 3)
      setGoal(t, era, 'long', { tier: 2 })
      dead = autoplay(t, era)
    }
    const next = continueWithHeir(dead, era, heirs(dead)[0].id)
    const parentGoal = dead.family.lives[dead.family.lives.length - 1].goal
    expect(parentGoal?.id).toBe('long')
    if (parentGoal!.steps.length < 4) expect(inheritable(next)?.id).toBe('long')
    pickFirst(next, era)
  })

  it('переезд хроники (chronicleSuccessor): наследник Багдада в Дамаске получает цель', () => {
    const era = ERAS.ISL
    const s = autoplay(newLife(era, { ...quick, protectedUntil: 90 }, 5), era, 3)
    s.hero.region = 'baghdad'
    s.year = 1290
    makeNpc(s, era, 'child', 'm', 1265)
    expect(chronicleSuccessor(s)).toMatchObject({ region: 'damascus' })
    const h = continueWithHeir(s, era, heirs(s)[0].id)
    expect(h.hero.region).toBe('damascus')
    pickFirst(h, era)
  })

  it('продолжение рода из мемориала (stateFromMemorial)', () => {
    for (const id of ['RUS', 'BYZ'] as const) {
      const era = ERAS[id]
      const dead = deadWithHeir(era, 41)
      const life = dead.family.lives[dead.family.lives.length - 1]
      const back = stateFromMemorial(era, life, [life], quick)
      expect(goalDue(back, 1)).toBe(false) // умерший герой
      const next = continueWithHeir(back, era, heirs(back)[0].id)
      pickFirst(next, ERAS[next.hero.era])
    }
  })

  it('эмиграция (abroad.emigrate): цель сохраняется; если её не было - окно открывается и на чужбине', () => {
    const era = ERAS.RUS
    const a = newLife(era, quick, 11)
    a.year = 1300
    a.hero.region = 'novgorod'
    a.hero.age = 30
    setGoal(a, era, 'wealth', { tier: 1 })
    expect(emigrate(a, 'BYZ', 'trade', 'all')).toBe(true)
    if (a.hero.alive) {
      expect(a.hero.goal?.id).toBe('wealth')
      expect(goalShown(a)).toBe(true)
    }
    const b = newLife(era, quick, 11)
    b.year = 1300
    b.hero.region = 'novgorod'
    b.hero.age = 30
    expect(emigrate(b, 'BYZ', 'trade', 'all')).toBe(true)
    if (b.hero.alive) pickFirst(b, ERAS.BYZ)
  })

  it('раб: «Свобода» всегда в выборе, и у наследника раба тоже', () => {
    for (const id of ERA_IDS) {
      const era = ERAS[id]
      if (!era.classes.some((c) => c.id === 'slave')) continue
      for (let seed = 1; seed <= 10; seed++) {
        const s = newLife(era, quick, seed)
        s.hero.birthCls = s.hero.cls = 'slave'
        expect(goalOffers(s).map((g) => g.id), id).toContain('freedom')
        pickFirst(s, era)
      }
    }
  })

  it('старое сохранение без поля goal (до 02.11): проходит миграцию, и окно цели открывается даже посреди года', () => {
    const era = ERAS.E03
    const s = autoplay(newLife(era, quick, 33), era, 25)
    const old = JSON.parse(JSON.stringify(s)) as GameState & { stats?: Record<string, unknown> }
    delete (old.hero as { goal?: unknown }).goal
    if (old.stats) delete old.stats.goalAsked
    old.phase = 'running'
    for (const v of [3, 4, 5]) {
      const save = JSON.parse(JSON.stringify(old)) as GameState
      save.version = v
      const m = migrate(save)
      expect(m, `версия ${v}`).not.toBeNull()
      expect(m!.hero.goal).toBeUndefined()
      // Раньше: только phase 'year' - до конца года (а при закрытии вкладки посреди года - снова) цели не было.
      pickFirst(m!, era)
    }
  })
})
