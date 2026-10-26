// Платформа «сайт»: IndexedDB с запасным localStorage, Яндекс Метрика + свой приёмник событий (Cloudflare Worker),
// системное меню «Поделиться», флаги из /flags.json. Рекламы на сайте нет.
import type { Lang } from '../engine/types'
import { DEFAULT_FLAGS } from './types'
import type { Flags, Platform, SharePayload, ShareResult } from './types'

const COUNTER_ID = 113771699
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
/** Эти события идут только в свой приёмник, чтобы не засорять Метрику. */
const RECEIVER_ONLY = new Set(['choice_made'])

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
declare global {
  interface Window {
    ym?: Ym
  }
  const __BUILD__: string
}

// ---------- Хранилище ----------

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

function kvGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function kvSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Хранилище недоступно (приватный режим) — живём без него.
  }
}

// ---------- Игрок, сессия, A/B ----------

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

let player = ''
const session = uuid()
let flags: Flags = { ...DEFAULT_FLAGS }
const context: Record<string, string | number> = {}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

function abBucket(): string {
  const r = hash(player + ':ab')
  let acc = 0
  const entries = Object.entries(flags.ab_buckets)
  for (const [name, share] of entries) {
    acc += share
    if (r < acc) return name
  }
  return entries[entries.length - 1]?.[0] ?? 'a'
}

// ---------- Аналитика ----------

let queue: Record<string, unknown>[] = []

function initMetrika(): void {
  if (!import.meta.env.PROD) return
  const ym: Ym = window.ym ?? (((...args: unknown[]) => {
    ;(ym.a = ym.a ?? []).push(args)
  }) as Ym)
  ym.l = Date.now()
  window.ym = ym
  const script = document.createElement('script')
  script.async = true
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`
  document.head.appendChild(script)
  ym(COUNTER_ID, 'init', { ssr: true, webvisor: true, clickmap: true, referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true })
}

function common(): Record<string, unknown> {
  return { platform: 'web', lang: context.lang ?? '', build: BUILD, ab: abBucket(), session_id: session, player_id: player, ...context }
}

function flush(beacon = false): void {
  if (!queue.length || !import.meta.env.PROD) return
  const batch = queue.splice(0, 50)
  const body = JSON.stringify({ events: batch })
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/events`, new Blob([body], { type: 'application/json' }))
      return
    }
    fetch(`${API}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    // Приёмник недоступен — события пропадают, игра не страдает.
  }
}

// ---------- Отзывы ----------

const FEEDBACK_QUEUE = 'thousands.feedback_queue'

async function postFeedback(data: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${API}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    return res.ok
  } catch {
    return false
  }
}

async function retryFeedback(): Promise<void> {
  const raw = kvGet(FEEDBACK_QUEUE)
  if (!raw) return
  let pending: Record<string, unknown>[] = []
  try {
    pending = JSON.parse(raw)
  } catch {
    pending = []
  }
  const left: Record<string, unknown>[] = []
  for (const item of pending) if (!(await postFeedback(item))) left.push(item)
  kvSet(FEEDBACK_QUEUE, JSON.stringify(left))
}

// ---------- Платформа ----------

let pauseHandlers: ((paused: boolean) => void)[] = []

export const webPlatform: Platform = {
  name: 'web',

  async init() {
    player = kvGet('thousands.player_id') ?? ''
    if (!player) {
      player = uuid()
      kvSet('thousands.player_id', player)
    }
    initMetrika()
    // Флаги: не ждём дольше полутора секунд — иначе играем с настройками по умолчанию.
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 1500)
      const res = await fetch('./flags.json', { cache: 'no-cache', signal: ctrl.signal })
      clearTimeout(timer)
      if (res.ok) flags = { ...DEFAULT_FLAGS, ...(await res.json()) }
    } catch {
      // Нет сети или файла — значения по умолчанию.
    }
    webPlatform.flags = flags
    setInterval(() => flush(), 10000)
    document.addEventListener('visibilitychange', () => {
      // Сначала игра записывает session_end, затем очередь уходит через sendBeacon.
      for (const h of pauseHandlers) h(document.visibilityState === 'hidden')
      if (document.visibilityState === 'hidden') flush(true)
    })
    retryFeedback()
  },

  ready() {},
  gameplayStart() {},
  gameplayStop() {},
  onPause(cb) {
    pauseHandlers.push(cb)
  },

  async save(key, value) {
    try {
      await idb('readwrite', (s) => s.put(JSON.parse(JSON.stringify(value)), key))
    } catch {
      kvSet(`thousands.${key}`, JSON.stringify(value))
    }
  },

  async load<T>(key: string) {
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
  },

  kvGet,
  kvSet,

  sessionFlag(key) {
    try {
      return sessionStorage.getItem(key) === '1'
    } catch {
      return true
    }
  },
  setSessionFlag(key) {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // ignore
    }
  },

  track(event, params = {}) {
    const full = { ...common(), ...params }
    if (!RECEIVER_ONLY.has(event)) window.ym?.(COUNTER_ID, 'reachGoal', event, full)
    queue.push({ name: event, ts: Date.now(), ...full })
    if (queue.length >= 50) flush()
  },

  userParams(params) {
    window.ym?.(COUNTER_ID, 'userParams', { ...params, UserID: player })
  },

  setContext(params) {
    Object.assign(context, params)
  },

  async share(payload: SharePayload): Promise<ShareResult> {
    try {
      if (payload.copyOnly) {
        await navigator.clipboard.writeText(payload.text)
        return 'copied'
      }
      if (payload.file && navigator.canShare?.({ files: [payload.file] })) {
        await navigator.share({ files: [payload.file], text: payload.text })
        return 'shared'
      }
      if (navigator.share) {
        await navigator.share({ text: payload.text, url: payload.url })
        return 'shared'
      }
      await navigator.clipboard.writeText(payload.url ? `${payload.text} ${payload.url}` : payload.text)
      return 'copied'
    } catch {
      return 'failed'
    }
  },

  async sendFeedback(data) {
    const item = { ...data, player_id: player, ts: Date.now(), build: BUILD }
    if (await postFeedback(item)) return
    let pending: unknown[] = []
    try {
      pending = JSON.parse(kvGet(FEEDBACK_QUEUE) ?? '[]')
    } catch {
      pending = []
    }
    kvSet(FEEDBACK_QUEUE, JSON.stringify([...pending, item].slice(-20)))
  },

  async showInterstitial() {
    return false
  },
  async showRewarded() {
    return false
  },

  async submitScore(board, score) {
    const key = `thousands.best.${board}`
    if (score > Number(kvGet(key) ?? 0)) kvSet(key, String(score))
  },

  async serverTime() {
    try {
      const res = await fetch(`${API}/time`, { method: 'HEAD', cache: 'no-store' })
      const date = res.headers.get('date')
      if (date) return Date.parse(date)
    } catch {
      // ignore
    }
    return Date.now()
  },

  flags,

  lang(): Lang {
    return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  },

  ab: abBucket,
  playerId: () => player,
}
