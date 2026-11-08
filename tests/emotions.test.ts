// Эмоциональная память (src/engine/emotions.ts, ТЗ семейной системы, этап 1 и пункт 2.7) и причина смерти родных (этап 0).
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import { emotionalImpact, emotionalLoad, emotionsYear, onEmotion, rememberEmotion, resolveEmotion } from '../src/engine/emotions'
import { autoplay, startYear } from '../src/engine/game'
import { newLife, SAVE_VERSION } from '../src/engine/life'
import { applyEffects, killNpc, makeNpc } from '../src/engine/rules'
import type { EmotionalMemory, GameState, LifeSummary, Npc, NpcRole } from '../src/engine/types'
import { migrate, parseSaveFile } from '../src/storage'

const ERAS = await loadAllEras()
const era = ERAS.E03
const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false } as const

function life(seed = 5, age = 30): GameState {
  const s = newLife(era, opts, seed)
  s.hero.age = age
  s.hero.birthYear = s.year - age
  s.hero.traits = []
  s.hero.npcs = []
  s.hero.emotionalMemories = []
  return s
}

function npc(s: GameState, role: NpcRole, attitude = 30, age = 40): Npc {
  const n = makeNpc(s, era, role, 'f', s.year - age, attitude)
  s.hero.npcs.push(n)
  return n
}

describe('Причина смерти родных (этап 0)', () => {
  it('killNpc запоминает причину, эффект kill_npc передаёт e.cause', () => {
    const s = life()
    const a = npc(s, 'friend')
    killNpc(s, a, 'accident')
    expect(a.alive).toBe(false)
    expect(a.deathCause).toBe('accident')
    const b = npc(s, 'sibling')
    applyEffects(s, era, [{ kill_npc: 'sibling', cause: 'arena' }])
    expect(b.deathCause).toBe('arena')
    const c = npc(s, 'friend')
    killNpc(s, c)
    expect(c.deathCause).toBeUndefined()
  })

  it('в прожитых жизнях у умерших родных есть причина смерти', () => {
    // Причина есть у естественных смертей и смертей в родах; события без поля cause в данных - пока без неё.
    let dead = 0
    let known = 0
    for (let i = 0; i < 20; i++) {
      const s = autoplay(newLife(era, opts, 900 + i), era)
      for (const n of s.hero.npcs.filter((n) => !n.alive)) {
        dead++
        if (n.deathCause) known++
      }
    }
    expect(dead).toBeGreaterThan(20)
    expect(known / dead).toBeGreaterThan(0.8)
  })
})

describe('Сила переживания (2.7)', () => {
  it('родство: ребёнок и супруг сильнее родителя, родитель - брата, брат - друга', () => {
    const s = life()
    const v = (r: NpcRole) => emotionalImpact(s, npc(s, r))
    expect(v('child')).toBeGreaterThan(v('father'))
    expect(v('spouse')).toBeGreaterThan(v('father'))
    expect(v('father')).toBeGreaterThan(v('sibling'))
    expect(v('sibling')).toBeGreaterThan(v('friend'))
    expect(emotionalImpact(s, { ...npc(s, 'friend'), role: 'servant' as NpcRole })).toBe(0)
  })

  it('возраст героя: подросток теряет родителя тяжелее взрослого, малыш почти не помнит брата', () => {
    const teen = life(5, 13)
    const adult = life(5, 30)
    const old = life(5, 60)
    const kid = life(5, 3)
    const pTeen = emotionalImpact(teen, npc(teen, 'mother'))
    const pAdult = emotionalImpact(adult, npc(adult, 'mother'))
    expect(pTeen).toBeGreaterThan(pAdult)
    expect(pAdult).toBeGreaterThan(emotionalImpact(old, npc(old, 'mother', 30, 85)))
    expect(emotionalImpact(kid, npc(kid, 'sibling'))).toBeLessThan(emotionalImpact(adult, npc(adult, 'sibling')))
  })

  it('характер: добрый горюет сильнее сдержанного', () => {
    const kind = life()
    kind.hero.traits = ['kind']
    const cold = life()
    cold.hero.traits = ['reserved']
    expect(emotionalImpact(kind, npc(kind, 'spouse'))).toBeGreaterThan(emotionalImpact(cold, npc(cold, 'spouse')))
  })

  it('отношения: любимого жаль сильнее, чем того, с кем в ссоре', () => {
    const s = life()
    expect(emotionalImpact(s, npc(s, 'father', 90))).toBeGreaterThan(emotionalImpact(s, npc(s, 'father', -60)))
  })

  it('причина: насильственная смерть тяжелее старости; смерть вдали - вполовину', () => {
    const s = life()
    const n = npc(s, 'spouse')
    const base = emotionalImpact(s, n)
    expect(emotionalImpact(s, n, { cause: 'killed' })).toBeGreaterThan(base)
    expect(emotionalImpact(s, n, { cause: 'old_age' })).toBeLessThan(base)
    expect(emotionalImpact(s, n, { far: true })).toBeCloseTo(base / 2, 5)
  })

  it('младенец - слабее взрослого ребёнка; сила всегда в 0–100', () => {
    const s = life()
    expect(emotionalImpact(s, npc(s, 'child', 30, 0))).toBeLessThan(emotionalImpact(s, npc(s, 'child', 30, 10)))
    s.hero.traits = ['kind', 'generous', 'hot_tempered']
    expect(emotionalImpact(s, npc(s, 'child', 100, 10), { cause: 'murder' })).toBeLessThanOrEqual(100)
  })
})

