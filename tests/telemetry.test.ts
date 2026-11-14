// Аудит 10.11, очередь 0: новые события аналитики (event_shown, loss_shown, year_windows, historical, heirs, utm)
// доходят до session_end счётчиками и не пишут лишних строк в D1; сбой загрузки куска сборки - перезагрузка один раз.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAllEras } from '../src/content'
import { autoplay, startYear, finishYear } from '../src/engine/game'
import { heirs, newLife } from '../src/engine/life'
import type { EventDef, GameSettings, LifeSummary } from '../src/engine/types'
import { platform } from '../src/platform'
import { AGGREGATED, countEvent, takeCounts } from '../src/platform/web'
import { eventKind, trackEventShown, trackLifeEnd, trackLossShown, trackYear, utmParams } from '../src/telemetry'
import { isChunkError, reloadForChunk } from '../src/ui/Crash'

const ERAS = await loadAllEras()
const opts: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false }

// В тестах нет окна браузера: события только проверяются, никуда не уходят.
let track: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  track = vi.spyOn(platform, 'track').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('Счётчики в session_end (AGGREGATED)', () => {
  it('event_shown копится по типу и по длине очереди, year_windows - гистограммой, loss_shown - по родству', () => {
    const counts: Record<string, Record<string, number>> = {}
    expect(countEvent(counts, 'event_shown', { type: 'dice', queue_len: 0 })).toBe(true)
    countEvent(counts, 'event_shown', { type: 'dice', queue_len: 2 })
    countEvent(counts, 'event_shown', { type: 'historical', queue_len: 0 })
    countEvent(counts, 'year_windows', { n: 3 })
    countEvent(counts, 'year_windows', { n: 0 })
    countEvent(counts, 'year_windows', { n: 0 })
    countEvent(counts, 'loss_shown', { npc_role: 'mother', is_death: 1 })
    countEvent(counts, 'tab_open', { tab: 'hero' })
    expect(countEvent(counts, 'life_end', {})).toBe(false)
    const out = takeCounts(counts)
    expect(out.events_shown).toEqual({ dice: 2, historical: 1 })
    expect(out.event_queue).toEqual({ 0: 2, 2: 1 })
    expect(out.year_windows).toEqual({ 0: 2, 3: 1 })
    expect(out.losses).toEqual({ mother: 1 })
    expect(out.tabs).toEqual({ hero: 1 })
  })

  it('все поля session_end разные (два счётчика не затирают друг друга)', () => {
    const fields = Object.values(AGGREGATED).flatMap((a) => (Array.isArray(a[0]) ? (a as [string, string][]) : [a as [string, string]]).map(([, f]) => f))
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('session_end за длинную сессию укладывается в предел приёмника (4000 знаков)', () => {
    const counts: Record<string, Record<string, number>> = {}
    for (let i = 0; i < 400; i++) {
      countEvent(counts, 'event_shown', { type: ['personal', 'family', 'local', 'historical', 'dice', 'estate', 'debt', 'profession', 'name', 'crisis', 'dream'][i % 11], queue_len: i % 6 })
      countEvent(counts, 'year_windows', { n: Math.min(9, i % 10) })
      countEvent(counts, 'tab_open', { tab: ['life', 'hero', 'people', 'world', 'diary'][i % 5] })
      countEvent(counts, 'emotional_event_created', { role: ['father', 'mother', 'spouse', 'child', 'sibling'][i % 5] })
      countEvent(counts, 'trade_started', { good: `good_${i % 14}` })
      countEvent(counts, 'trade_completed', { good: `good_${i % 14}` })
      countEvent(counts, 'loss_shown', { npc_role: ['father', 'mother', 'spouse', 'child'][i % 4] })
    }
    const params = { screen: 'life', age: 40, sec_in_session: 3600, ...takeCounts(counts), platform: 'web', lang: 'ru', build: '2026-11-10T12:00', ab: 'a', session_id: 'x'.repeat(36), player_id: 'y'.repeat(36), life_index: 12, mode: 'quick', utm: 'telegram' }
    expect(JSON.stringify(params).length).toBeLessThan(4000)
  })
})

describe('Новые события', () => {
  it('тип окна: история, кости, покупки, долги и обычные', () => {
    const ev = (o: Partial<EventDef>) => ({ id: 'x', type: 'personal', base_weight: 1, ...o }) as EventDef
    expect(eventKind(ev({ type: 'global_historical' }))).toBe('historical')
    expect(eventKind(ev({ dynamic: 'dice' }))).toBe('dice')
    expect(eventKind(ev({ id: 'estate_home' }))).toBe('estate')
    expect(eventKind(ev({ id: 'debt_pit' }))).toBe('debt')
    expect(eventKind(ev({ type: 'family' }))).toBe('family')
  })

  it('event_shown несёт queue_len, а year_windows считает окна прошедшего года', () => {
    const era = ERAS.E03
    const s = autoplay(newLife(era, { ...opts, protectedUntil: 90 }, 77), era, 20)
    if (s.phase === 'running') {
      s.queue = []
      finishYear(s, era)
    }
    const spy = track
    startYear(s, era, null)
    const ev = { id: 'test_ev', type: 'local', base_weight: 1 } as EventDef
    trackEventShown(s, ev)
    trackEventShown(s, ev)
    expect(spy).toHaveBeenCalledWith('event_shown', expect.objectContaining({ event_id: 'test_ev', type: 'local', age: s.hero.age, queue_len: expect.any(Number) }))
    s.queue = []
    finishYear(s, era)
    trackYear(s)
    expect(spy).toHaveBeenCalledWith('year_windows', { n: 2 })
    // Следующий год без окон - ноль.
    startYear(s, era, null)
    s.queue = []
    finishYear(s, era)
    trackYear(s)
    expect(spy).toHaveBeenLastCalledWith('year_windows', { n: 0 })
  })

  it('loss_shown: родство и смерть', () => {
    const spy = track
    trackLossShown('mother')
    expect(spy).toHaveBeenCalledWith('loss_shown', { npc_role: 'mother', is_death: 1 })
  })

  it('life_end несёт число наследников', () => {
    const era = ERAS.RUS
    const s = autoplay(newLife(era, opts, 3), era)
    const spy = track
    trackLifeEnd(s, { age: s.hero.age, cause: 'old_age', region: s.hero.region, era: s.hero.era, generation: 1 } as LifeSummary)
    expect(spy).toHaveBeenCalledWith('life_end', expect.objectContaining({ heirs: heirs(s).length }))
  })

  it('utm: метки из адреса чистятся, первый источник запоминается', () => {
    const store = new Map<string, string>()
    vi.spyOn(platform, 'kvGet').mockImplementation((k) => store.get(k) ?? null)
    vi.spyOn(platform, 'kvSet').mockImplementation((k, v) => void store.set(k, v))
    expect(utmParams('?life=abc')).toEqual({ first: '' })
    expect(utmParams('?utm_source=Telegram&utm_medium=post&utm_campaign=nov<script>')).toEqual({ utm_source: 'telegram', utm_medium: 'post', utm_campaign: 'novscript', first: 'telegram' })
    expect(utmParams('?utm_source=vk')).toEqual({ utm_source: 'vk', first: 'telegram' })
    expect(utmParams('')).toEqual({ first: 'telegram' })
  })
})

describe('js_error: сбой загрузки после обновления', () => {
  it('узнаёт ошибки подгрузки модуля разных браузеров', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://thousands.life/assets/c-rus-ru-AbC.js'))).toBe(true)
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('перезагружает страницу один раз за сессию', () => {
    let flag = false
    vi.spyOn(platform, 'sessionFlag').mockImplementation(() => flag)
    vi.spyOn(platform, 'setSessionFlag').mockImplementation(() => void (flag = true))
    const reload = vi.fn()
    expect(reloadForChunk(new Error('x'), reload)).toBe(true)
    expect(reloadForChunk(new Error('x'), reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('js_error', expect.objectContaining({ kind: 'chunk' }))
  })
})
