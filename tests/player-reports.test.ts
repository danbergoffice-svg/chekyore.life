// Отзывы игроков 10.11: вдова и «Выйти за компаньона», вдова, а не «в разводе», «родительский дом» без родни,
// дом не по положению, школа предка, кочевники без лавок, подкидыш бездетным.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import { assetLock, offerAllowed, offerAnswered } from '../src/engine/estate'
import { autoplay, choiceAvailable, eventChoices, FOUNDLING, lockReason } from '../src/engine/game'
import { heirs, newLife } from '../src/engine/life'
import { killNpc, makeNpc, maritalStatus } from '../src/engine/rules'
import type { ActiveEvent, GameSettings, GameState } from '../src/engine/types'
import { createT, hasKey, loadEraTexts } from '../src/i18n'
import { breathe } from './breathe'

const ERAS = await loadAllEras()
const quick: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }

function adult(seed: number, era = ERAS.E03): GameState {
  const s = autoplay(newLife(era, { ...quick, protectedUntil: 90 }, seed), era, 30)
  s.hero.alive = true
  s.phase = 'year'
  s.queue = []
  return s
}

const ev = (era: typeof ERAS.E03, id: string) => era.events.find((e) => e.id === id)!

describe('Вдовство', () => {
  it('«Выйти за компаньона мужа» открыто: муж умирает в самом событии', () => {
    const era = ERAS.E03
    const s = adult(11)
    s.hero.sex = 'f'
    s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse')
    const husband = makeNpc(s, era, 'spouse', 'm', s.year - 35)
    s.hero.tags.push('married')
    const e = ev(era, 't_widowhood')
    s.queue = [{ eventId: e.id, at: 0.5, npcId: husband.id } as ActiveEvent]
    const remarry = eventChoices(s, era, e).find((c) => c.id === 'remarry')!
    expect(choiceAvailable(s, remarry, e)).toBe(true)
    expect(lockReason(s, remarry, e)).toBeNull()
    // Другой выбор с новым супругом при живом муже, которого событие не трогает, - по-прежнему закрыт.
    expect(choiceAvailable(s, remarry)).toBe(false)
  })

  it('«Вернуться в родительский дом» - только если есть отец, мать или брат с сестрой', () => {
    const era = ERAS.E03
    const s = adult(12)
    const e = ev(era, 't_widowhood')
    const home = eventChoices(s, era, e).find((c) => c.id === 'return_home')!
    for (const n of s.hero.npcs) if (['father', 'mother', 'sibling'].includes(n.role)) killNpc(s, n)
    expect(choiceAvailable(s, home, e)).toBe(false)
    expect(lockReason(s, home, e)?.key).toBe('event.lock.nobody')
    makeNpc(s, era, 'mother', 'f', s.year - 55)
    expect(choiceAvailable(s, home, e)).toBe(true)
  })

  it('муж уехал и умер вдали - вдова, а не «в разводе»; уехал и жив - замужем', () => {
    const era = ERAS.E03
    const s = adult(13)
    s.hero.npcs = s.hero.npcs.filter((n) => n.role !== 'spouse')
    const husband = makeNpc(s, era, 'spouse', 'm', s.year - 35)
    husband.away = { since: s.year, reason: 'service' }
    expect(maritalStatus(s.hero).kind).toBe('married')
    husband.alive = false
    husband.deathYear = s.year + 1
    expect(maritalStatus(s.hero).kind).toBe('widowed')
    husband.away = { since: s.year, reason: 'divorced' }
    expect(maritalStatus(s.hero).kind).toBe('divorced')
  })
})

describe('Дом по положению', () => {
  it('«Дом побольше» приходит снова, когда герой поднялся в положении', () => {
    const s = adult(14)
    s.hero.band = 1
    s.hero.home = 1
    s.hero.seen.estate_home = s.year
    offerAnswered(s, 'estate_home', 'save')
    expect(offerAllowed(s, 'home')).toBe(false)
    s.hero.band = 2
    expect(offerAllowed(s, 'home')).toBe(true)
    // Дом уже по положению (большой дом у «верхов») - не нужно.
    s.hero.home = 3
    expect(offerAllowed(s, 'home')).toBe(false)
    s.hero.home = 1
    offerAnswered(s, 'estate_home', 'save')
    expect(offerAllowed(s, 'home')).toBe(false)
  })
})

