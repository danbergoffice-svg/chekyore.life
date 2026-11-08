// Пакет 3: дом, земля и рабы покупаются выбором в событиях; доход и риски; ставки в кости; наследство и мемориал.
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay, choose, eligible, eventChoices, eventParams, startYear } from '../src/engine/game'
import { continueWithHeir, estateShare, heirs, newLife, stateFromMemorial, summarize } from '../src/engine/life'
import { applyDice, diceOf, diceStakes } from '../src/engine/dice'
import type { DiceResult, Stake } from '../src/engine/dice'
import { HOME_COST, householdYear } from '../src/engine/household'
import { canBuy, estateOffers, landPrice, LAND_MAX, slaveryAllowed, slavePrice } from '../src/engine/estate'
import type { EraDef, GameState } from '../src/engine/types'

const EUR = await loadEra('EUR')
const E03 = await loadEra('E03')
const RUS = await loadEra('RUS')
const IND = await loadEra('IND')
const CHN = await loadEra('CHN')
const ISL = await loadEra('ISL')
const base = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }
const play = (stake: Stake, won: boolean): DiceResult => ({ stake, won, cheated: false, caught: false, exposed: false, fate: false, chase: false, opponent: 'risky' })

/** Взрослый свободный горожанин в этом краю и в этом году, с деньгами. */
function adult(era: EraDef, region: string, seed: number, money = 5000, year?: number): GameState {
  const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, seed), era, 6)
  s.hero.age = 35
  s.hero.cls = 'craftsman'
  s.hero.region = region
  s.hero.tags = s.hero.tags.filter((t) => t !== 'enslaved' && t !== 'in_debt' && t !== 'deep_debt')
  s.hero.money = money
  s.hero.home = 2
  s.hero.rent = undefined
  if (year !== undefined) s.year = year
  return s
}

/** Открыть событие хозяйства и сделать в нём выбор. */
function decide(s: GameState, era: EraDef, eventId: string, choiceId: string): void {
  s.queue = [{ eventId, at: 0.5, outcome: null }]
  s.phase = 'running'
  choose(s, era, choiceId)
}

describe('Где можно купить раба', () => {
  it('там, где рабство было обычным и законным, - да; в Европе, Китае и поздней Руси - нет', () => {
    expect(slaveryAllowed(adult(E03, 'rome', 1, 0, -100))).toBe(true)
    expect(slaveryAllowed(adult(E03, 'athens', 2, 0, -300))).toBe(true)
    expect(slaveryAllowed(adult(ISL, 'cordoba', 3, 0, 950))).toBe(true)
    expect(slaveryAllowed(adult(IND, 'delhi', 4, 0, 1300))).toBe(true)
    expect(slaveryAllowed(adult(IND, 'bengal', 5, 0, 1300))).toBe(false)
    expect(slaveryAllowed(adult(RUS, 'kiev', 6, 0, 1100))).toBe(true)
    expect(slaveryAllowed(adult(RUS, 'moscow', 7, 0, 1450))).toBe(false)
    expect(slaveryAllowed(adult(EUR, 'paris', 8, 0, 1200))).toBe(false)
    expect(slaveryAllowed(adult(CHN, 'hangzhou', 9, 0, 1200))).toBe(false)
  })

  it('купить можно только свободному взрослому, с запасом денег; в Париже - никогда', () => {
    const rome = adult(E03, 'rome', 10, 5000, -100)
    expect(canBuy(rome, 'slaves')).toBe(true)
    rome.hero.money = slavePrice(rome)
    expect(canBuy(rome, 'slaves')).toBe(false)
    rome.hero.money = 5000
    rome.hero.cls = 'slave'
    expect(canBuy(rome, 'slaves')).toBe(false)
    const paris = adult(EUR, 'paris', 11, 100000, 1200)
    expect(canBuy(paris, 'slaves')).toBe(false)
    expect(estateOffers(paris)).toEqual(['home', 'land'])
  })
})

