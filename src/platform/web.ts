// Платформа «сайт»: IndexedDB с запасным localStorage, Яндекс Метрика + свой приёмник событий (Cloudflare Worker),
// системное меню «Поделиться», флаги из /flags.json. Рекламы на сайте нет.
import type { Lang } from '../engine/types'
import { fetchFlags, kvGet, kvSet, loadLocal, saveLocal, sessionFlag, setSessionFlag, uuid } from './local'
import { DEFAULT_FLAGS } from './types'
import type { Flags, Platform, SharePayload, ShareResult } from './types'

const COUNTER_ID = 113771699
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
/** Эти события идут только в свой приёмник, чтобы не засорять Метрику. */
const RECEIVER_ONLY = new Set(['choice_made', 'dream_step'])

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
declare global {
  interface Window {
    ym?: Ym
  }
  const __BUILD__: string
}

// ---------- Игрок, сессия, A/B ----------

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
  // ?ab=b в адресе — посмотреть вариант вручную (и для проверок в браузере); иначе — по id игрока и долям флага.
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ab') : null
  if (forced && forced in flags.ab_buckets) return forced
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
  external: true,

  async init() {
    player = kvGet('thousands.player_id') ?? ''
    if (!player) {
      player = uuid()
      kvSet('thousands.player_id', player)
    }
    initMetrika()
    flags = await fetchFlags({ ...DEFAULT_FLAGS })
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

  save: saveLocal,
  load: loadLocal,
  kvGet,
  kvSet,
  sessionFlag,
  setSessionFlag,

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
