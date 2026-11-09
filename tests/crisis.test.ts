// Перелом сорокалетия (engine/crisis.ts, ТЗ crisis-plinko v2.1): расписание, тактики по сословию, расклад исходов,
// смягчение без отмены, пол здоровья, азарт, не больше двух шаров, A/B (без settings.crisis перелома нет).
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { autoplay, choose, currentEvent, eventChoices } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { applyCrisis, BOARD, crisisDrop, crisisDue, crisisFinal, crisisOdds, crisisOptions, crisisSecond, crisisStances, HEALTH_FLOOR, SEV, SLOT_CAT } from '../src/engine/crisis'
import type { CrisisRecord, StanceId } from '../src/engine/crisis'
import { diceOf } from '../src/engine/dice'
import { makeNpc } from '../src/engine/rules'
import type { GameState } from '../src/engine/types'

const era = await loadEra('MNG')
const base = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, crisis: true, protectedUntil: 90 }

function adult(seed: number, age = 40): GameState {
  const s = newLife(era, base, seed)
  s.hero.age = age
  s.hero.attrs = { health: 70, intellect: 50, strength: 50, charisma: 50, diligence: 55, risk_tolerance: 40 }
  s.hero.hidden.faith = 50
  s.hero.cls = 'peasant'
  s.hero.profession = null
  s.hero.money = 200
  s.hero.home = 2
  s.hero.rent = undefined
  s.queue = [{ eventId: 'crisis_turn', at: 0.5, outcome: null }]
  return s
}
const rec = (slot: CrisisRecord['slot'], stance: StanceId, s: GameState): CrisisRecord => {
  // Нужный исход: бросать, пока не выпадет (генератор детерминирован - тест стабилен).
  for (let i = 0; i < 500; i++) {
    const r = crisisDrop(s, era, stance)
    if (r.slot === slot) return r
  }
  throw new Error(`не выпал ${slot}`)
}

