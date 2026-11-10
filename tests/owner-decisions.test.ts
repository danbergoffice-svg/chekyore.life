// Решения владельца 10.11 (11_OWNER_DECISIONS, ТЗ №1): повторы окон «Дом побольше» и «Земля на продажу»,
// болезнь близкого без окна, метка «дело закроет цель», перестройка дома из «Имущества».
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { canBuy, estateOffers, estatePrice, homeUpgradeLock, LAND_GAP, LAND_REFUSALS, offerAllowed, offerAnswered, upgradeHome } from '../src/engine/estate'
import { autoplay } from '../src/engine/game'
import { professionClosesGoal } from '../src/engine/goals'
import { isLossCard, npcHealthYear } from '../src/engine/illness'
import { newLife } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'
import type { GameSettings, GameState } from '../src/engine/types'

const ERAS = await loadAllEras()
const quick: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }

const base = new Map<number, GameState>()
function adult(seed: number): GameState {
  if (!base.has(seed)) {
    const era = ERAS.E03
    const s = autoplay(newLife(era, { ...quick, protectedUntil: 90 }, seed), era, 30)
    s.hero.alive = true
    base.set(seed, s)
  }
  const s = structuredClone(base.get(seed)!)
  s.hero.cls = 'craftsman'
  s.hero.tags = s.hero.tags.filter((t) => t !== 'enslaved')
  s.hero.rent = undefined
  s.hero.home = 1
  s.hero.land = 0
  s.hero.money = 1e6
  s.hero.seen = {}
  s.hero.landRefused = 0
  return s
}

describe('Окна покупок без повторов (MEC-038)', () => {
  it('«Дом побольше» - один раз за жизнь, даже если денег хватает и дом можно расширять', () => {
    const s = adult(1)
    expect(canBuy(s, 'home')).toBe(true)
    expect(estateOffers(s)).toContain('home')
    s.hero.seen.estate_home = s.year
    s.year += 20
    expect(canBuy(s, 'home')).toBe(true)
    expect(estateOffers(s)).not.toContain('home')
  })

  it(`«Земля на продажу» - не чаще раза в ${LAND_GAP} лет`, () => {
    const s = adult(2)
    expect(estateOffers(s)).toContain('land')
    s.hero.seen.estate_land = s.year
    s.year += LAND_GAP - 1
    expect(offerAllowed(s, 'land')).toBe(false)
    s.year += 1
    expect(offerAllowed(s, 'land')).toBe(true)
  })

  it(`после ${LAND_REFUSALS} отказов подряд земли больше не предлагают; покупка обнуляет счёт`, () => {
    const s = adult(3)
    offerAnswered(s, 'estate_land', 'save')
    offerAnswered(s, 'estate_land', 'save')
    expect(offerAllowed(s, 'land')).toBe(true)
    offerAnswered(s, 'estate_land', 'buy')
    expect(s.hero.landRefused).toBe(0)
    for (let i = 0; i < LAND_REFUSALS; i++) offerAnswered(s, 'estate_land', 'save')
    s.year += 100
    expect(offerAllowed(s, 'land')).toBe(false)
    // Другие события счёт не трогают.
    offerAnswered(s, 'estate_home', 'buy')
    expect(s.hero.landRefused).toBe(LAND_REFUSALS)
  })

  it('в прогоне жизней: «Дом побольше» раз и снова только после подъёма, земля - с промежутком от 8 лет и не больше 3 отказов подряд', () => {
    let homes = 0
    let repeats = 0
    let lands = 0
    for (let i = 0; i < 120; i++) {
      const era = ERAS[(['E03', 'RUS', 'CHN', 'EUR', 'ISL'] as const)[i % 5]]
      if (!era) continue
      const s = autoplay(newLife(era, { ...quick, protectedUntil: 70 }, 500 + i), era)
      const at = (id: string) => s.hero.diary.filter((d) => d.eventId === id && d.key.startsWith(`ev.${id}`))
      const home = at('estate_home')
      const land = at('estate_land')
      homes += home.length
      lands += land.length
      // Раз за жизнь и ещё раз после каждого подъёма в положении (полос четыре).
      expect(home.length, `жизнь ${i}`).toBeLessThanOrEqual(4)
      if (home.length > 1) repeats++
      for (let k = 1; k < land.length; k++) expect(land[k].year - land[k - 1].year).toBeGreaterThanOrEqual(LAND_GAP)
      let run = 0
      for (const d of land) {
        const ch = d.params?.choice as { key?: string } | undefined
        run = ch?.key === 'ev.estate_land.buy' ? 0 : run + 1
        expect(run).toBeLessThanOrEqual(LAND_REFUSALS)
      }
    }
    // Окна покупок не пропали совсем.
    expect(homes).toBeGreaterThan(0)
    // Повторы - редкость: только у тех, кто поднялся.
    expect(repeats).toBeLessThan(40)
    expect(lands).toBeGreaterThan(0)
  }, 300000)
})

