// Ключ «Экстримал» (10.11): рождение в самом раннем времени игры - для самой долгой династии; история в каждом поколении.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay, HISTORY_BOOST } from '../src/engine/game'
import { continueWithHeir, earliestBirth, earliestStart, heirs, newLife } from '../src/engine/life'
import type { GameSettings } from '../src/engine/types'
import { createT, hasKey } from '../src/i18n'
import { redeemPromo } from '../src/promo'
import { breathe } from './breathe'

const ERAS = await loadAllEras()
const metas = ERA_IDS.map((id) => ERA_META[id])
const quick: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }

describe('Ключ «Экстримал»', () => {
  it('ЭКСТРИМАЛ и EXTREMAL дают дар «самое раннее время», один раз', () => {
    for (const code of ['Экстримал', 'ЭКСТРИМАЛ', 'extremal', ' Экс-тримал ']) {
      const r = redeemPromo(code)
      expect(r.ok && r.reward.gift).toBe('earliest')
    }
    const r = redeemPromo('Экстримал')
    expect(r.ok && redeemPromo('Экстримал', [r.hash])).toEqual({ ok: false, error: 'used' })
    for (const lang of ['ru', 'en', 'tr'] as const) {
      expect(hasKey(lang, 'gift.earliest') && hasKey(lang, 'gift.earliest.desc')).toBe(true)
      expect(createT(lang)('gift.earliest.desc')).not.toMatch(/\{/)
    }
  })

  it('рождение - в самом раннем году игры (Древний Восток, 1550 до н.э.), край и сословие - жребием', () => {
    const start = earliestStart(metas)
    const min = Math.min(...metas.flatMap((m) => m.regions.map((r) => r.years[0])))
    expect(start).toEqual({ era: 'ANE', year: min })
    const regions = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const b = earliestBirth(1000 + i, metas)
      expect(b.era).toBe('ANE')
      expect(b.year).toBe(-1550)
      regions.add(b.region)
    }
    expect(regions.size).toBeGreaterThan(1)
  })

  it('династия от раннего старта: у потомков исторические события своего времени', async () => {
    const era = ERAS.ANE
    const hist = new Set(era.events.filter((e) => e.type === 'global_historical').map((e) => e.id))
    const years: number[] = []
    let later = 0
    for (let d = 0; d < 25; d++) {
      await breathe()
      let s = newLife(era, { ...quick, protectedUntil: 40 }, 300 + d, undefined, earliestBirth(300 + d, metas))
      for (let g = 0; g < 12; g++) {
        autoplay(s, era)
        for (const x of s.hero.diary) if (x.eventId && hist.has(x.eventId)) {
          years.push(x.year)
          if (g > 0) later++
        }
        const h = heirs(s)
        if (!h.length || s.offChronicle !== undefined) break
        s = continueWithHeir(s, era, h[0].id)
      }
    }
    // История есть и у наследников, и далеко от года старта.
    expect(later).toBeGreaterThan(5)
    expect(Math.max(...years)).toBeGreaterThan(-1450)
  }, 300000)
})

describe('Исторические события чаще, пока в жизни их не было', () => {
  it('прогон: взрослых жизней без истории меньше, а в среднем событий не вдвое больше', async () => {
    const run = async (mult: number) => {
      const keep = HISTORY_BOOST.mult
      HISTORY_BOOST.mult = mult
      let adults = 0
      let empty = 0
      let total = 0
      try {
        for (let i = 0; i < 280; i++) {
          if (i % 20 === 0) await breathe()
          const era = ERAS[ERA_IDS[i % ERA_IDS.length]]
          const hist = new Set(era.events.filter((e) => e.type === 'global_historical').map((e) => e.id))
          const s = autoplay(newLife(era, { ...quick, protectedUntil: 40 }, 8000 + i), era)
          if (s.hero.age < 25 || s.offChronicle !== undefined) continue
          adults++
          const n = s.hero.diary.filter((d) => d.eventId && hist.has(d.eventId)).length
          total += n
          if (!n) empty++
        }
      } finally {
        HISTORY_BOOST.mult = keep
      }
      return { empty: empty / adults, per: total / adults }
    }
    const off = await run(1)
    const on = await run(HISTORY_BOOST.mult)
    expect(on.empty).toBeLessThan(off.empty * 0.85)
    expect(on.per).toBeLessThan(off.per * 1.5)
  }, 600000)
})
