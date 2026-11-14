// MEC-089 (аудит 10.11, очередь 0): сохранение любой прошлой версии (3…9) загружается без потерь -
// герой, близкие, дневник, деньги, род и мемориал те же, а жизнь можно доиграть. Неизвестная версия не роняет игру.
import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, SAVE_VERSION } from '../src/engine/life'
import type { GameSettings, GameState, LifeSummary } from '../src/engine/types'
import { migrate, parseSaveFile } from '../src/storage'

const ERAS = await loadAllEras()
const opts: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }

/** Сохранение, каким его записала бы игра версии v: поля, появившиеся позже, убраны. */
function asVersion(s: GameState, v: number): GameState {
  const old = JSON.parse(JSON.stringify(s)) as GameState & { family: Record<string, unknown> }
  old.version = v
  if (v < 9) delete old.family.trade
  if (v < 8) delete old.family.estate
  if (v < 7) for (const n of old.hero.npcs) delete (n as Partial<typeof n>).education, delete (n as Partial<typeof n>).upbringing
  if (v < 6) delete old.hero.emotionalMemories
  if (v < 4) delete (old.hero as Partial<typeof old.hero>).religion
  return old
}

/** То, что игрок не должен потерять. */
const essence = (g: GameState) => ({
  name: g.hero.name,
  age: g.hero.age,
  year: g.year,
  era: g.hero.era,
  region: g.hero.region,
  money: g.hero.money,
  attrs: g.hero.attrs,
  skills: g.hero.skills,
  profession: g.hero.profession,
  home: g.hero.home,
  land: g.hero.land,
  slaves: g.hero.slaves,
  diary: g.hero.diary.length,
  npcs: g.hero.npcs.map((n) => [n.id, n.name, n.role, n.alive]),
  goal: g.hero.goal,
  family: g.family.id,
  generation: g.hero.generation,
})

describe('Миграции сохранений (MEC-089)', () => {
  const cases = [
    ['E03', 31],
    ['RUS', 32],
    ['CHN', 33],
    ['JPN', 34],
  ] as const
  for (const [id, seed] of cases) {
    it(`${id}: версии 3…${SAVE_VERSION} загружаются без потерь и жизнь идёт дальше`, () => {
      const era = ERAS[id]
      const s = autoplay(newLife(era, opts, seed), era, 35)
      for (let v = 3; v <= SAVE_VERSION; v++) {
        const old = asVersion(s, v)
        const game = migrate(JSON.parse(JSON.stringify(old)))
        expect(game, `версия ${v}`).not.toBeNull()
        expect(game!.version).toBe(SAVE_VERSION)
        expect(essence(game!)).toEqual(essence(s))
        expect(game!.hero.religion).toBeTruthy()
        if (v < 6) expect(game!.hero.emotionalMemories).toEqual([])
        expect(game!.family.estate).toBeTruthy()
        expect(game!.family.trade).toBeTruthy()
        // Через файл «Скачать всё» - то же самое, мемориал цел.
        const memorial = [{ heroId: 'h0', report: {}, diary: [] }] as unknown as LifeSummary[]
        const file = parseSaveFile(JSON.stringify({ version: v, game: old, memorial }))!
        expect(file.game && essence(file.game)).toEqual(essence(s))
        expect(file.memorial).toHaveLength(1)
        // Жизнь доигрывается до конца без ошибок.
        if (v === 3 || v === 7) {
          autoplay(game!, era)
          expect(game!.hero.alive).toBe(false)
        }
      }
    }, 120000)
  }

  it('неизвестная или испорченная версия не роняет загрузку: игры нет, мемориал остаётся', () => {
    const era = ERAS.E03
    const s = autoplay(newLife(era, opts, 5), era, 10)
    for (const v of [2, SAVE_VERSION + 1, undefined]) {
      const g = JSON.parse(JSON.stringify(s)) as GameState
      ;(g as { version?: number }).version = v
      expect(migrate(g)).toBeNull()
    }
    expect(migrate(undefined)).toBeNull()
    expect(migrate('x' as unknown as GameState)).toBeNull()
    const memorial = [{ heroId: 'h0', report: {}, diary: [] }] as unknown as LifeSummary[]
    const file = parseSaveFile(JSON.stringify({ version: 99, game: { version: 99 }, memorial }))!
    expect(file.game).toBeNull()
    expect(file.memorial).toHaveLength(1)
    expect(parseSaveFile('{oops')).toBeNull()
  })
})