describe('Покупки - выборами в событиях', () => {
  it('дом больше не покупается тихо: при больших деньгах householdYear дом не меняет', () => {
    const s = adult(EUR, 'paris', 20, 100000, 1200)
    for (let i = 0; i < 20; i++) householdYear(s, EUR)
    expect(s.hero.home).toBe(2)
    expect(s.hero.diary.some((d) => d.key === 'diary.home_up')).toBe(false)
  })

  it('разбогатевшему предлагают купить дом, землю - и рабов только в Риме', () => {
    const offered = (s: GameState, era: EraDef) => {
      const seen = new Set<string>()
      for (let i = 0; i < 40; i++) {
        s.hero.money = 100000
        s.hero.age = 30
        s.hero.alive = true
        s.phase = 'year'
        startYear(s, era, null)
        for (const q of s.queue) if (q.eventId.startsWith('estate_')) seen.add(q.eventId)
        s.queue = []
        s.year += 1
      }
      return seen
    }
    const rome = offered(adult(E03, 'rome', 21, 0, -150), E03)
    expect(rome.has('estate_slaves')).toBe(true)
    expect(rome.has('estate_land')).toBe(true)
    const paris = offered(adult(EUR, 'paris', 22, 0, 1200), EUR)
    expect(paris.has('estate_land') || paris.has('estate_home')).toBe(true)
    expect(paris.has('estate_slaves')).toBe(false)
  })

  it('купить дом побольше: цена из HOME_COST, дом на ступень больше, цена - в тексте', () => {
    const s = adult(EUR, 'paris', 30, 3000, 1200)
    const params = eventParams(s, { eventId: 'estate_home' })
    expect(params.n).toBe(HOME_COST[3])
    expect(params.home).toEqual({ key: 'home.3' })
    decide(s, EUR, 'estate_home', 'buy')
    expect(s.hero.home).toBe(3)
    expect(s.hero.money).toBe(3000 - HOME_COST[3])
  })

  it('купить землю: деньги уходят, наделы растут; три надела делают крестьянина землевладельцем', () => {
    const s = adult(EUR, 'cologne', 31, 10000, 1200)
    s.hero.cls = 'peasant'
    const price = landPrice(s)
    decide(s, EUR, 'estate_land', 'buy')
    expect(s.hero.land).toBe(1)
    expect(s.hero.money).toBe(10000 - price)
    decide(s, EUR, 'estate_land', 'buy_two')
    expect(s.hero.land).toBe(3)
    expect(s.hero.cls).toBe('landowner')
    s.hero.land = LAND_MAX
    expect(canBuy(s, 'land')).toBe(false)
  })

  it('купить раба в Риме; в краю без рабства событие не подходит', () => {
    const s = adult(E03, 'rome', 32, 5000, -100)
    const ev = E03.events.find((e) => e.id === 'estate_slaves')!
    expect(eligible(s, E03, ev, true)).toBe(true)
    decide(s, E03, 'estate_slaves', 'buy')
    expect(s.hero.slaves).toBe(1)
    const p = adult(EUR, 'paris', 33, 5000, 1200)
    expect(eligible(p, EUR, EUR.events.find((e) => e.id === 'estate_slaves')!, true)).toBe(false)
    // Тяжёлая тема: в режиме «убрать тяжёлые сцены» не показывается.
    s.settings.softenHeavy = true
    s.hero.slaves = 0
    expect(eligible(s, E03, ev, true)).toBe(false)
  })
})

describe('Доход и риски владений', () => {
  it('земля и рабы приносят доход каждый год', () => {
    const s = adult(E03, 'rome', 40, 0, -100)
    s.hero.animals = []
    s.hero.land = 3
    s.hero.slaves = 2
    const before = s.hero.money
    for (let i = 0; i < 10; i++) householdYear(s, E03)
    expect(s.hero.money - before).toBeGreaterThan(10 * 2 * 30)
  })

  it('неурожай, захват земли, побег и освобождение отнимают наделы и рабов', () => {
    const s = adult(E03, 'rome', 41, 1000, -100)
    s.hero.land = 2
    s.hero.slaves = 3
    decide(s, E03, 'estate_land_claim', 'yield')
    expect(s.hero.land).toBe(1)
    const money = s.hero.money
    decide(s, E03, 'estate_drought', 'sell')
    expect(s.hero.land).toBe(0)
    expect(s.hero.money).toBeGreaterThan(money)
    decide(s, E03, 'estate_runaway', 'let_go')
    expect(s.hero.slaves).toBe(2)
    decide(s, E03, 'estate_freedom', 'free')
    expect(s.hero.slaves).toBe(1)
  })

  it('у мусульманина и христианина свой текст о просьбе освобождения', async () => {
    const { createT, loadTexts } = await import('../src/i18n')
    await loadTexts('ru', 'common')
    const t = createT('ru')
    expect(t('ev.estate_freedom.text', {}, { religion: 'islam' })).toContain('имам')
    expect(t('ev.estate_freedom.text', {}, { religion: 'orthodox', region: 'kiev' })).toContain('холоп')
    expect(t('ev.estate_freedom.text', {}, { religion: 'roman_gods' })).not.toContain('имам')
  })

  it('в долгах сначала продают рабов, потом землю', () => {
    const s = adult(E03, 'rome', 42, -5000, -100)
    s.hero.land = 1
    s.hero.slaves = 1
    for (let i = 0; i < 30 && (s.hero.land || s.hero.slaves); i++) {
      s.hero.money = -5000
      householdYear(s, E03)
      if (s.hero.land === 0) expect(s.hero.slaves).toBe(0)
    }
    expect(s.hero.slaves).toBe(0)
  })
})

