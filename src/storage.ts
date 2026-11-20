// Сохранения игры и настройки поверх модуля platform. Схема версионируется (SAVE_VERSION), старые сохранения мигрируют.
import { SAVE_VERSION } from './engine/life'
import { initializeChild } from './engine/children'
import { migrateArms } from './engine/arms'
import type { Earned } from './engine/achievements'
import type { Lottery } from './engine/life'
import type { GameState, Lang, LifeSummary } from './engine/types'
import { platform } from './platform'
import type { Daily, Gift } from './daily'

export interface Prefs {
  lang: Lang
  font: 's' | 'm' | 'l'
  contrast: boolean
  theme: 'auto' | 'light' | 'dark'
  mode: 'quick' | 'full'
  mortality: 'soft' | 'historical'
  softenHeavy: boolean
  /** Лотерея рождения: все страны поровну или по числу жителей. */
  lottery: Lottery
  /** Длительность взрослого года в секундах на скорости ×1; не задано - стандартная (флаг year_sec). */
  yearSec?: number
  /** Музыка: включена ли и громкость 0–1 (по умолчанию включена, 0.5). */
  sound?: boolean
  volume?: number
  /** Отзыв: ещё не просили, отложили (на какой по счёту жизни), отправлен. */
  feedback?: { state: 'later' | 'sent'; lives: number }
  /** До 28.10.2026: страна всех следующих жизней за отзыв. Теперь за отзыв - один дар «Страна по выбору»;
   *  при загрузке старый выбор превращается в такой дар (loadPrefs). */
  country?: string
  /** Испытание «прожить жизнь дольше 30 лет»: ready - награда ждёт (выбор судьбы у барабана), used - получена. */
  fate?: 'ready' | 'used'
  /** Награда за установку на главный экран: следующая жизнь - в царской семье. */
  royal?: 'ready' | 'used'
  /** Дары за вход: последний полученный день серии и дары, которые ждут следующей жизни. */
  daily?: Daily
  gifts?: Gift[]
  /** Спецключи (src/promo.ts): хеши уже применённых; страна дара «страна по выбору», выданного ключом. */
  promoUsed?: string[]
  /** Графика сцен: живописная (по умолчанию, где есть) или пиксельная. */
  art?: 'painted' | 'pixel'
  /** Строка вестей под шапкой жизни; false - игрок её скрыл (вернуть - в настройках). */
  notices?: boolean
  /** Окно «сохранить достижения» после первой жизни уже показывали. */
  accountAsked?: boolean
  /** «Другая судьба» (П4) уже использована - кнопка больше не показывается. */
  rebirthUsed?: boolean
  promoCountry?: string
  /** День, когда панель «Дары» сама открылась (раз в день, если ждёт дар дня). */
  dailyShown?: string
  /** «Жизнь дня» (src/dailyLife.ts): дата UTC начатой попытки (одна в день), отправленного итога и последнего дня,
   *  проверенного на победу (награда - царская семья); ник для таблиц и «не показывать меня». */
  dailyTried?: string
  dailySent?: string
  dailyChecked?: string
  nick?: string
  nickHidden?: boolean
  /** «На главный экран»: done - добавили или поняли подсказку; later - отложили (на какой по счёту жизни). */
  install?: { state: 'done' | 'later'; lives: number }
}

export interface SaveFile {
  version: number
  game: GameState | null
  memorial: LifeSummary[]
}

const PREFS_KEY = 'thousands.prefs'

// Хранение целиком в модуле platform: на сайте IndexedDB, в Яндекс Играх - облачные сохранения.
const get = <T,>(key: string) => platform.load<T>(key)
const put = (key: string, value: unknown) => platform.save(key, value)

const OLD_FAITH: Record<string, string> = { rome: 'roman_gods', athens: 'roman_gods', egypt: 'egyptian_gods' }

