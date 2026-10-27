// Сон о будущем (docs/TZ_dreams.md): приёмка движка.
import { describe, expect, it } from 'vitest'
import { ERA_META, loadAllEras } from '../src/content'
import { validateDreams } from '../src/content/validate'
import { DREAM_DEFS, answerDream, checkInput, dreamDef, dreamThemes, expectedAnswer, pickDream, resolveDream, startDream, trainingOutcome, trainingState } from '../src/engine/dreams'
import { evaluate } from '../src/engine/formula'
import { autoplay, choose, choiceAvailable, currentEvent, dismiss, eventChoices, finishYear, startYear } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { next } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { loadAllTexts } from '../src/i18n'

const eras = await loadAllEras()
await loadAllTexts()
const soft = (livesBefore: number, dreamChance?: number) => ({ mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false, livesBefore, dreamChance })

describe('Сон о будущем', () => {
  it('вычислитель формул: скобки, степени, тригонометрия в градусах', () => {
    expect(evaluate('9 / cos(30)', {})).toBeCloseTo(10.392, 2)
    expect(evaluate('p * (1 + r/100)^n', { p: 100, r: 10, n: 3 })).toBeCloseTo(133.1, 1)
    expect(evaluate('-2 + sqrt(16) * 2', {})).toBe(6)
    expect(() => evaluate('x + 1', {})).toThrow()
  })

  it('каталог снов проходит проверку: ответы, доли, формулы на краях, тексты RU и EN', () => {
    expect(DREAM_DEFS.length).toBeGreaterThanOrEqual(16)
    expect(validateDreams()).toEqual([])
  })

  it('1000 первых жизней — ни одного сна', () => {
    let dreams = 0
    for (let i = 0; i < 1000; i += 1) {
      const era = eras[Object.keys(eras)[i % 13]]
      const s = autoplay(newLife(era, soft(0, 1), 70000 + i), era)
      if (s.hero.dreamSeen || s.hero.diary.some((d) => d.eventId === 'dream_intro')) dreams++
    }
    expect(dreams).toBe(0)
  }, 300000)

  it('со второй жизни — не больше одного сна; у доживших до 40 сон был у 55–75%', () => {
    let alive40 = 0
    let had = 0
    for (let i = 0; i < 1000; i++) {
      const era = eras[Object.keys(eras)[i % 13]]
      const s = autoplay(newLife(era, soft(1), 80000 + i), era)
      const n = s.hero.diary.filter((d) => d.eventId === 'dream_intro').length
      expect(n).toBeLessThanOrEqual(1)
      if (s.hero.age >= 41) {
        alive40++
        if (n) had++
      }
    }
    expect(had / alive40).toBeGreaterThan(0.55)
    expect(had / alive40).toBeLessThan(0.75)
  }, 300000)

  it('при эпидемии — не меньше 60% снов о медицине; «Цинга» и «Полярная звезда» — только в портах', () => {
    const s = newLife(eras.EUR, soft(1), 5)
    s.hero.tags.push('epidemic')
    expect(dreamThemes(s).has('medicine')).toBe(true)
    let med = 0
    for (let y = 0; y < 400; y++) {
      s.year = 1100 + y
      if (pickDream(s)!.themes.includes('medicine')) med++
    }
    expect(med / 400).toBeGreaterThan(0.6)
    for (const id of Object.keys(eras)) {
      for (const r of ERA_META[id].regions) {
        const t = newLife(eras[id], soft(1), 9)
        t.hero.region = r.id
        for (let y = 0; y < 30; y++) {
          t.year += 1
          const d = pickDream(t)
          if (d?.region_tags?.includes('port')) expect(r.tags ?? []).toContain('port')
        }
      }
    }
  })

  it('провал «Пороха» убивает с частотой death_chance ±3 п.п.; причина — «плохо учился в школе»', () => {
    const def = dreamDef('gunpowder')!
    let deaths = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const s = newLife(eras.RUS, soft(1), 90000 + i)
      s.year = 1100 + (i % 200)
      s.hero.age = 25
      startDream(s, 'gunpowder')
      s.dream!.done = true
      s.dream!.score = 0
      const o = resolveDream(s, eras.RUS)
      if (o === 'death') {
        deaths++
        expect(s.hero.deathCause).toBe('dream_failure')
      }
    }
    expect(Math.abs(deaths / N - def.death_chance![0])).toBeLessThan(0.03)
  })

  it('верные ответы на все шаги — прорыв: скачок по сословию и занятие сна', () => {
    const s = newLife(eras.JPN, soft(1), 31)
    s.year = 1250
    s.hero.age = 25
    s.hero.cls = 'craftsman'
    startDream(s, 'rotation')
    const def = dreamDef('rotation')!
    for (const step of def.steps) for (const input of step.items) answerDream(s, expectedAnswer(input, s.dream!.params, s.hero.era))
    expect(s.dream!.score).toBe(3)
    expect(resolveDream(s, eras.JPN)).toBe('breakthrough')
    expect(s.hero.cls).toBe('trader')
    expect(s.hero.traits).toContain('dreamer')
  })

  it('ответ: запятая вместо точки, анахронизм (картофель в Европе) — ошибка', () => {
    const lever = dreamDef('lever')!.steps[1].items[0]
    expect(checkInput(lever, '125,0', { q: 500 }, 'EUR')).toBe(true)
    const legumes = dreamDef('rotation')!.steps[1].items[0]
    expect(checkInput(legumes, ['clover', 'vetch', 'peas'], {}, 'EUR')).toBe(true)
    expect(checkInput(legumes, ['clover', 'vetch', 'peas', 'potato'], {}, 'EUR')).toBe(false)
    expect(checkInput(legumes, ['beans'], {}, 'AMR')).toBe(true)
  })

  it('сон не меняет остальную жизнь: без сна и с отказом от сна — те же события', () => {
    const live = (s: GameState, era = eras.EUR) => {
      for (let i = 0; i < 130 * 6 && s.phase !== 'dead'; i++) {
        if (s.phase === 'year') startYear(s, era, null)
        else if (s.queue.length > 0) {
          const ev = currentEvent(s, era)!
          const opts = eventChoices(s, era, ev).filter((c) => choiceAvailable(s, c))
          if (ev.id === 'dream_intro') choose(s, era, 'skip')
          else choose(s, era, opts.length ? opts[Math.floor(next(s) * opts.length)].id : null)
          dismiss(s, era)
        } else finishYear(s, era)
      }
      return s.hero.diary.filter((d) => d.eventId && d.eventId !== 'dream_intro').map((d) => `${d.year}:${d.eventId}`)
    }
    const a = live(newLife(eras.EUR, soft(1, 0), 4242))
    const b = live(newLife(eras.EUR, soft(1, 1), 4242))
    expect(b).toEqual(a)
  })

  it('тренировка: тот же сон в той же стране, новые числа, итог только по очкам', () => {
    const a = trainingState(ERA_META.EUR, 'thales', 1300, 11)
    const b = trainingState(ERA_META.EUR, 'thales', 1300, 12)
    expect(a.dream?.id).toBe('thales')
    expect(a.hero.era).toBe('EUR')
    expect(a.year).toBe(1300)
    const differ = [13, 14, 15, 16, 17].some((seed) => JSON.stringify(trainingState(ERA_META.EUR, 'thales', 1300, seed).dream?.params) !== JSON.stringify(a.dream?.params))
    expect(differ || JSON.stringify(a.dream?.params) !== JSON.stringify(b.dream?.params)).toBe(true)
    expect([trainingOutcome(3), trainingOutcome(2), trainingOutcome(1), trainingOutcome(0)]).toEqual(['breakthrough', 'partial', 'failure', 'failure'])
  })
})
