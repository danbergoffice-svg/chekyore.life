// «Пропустить детство»: из любого возраста до 13 - сразу к 13 годам, в начало года, живым (первая жизнь под защитой).
import { describe, expect, it } from 'vitest'
import { loadEra } from '../src/content'
import { skipChildhood } from '../src/engine/game'
import { newLife } from '../src/engine/life'

describe('Пропустить детство', () => {
  it('новорождённый и пятилетний - к 13 годам, в начало года', async () => {
    for (const id of ['EUR', 'JPN', 'MAY']) {
      const era = await loadEra(id)
      for (const seed of [1, 2, 3]) {
        const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20 }, seed)
        const from = skipChildhood(s, era)
        expect(from).toBe(0)
        expect(s.phase).toBe('year')
        expect(s.hero.age).toBe(13)
        expect(s.hero.alive).toBe(true)
        expect(s.hero.goal).toBeTruthy()
      }
    }
  })

  it('с 13 лет и старше ничего не делает', async () => {
    const era = await loadEra('EUR')
    const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20 }, 9)
    skipChildhood(s, era)
    const year = s.year
    skipChildhood(s, era)
    expect(s.year).toBe(year)
  })
})
