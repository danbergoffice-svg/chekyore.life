// Кости (engine/dice.ts): лестница ставок по азарту, что теряется при проигрыше, жульничество, наследство.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay, choose, eligible } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import { applyDice, DICE_QUIT_AFTER, diceOf, diceRefuse, diceStakes, diceYear, WIFE_TAKES_UNDER } from '../src/engine/dice'
import { ANIMAL_COST, HOME_COST } from '../src/engine/household'
import type { DiceResult, Stake } from '../src/engine/dice'
import { makeNpc } from '../src/engine/rules'

const era = await loadEra('EUR')
const base = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }
const play = (stake: Stake, won: boolean, extra: Partial<DiceResult> = {}): DiceResult => ({ stake, won, cheated: false, caught: false, exposed: false, fate: false, chase: false, opponent: 'risky', ...extra })

function adult(seed: number) {
  const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, seed), era, 6)
  s.hero.age = 35
  return s
}

describe('Кости', () => {
  it('ставки открывает азарт: монеты всегда, кошелёк с 30, имущество с 50, семья с 70 и без денег, себя с 85 и в долгу', () => {
    const s = adult(1)
    s.hero.money = 500
    s.hero.home = 2
    const kinds = () => diceStakes(s, era).map((x) => x.kind)
    expect(kinds()).toEqual(['coins'])
    diceOf(s.hero).lust = 30
    expect(kinds()).toContain('purse')
    diceOf(s.hero).lust = 55
    expect(kinds()).toContain('house')
    const son = makeNpc(s, era, 'child', 'm', s.year - 12)
    diceOf(s.hero).lust = 75
    expect(kinds()).not.toContain('son')
    s.hero.money = -50
    expect(diceStakes(s, era).find((x) => x.kind === 'son')?.npcId).toBe(son.id)
    expect(kinds()).not.toContain('self')
    diceOf(s.hero).lust = 90
    expect(kinds()).toContain('self')
  })

  it('проигрыш: сын уходит в услужение, дом - на ступень меньше, себя - в кабалу; род это запомнит', () => {
    const s = adult(2)
    const d = diceOf(s.hero)
    d.lust = 95
    s.hero.money = -100
    s.hero.home = 3
    const son = makeNpc(s, era, 'child', 'm', s.year - 14)
    applyDice(s, era, play({ level: 4, kind: 'son', amount: 300, npcId: son.id }, false))
    expect(son.away?.reason).toBe('service')
    applyDice(s, era, play({ level: 3, kind: 'house', amount: 900 }, false))
    expect(s.hero.home).toBe(2)
    applyDice(s, era, play({ level: 5, kind: 'self', amount: 800 }, false))
    expect(s.hero.cls).toBe('slave')
    expect(s.hero.tags).toContain('enslaved')
    expect(d.ruined).toBe(true)
  })

  it('выигрыш поднимает славу и азарт, крупный - тянет последствие; пойманный шулер проигрывает и платит по обычаю края', () => {
    const s = adult(3)
    s.hero.money = 100
    const d = diceOf(s.hero)
    applyDice(s, era, play({ level: 2, kind: 'purse', amount: 100 }, true))
    expect(s.hero.money).toBe(200)
    expect(d.lust).toBeGreaterThanOrEqual(13)
    expect(d.fame[s.hero.region]).toBeGreaterThan(0)
    expect(s.hero.triggers.some((t) => t.eventId.startsWith('dice_'))).toBe(true)
    const health = s.hero.attrs.health
    applyDice(s, era, play({ level: 1, kind: 'coins', amount: 50 }, true, { cheated: true, caught: true }))
    // Европа: шулеру рубят руку - здоровье падает, метка увечья.
    expect(s.hero.attrs.health).toBeLessThan(health)
    expect(s.hero.tags).toContain('maimed')
    expect(d.fame[s.hero.region]).toBe(100)
  })

  it('слава гаснет за несколько лет, зарок остужает азарт', () => {
    const s = adult(4)
    const d = diceOf(s.hero)
    d.fame[s.hero.region] = 90
    d.lust = 60
    s.hero.flags.push('v_quit_dice')
    for (let i = 0; i < 4; i++) {
      s.year++
      diceYear(s)
    }
    expect(d.fame[s.hero.region]).toBeLessThan(30)
    expect(d.lust).toBeLessThan(30)
  })

  it('наследник проигравшегося получает легенду рода, наследник великого игрока - счастливые кости', () => {
    for (const [ruined, tag] of [[true, 'dice_legend'], [false, 'lucky_dice']] as const) {
      let s = autoplay(newLife(era, base, ruined ? 10 : 11), era)
      for (let i = 0; i < 20 && !heirs(s).length; i++) s = autoplay(newLife(era, base, 100 + i + (ruined ? 0 : 50)), era)
      const d = diceOf(s.hero)
      d.ruined = ruined
      d.skill = 80
      d.net = 500
      const kid = heirs(s)[0]
      if (!kid) continue
      const h = continueWithHeir(s, era, kid.id)
      expect(h.hero.tags).toContain(tag)
    }
  })

  it('трижды подряд отказался от стола - завязал: метка, дневник, события костей больше не выпадают; партия обнуляет счёт', () => {
    const s = adult(21)
    const table = era.events.find((e) => e.id === 'dice_table')!
    const decline = () => {
      s.queue = [{ eventId: 'dice_table', at: 0.5, outcome: null }]
      choose(s, era, 'decline')
      s.queue = []
    }
    decline()
    decline()
    expect(diceOf(s.hero).refused).toBe(2)
    // Сыгранная партия - счёт отказов заново.
    s.hero.money = 1000
    applyDice(s, era, play(diceStakes(s, era)[0], true))
    expect(diceOf(s.hero).refused).toBe(0)
    for (let i = 0; i < DICE_QUIT_AFTER; i++) decline()
    const d = diceOf(s.hero)
    expect(d.quit).toBe(true)
    expect(s.hero.tags).toContain('dice_quit')
    expect(s.hero.diary.filter((e) => e.key === 'diary.dice_quit')).toHaveLength(1)
    expect(eligible(s, era, table, true)).toBe(false)
    // Метка не слетает с годами и азарт больше не держит у стола.
    diceYear(s)
    expect(s.hero.tags).toContain('dice_quit')
    expect(s.hero.tags).not.toContain('gambler')
    // «Назад» у стола без партии - тот же отказ: diceRefuse после завязки ничего не ломает.
    diceRefuse(s)
    expect(s.hero.diary.filter((e) => e.key === 'diary.dice_quit')).toHaveLength(1)
  })

  it('в автоигре отказы считаются, завязавший больше не садится за стол', () => {
    let quit = 0
    for (let seed = 1; seed <= 40; seed++) {
      const s = autoplay(newLife(era, base, 300 + seed), era, 90, (opts) => {
        const i = opts.findIndex((c) => ['decline', 'resist', 'home', 'watch', 'stop', 'stay', 'refuse'].includes(c.id))
        return i >= 0 ? i : null
      })
      const d = s.hero.dice
      if (!d?.quit) continue
      quit++
      const at = s.hero.diary.find((e) => e.key === 'diary.dice_quit')
      expect(at).toBeTruthy()
      // Само третье «нет» записывается в тот же год; дальше столов нет.
      const after = s.hero.diary.filter((e) => e.year > at!.year && e.eventId && era.events.find((x) => x.id === e.eventId)?.dynamic === 'dice')
      expect(after).toEqual([])
    }
    expect(quit).toBeGreaterThan(0)
  })

  it('у каждой ставки цена: дом - по HOME_COST, скотина - по ANIMAL_COST, земля и семья - не ноль', () => {
    const s = adult(22)
    const d = diceOf(s.hero)
    d.lust = 75
    s.hero.money = 0
    s.hero.home = 3
    s.hero.cls = 'landowner'
    s.hero.animals = [{ kind: 'goat', since: s.year }, { kind: 'horse', since: s.year }, { kind: 'chickens', since: s.year }]
    makeNpc(s, era, 'child', 'm', s.year - 12)
    const stakes = diceStakes(s, era)
    expect(stakes.find((x) => x.kind === 'house')!.amount).toBe(HOME_COST[3])
    const animal = stakes.find((x) => x.kind === 'animal')!
    expect(animal.animal).toBe('horse')
    expect(animal.amount).toBe(ANIMAL_COST.horse)
    for (const k of ['land', 'son'] as const) expect(stakes.find((x) => x.kind === k)!.amount).toBeGreaterThan(0)
  })

  it('проиграл скотину: можно откупиться её ценой, если хватает денег', () => {
    const s = adult(23)
    s.hero.animals = [{ kind: 'cow', since: s.year }]
    s.hero.money = 500
    const stake: Stake = { level: 3, kind: 'animal', amount: ANIMAL_COST.cow, animal: 'cow' }
    applyDice(s, era, play(stake, false, { ransom: true }))
    expect(s.hero.animals.map((a) => a.kind)).toEqual(['cow'])
    expect(s.hero.money).toBe(500 - ANIMAL_COST.cow)
    expect(s.hero.diary.some((e) => e.key === 'diary.dice_lost.animal_ransom')).toBe(true)
    // Денег не хватает - скотину уводят, даже если хотел откупиться.
    s.hero.money = 10
    applyDice(s, era, play(stake, false, { ransom: true }))
    expect(s.hero.animals).toEqual([])
    expect(s.hero.money).toBe(10)
  })

  it('проиграл жену: 50 на 50 - один с детьми или она уводит малых; взрослые сыновья остаются в роду', () => {
    const seen = new Set<string>()
    for (let seed = 30; seed < 60; seed++) {
      const s = adult(seed)
      s.hero.sex = 'm'
      const wife = makeNpc(s, era, 'spouse', 'f', s.year - 30)
      const small = makeNpc(s, era, 'child', 'f', s.year - 5)
      const grown = makeNpc(s, era, 'child', 'm', s.year - (WIFE_TAKES_UNDER + 2))
      applyDice(s, era, play({ level: 4, kind: 'wife', amount: 300, npcId: wife.id }, false))
      expect(wife.away).toBeTruthy()
      expect(grown.away).toBeUndefined()
      const key = [...s.hero.diary].reverse().find((e) => e.key.startsWith('diary.dice_lost.wife'))!.key
      seen.add(key)
      if (key === 'diary.dice_lost.wife_kids') expect(small.away).toBeTruthy()
      else expect(small.away).toBeUndefined()
    }
    expect([...seen].sort()).toEqual(['diary.dice_lost.wife_kids', 'diary.dice_lost.wife_stay'])
  })
})
