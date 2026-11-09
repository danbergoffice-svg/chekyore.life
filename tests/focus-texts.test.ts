// У каждого фокуса каждой страны есть название, описание и короткая подпись на трёх языках
// (09.11: после выбора «Тяги к путешествиям» на кнопке был виден ключ focus_short.travel).
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import { hasKey, loadAllTexts } from '../src/i18n'

const ERAS = await loadAllEras()

describe('Тексты фокусов', () => {
  it('название, описание и короткая подпись - у всех фокусов всех стран, на трёх языках', async () => {
    const missing: string[] = []
    await loadAllTexts()
    for (const lang of ['ru', 'en', 'tr'] as const) {
      for (const id of ERA_IDS) {
        for (const f of ERAS[id].focuses)
          for (const k of [`focus.${f.id}`, `focus.${f.id}.desc`, `focus_short.${f.id}`]) if (!hasKey(lang, k)) missing.push(`${lang} ${id} ${k}`)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
})
