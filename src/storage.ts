// Сохранения игры и настройки поверх модуля platform. Схема версионируется (SAVE_VERSION), старые сохранения мигрируют.
import { SAVE_VERSION } from './engine/life'
import type { Lottery } from './engine/life'
import type { GameState, Lang, LifeSummary } from './engine/types'
import { platform } from './platform'

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
  /** Отзыв: ещё не просили, отложили (на какой по счёту жизни), отправлен. */
  feedback?: { state: 'later' | 'sent'; lives: number }
}

export interface SaveFile {
  version: number
  game: GameState | null
  memorial: LifeSummary[]
}

const PREFS_KEY = 'thousands.prefs'

// Хранение целиком в модуле platform: на сайте IndexedDB, в Яндекс Играх — облачные сохранения.
const get = <T,>(key: string) => platform.load<T>(key)
const put = (key: string, value: unknown) => platform.save(key, value)

const OLD_FAITH: Record<string, string> = { rome: 'roman_gods', athens: 'roman_gods', egypt: 'egyptian_gods' }

/** Миграции сохранений между версиями. 3 → 4: у героя появилась вера. */
function migrate(game: GameState | undefined): GameState | null {
  if (!game || typeof game !== 'object') return null
  if (game.version === 3) {
    game.hero.religion ??= OLD_FAITH[game.hero.region] ?? 'roman_gods'
    game.version = 4
  }
  if (game.version !== SAVE_VERSION) return null
  return game
}

/** Жизни из первой беты без итогового отчёта открыть нельзя — их пропускаем. */
function cleanMemorial(memorial: LifeSummary[] | undefined): LifeSummary[] {
  return (memorial ?? []).filter((l) => l && typeof l === 'object' && 'report' in l && Array.isArray(l.diary))
}

export async function loadSave(): Promise<SaveFile> {
  const [game, memorial] = await Promise.all([get<GameState>('game'), get<LifeSummary[]>('memorial')])
  return { version: SAVE_VERSION, game: migrate(game), memorial: cleanMemorial(memorial) }
}

export function saveGame(game: GameState | null): Promise<void> {
  return put('game', game)
}

export function saveMemorial(memorial: LifeSummary[]): Promise<void> {
  return put('memorial', memorial)
}

export async function clearAll(): Promise<void> {
  await Promise.all([put('game', null), put('memorial', [])])
}

export function loadPrefs(defaults: Prefs): Prefs {
  try {
    const raw = platform.kvGet(PREFS_KEY)
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults
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
    return { version: SAVE_VERSION, game: migrate(data.game ?? undefined), memorial: cleanMemorial(data.memorial) }
  } catch {
    return null
  }
}
