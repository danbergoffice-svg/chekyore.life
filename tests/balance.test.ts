// Правки после теста владельца 28.10: деньги в старости, небесные знамения, повтор историй рождения.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay, startYear } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'

const ERAS = await loadAllEras()
const breathe = () => new Promise((r) => setTimeout(r, 0))
const settings = { mode: 'full', mortality: 'soft', softenHeavy: false, livesBefore: 3 } as const

describe('Баланс', () => {
  it('в старости состояние не тает: у доживших до 70 медиана богатства в 65 – не меньше 70% от богатства в 50', async () => {
    const ratios: number[] = []
    for (let i = 0; i < 500; i++) {
      if (i % 50 === 0) await breathe()
      const b = rollBirth(31000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
      const era = ERAS[b.era]
      const s = autoplay(newLife(era, settings, 31000 + i, undefined, b), era)
      const at = (age: number) => s.hero.history.find((y) => y.age === age)?.money
      const m50 = at(50)
      const m65 = at(65)
      if (s.hero.age >= 70 && m50 !== undefined && m65 !== undefined && m50 > 0) ratios.push(m65 / m50)
    }
    ratios.sort((a, b) => a - b)
    expect(ratios.length).toBeGreaterThan(20)
    expect(ratios[Math.floor(ratios.length / 2)]).toBeGreaterThan(0.7)
  }, 300000)

  it('небесное знамение – одно на жизнь: столб света и затмение вместе не бывают', async () => {
    let any = 0
    for (let i = 0; i < 400; i++) {
      if (i % 50 === 0) await breathe()
      const era = ERAS[ERA_IDS[i % ERA_IDS.length]]
      const s = autoplay(newLife(era, settings, 33000 + i), era)
      const ids = new Set(s.hero.diary.map((d) => d.eventId))
      expect(ids.has('f_omen_sky') && ids.has('a_eclipse'), `seed ${33000 + i}`).toBe(false)
      if (ids.has('f_omen_sky') || ids.has('a_eclipse')) any++
    }
    expect(any).toBeGreaterThan(0)
  }, 300000)

  it('история рождения из прошлых жизней выпадает заметно реже новой', () => {
    const era = ERAS.E03
    const pool = era.events.filter((e) => e.first_choice).map((e) => e.id)
    const fresh = 'fc_gift'
    const birthSeen = pool.filter((id) => id !== fresh)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 400; i++) {
      const s = newLife(era, { ...settings, birthSeen }, 35000 + i)
      startYear(s, era, null)
      const first = s.queue.find((q) => pool.includes(q.eventId))
      if (first) counts[first.eventId] = (counts[first.eventId] ?? 0) + 1
    }
    const seenAvg = birthSeen.reduce((n, id) => n + (counts[id] ?? 0), 0) / birthSeen.length
    expect(counts[fresh] ?? 0).toBeGreaterThan(seenAvg * 3)
  })
})