describe('Школа предка', () => {
  it('у потомка основателя школы (вакф или своя школа) - событие с даровой учёбой; тексты на трёх языках', async () => {
    for (const lang of ['ru', 'en', 'tr'] as const) {
      await loadEraTexts(lang, 'E03')
      for (const k of ['title', 'text', 'study', 'play']) expect(hasKey(lang, `ev.f_ancestor_school.${k}`), `${lang} ${k}`).toBe(true)
      expect(createT(lang)('ev.f_ancestor_school.text', {}, { sex: 'f' })).not.toMatch(/\{/)
    }
    const era = ERAS.E03
    const e = ev(era, 'f_ancestor_school')
    expect(e.conditions).toEqual([{ any: [{ flag: 'family_waqf' }, { flag: 'family_school' }] }])
    let seen = 0
    for (let i = 0; i < 40 && !seen; i++) {
      const s = newLife(era, quick, 7700 + i)
      s.hero.flags.push('family_school')
      autoplay(s, era, 15)
      if (s.hero.diary.some((d) => d.eventId === 'f_ancestor_school')) seen++
    }
    expect(seen).toBeGreaterThan(0)
    const teacher = ERAS.E03.events.find((x) => x.id === 't_teacher_legacy')!
    expect(JSON.stringify(teacher.choices!.find((c) => c.id === 'open_school')!.effects)).toContain('family_school')
  })
})

describe('Кочевники', () => {
  it('в степи Онона нельзя купить мастерскую, лавку, доходный дом и склад; в Сарае - можно', () => {
    const era = ERAS.MNG
    const s = adult(15, era)
    s.hero.cls = 'trader'
    s.hero.money = 1e6
    s.hero.region = 'onon'
    for (const ty of ['workshop', 'shop', 'house', 'warehouse'] as const) expect(assetLock(s, ty)).toBe('estate.lock.nomad')
    expect(assetLock(s, 'farm')).toBeUndefined()
    s.hero.region = 'sarai'
    expect(assetLock(s, 'workshop')).toBeUndefined()
    const t = createT('ru')
    expect(t('asset.farm', {}, { region: 'onon' })).toBe('стадо')
    expect(t('asset.farm', {}, { region: 'sarai' })).toBe('хозяйство')
  })
})

describe('Подкидыш бездетным (решение владельца №4)', () => {
  it('прогон ботом: бездетных смертей взрослых меньше, род продолжается чаще; приёмный ребёнок - наследник', async () => {
    const run = async (chance: number) => {
      const keep = FOUNDLING.chance
      FOUNDLING.chance = chance
      let adults = 0
      let childless = 0
      let withHeir = 0
      let adoptedHeir = 0
      try {
        for (let i = 0; i < 700; i++) {
          if (i % 25 === 0) await breathe()
          const era = ERAS[ERA_IDS[i % ERA_IDS.length]]
          // Бот берёт подкидыша, если предложили (иначе - случайный выбор): меряем, сколько бездетных получают шанс.
          const s = autoplay(newLife(era, { ...quick, protectedUntil: 45 }, 60000 + i), era, 130, (opts) => {
            const k = opts.findIndex((c) => c.id === 'adopt')
            return k >= 0 ? k : null
          })
          if (s.hero.age < 40) continue
          adults++
          // Племянник и ученик (наследники бездетного, 20.11) - не свои дети.
          const own = (n: { tags?: string[] }) => !n.tags?.includes('nephew') && !n.tags?.includes('apprentice')
          if (!s.hero.npcs.some((n) => n.role === 'child' && own(n))) childless++
          const h = heirs(s).filter(own)
          if (h.length) withHeir++
          const adoptedIds = new Set(s.hero.diary.filter((d) => d.key.startsWith('diary.adopted_')).map((d) => (d.params?.child as { name?: string } | undefined)?.name))
          if (h.some((n) => adoptedIds.has(n.name))) adoptedHeir++
        }
      } finally {
        FOUNDLING.chance = keep
      }
      return { adults, childless: childless / adults, withHeir: withHeir / adults, adoptedHeir }
    }
    const off = await run(0)
    const on = await run(FOUNDLING.chance)
    console.log('подкидыш: без', off, 'с', on)
    expect(on.childless).toBeLessThan(off.childless * 0.6)
    expect(on.adoptedHeir).toBeGreaterThan(0)
    expect(on.withHeir).toBeGreaterThan(off.withHeir)
  }, 600000)
})
