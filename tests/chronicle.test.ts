// Конец хроники края (отзыв 05.11): семья перебирается туда, где история продолжается, а не застревает «вне хроники».
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { autoplay, startYear } from '../src/engine/game'
import { chronicleSuccessor, continueWithHeir, eraEnding, heirs, newLife } from '../src/engine/life'
import { makeNpc } from '../src/engine/rules'

const ERAS = await loadAllEras()
const base = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }

describe('Конец хроники края', () => {
  it('Багдад после 1300 - наследник живёт в Дамаске, а род не «ждёт продолжения»', () => {
    const era = ERAS.ISL
    const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, 5), era, 3)
    s.hero.region = 'baghdad'
    s.year = 1290
    makeNpc(s, era, 'child', 'm', 1265)
    expect(chronicleSuccessor(s)).toMatchObject({ era: 'ISL', region: 'damascus' })
    expect(eraEnding(s)).toBe(false)
    const kid = heirs(s)[0]
    const h = continueWithHeir(s, era, kid.id)
    expect(h.hero.region).toBe('damascus')
    expect(h.hero.diary.some((d) => d.key === 'diary.chronicle_move')).toBe(true)
  })

  it('Константинополь после 1453 - Стамбул в исламском мире', () => {
    const era = ERAS.BYZ
    const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, 6), era, 3)
    s.hero.region = 'constantinople'
    s.year = 1445
    makeNpc(s, era, 'child', 'f', 1420)
    const h = continueWithHeir(s, era, heirs(s)[0].id)
    expect(h.hero.era).toBe('ISL')
    expect(h.hero.region).toBe('istanbul')
  })

  it('при жизни: Кайфэн после 1180 - герой перебирается в Ханчжоу', () => {
    const era = ERAS.CHN
    const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, 7), era, 2)
    s.hero.region = 'kaifeng'
    s.year = 1181
    s.phase = 'year'
    startYear(s, era, null)
    expect(s.hero.region).toBe('hangzhou')
  })

  it('где продолжения нет (Европа после 1500), хроника кончается как раньше', () => {
    const era = ERAS.EUR
    const s = autoplay(newLife(era, { ...base, protectedUntil: 90 }, 8), era, 3)
    s.year = 1490
    makeNpc(s, era, 'child', 'm', 1470)
    expect(chronicleSuccessor(s)).toBeNull()
    expect(eraEnding(s)).toBe(true)
  })
})
