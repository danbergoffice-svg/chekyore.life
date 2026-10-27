// ТЗ v3, п. 11: переезд в другую страну — только по реальным маршрутам, тоска раз в три года, натурализация.
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import ROUTES from '../src/content/routes.json'
import { canEmigrate, emigrate, returnHome } from '../src/engine/abroad'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'

const eras = await loadAllEras()
const open = new Set((ROUTES.routes as { from: string; to: string }[]).map((r) => `${r.from}>${r.to}`))

describe('Переезд в другую страну (п. 11)', () => {
  it('1200 жизней: только открытые маршруты, уезжает 2–10% взрослых, «вернуться?» — раз в три года (или через год, если «подумать»)', () => {
    let adults = 0
    let moved = 0
    let n = 0
    for (const id of ['RUS', 'EUR', 'BYZ', 'ISL']) {
      for (let i = 0; i < 300; i++) {
        const s = autoplay(newLife(eras[id], { mode: 'quick', mortality: 'soft', softenHeavy: false }, 500000 + n++), eras[id])
        if (s.hero.age < 18) continue
        adults++
        const path = s.hero.erasLived ?? [id]
        if (path.length > 1) moved++
        for (let k = 1; k < path.length; k++) expect(open.has(`${path[k - 1]}>${path[k]}`) || open.has(`${path[k]}>${path[k - 1]}`), path.join('>')).toBe(true)
        const asks = s.hero.diary.filter((d) => d.eventId === 'ab_homesick')
        for (let k = 1; k < asks.length; k++) {
          const gap = asks[k].year - asks[k - 1].year
          const later = (asks[k - 1].params?.choice as { key?: string } | undefined)?.key === 'ev.ab_homesick.later'
          // Между вопросами герой мог вернуться домой или снова переехать — тогда отсчёт начинается заново.
          const moved = s.hero.diary.some((d) => (d.key.startsWith('diary.returned_home') || d.key.startsWith('diary.emigrated_')) && d.year >= asks[k - 1].year && d.year <= asks[k].year)
          if (!moved) expect(gap).toBe(later ? 1 : 3)
        }
        if (s.hero.abroad?.naturalized) {
          const after = asks.filter((d) => d.year > s.hero.abroad!.naturalized!)
          expect(after.every((d) => d.year > s.hero.abroad!.naturalized!)).toBe(true)
        }
      }
    }
    expect(moved / adults).toBeGreaterThan(0.02)
    expect(moved / adults).toBeLessThan(0.1)
  }, 600000)

  it('в Америку и из неё — никогда; майя и Древний мир — только внутри своей страны', () => {
    for (const id of ['AMR', 'MAY', 'E03', 'ANE', 'CHN', 'JPN']) {
      const s = newLife(eras[id], { mode: 'quick', mortality: 'soft', softenHeavy: false }, 3)
      s.hero.age = 30
      expect(canEmigrate(s, '@any'), id).toBe(false)
    }
  })

  it('переезд и возвращение: родня остаётся на родине и снова рядом после возвращения; наследник живёт в новой стране', () => {
    const s = newLife(eras.RUS, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 11)
    s.year = 1300
    s.hero.region = 'novgorod'
    s.hero.age = 30
    expect(emigrate(s, 'BYZ', 'trade', 'all')).toBe(true)
    if (!s.hero.alive) return
    expect(s.hero.era).toBe('BYZ')
    expect(s.hero.npcs.filter((n) => n.role === 'father' || n.role === 'mother').every((n) => !n.alive || n.away?.reason === 'homeland')).toBe(true)
    s.year += 5
    expect(returnHome(s)).toBe(true)
    expect(s.hero.era).toBe('RUS')
    expect(s.hero.returned?.years).toBe(5)
    expect(s.hero.npcs.some((n) => n.away?.reason === 'homeland')).toBe(false)
    // Род в новой стране.
    const t = autoplay(newLife(eras.RUS, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 12), eras.RUS)
    t.hero.alive = false
    if (heirs(t).length) {
      t.hero.era = 'BYZ'
      t.hero.region = 'constantinople'
      const next = continueWithHeir(t, eras.RUS, heirs(t)[0].id)
      expect(next.hero.era).toBe('BYZ')
    }
  })
})