describe('Перелом сорокалетия', () => {
  it('без A/B-группы перелома нет; в группе - назначается на 36–44 и случается раз', () => {
    const off = newLife(era, { ...base, crisis: undefined }, 3)
    off.hero.age = 40
    expect(crisisDue(off, false)).toBe(false)
    expect(off.hero.crisis).toBeUndefined()
    const ages = new Set<number>()
    for (let seed = 1; seed <= 60; seed++) {
      const s = newLife(era, base, seed)
      s.hero.age = 35
      crisisDue(s, false)
      const a = s.hero.crisis!.age
      expect(a).toBeGreaterThanOrEqual(36)
      expect(a).toBeLessThanOrEqual(44)
      ages.add(a)
      s.hero.age = a
      expect(crisisDue(s, false)).toBe(true)
      s.hero.crisis!.offered = s.year
      expect(crisisDue(s, false)).toBe(false)
    }
    expect(ages.size).toBeGreaterThan(4)
  })

  it('в год другой мини-игры перелом сдвигается, после 45 - пропускается', () => {
    const s = newLife(era, base, 5)
    s.hero.age = 44
    s.hero.crisis = { age: 44 }
    expect(crisisDue(s, true)).toBe(false)
    expect(s.hero.crisis.age).toBe(45)
    s.hero.age = 45
    expect(crisisDue(s, true)).toBe(false)
    expect(s.hero.crisis.skipped).toBe(true)
    const late = newLife(era, base, 6)
    late.hero.age = 50
    expect(crisisDue(late, false)).toBe(false)
    expect(late.hero.crisis?.skipped).toBe(true)
  })

  it('тактики по сословию: раб «ищет волю», духовному «начать заново» закрыто', () => {
    const s = adult(1)
    expect(crisisStances(s)).toEqual(['start_over', 'hold_on', 'seek_meaning'])
    s.hero.cls = 'slave'
    expect(crisisStances(s)).toEqual(['seek_freedom', 'hold_on', 'seek_meaning'])
    s.hero.cls = 'peasant'
    s.hero.profession = 'monk'
    expect(crisisStances(s)).toEqual(['hold_on', 'seek_meaning'])
    // Варианты окна - те же тактики; ставка меньше 10 закрывает тактику.
    s.hero.profession = null
    s.hero.attrs.charisma = 5
    const ev = currentEvent(s, era)!
    expect(ev.dynamic).toBe('crisis')
    const choices = eventChoices(s, era, ev)
    expect(choices.map((c) => c.id)).toEqual(['start_over', 'hold_on', 'seek_meaning'])
  })

  it('расклад первого шара: беды 38–45%, удачи 17–25% при любой тактике; опыт снижает свои беды', () => {
    const s = adult(2)
    for (const st of ['start_over', 'hold_on', 'seek_meaning'] as StanceId[]) {
      const o = crisisOdds(s, st)
      expect(o.neg).toBeGreaterThanOrEqual(0.38)
      expect(o.neg).toBeLessThanOrEqual(0.46)
      expect(o.clean).toBeGreaterThanOrEqual(0.17)
      expect(o.clean).toBeLessThanOrEqual(0.25)
    }
    const before = crisisOdds(s, 'hold_on').neg
    s.hero.attrs.diligence = 70
    s.hero.attrs.health = 70
    expect(crisisOdds(s, 'hold_on').neg).toBeLessThan(before)
    // И по броскам - то же, что по весам.
    const t = adult(3)
    let neg = 0
    const N = 4000
    for (let i = 0; i < N; i++) if (SLOT_CAT[crisisDrop(t, era, 'seek_meaning').slot] === 'neg') neg++
    expect(neg / N).toBeGreaterThan(0.34)
    expect(neg / N).toBeLessThan(0.46)
  })

  it('удар по поставленному - полной силы, по непоставленному - на ступень мягче; принять - здоровье 70 → 50', () => {
    const s = adult(4)
    const r = rec('worn_body', 'hold_on', s)
    expect(r.first.find((c) => c.param === 'health')).toMatchObject({ delta: -SEV.strong, staked: true })
    expect(r.first.find((c) => c.param === 'strength')).toMatchObject({ delta: -SEV.trace, staked: false })
    applyCrisis(s, r)
    expect(s.hero.attrs.health).toBe(50)
    expect(s.hero.attrs.strength).toBe(47)
    expect(s.hero.tags).toContain('crisis_done')
    expect(s.hero.crisis?.done).toBe(true)
  })

  it('опора на близких смягчает, но не отменяет удар и всегда чего-то стоит', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = adult(seed)
      const wife = makeNpc(s, era, 'spouse', 'f', s.year - 38)
      wife.attitude = 70
      const r = rec('worn_body', 'hold_on', s)
      const opts = crisisOptions(s, r)
      expect(opts.family.map((n) => n.id)).toContain(wife.id)
      expect(opts.home).toBe(true)
      expect(opts.gamble).toBe(false)
      const sec = crisisSecond(s, r, 'family', wife.id)
      const hp = crisisFinal(r).find((c) => c.param === 'health')!.delta
      expect(hp).toBeLessThanOrEqual(-SEV.trace)
      if (sec.outcome === 'strong') expect(hp).toBe(-SEV.medium)
      if (sec.outcome === 'partial') expect(hp).toBe(-SEV.strong + 6)
      if (sec.outcome === 'conflict' || sec.outcome === 'rupture') expect(hp).toBe(-SEV.strong)
      applyCrisis(s, r)
      expect(wife.attitude).toBeLessThan(70)
    }
  })

  it('опора на хозяйство: треть денег, а без денег - дом скромнее', () => {
    const s = adult(7)
    const r = rec('burnout', 'hold_on', s)
    crisisSecond(s, r, 'home')
    applyCrisis(s, r)
    expect(s.hero.money).toBe(140)
    const poor = adult(8)
    poor.hero.money = 0
    const r2 = rec('burnout', 'hold_on', poor)
    crisisSecond(poor, r2, 'home')
    applyCrisis(poor, r2)
    expect(poor.hero.home).toBe(1)
    expect(poor.hero.tags).toContain('home_mortgaged')
  })

  it('перелом не опускает здоровье ниже 15', () => {
    const s = adult(9)
    s.hero.attrs.health = 25
    const r = rec('worn_body', 'hold_on', s)
    applyCrisis(s, r)
    expect(s.hero.attrs.health).toBe(HEALTH_FLOOR)
  })

  it('азарт: «Ещё раз…» только азартным и только после удачи; спустил всё - выигрыша нет, азарт растёт', () => {
    const s = adult(10)
    const r = rec('windfall', 'start_over', s)
    expect(crisisOptions(s, r).gamble).toBe(false)
    diceOf(s.hero).lust = 40
    expect(crisisOptions(s, r).gamble).toBe(true)
    s.hero.flags.push('v_quit_dice')
    expect(crisisOptions(s, r).gamble).toBe(false)
    s.hero.flags = s.hero.flags.filter((f) => f !== 'v_quit_dice')
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const g = adult(seed)
      diceOf(g.hero).lust = 40
      const gr = rec('windfall', 'start_over', g)
      const won = gr.first.find((c) => c.param === 'money')!.delta
      const sec = crisisSecond(g, gr, 'gamble')
      outcomes.add(sec.outcome)
      const money = crisisFinal(gr).filter((c) => c.param === 'money').reduce((n, c) => n + c.delta, 0)
      if (sec.outcome === 'double') expect(money).toBe(won * 2)
      if (sec.outcome === 'bust') expect(money).toBe(-Math.round(200 * 0.2))
      applyCrisis(g, gr)
      expect(diceOf(g.hero).lust).toBeGreaterThanOrEqual(45)
    }
    expect(outcomes).toEqual(new Set(['double', 'half', 'bust']))
  })

  it('не больше двух шаров: второй записан, третьего нет в вариантах', () => {
    const s = adult(11)
    const r = rec('burnout', 'hold_on', s)
    crisisSecond(s, r, 'home')
    expect(r.second).toBeDefined()
    // В окне после второго шара - только «Дальше» (опции считаются от первого шара, повторно не предлагаются).
    expect(BOARD).toHaveLength(9)
  })

  it('окно события: выбор тактики без доски (бот) - один шар, перелом применён, метки для наград', () => {
    const s = adult(12)
    choose(s, era, 'seek_meaning')
    expect(s.queue[0].outcome).not.toBeNull()
    expect(s.hero.crisis?.done).toBe(true)
    expect(s.hero.tags).toContain('crisis_stance_seek_meaning')
    expect(s.hero.diary.map((d) => d.key)).toContain('diary.crisis')
    expect(s.hero.diary.at(-1)?.key).toBe('ev.crisis_turn.title')
  })

  it('прогон жизней в группе A/B: перелом случается у доживших до 45 и ничего не ломает', () => {
    let had = 0
    let reached = 0
    for (let seed = 1; seed <= 12; seed++) {
      const s = autoplay(newLife(era, base, seed), era, 60)
      if (s.hero.age >= 45 || (s.hero.alive === false && s.hero.age >= 45)) reached++
      if (s.hero.crisis?.done) had++
    }
    expect(had).toBeGreaterThan(0)
    expect(had).toBeLessThanOrEqual(reached + 1)
  })
})