/** Миграции сохранений между версиями. 3 → 4: у героя появилась вера. Мемориал не версионируется и не теряется. */
export function migrate(game: GameState | undefined): GameState | null {
  if (!game || typeof game !== 'object') return null
  if (game.version === 3) {
    game.hero.religion ??= OLD_FAITH[game.hero.region] ?? 'roman_gods'
    game.version = 4
  }
  // 4 → 5: сон о будущем (поле dream, hero.dreamSeen) - в старых жизнях сна не было, менять нечего.
  if (game.version === 4) game.version = 5
  // 5 → 6: эмоциональная память (hero.emotionalMemories) - у старых жизней пустая; родные, умершие раньше, без причины смерти.
  if (game.version === 5) {
    game.hero.emotionalMemories ??= []
    game.version = 6
  }
  // 6 → 7: воспитание и обучение детей - детям героя заводятся пустые профили (без случайности, жизнь идёт как шла).
  if (game.version === 6) {
    for (const n of game.hero.npcs) if (n.role === 'child') initializeChild(game, n)
    game.version = 7
  }
  // 7 → 8: семейное имущество (Family.estate) - пустой реестр; дом, скот, наделы и рабы остаются у героя как были.
  if (game.version === 7) {
    game.family.estate ??= { assets: [], debts: 0 }
    game.version = 8
  }
  // 8 → 9: торговля и дела рода - пустой запас, дел нет.
  if (game.version === 8) {
    game.family.trade ??= { inventory: { goods: [], capacity: 20 }, businesses: [] }
    game.version = 9
  }
  if (game.version !== SAVE_VERSION) return null
  // Герб: прежний готовый выбор (house) - в новый формат конструктора (без смены версии: поле необязательное).
  migrateArms(game.family)
  for (const l of game.family?.lives ?? []) migrateArms(l)
  return game
}

/**
 * До 03.11.2026 наследник получал id h1, h2… от счётчика своей семьи - у разных семей id повторялись, и мемориал,
 * итог жизни и награды находили чужую запись (Аббас вместо Герона, итог не той страны - пустой экран).
 * Повторы в мемориале переименовываются (последняя запись - самая свежая - сохраняет id: на неё ссылается текущая
 * игра); живой герой с чужим id получает свой.
 */
export function uniqueHeroIds(game: GameState | null, memorial: LifeSummary[]): void {
  const seen = new Set<string>()
  for (let i = memorial.length - 1; i >= 0; i--) {
    const l = memorial[i]
    if (seen.has(l.heroId)) l.heroId = `${l.heroId}~${i}`
    seen.add(l.heroId)
  }
  if (game && game.phase !== 'dead' && seen.has(game.hero.id)) game.hero.id = `${game.hero.id}~${game.family.id}`
}

/** Жизни из первой беты без итогового отчёта открыть нельзя - их пропускаем. */
function cleanMemorial(memorial: LifeSummary[] | undefined): LifeSummary[] {
  const out = (memorial ?? []).filter((l) => l && typeof l === 'object' && 'report' in l && Array.isArray(l.diary))
  for (const l of out) migrateArms(l)
  return out
}

export async function loadSave(): Promise<SaveFile> {
  const [game, memorial] = await Promise.all([get<GameState>('game'), get<LifeSummary[]>('memorial')])
  const out = { version: SAVE_VERSION, game: migrate(game), memorial: cleanMemorial(memorial) }
  uniqueHeroIds(out.game, out.memorial)
  return out
}

export function saveGame(game: GameState | null): Promise<void> {
  return put('game', game)
}

export function saveMemorial(memorial: LifeSummary[]): Promise<void> {
  return put('memorial', memorial)
}

/** Полученные награды: {id, ts, lifeId}. */
export async function loadAchievements(): Promise<Earned[]> {
  const list = await get<Earned[]>('achievements')
  return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : []
}

export function saveAchievements(list: Earned[]): Promise<void> {
  return put('achievements', list)
}

export async function clearAll(): Promise<void> {
  await Promise.all([put('game', null), put('memorial', []), put('achievements', [])])
}

export function loadPrefs(defaults: Prefs): Prefs {
  try {
    const raw = platform.kvGet(PREFS_KEY)
    const p: Prefs = raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults
    // Страна за отзыв была навсегда - теперь на одну жизнь: вместо неё один дар «Страна по выбору».
    if (p.country) return { ...p, country: undefined, gifts: [...(p.gifts ?? []), 'country'] }
    return p
  } catch {
    return defaults
  }
}

export function savePrefs(prefs: Prefs): void {
  platform.kvSet(PREFS_KEY, JSON.stringify(prefs))
}

export function parseSaveFile(text: string): SaveFile | null {
  try {
    const data = JSON.parse(text) as SaveFile
    if (!Array.isArray(data.memorial)) return null
    const out = { version: SAVE_VERSION, game: migrate(data.game ?? undefined), memorial: cleanMemorial(data.memorial) }
    uniqueHeroIds(out.game, out.memorial)
    return out
  } catch {
    return null
  }
}