describe('Память и затухание (2.7)', () => {
  it('смерть близкого: запись в память, удар по счастью и стрессу в Hero.hidden, без новых шкал', () => {
    const s = life()
    const keys = Object.keys(s.hero.hidden).sort()
    const h0 = s.hero.hidden.happiness
    const st0 = s.hero.hidden.stress
    const n = npc(s, 'spouse', 60)
    killNpc(s, n, 'illness')
    const m = s.hero.emotionalMemories![0]
    expect(m).toMatchObject({ type: 'grief', npcId: n.id, role: 'spouse', cause: 'illness', year: s.year })
    expect(m.intensity).toBeGreaterThan(50)
    expect(s.hero.hidden.happiness).toBeLessThan(h0)
    expect(s.hero.hidden.stress).toBeGreaterThan(st0)
    expect(Object.keys(s.hero.hidden).sort()).toEqual(keys)
  })

  it('смерть супруга: вдовство (нет метки married), одиночество растёт, память о супруге', () => {
    const s = life()
    s.hero.tags.push('married')
    const l0 = s.hero.hidden.loneliness
    killNpc(s, npc(s, 'spouse', 50), 'fever')
    expect(s.hero.tags).not.toContain('married')
    expect(s.hero.hidden.loneliness).toBeGreaterThan(l0)
    expect(s.hero.emotionalMemories![0].role).toBe('spouse')
  })

  it('прежнее неутихшее горе делает новое тяжелее; рядом семья - утешение быстрее', () => {
    const s = life()
    const n = npc(s, 'sibling')
    const before = emotionalImpact(s, n)
    rememberEmotion(s, 'grief', npc(s, 'child', 80))
    expect(emotionalImpact(s, n)).toBeGreaterThan(before)
    const years = (withFamily: boolean) => {
      const x = life(9)
      if (withFamily) npc(x, 'spouse', 60)
      const m = rememberEmotion(x, 'grief', npc(x, 'friend', 60))!
      m.intensity = m.current = 70
      while (m.resolved === undefined) {
        x.year++
        emotionsYear(x)
      }
      return m.resolved - m.year
    }
    expect(years(true)).toBeLessThanOrEqual(years(false))
  })

  it('смерть вдали - grief_far и слабее', () => {
    const s = life()
    const near = npc(s, 'father', 30)
    const far = npc(s, 'mother', 30)
    far.away = { since: s.year, reason: 'abroad' }
    killNpc(s, near, 'illness')
    killNpc(s, far, 'illness')
    const [a, b] = s.hero.emotionalMemories!
    expect(b.type).toBe('grief_far')
    expect(b.intensity).toBeLessThan(a.intensity)
  })

  it('с разводом горя нет; одинаковый сид - одинаковая сила (только rng.ts)', () => {
    const s = life()
    const ex = npc(s, 'spouse')
    ex.away = { since: s.year, reason: 'divorced' }
    killNpc(s, ex)
    expect(s.hero.emotionalMemories).toHaveLength(0)
    const x = life(77)
    const y = life(77)
    expect(rememberEmotion(x, 'grief', npc(x, 'child'))!.intensity).toBe(rememberEmotion(y, 'grief', npc(y, 'child'))!.intensity)
  })

  it('память затухает годами и утихает; тихая запись в дневник о самых близких', () => {
    const s = life()
    killNpc(s, npc(s, 'spouse', 80), 'illness')
    const m = s.hero.emotionalMemories![0]
    const seen: number[] = [m.current]
    for (let y = 1; y <= 30 && m.resolved === undefined; y++) {
      s.year++
      s.hero.age++
      emotionsYear(s)
      seen.push(m.current)
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThan(seen[i - 1])
    expect(m.resolved).toBeDefined()
    expect(m.resolved! - m.year).toBeGreaterThanOrEqual(3)
    expect(m.resolved! - m.year).toBeLessThanOrEqual(15)
    expect(s.hero.diary.some((d) => d.key === 'diary.grief_eased')).toBe(true)
    expect(emotionalLoad(s.hero)).toBe(0)
  })

  it('вера и набожность ускоряют утешение', () => {
    const years = (pious: boolean) => {
      const s = life()
      if (pious) {
        s.hero.traits = ['pious']
        s.hero.hidden.faith = 90
      } else s.hero.hidden.faith = 20
      const m = rememberEmotion(s, 'grief', npc(s, 'child', 60))!
      m.intensity = m.current = 80
      while (m.resolved === undefined) {
        s.year++
        emotionsYear(s)
      }
      return m.resolved - m.year
    }
    expect(years(true)).toBeLessThan(years(false))
  })

  it('emotionsYear - ровно раз за год startYear; в год события память не затухает', () => {
    const s = autoplay(newLife(era, opts, 31), era, 25)
    const before = s.hero.emotionalMemories?.length ?? 0
    const n = npc(s, 'friend', 80)
    killNpc(s, n, 'accident')
    const m = s.hero.emotionalMemories![before]
    const c0 = m.current
    emotionsYear(s)
    expect(m.current).toBe(c0)
    if (s.phase === 'year' && s.hero.alive) {
      s.year++
      s.hero.age++
      startYear(s, era, null)
      expect(m.current).toBeLessThan(c0)
    }
  })

  it('resolveEmotion повторно ничего не делает; аналитика: created и resolved', () => {
    const got: string[] = []
    onEmotion((k) => got.push(k))
    const s = life()
    const m = rememberEmotion(s, 'grief', npc(s, 'father'))!
    resolveEmotion(s, m)
    resolveEmotion(s, m)
    onEmotion(undefined)
    expect(got).toEqual(['created', 'resolved'])
  })

  it('память не растёт без конца', () => {
    const s = life()
    for (let i = 0; i < 80; i++) {
      const m = rememberEmotion(s, 'grief', npc(s, 'friend'))!
      if (i % 2) resolveEmotion(s, m)
    }
    expect(s.hero.emotionalMemories!.length).toBeLessThanOrEqual(40)
  })

  it('600 жизней по всем странам без ошибок; горе есть, счастье в рамках', () => {
    let withGrief = 0
    let lives = 0
    for (const id of ERA_IDS)
      for (let k = 0; k < Math.ceil(600 / ERA_IDS.length); k++, lives++) {
        const s = autoplay(newLife(ERAS[id], opts, 5000 + lives), ERAS[id])
        const mem: EmotionalMemory[] = s.hero.emotionalMemories ?? []
        if (mem.length) withGrief++
        for (const m of mem) {
          expect(m.intensity).toBeGreaterThan(0)
          expect(m.intensity).toBeLessThanOrEqual(100)
        }
        expect(s.hero.hidden.happiness).toBeGreaterThanOrEqual(0)
        expect(s.hero.hidden.happiness).toBeLessThanOrEqual(100)
      }
    expect(withGrief / lives).toBeGreaterThan(0.5)
  }, 300000)
})

describe('Сохранения (этап 0)', () => {
  it(`сохранение версии 5 мигрирует в ${SAVE_VERSION}, мемориал и герой целы`, () => {
    const s = autoplay(newLife(era, opts, 12), era, 20)
    const old = JSON.parse(JSON.stringify(s)) as GameState
    old.version = 5
    delete old.hero.emotionalMemories
    const game = migrate(JSON.parse(JSON.stringify(old)))!
    expect(game.version).toBe(SAVE_VERSION)
    expect(game.hero.emotionalMemories).toEqual([])
    expect(game.hero.name).toBe(s.hero.name)
    expect(game.hero.npcs.length).toBe(s.hero.npcs.length)
    // Игра идёт дальше.
    autoplay(game, era)
    expect(game.hero.alive).toBe(false)

    const memorial = [{ heroId: 'h0', report: {}, diary: [] }] as unknown as LifeSummary[]
    const file = parseSaveFile(JSON.stringify({ version: 5, game: old, memorial }))!
    expect(file.game?.version).toBe(SAVE_VERSION)
    expect(file.memorial).toHaveLength(1)
    // Версия 3 по-прежнему доходит до новой.
    const v3 = JSON.parse(JSON.stringify(old)) as GameState
    v3.version = 3
    expect(migrate(v3)?.version).toBe(SAVE_VERSION)
  })
})
