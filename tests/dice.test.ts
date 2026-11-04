// Кости (engine/dice.ts): лестница ставок по азарту, что теряется при проигрыше, жульничество, наследство.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import { applyDice, diceOf, diceStakes, diceYear } from '../src/engine/dice'
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
})
