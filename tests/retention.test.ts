// ТЗ «Удержание новичков в первые минуты» (20.11.2026): проверки задач R1–R10.
import { describe, expect, it } from 'vitest'
import { RELIGIONS } from '../src/content'
import { createT, hasKey, loadTexts } from '../src/i18n'
import type { Lang } from '../src/engine/types'

const FIRST = ['fc_amulet', 'fc_wetnurse', 'fc_gift', 'fc_fortune', 'fc_patron', 'fc_betrothal', 'fc_winter', 'fc_vow']
const LIMIT: Partial<Record<Lang, number>> = { ru: 110, en: 120 }

describe('R1: короткие тексты общих первых карточек', () => {
  for (const lang of ['ru', 'en'] as const)
    it(`${lang}: у всех 8 карточек есть .short не длиннее ${LIMIT[lang]} знаков при любой вере и поле`, async () => {
      await loadTexts(lang, 'common')
      const long: string[] = []
      for (const id of FIRST) {
        expect(hasKey(lang, `ev.${id}.short`), id).toBe(true)
        for (const sex of ['m', 'f'] as const) {
          const t = createT(lang, { sex })
          for (const r of RELIGIONS) {
            const s = t(`ev.${id}.short`, { faith: { key: `religion.${r.id}` } })
            expect(s, id).not.toMatch(/[{}]/)
            if (s.length > LIMIT[lang]!) long.push(`${id} ${r.id}: ${s.length}`)
          }
        }
      }
      expect(long).toEqual([])
    })
})

describe('R9, R10: эксперименты XS и XR', async () => {
  const { autoSpinOn, revealLite, tourDrip, goalAge, homeQuiet, rebirthOn } = await import('../src/goal')
  const { DEFAULT_FLAGS } = await import('../src/platform/types')
  const ids = Array.from({ length: 4000 }, (_, i) => `p-${i}-${(i * 2654435761) % 1e9}`)
  it('по умолчанию выключены (порталы как было)', () => {
    expect(DEFAULT_FLAGS.auto_spin_share).toBe(0)
    expect(DEFAULT_FLAGS.reveal_lite_share).toBe(0)
    expect(ids.some((id) => autoSpinOn(id, DEFAULT_FLAGS) || revealLite(id, DEFAULT_FLAGS))).toBe(false)
  })
  it('при 0,5 - около половины, и деление не совпадает с XT, XG, П2, П4 и друг с другом', () => {
    const f = { auto_spin_share: 0.5, reveal_lite_share: 0.5, tour_drip_share: 0.5, goal_late_share: 0.5, home_quiet_share: 0.5, rebirth_share: 0.5 }
    const xs = ids.map((id) => autoSpinOn(id, f))
    const share = (a: boolean[]) => a.filter(Boolean).length / a.length
    expect(share(xs)).toBeGreaterThan(0.45)
    expect(share(xs)).toBeLessThan(0.55)
    for (const other of [ids.map((id) => revealLite(id, f)), ids.map((id) => tourDrip(id, f)), ids.map((id) => goalAge(id, f) > 0), ids.map((id) => homeQuiet(id, f)), ids.map((id) => rebirthOn(id, f))]) {
      // Независимые деления: в обоих рукавах - около четверти игроков, а не половина (совпадение) и не ноль (дополнение).
      const both = xs.filter((v, i) => v && other[i]).length / ids.length
      expect(both).toBeGreaterThan(0.2)
      expect(both).toBeLessThan(0.3)
    }
  })
})
