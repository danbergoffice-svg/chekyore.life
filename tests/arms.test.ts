// Герб рода (src/engine/arms.ts, конструктор 19.11): прежние готовые гербы переводятся в новый формат, имя и
// знак - в хронике и мемориале, мусор в сохранении не ломает показ; тексты всех знаков и тинктур на всех языках.
import { describe, expect, it } from 'vitest'
import { armsOf, CHARGES, cleanArms, DIVISIONS, LEGACY_CHARGES, legacyArms, migrateArms, readable, SHAPES, TINCTURES } from '../src/engine/arms'
import { migrate } from '../src/storage'
import { createT, hasKey, LANGS } from '../src/i18n'
import type { GameState } from '../src/engine/types'
import { SAVE_VERSION } from '../src/engine/life'

describe('Герб рода', () => {
  it('20 прежних знаков и ещё 10; у всех прежних есть перевод в новый формат', () => {
    expect(LEGACY_CHARGES).toHaveLength(20)
    expect(CHARGES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(CHARGES).size).toBe(CHARGES.length)
    for (const id of LEGACY_CHARGES) {
      const a = legacyArms(id)!
      expect(a.charge).toBe(id)
      expect(a.division).toBe('plain')
      expect(TINCTURES).toContain(a.field)
      expect(a.ink).not.toBe(a.field)
    }
  })

  it('старое сохранение: house без arms получает герб, повторная миграция ничего не меняет', () => {
    const game = { version: SAVE_VERSION, hero: { npcs: [] }, family: { id: 'f', house: 'moon', lives: [{ house: 'falcon' }] } } as unknown as GameState
    migrate(game)
    expect(game.family.arms).toEqual(legacyArms('moon'))
    expect(game.family.lives[0].arms?.charge).toBe('falcon')
    const own = { house: 'eagle', arms: { ...legacyArms('sun')!, charge: 'eagle', name: 'Дом Волховских' } }
    migrateArms(own)
    expect(own.arms.name).toBe('Дом Волховских')
  })

  it('испорченный герб: неизвестный знак - нет герба, прочее - по умолчанию, имя обрезано', () => {
    expect(cleanArms({ charge: 'dragon' } as never)).toBeUndefined()
    const a = cleanArms({ charge: 'bee', shape: 'hex', field: 'pink', name: '   ' + 'я'.repeat(50) } as never)!
    expect(a.shape).toBe('heater')
    expect(a.field).toBe('azure')
    expect(a.name!.length).toBeLessThanOrEqual(28)
    expect(armsOf({ house: 'oak' })?.charge).toBe('oak')
    expect(armsOf({})).toBeUndefined()
  })

  it('правило тинктур: металл на цвете читается, цвет на цвете - нет', () => {
    expect(readable({ field: 'azure', ink: 'or', division: 'plain', field2: 'argent' })).toBe(true)
    expect(readable({ field: 'azure', ink: 'gules', division: 'plain', field2: 'argent' })).toBe(false)
    expect(readable({ field: 'azure', ink: 'argent', division: 'pale', field2: 'argent' })).toBe(false)
  })

  it('тексты: имя каждого знака, тинктуры, формы, деления - на всех языках', () => {
    for (const lang of LANGS) {
      const keys = [...CHARGES.map((c) => `house.${c}`), ...TINCTURES.map((x) => `arms.tincture.${x}`), ...SHAPES.map((x) => `arms.shape.${x}`), ...DIVISIONS.map((x) => `arms.division.${x}`), 'arms.confirm', 'arms.name_own', 'arms.hint_contrast']
      for (const k of keys) expect(hasKey(lang, k), `${lang} ${k}`).toBe(true)
      const t = createT(lang)
      expect(t('house.eagle')).not.toMatch(/house\./)
    }
  })
})
