// Сохранения: IndexedDB, а если он недоступен (приватный режим и т.п.) — localStorage.
import { SAVE_VERSION } from './engine/life'
import type { GameState, Lang, LifeSummary } from './engine/types'

export interface Prefs {
  lang: Lang
  font: 's' | 'm' | 'l'
  contrast: boolean
  theme: 'auto' | 'light' | 'dark'
  mode: 'quick' | 'full'
  mortality: 'soft' | 'historical'
  softenHeavy: boolean
}

export interface SaveFile {
  version: number
  game: GameState | null
  memorial: LifeSummary[]
}

const DB = 'thousands'
const STORE = 'kv'
const PREFS_KEY = 'thousands.prefs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

async function get<T>(key: string): Promise<T | undefined> {
  try {
    return await idb<T | undefined>('readonly', (s) => s.get(key))
  } catch {
    try {
      const raw = localStorage.getItem(`thousands.${key}`)
      return raw ? (JSON.parse(raw) as T) : undefined
    } catch {
      return undefined
    }
  }
}

async function put(key: string, value: unknown): Promise<void> {
  try {
    await idb('readwrite', (s) => s.put(JSON.parse(JSON.stringify(value)), key))
  } catch {
    try {
      localStorage.setItem(`thousands.${key}`, JSON.stringify(value))
    } catch {
      // Сохранить негде — игра продолжится без сохранения.
    }
  }
}

/** Миграции сохранений между версиями. Пока версия одна. */
function migrate(game: GameState | undefined): GameState | null {
  if (!game || typeof game !== 'object') return null
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
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults
  } catch {
    return defaults
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Настройки не сохранятся, но игра работает.
  }
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
