// Болезни близких и врач (отзыв 09.11): близкий сначала болеет известной болезнью, смерть видна герою (траур
// в шапке - от эмоциональной памяти, engine/emotions.ts), врач лучше лечит себя и своих.
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { mourning } from '../src/engine/emotions'
import { autoplay, riskChance } from '../src/engine/game'
import { healing, ILL_DEATH, npcHealthYear } from '../src/engine/illness'
import { newLife } from '../src/engine/life'
import { killNpc, makeNpc } from '../src/engine/rules'
import type { ChoiceDef, GameSettings, GameState } from '../src/engine/types'
import { allKeys, hasKey, loadTexts } from '../src/i18n'

const ERAS = await loadAllEras()
const quick: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }

const base = new Map<number, GameState>()
/** Взрослый герой (копия одной заготовки: проигрывать жизнь заново в каждом опыте - долго). */
function adult(seed: number): GameState {
  if (!base.has(seed)) {
    const era = ERAS.E03
    const s = autoplay(newLife(era, { ...quick, protectedUntil: 90 }, seed), era, 30)
    s.hero.alive = true
    s.hero.emotionalMemories = []
    base.set(seed, s)
  }
  return structuredClone(base.get(seed)!)
}

describe('Болезни близких', () => {
  it('у умерших близких есть причина, и большинство взрослых сначала болели (запись в дневнике)', () => {
    let dead = 0
    let withCause = 0
    let adults = 0
    let warned = 0
    for (let i = 0; i < 60; i++) {
      const era = ERAS[(['E03', 'RUS', 'CHN', 'MNG'] as const)[i % 4]]
      const s = autoplay(newLife(era, quick, 1000 + i), era)
      const ill = new Set(s.hero.diary.filter((d) => d.key === 'diary.npc_ill').map((d) => (d.params?.who as { name: string }).name))
      for (const n of s.hero.npcs.filter((x) => !x.alive && !x.away && x.deathYear !== undefined)) {
        dead++
        if (n.deathCause) withCause++
        if (n.deathYear! - n.birthYear >= 15) {
          adults++
          if (ill.has(n.name)) warned++
        }
      }
    }
    expect(dead).toBeGreaterThan(100)
    expect(withCause / dead).toBeGreaterThan(0.8)
    expect(warned / adults).toBeGreaterThan(0.6)
  })

  it('смертность близких в среднем прежняя: болезнь начинается чаще, но не каждая смертельна', () => {
    // q = 0.1 за 10 лет: без болезней доля доживших 0.9^10 ≈ 0.35; с болезнями - близко к этому.
    let alive = 0
    const N = 3000
    for (let i = 0; i < N; i++) {
      const s = adult(7)
      s.rng = (i * 2654435761) >>> 0
      const n = makeNpc(s, ERAS.E03, 'sibling', 'm', s.year - 40)
      for (let y = 0; y < 10 && n.alive; y++) {
        npcHealthYear(s, n, 0.1)
        s.year++
      }
      if (n.alive) alive++
    }
    expect(alive / N).toBeGreaterThan(0.3)
    expect(alive / N).toBeLessThan(0.45)
  })

  it('больной виден во вкладке «Близкие», умерший от болезни - с её названием', () => {
    const s = adult(13)
    const kid = makeNpc(s, ERAS.E03, 'child', 'm', s.year - 36)
    kid.ill = { cause: 'consumption', since: s.year - 1 }
    s.rng = 1
    for (let i = 0; i < 50 && kid.alive; i++) {
      npcHealthYear(s, kid, 0)
      if (kid.alive) kid.ill = { cause: 'consumption', since: s.year - 1 }
    }
    expect(kid.alive).toBe(false)
    expect(kid.deathCause).toBe('consumption')
    expect(kid.ill).toBeUndefined()
  })

  it('врач выхаживает больных близких заметно чаще', () => {
    const outcome = (medicine: number) => {
      let survived = 0
      for (let i = 0; i < 2000; i++) {
        const s = adult(9)
        s.rng = (i * 40503 + 17) >>> 0
        s.hero.skills.medicine = medicine
        const n = makeNpc(s, ERAS.E03, 'child', 'f', s.year - 10)
        n.ill = { cause: 'fever', since: s.year - 1 }
        npcHealthYear(s, n, 0)
        if (n.alive) survived++
      }
      return survived / 2000
    }
    const plain = outcome(0)
    const doctor = outcome(60)
    expect(plain).toBeGreaterThan(1 - ILL_DEATH - 0.05)
    expect(plain).toBeLessThan(1 - ILL_DEATH + 0.05)
    expect(doctor - plain).toBeGreaterThan(0.2)
  })

  it('врач: выше шанс в рискованных делах о здоровье, а в остальных - как у всех', () => {
    const s = adult(11)
    const care: ChoiceDef = { id: 'care', risk_roll: { param: 'diligence', success_chance_base: 0.6, on_failure: [{ kill_npc: 'spouse' }] } }
    const deal: ChoiceDef = { id: 'deal', risk_roll: { param: 'diligence', success_chance_base: 0.6, on_failure: [{ param: 'money', delta: -100 }] } }
    s.hero.skills.medicine = 0
    const a = riskChance(s, care)!
    const d0 = riskChance(s, deal)!
    s.hero.skills.medicine = 60
    expect(healing(s.hero)).toBe(1)
    expect(riskChance(s, care)! - a).toBeCloseTo(0.25, 5)
    expect(riskChance(s, deal)).toBe(d0)
  })

  it('смерть сына видна герою: «в трауре», пока горе не утихло', () => {
    const s = adult(15)
    expect(mourning(s.hero)).toBe(false)
    const kid = makeNpc(s, ERAS.E03, 'child', 'm', s.year - 20)
    kid.attitude = 60
    killNpc(s, kid, 'consumption')
    expect(mourning(s.hero)).toBe(true)
  })

  it('тексты болезней и записей - на трёх языках', async () => {
    const ids = ['consumption', 'pox', 'flux', 'chest', 'wound', 'heart', 'stroke', 'fever', 'old_age', 'infant_illness', 'epidemic', 'accident', 'childbirth']
    const keys = ['npc.ill', 'life.grief', 'life.grief_tip', 'diary.npc_ill', 'diary.npc_recovered', 'diary.npc_healed', 'diary.self_healed', 'rel.friend']
    for (const lang of ['ru', 'en', 'tr'] as const) {
      await loadTexts(lang, 'common')
      const have = new Set(allKeys(lang))
      for (const k of keys) expect(have.has(k), `${lang} ${k}`).toBe(true)
      for (const id of ids) expect(hasKey(lang, `cause.${id}`), `${lang} cause.${id}`).toBe(true)
    }
  })
})
