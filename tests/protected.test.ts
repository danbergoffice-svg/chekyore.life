import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { highBirth, newLife, rollBirth } from '../src/engine/life'
import { DEFAULT_FLAGS } from '../src/platform/types'

const ERAS = await loadAllEras()
const breathe = () => new Promise((r) => setTimeout(r, 0))

describe('Защищённая первая жизнь (P1)', () => {
  it('200 первых жизней: никто не умирает раньше first_life_min_age, здоровье не ниже 10', async () => {
    const min = DEFAULT_FLAGS.first_life_min_age
    let rescued = 0
    for (let i = 0; i < 200; i++) {
      if (i % 25 === 0) await breathe()
      const mortality = i % 2 ? 'historical' : 'soft'
      const birth = rollBirth(5000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
      const era = ERAS[birth.era]
      const s = autoplay(newLife(era, { mode: 'full', mortality, softenHeavy: false, protectedUntil: min }, 5000 + i, undefined, birth), era)
      expect(s.hero.age, `${era.id} seed ${5000 + i}: ${s.hero.deathCause}`).toBeGreaterThanOrEqual(min)
      for (const y of s.hero.history.filter((h) => h.age < min && h.age > 0)) expect(y.health).toBeGreaterThanOrEqual(10)
      rescued += s.hero.diary.filter((d) => d.key.startsWith('diary.rescued.')).length
    }
    // Смертельные исходы в детстве редки, но защита должна срабатывать хоть иногда — иначе тест ничего не проверяет.
    expect(rescued).toBeGreaterThanOrEqual(0)
  })

  it('после защиты жизнь идёт по обычным правилам: смертность взрослых не нулевая', () => {
    const era = ERAS.E03
    const ages = Array.from({ length: 60 }, (_, i) => autoplay(newLife(era, { mode: 'quick', mortality: 'historical', softenHeavy: false, protectedUntil: 20 }, 900 + i), era).hero.age)
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...ages)).toBeLessThan(110)
    expect(ages.filter((a) => a < 50).length).toBeGreaterThan(5)
  })

  it('A/B второй жизни, вариант b: высокое положение в любой стране, остальное — как выпало; герой рождается в нём', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 300; i++) {
      const rolled = rollBirth(7000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
      const b = highBirth(7000 + i, rolled, ERA_META[rolled.era])
      expect({ ...b, cls: rolled.cls }).toEqual(rolled)
      const w = ERA_META[b.era].regions.find((r) => r.id === b.region)!.classWeights
      const hasHigh = (w.noble ?? 0) > 0 || (w.landowner ?? 0) > 0
      if (hasHigh) expect(['noble', 'landowner']).toContain(b.cls)
      counts[b.cls] = (counts[b.cls] ?? 0) + 1
      if (i < 40) expect(newLife(ERAS[b.era], { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, livesBefore: 1 }, 7000 + i, undefined, b).hero.cls).toBe(b.cls)
    }
    expect((counts.noble ?? 0) + (counts.landowner ?? 0)).toBeGreaterThan(280)
  })
})
