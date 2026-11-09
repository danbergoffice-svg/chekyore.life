// Хроника рода (src/engine/chronicle.ts; ТЗ семейной системы, этап 5): поколения, события, имущество, достижения.
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { familyChronicle, familyLives, headlineAchievement, lifeWealth } from '../src/engine/chronicle'
import { acquireAsset } from '../src/engine/estate'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife, summarize } from '../src/engine/life'
import type { EraDef, GameState, LifeSummary } from '../src/engine/types'

const ERAS = await loadAllEras()
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 90 } as const

/** Прожить род до gens поколений; первому герою - лавка, чтобы было наследие. */
function dynasty(era: EraDef, seed: number, gens: number): LifeSummary[] {
  const memorial: LifeSummary[] = []
  let s: GameState = newLife(era, opts, seed)
  let first = true
  for (let g = 0; g < gens; g++) {
    // Род мог переехать (эмиграция, конец хроники края): дальше - правила страны, где живёт герой.
    era = ERAS[s.hero.era as keyof typeof ERAS] ?? era
    s = autoplay(s, era, 130, undefined, (_f, st: GameState) => {
      if (first && st.hero.age >= 25) {
        st.hero.cls = 'trader'
        st.hero.money += 2000
        if (acquireAsset(st, { type: 'workshop' })) first = false
      }
      return null
    })
    // За жизнь герой мог уехать в другую страну - итог по правилам той, где он умер.
    era = ERAS[s.hero.era as keyof typeof ERAS] ?? era
    const life = summarize(s, era)
    memorial.push(life)
    s.family = { ...s.family, lives: [...s.family.lives, life] }
    const k = heirs(s)
    if (!k.length) break
    s = continueWithHeir(s, era, k[0].id)
  }
  return memorial
}

describe('Хроника рода', () => {
  it('поколения по порядку, годы рода, страны, потомки', () => {
    let m = dynasty(ERAS.EUR, 31, 4)
    for (let seed = 32; m.length < 3; seed++) m = dynasty(ERAS.EUR, seed, 4)
    const c = familyChronicle(m, m[0].familyId)
    expect(c.generations.map((g) => g.generation)).toEqual([...c.generations.map((g) => g.generation)].sort((a, b) => a - b))
    expect(c.generations.length).toBe(m.length)
    expect(c.span).toBe(Math.max(...m.map((l) => l.deathYear)) - m[0].birthYear)
    expect(c.countries).toContain('EUR')
    expect(c.descendants).toBe(m.reduce((s, l) => s + l.children, 0))
    expect(c.founder).toBe(m[0].name)
    // Достижение «Три поколения» взято, «Десять» - нет, но виден прогресс.
    const g3 = c.achievements.find((a) => a.id === 'gens3')!
    expect(g3.done).toBe(m.length >= 3)
    const g10 = c.achievements.find((a) => a.id === 'gens10')!
    expect(g10.done).toBe(false)
    expect(g10.have).toBe(m.length)
    expect(headlineAchievement(c)).toBeDefined()
  })

  it('история имущества: покупка и наследство; наследие через поколения', () => {
    let m = dynasty(ERAS.E03, 51, 4)
    for (let seed = 52; m.length < 3 || !m[0].estateSnapshot?.assets.length; seed++) m = dynasty(ERAS.E03, seed, 4)
    const c = familyChronicle(m, m[0].familyId)
    expect(c.property.some((e) => e.entry.key === 'diary.asset_bought')).toBe(true)
    expect(c.property.every((e, i) => i === 0 || e.generation >= c.property[i - 1].generation)).toBe(true)
    // Мастерская могла уйти брату или быть продана - но если она дошла до третьего поколения, это «Наследие».
    const heirloom = c.achievements.find((a) => a.id === 'heirloom')!
    expect(heirloom.have).toBeGreaterThanOrEqual(1)
    expect(c.generations[0].wealth).toBe(lifeWealth(m[0]))
    expect(c.generations[0].wealth).toBeGreaterThanOrEqual(Math.max(0, m[0].money))
  })

  it('главные события - не больше четырёх на жизнь, по годам', () => {
    const m = dynasty(ERAS.RUS, 71, 3)
    const c = familyChronicle(m, m[0].familyId)
    for (const l of m) {
      const mine = c.events.filter((e) => e.heroId === l.heroId)
      expect(mine.length).toBeLessThanOrEqual(4)
      for (let i = 1; i < mine.length; i++) expect(mine[i].year).toBeGreaterThanOrEqual(mine[i - 1].year)
    }
  })

  it('чужие роды не смешиваются; старые записи мемориала без новых полей читаются', () => {
    const a = dynasty(ERAS.CHN, 81, 2)
    const b = dynasty(ERAS.ISL, 82, 2)
    const old = JSON.parse(JSON.stringify(b)) as LifeSummary[]
    for (const l of old) {
      delete l.estateSnapshot
      delete l.tradeSnapshot
      delete (l as Partial<LifeSummary>).erasLived
    }
    const c = familyChronicle([...a, ...old], old[0].familyId)
    expect(c.generations.every((g) => old.some((l) => l.heroId === g.heroId))).toBe(true)
    expect(familyLives([...a, ...old], a[0].familyId)).toHaveLength(a.length)
    expect(c.property.length).toBeGreaterThanOrEqual(0)
    expect(familyChronicle([], 'none').generations).toEqual([])
  })

  it('хроника - только чтение: мемориал не меняется', () => {
    const m = dynasty(ERAS.JPN, 91, 2)
    const before = JSON.stringify(m)
    familyChronicle(m, m[0].familyId)
    expect(JSON.stringify(m)).toBe(before)
  })
})
