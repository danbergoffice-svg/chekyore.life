// Подтверждённые дефекты аудита 10.11: D-01 (цена в дневнике), D-02 (тексты ролей), D-03 (падеж имени в разводе).
import { describe, expect, it } from 'vitest'
import { ERA_META } from '../src/content'
import type { DiaryEntry, NpcRole } from '../src/engine/types'
import { createT, hasKey, loadEraTexts, rawText } from '../src/i18n'
import type { Lang } from '../src/engine/types'
import { diaryText } from '../src/ui/text'

const LANGS: Lang[] = ['ru', 'en', 'tr']
await Promise.all(LANGS.map((l) => loadEraTexts(l, 'E03')))

describe('D-01: цена покупки в дневнике', () => {
  const region = ERA_META.E03.regions[0]
  for (const lang of LANGS) {
    it(`${lang}: «Купить (…)» с числом и монетой, без {price} {coin}`, () => {
      const t = createT(lang)
      for (const [ev, choice] of [
        ['estate_home', 'buy'],
        ['estate_land', 'buy'],
      ]) {
        const e: DiaryEntry = {
          year: 100,
          age: 30,
          key: `ev.${ev}.title`,
          params: { price: (1250).toLocaleString(), n: 1250, coin: { key: `coin.${region.coin}` }, home: { key: 'home.2' }, land: 0, slaves: 0, choice: { key: `ev.${ev}.${choice}` }, result: 'ok' },
        }
        const s = diaryText(t, e, 'm', region.id, '', lang)
        expect(s).not.toMatch(/\{\w+\}|coin\./)
        expect(s).toMatch(/1.?250/)
      }
    })
  }
})

describe('D-02: роли близких', () => {
  const ROLES: NpcRole[] = ['father', 'mother', 'sibling', 'friend', 'spouse', 'child', 'grandchild', 'mentor', 'rival', 'patron']
  for (const lang of LANGS)
    it(`${lang}: у каждой роли есть текст rel.*`, () => {
      for (const r of ROLES) expect(hasKey(lang, `rel.${r}`), `rel.${r}`).toBe(true)
      const t = createT(lang)
      expect(t('rel.rival', {}, { sex: 'f' })).not.toMatch(/rel\.|\{/)
    })
  it('ru: наставница, покровитель по полу', () => {
    const t = createT('ru')
    expect(t('rel.mentor', { sex: 'f' })).toBe('наставница')
    expect(t('rel.patron', { sex: 'm' })).toBe('покровитель')
  })
})

describe('D-03: имя в записи о разводе', () => {
  it('ru: имя стоит в именительном падеже («Брак расторгнут: Елена…», не «с Елена»)', () => {
    const t = createT('ru')
    const s = t('diary.divorced', { who: 'Елена', sex: 'f' }, { sex: 'm' })
    expect(s).toBe('Брак расторгнут: Елена больше не живёт с тобой.')
    // Имена в игре не склоняются - после предлога имени быть не должно.
    for (const key of ['diary.divorced', 'chapter.divorced']) expect(rawText('ru', key)).not.toMatch(/\s(с|со|к|ко|о|об|у|от|для|без)\s\{(who|npc|name)\}/)
  })
})
