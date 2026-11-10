// Просьбы владельца 10.11: короче траур и срок траура в меню героя; подсказки вкладок; «Поддержать проект» (Boosty).
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { mourning, mourningLeft } from '../src/engine/emotions'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { killNpc, makeNpc } from '../src/engine/rules'
import { createT, hasKey } from '../src/i18n'
import SOCIAL from '../src/ui/Social.tsx?raw'

const ERAS = await loadAllEras()

describe('Траур', () => {
  it('смерть мужа: траур 1-3 года, срок в меню убывает и доходит до нуля', () => {
    const era = ERAS.E03
    const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 90 }, 21), era, 30)
    s.hero.alive = true
    s.phase = 'year'
    s.queue = []
    s.hero.emotionalMemories = []
    const husband = makeNpc(s, era, 'spouse', s.hero.sex === 'm' ? 'f' : 'm', s.year - 32)
    killNpc(s, husband, 'illness')
    expect(mourning(s.hero)).toBe(true)
    const first = mourningLeft(s)
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(3)
    let years = 0
    while (mourning(s.hero) && years < 10) {
      autoplay(s, era, 1)
      years++
    }
    expect(years).toBeLessThanOrEqual(3)
    expect(mourningLeft(s)).toBe(0)
  })
})

describe('Подсказки и поддержка', () => {
  it('тексты подсказок вкладок, срока траура и кнопок - на трёх языках, без незаполненных {…}', () => {
    for (const lang of ['ru', 'en', 'tr'] as const) {
      const t = createT(lang)
      for (const k of ['hint.tab_life', 'hint.tab_life_b', 'hint.tab_hero', 'hint.tab_people', 'hint.tab_diary', 'settings.tour', 'settings.tour.desc', 'support.boosty', 'life.grief_left']) {
        expect(hasKey(lang, k), `${lang} ${k}`).toBe(true)
        expect(t(k, { n: 2 }, { sex: 'f' })).not.toMatch(/\{/)
      }
    }
    expect(createT('ru')('life.grief_left', { n: 1 }, { sex: 'f' })).toContain('около 1 года')
    expect(createT('ru')('life.grief_left', { n: 2 }, { sex: 'f' })).toContain('около 2 лет')
  })

  it('Boosty: адрес и значок 16×16', () => {
    expect(SOCIAL).toContain("'https://boosty.to/afterall/donate'")
    const block = SOCIAL.slice(SOCIAL.indexOf('boosty: {'), SOCIAL.indexOf('],', SOCIAL.indexOf('boosty: {')))
    const rows = [...block.matchAll(/'([.a-z]+)'/g)].map((m) => m[1])
    expect(rows).toHaveLength(16)
    for (const r of rows) expect(r).toHaveLength(16)
  })
})
