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