describe('Дом перестраивают в «Имуществе»', () => {
  it('хватает денег - дом растёт на ступень, деньги уходят; нет денег, чужой дом, усадьба - нельзя', () => {
    const s = adult(4)
    s.hero.money = estatePrice(s, 'home') - 1
    expect(homeUpgradeLock(s)).toBe('estate.lock.money')
    expect(upgradeHome(s)).toBe(false)
    s.hero.money = estatePrice(s, 'home') + 10
    const price = estatePrice(s, 'home')
    expect(upgradeHome(s)).toBe(true)
    expect(s.hero.home).toBe(2)
    expect(s.hero.money).toBe(10)
    expect(s.hero.diary.at(-1)?.key).toBe('diary.home_up')
    s.hero.money = 1e6
    s.hero.home = 4
    expect(homeUpgradeLock(s)).toBe('estate.home_lock.max')
    s.hero.home = 2
    s.hero.rent = { level: 1, perYear: 1, since: s.year, lost: 0 }
    expect(homeUpgradeLock(s)).toBe('estate.home_lock.rent')
    expect(price).toBeGreaterThan(0)
  })
})

describe('Болезнь близкого - строка, не окно (MEC-044/093)', () => {
  it('запись о болезни есть в дневнике, но карточку утраты не открывает; смерть - открывает', () => {
    let ill = 0
    let deaths = 0
    for (let i = 0; i < 400 && (ill < 3 || deaths < 3); i++) {
      const s = adult(5)
      s.rng = (i * 2654435761) >>> 0
      const n = makeNpc(s, ERAS.E03, 'mother', 'f', s.year - 60)
      s.hero.npcs.push(n)
      for (let y = 0; y < 6 && n.alive; y++) {
        const before = s.hero.diary.length
        npcHealthYear(s, n, 0.3)
        for (const d of s.hero.diary.slice(before)) {
          if (d.key === 'diary.npc_ill') {
            ill++
            expect(isLossCard(d)).toBe(false)
          }
          if (d.key.startsWith('diary.death_') && d.major) {
            deaths++
            expect(isLossCard(d)).toBe(true)
          }
        }
        s.year++
      }
      // Пока болен - отметка в «Близких» (npc.ill).
      if (n.alive && n.ill) expect(n.ill.cause).toBeTruthy()
    }
    expect(ill).toBeGreaterThan(0)
    expect(deaths).toBeGreaterThan(0)
  })
})

describe('Выбор дела закрывает цель (метка)', () => {
  it('монах/монахиня при цели «Большая семья» без супруга - метка; с супругом или другой целью - нет', () => {
    const s = adult(6)
    s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse')
    s.hero.goal = { id: 'family', steps: [], tier: 'calm' } as unknown as GameState['hero']['goal']
    expect(professionClosesGoal(s.hero, 'monk')).toBe(true)
    expect(professionClosesGoal(s.hero, 'scribe')).toBe(false)
    s.hero.goal = { ...s.hero.goal!, id: 'learning' }
    expect(professionClosesGoal(s.hero, 'monk')).toBe(false)
    s.hero.goal = { ...s.hero.goal!, id: 'love' }
    s.hero.npcs.push(makeNpc(s, ERAS.E03, 'spouse', 'f', s.year - 25))
    expect(professionClosesGoal(s.hero, 'monk')).toBe(false)
  })
})
