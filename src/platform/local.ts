// Хранение на устройстве игрока: IndexedDB с запасным localStorage. Общее для сайта и порталов.

const DB = 'thousands'
const STORE = 'kv'

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

export function kvGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function kvSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Хранилище недоступно (приватный режим) — живём без него.
  }
}

export async function saveLocal(key: string, value: unknown): Promise<void> {
  try {
    await idb('readwrite', (s) => s.put(JSON.parse(JSON.stringify(value)), key))
  } catch {
    kvSet(`thousands.${key}`, JSON.stringify(value))
  }
}

export async function loadLocal<T>(key: string): Promise<T | undefined> {
  try {
    return await idb<T | undefined>('readonly', (s) => s.get(key))
  } catch {
    const raw = kvGet(`thousands.${key}`)
    try {
      return raw ? (JSON.parse(raw) as T) : undefined
    } catch {
      return undefined
    }
  }
}

export function sessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return true
  }
}

export function setSessionFlag(key: string): void {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    // ignore
  }
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Флаги из файла рядом с игрой; не ждём дольше полутора секунд — иначе значения по умолчанию. */
export async function fetchFlags<T>(defaults: T): Promise<T> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch('./flags.json', { cache: 'no-cache', signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) return { ...defaults, ...(await res.json()) }
  } catch {
    // Нет сети или файла.
  }
  return defaults
}
