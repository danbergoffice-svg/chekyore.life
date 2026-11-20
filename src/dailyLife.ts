// «Жизнь дня» (docs/TZ_daily.md): одна жизнь на всех по дате UTC, одна попытка, сложный режим, таблица дня с никами.
// Здесь - только расчёты без интерфейса: дата, номер жизни, рождение, кому показывать, итог для таблицы, проверка ника.
// Сервер - worker/daily.ts, экраны - src/ui/DailyLife.tsx, запуск и отправка итога - App.tsx.
import { rollBirth, type Birth } from './engine/life'
import type { EraMeta, GameState } from './engine/types'
import { share } from './goal'

/** Дата по UTC в виде YYYY-MM-DD: у всех игроков мира одни сутки (решение владельца 21.11). */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Вчерашняя дата UTC. */
export function prevUtcDate(date: string): string {
  return utcDate(Date.parse(date + 'T12:00:00Z') - 86400000)
}

/** Сколько миллисекунд до следующей полуночи UTC. */
export function msToNextDay(ms: number): number {
  const next = Date.parse(utcDate(ms) + 'T00:00:00Z') + 86400000
  return Math.max(0, next - ms)
}

/** Номер жизни дня: один и тот же у всех для одной даты, никогда не 0. */
export function dailySeed(date: string): number {
  let h = 2166136261
  const s = 'daily:' + date
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0 || 1
}

/** Рождение жизни дня: лотерея «по числу жителей» среди всех стран игры (порядок стран - как в ERA_IDS). */
export function dailyBirth(date: string, eras: EraMeta[]): Birth {
  return rollBirth(dailySeed(date), 'population', eras)
}

export interface DailyFlags {
  daily_share?: number
  daily_min_lives?: number
}

/**
 * Показывать ли игроку жизнь дня: только на своём сайте (на порталах другая сборка событий - рождение было бы тем же,
 * а жизнь нет), только после daily_min_lives законченных жизней и только в доле daily_share (A/B; ?daily=0|1 - руками).
 */
export function dailyOn(playerId: string, flags: DailyFlags, lives: number, platformName: string): boolean {
  if (platformName !== 'web') return false
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('daily') : null
  if (forced === '0') return false
  if (lives < (flags.daily_min_lives ?? 1)) return false
  if (forced === '1') return true
  return share(playerId, 'daily', flags.daily_share ?? 0)
}

/** Итог жизни дня для таблицы: возраст, живые дети и внуки, богатство, дело. */
export interface DailyResult {
  date: string
  age: number
  kids: number
  wealth: number
  prof: string | null
  /** Сколько секунд реального времени шла жизнь (защита от подделки на сервере). */
  sec: number
  birth: { era: string; region: string; year: number; cls: string; sex: string }
}

export function dailyResult(state: GameState, date: string, birth: Birth): DailyResult {
  const h = state.hero
  const kids = h.npcs.filter((n) => n.alive && (n.role === 'child' || n.role === 'grandchild')).length
  return {
    date,
    age: h.age,
    kids,
    wealth: Math.max(0, Math.round(h.money)),
    prof: h.profession,
    sec: Math.round(state.stats?.sec ?? 0),
    birth: { era: birth.era, region: birth.region, year: birth.year, cls: birth.cls, sex: birth.sex },
  }
}

/** Ник: 3–16 знаков, буквы любых алфавитов, цифры, «_» и «-»; без ссылок. Та же проверка - на сервере (worker/daily.ts). */
export function nickOk(nick: string): boolean {
  const s = nick.trim()
  return /^[\p{L}\p{N}_-]{3,16}$/u.test(s) && !/(https?|www|\.com|\.ru)/i.test(s)
}

/** Строка таблицы дня с сервера. */
export interface DailyRow {
  place: number
  nick: string | null
  country: string | null
  age: number
  kids: number
  prof: string | null
  me?: boolean
}

/** Ответ сервера о жизни дня: сколько сыграло, топ, своё место, рекорд. */
export interface DailyBoard {
  date: string
  n: number
  top: DailyRow[]
  me: DailyRow | null
}
