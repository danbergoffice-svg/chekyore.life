// Проиграл дом в кости - снимает жильё (пакет 2): аренда в поле героя, раз в год, выкуп, наследнику - аренда.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import { applyDice, diceOf, diceStakes } from '../src/engine/dice'
import type { DiceResult, Stake } from '../src/engine/dice'
import { HOME_COST, householdYear, rentPerMonth, rentPerYear } from '../src/engine/household'
import type { GameState } from '../src/engine/types'

const era = await loadEra('EUR')
const base = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }
const play = (stake: Stake, won: boolean): DiceResult => ({ stake, won, cheated: false, caught: false, exposed: false, fate: false, chase: false, opponent: 'risky' })

function adult(seed: number, region = 'cologne'): GameState {
  const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, seed), era, 6)
  s.hero.age = 35
  s.hero.cls = 'craftsman'
  s.hero.region = region
  s.hero.tags = s.hero.tags.filter((t) => t !== 'rural')
  s.hero.animals = []
  return s
}

function loseHouse(s: GameState, home: number): void {
  s.hero.home = home
  s.hero.money = 100
  diceOf(s.hero).lust = 55
  const stake = diceStakes(s, era).find((x) => x.kind === 'house')!
  applyDice(s, era, play(stake, false))
}

describe('Проигранный дом и аренда', () => {
  it('дом на кону стоит столько же, сколько при покупке (HOME_COST)', () => {
    const s = adult(1)
    s.hero.money = 100
    diceOf(s.hero).lust = 55
    for (const home of [2, 3, 4]) {
      s.hero.home = home
      expect(diceStakes(s, era).find((x) => x.kind === 'house')?.amount).toBe(HOME_COST[home])
    }
  })

  it('проиграл дом: своего нет, снимает на ступень скромнее, плата по жилью и краю; в дневнике - аренда в месяц', () => {
    const s = adult(2)
    loseHouse(s, 3)
    const r = s.hero.rent!
    expect(r).toBeDefined()
    expect(r.lost).toBe(3)
    expect(r.level).toBe(2)
    expect(s.hero.home).toBe(2)
    expect(r.perYear).toBe(rentPerYear(s, 2))
    const entry = s.hero.diary.find((d) => d.key === 'diary.dice_lost.house')!
    expect(entry.params?.rent).toBe(rentPerMonth(r))
    expect(rentPerMonth(r)).toBe(Math.round(r.perYear / 12))
    // Своего дома нет - и на кон его уже не поставить.
    diceOf(s.hero).lust = 60
    expect(diceStakes(s, era).some((x) => x.kind === 'house')).toBe(false)
  })

  it('аренда зависит от жилья и края: больше дом - дороже, в столице дороже, чем в деревне', () => {
    const town = adult(3)
    const paris = adult(3, 'paris')
    expect(rentPerYear(town, 3)).toBeGreaterThan(rentPerYear(town, 2))
    expect(rentPerYear(town, 2)).toBeGreaterThan(rentPerYear(town, 1))
    expect(rentPerYear(paris, 2)).toBeGreaterThan(rentPerYear(town, 2))
    town.hero.cls = 'peasant'
    expect(rentPerYear(town, 2)).toBeLessThan(rentPerYear(paris, 2))
  })

  it('аренду списывают раз в год', () => {
    const s = adult(4)
    loseHouse(s, 2)
    expect(s.hero.rent).toBeDefined()
    // Меньше цены самой дешёвой хижины - выкупать не на что, только платить.
    s.hero.money = HOME_COST[1] - 1
    householdYear(s, era)
    expect(s.hero.money).toBe(HOME_COST[1] - 1 - s.hero.rent!.perYear)
  })

  it('появились деньги - выкупает свой дом, и аренда кончается', () => {
    const s = adult(5)
    loseHouse(s, 3)
    for (let i = 0; i < 40 && s.hero.rent; i++) {
      s.hero.money = HOME_COST[3] * 2
      householdYear(s, era)
    }
    expect(s.hero.rent).toBeUndefined()
    expect(s.hero.home).toBe(3)
    expect(s.hero.diary.some((d) => d.key === 'diary.rent_bought_back')).toBe(true)
    // Свой дом - больше не платит.
    s.hero.money = 300
    householdYear(s, era)
    expect(s.hero.money).toBeGreaterThanOrEqual(300)
  })

  it('на выкуп не хватает, а на дом поменьше - хватает: покупает новый того же размера, что снимал', () => {
    const s = adult(6)
    loseHouse(s, 4)
    for (let i = 0; i < 40 && s.hero.rent; i++) {
      s.hero.money = HOME_COST[3] * 2
      householdYear(s, era)
    }
    expect(s.hero.rent).toBeUndefined()
    expect(s.hero.home).toBe(3)
    expect(s.hero.diary.some((d) => d.key === 'diary.rent_bought')).toBe(true)
  })

  it('наследник получает аренду, а не дом', () => {
    let s = autoplay(newLife(era, base, 10), era)
    for (let i = 0; i < 30 && !heirs(s).length; i++) s = autoplay(newLife(era, base, 200 + i), era)
    const kid = heirs(s)[0]
    expect(kid).toBeDefined()
    s.hero.home = 2
    s.hero.rent = { level: 2, perYear: 60, since: s.year - 5, lost: 3 }
    const h = continueWithHeir(s, era, kid.id)
    expect(h.hero.rent?.lost).toBe(3)
    expect(h.hero.home).toBe(2)
  })

  it('тексты проигрыша дома и аренды есть на ru, en, tr', async () => {
    for (const lang of ['ru', 'en', 'tr']) {
      const ui = (await import(`../src/i18n/${lang}.json`)).default as Record<string, string>
      const dice = (await import(`../src/content/common/${lang}_dice.json`)).default as Record<string, string>
      for (const k of ['diary.rent_bought_back', 'diary.rent_bought', 'diary.rent_down', 'hero.rent']) expect(ui[k], `${lang} ${k}`).toBeTruthy()
      expect(dice['diary.dice_lost.house']).toContain('{rent}')
    }
  })
})