describe('Кости, наследство, мемориал', () => {
  it('надел и раб - на кону по своей цене; проиграл - на один меньше, сословие то же', () => {
    const s = adult(E03, 'rome', 50, 100, -100)
    s.hero.cls = 'landowner'
    s.hero.land = 2
    s.hero.slaves = 2
    diceOf(s.hero).lust = 55
    const stakes = diceStakes(s, E03)
    const land = stakes.find((x) => x.kind === 'land')!
    const slave = stakes.find((x) => x.kind === 'slave')!
    expect(land.amount).toBe(landPrice(s))
    expect(slave.amount).toBe(slavePrice(s))
    applyDice(s, E03, play(land, false))
    applyDice(s, E03, play(slave, false))
    expect(s.hero.land).toBe(1)
    expect(s.hero.slaves).toBe(1)
    expect(s.hero.cls).toBe('landowner')
  })

  it('наследник получает землю и рабов по обычаю края; в итоге и мемориале они сохраняются', () => {
    let s: GameState = autoplay(newLife(E03, base, 600), E03)
    for (let i = 0; i < 40 && !heirs(s).length; i++) s = autoplay(newLife(E03, base, 601 + i), E03)
    const kid = heirs(s)[0]
    expect(kid).toBeDefined()
    s.hero.land = 4
    s.hero.slaves = 3
    s.hero.home = 3
    const share = estateShare(s, E03, kid)
    expect(share.land).toBeGreaterThan(0)
    const life = summarize(s, E03)
    expect([life.land, life.slaves, life.home]).toEqual([4, 3, 3])
    const back = stateFromMemorial(E03, life, [life], base)
    expect([back.hero.land, back.hero.slaves, back.hero.home]).toEqual([4, 3, 3])
    const next = continueWithHeir(back, E03, kid.id)
    expect(next.hero.land).toBe(share.land)
    expect(next.hero.slaves).toBe(share.slaves)
    expect(next.hero.diary.some((d) => d.key.startsWith('diary.estate_inherited'))).toBe(true)
  })

  it('где наследуют сыновья, дочь при братьях землю не получает', () => {
    const s = adult(EUR, 'paris', 61, 0, 1200)
    s.hero.land = 3
    const kids = [
      { id: 'k1', role: 'child' as const, name: 'a', sex: 'm' as const, birthYear: s.year - 20, traits: [], attitude: 50, alive: true },
      { id: 'k2', role: 'child' as const, name: 'b', sex: 'f' as const, birthYear: s.year - 18, traits: [], attitude: 50, alive: true },
    ]
    s.hero.npcs = kids
    s.hero.alive = false
    const rule = (EUR.regions.find((r) => r.id === 'paris')?.inheritance ?? EUR.inheritance) === 'sons_first'
    const son = estateShare(s, EUR, kids[0])
    const daughter = estateShare(s, EUR, kids[1])
    if (rule) {
      expect(son.land).toBe(3)
      expect(daughter.land).toBe(0)
    } else {
      expect(son.land).toBe(2)
      expect(daughter.land).toBe(2)
    }
  })

  it('у каждого выбора событий хозяйства есть тексты на ru, en и tr', async () => {
    const { hasKey, loadTexts } = await import('../src/i18n')
    for (const lang of ['ru', 'en', 'tr'] as const) await loadTexts(lang, 'common')
    for (const ev of E03.events.filter((e) => e.id.startsWith('estate_'))) {
      for (const lang of ['ru', 'en', 'tr'] as const) {
        if (!ev.moment) expect(hasKey(lang, `ev.${ev.id}.title`), `${lang} ${ev.id}`).toBe(true)
        expect(hasKey(lang, `ev.${ev.id}.text`), `${lang} ${ev.id}`).toBe(true)
        for (const c of eventChoices(adult(E03, 'rome', 70, 5000, -100), E03, ev)) {
          expect(hasKey(lang, `ev.${ev.id}.${c.id}`), `${lang} ${ev.id}.${c.id}`).toBe(true)
          for (const out of c.risk_roll ? ['success', 'failure'] : ['ok']) expect(hasKey(lang, `ev.${ev.id}.${c.id}.${out}`), `${lang} ${ev.id}.${c.id}.${out}`).toBe(true)
        }
      }
    }
  })
})
