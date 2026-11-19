// Близкие (20.11, engine/kin.ts и забота о детях в engine/children.ts): действия с супругом и роднёй (одно в год,
// трата = запись в дневнике), тепло и холод (помощь в долгах, ссоры, спор о наследстве), учитель, спорт и воинское
// учение, присмотр, учение своему делу.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import { doKin, disputeK, kinActions, kinCost, kinLock, kinYear, KIN_YEAR } from '../src/engine/kin'
import { CARE, childrenYear, learnRate, ownTradeTrack, setOversee, setTraining, setTutor, teachOwnTrade, trainingCost, tutorCost, isStudying, refuseChance } from '../src/engine/children'
import type { GameState } from '../src/engine/types'

const era = await loadEra('EUR')
const opts = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, protectedUntil: 90 }
function adult(seed: number): GameState {
  const s = autoplay(newLife(era, opts, seed), era, 6)
  s.hero.age = 35
  s.hero.cls = 'craftsman'
  s.hero.money = 5000
  s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse' && n.role !== 'child')
  return s
}
const diaryMoney = (s: GameState, from: number) => s.hero.diary.slice(from).reduce((x, e) => x + (typeof e.params?.money === 'number' ? (e.key === 'diary.kin.helped' ? 1 : -1) * (e.params.money as number) : 0), 0)

describe('Близкие: действия', () => {
  it('супругу - внимание, свидание, подарок, холодность; одно действие в год; трата = запись в дневнике', () => {
    const s = adult(1)
    const w = makeNpc(s, era, 'spouse', 'f', s.year - 30)
    w.attitude = 20
    expect(kinActions(s, w)).toEqual(['attention', 'date', 'gift', 'cold'])
    const m = s.hero.money
    const from = s.hero.diary.length
    expect(doKin(s, w.id, 'gift')).toBe(true)
    expect(w.attitude).toBe(35)
    expect(m - s.hero.money).toBe(kinCost(s, 'gift'))
    expect(diaryMoney(s, from)).toBe(s.hero.money - m)
    expect(kinLock(s, w, 'attention')).toBe('kin.lock.year')
    s.year++
    expect(doKin(s, w.id, 'cold')).toBe(true)
    expect(w.attitude).toBe(23)
  })

  it('родне - навестить, помочь, отдалиться; маленьким детям - нет (у них забота и учение); денег мало - нельзя', () => {
    const s = adult(2)
    const b = makeNpc(s, era, 'sibling', 'm', s.year - 33)
    const kid = makeNpc(s, era, 'child', 'm', s.year - 8)
    expect(kinActions(s, b)).toEqual(['visit', 'help', 'distance'])
    expect(kinActions(s, kid)).toEqual([])
    s.hero.money = 0
    expect(kinLock(s, b, 'help')).toBe('kin.lock.money')
    expect(doKin(s, b.id, 'visit')).toBe(true)
  })

  it('тепло и холод: тёплая родня выручает в долгах (сумма в дневнике = деньги), холодная ссорится; спор о наследстве от тепла', () => {
    let helped = 0
    let quarrels = 0
    for (let i = 0; i < 40; i++) {
      const s = adult(10 + i)
      const b = makeNpc(s, era, 'sibling', 'f', s.year - 30)
      b.attitude = 80
      s.hero.money = -50
      const from = s.hero.diary.length
      const m = s.hero.money
      kinYear(s)
      if (s.hero.money > m) {
        helped++
        expect(diaryMoney(s, from)).toBe(s.hero.money - m)
      }
      b.attitude = -60
      s.hero.money = 100
      const d = s.hero.diary.length
      kinYear(s)
      if (s.hero.diary.slice(d).some((e) => e.key === 'diary.kin.quarrel')) quarrels++
    }
    expect(helped).toBeGreaterThan(40 * KIN_YEAR.helpChance * 0.4)
    expect(quarrels).toBeGreaterThan(0)
    expect(disputeK(80)).toBeLessThan(1)
    expect(disputeK(-50)).toBeGreaterThan(1)
  })
})

describe('Близкие: забота о детях', () => {
  it('учитель: плата раз в год (запись в дневнике), учёба быстрее; нет денег - учитель уходит', () => {
    const s = adult(3)
    const kid = makeNpc(s, era, 'child', 'm', s.year - 9)
    const slow = learnRate(kid)
    expect(setTutor(s, kid.id, true)).toBe(true)
    expect(learnRate(kid)).toBeGreaterThan(slow)
    const m = s.hero.money
    const from = s.hero.diary.length
    childrenYear(s, era)
    expect(m - s.hero.money).toBe(tutorCost(s))
    expect(diaryMoney(s, from)).toBe(s.hero.money - m)
    s.hero.money = 0
    childrenYear(s, era)
    expect(kid.tutor).toBeUndefined()
  })

  it('спорт или воинское учение: через несколько лет - метка; присмотр - бросают реже', () => {
    const s = adult(4)
    const kid = makeNpc(s, era, 'child', 'm', s.year - 7)
    expect(setTraining(s, kid.id, 'military')).toBe(true)
    for (let y = 0; y < CARE.trainYears; y++) {
      const m = s.hero.money
      childrenYear(s, era)
      expect(m - s.hero.money).toBe(trainingCost(s))
      s.year++
    }
    expect(kid.tags).toContain('trained_military')
    const teen = makeNpc(s, era, 'child', 'f', s.year - 14)
    teen.education = { path: 'craft', level: 0, progress: 0.2, startedYear: s.year - 1 }
    const free = refuseChance(teen, 14)
    expect(setOversee(s, teen.id, true)).toBe(true)
    expect(refuseChance(teen, 14)).toBeLessThan(free)
  })

  it('учить своему делу: учёба дома, бесплатно', () => {
    const s = adult(5)
    s.hero.profession = era.professions.find((p) => ownTradeTrack({ ...s, hero: { ...s.hero, profession: p.id } } as GameState, era))?.id ?? s.hero.profession
    const track = ownTradeTrack(s, era)
    if (!track) return
    const kid = makeNpc(s, era, 'child', 'm', s.year - track.ages[0])
    expect(teachOwnTrade(s, era, kid.id)).toBe(true)
    expect(isStudying(kid)).toBe(true)
    expect(kid.education?.home).toBe(true)
    s.year++
    const m = s.hero.money
    childrenYear(s, era)
    expect(s.hero.money).toBe(m)
  })
})
