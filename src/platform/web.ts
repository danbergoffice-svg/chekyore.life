// Платформа «сайт»: IndexedDB с запасным localStorage, Яндекс Метрика + свой приёмник событий (Cloudflare Worker),
// системное меню «Поделиться», флаги из /flags.json. Рекламы на сайте нет.
import type { Lang } from '../engine/types'
import { fetchFlags, kvGet, kvSet, loadLocal, saveLocal, sessionFlag, setSessionFlag, uuid } from './local'
import { DEFAULT_FLAGS } from './types'
import type { Flags, Platform, SharePayload, ShareResult } from './types'
import type { DailyBoard } from '../dailyLife'

const COUNTER_ID = 113771699
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
/** Эти события идут только в свой приёмник, чтобы не засорять Метрику. */
const RECEIVER_ONLY = new Set(['choice_made', 'dream_step', 'menu_leave', 'daily_offer'])

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

/** Отложенное системное окно установки (Chrome на Android и компьютере). */
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let installEvent: InstallEvent | null = null

function abBucket(): string {
  // ?ab=b в адресе - посмотреть вариант вручную (и для проверок в браузере); иначе - по id игрока и долям флага.
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
  // crossorigin: ошибки внутри Метрики приходят с текстом и стеком, а не «Script error.» (mc.yandex.ru отдаёт CORS *).
  script.crossOrigin = 'anonymous'
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`
  document.head.appendChild(script)
  ym(COUNTER_ID, 'init', { ssr: true, webvisor: true, clickmap: true, referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true })
}

function common(): Record<string, unknown> {
  return { platform: (import.meta.env.VITE_PLATFORM as string | undefined) || 'web', lang: context.lang ?? '', build: BUILD, ab: abBucket(), session_id: session, player_id: player, ...context }
}

/** События-счётчики: имя → [поле, по которому считать ('' - просто сколько раз), поле в session_end]:
 *  session_end.tabs = {life: 5, hero: 2}, .speeds = {0: 3, 0.5: 1}, .next_events = {'': 4}. */
export const AGGREGATED: Record<string, [string, string] | [string, string][]> = {
  tab_open: ['tab', 'tabs'],
  speed_change: ['speed', 'speeds'],
  next_event_click: ['', 'next_events'],
  historian_open: ['', 'historian'],
  people_open: ['', 'people'],
  // Эмоциональная память: за жизнь их бывает с десяток - считаем по родству, одним полем в session_end.
  emotional_event_created: ['role', 'emotions'],
  emotional_event_resolved: ['role', 'emotions_resolved'],
  // Сделки на рынке бывают десятками за жизнь - счётчиком по товару.
  trade_started: ['good', 'trades_buy'],
  trade_completed: ['good', 'trades_sell'],
  // Аудит 10.11, очередь 0: окна событий - по типу и по длине очереди в момент показа; сколько окон было в году
  // (гистограмма: {0: 12, 1: 20, 3: 4} - медиана и p90 считаются сразу); окна утраты - по родству.
  event_shown: [
    ['type', 'events_shown'],
    ['queue_len', 'event_queue'],
  ],
  year_windows: ['n', 'year_windows'],
  loss_shown: ['npc_role', 'losses'],
}

/** Пары [поле события, поле session_end] для счётчика. */
const aggOf = (event: string): [string, string][] | undefined => {
  const a = AGGREGATED[event]
  return a === undefined ? undefined : Array.isArray(a[0]) ? (a as [string, string][]) : [a as [string, string]]
}

/** Счётчики, накопленные с прошлого session_end (сбрасываются при выдаче). */
export function takeCounts(counts: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [key, c] of Object.entries(counts)) {
    const [event, field] = key.split('|')
    if (aggOf(event)?.some(([, f]) => f === field)) out[field] = { ...(out[field] ?? {}), ...c }
  }
  return out
}

/** Учесть событие-счётчик; false - событие не счётчик. */
export function countEvent(counts: Record<string, Record<string, number>>, event: string, params: Record<string, unknown>): boolean {
  const agg = aggOf(event)
  if (!agg) return false
  for (const [by, field] of agg) {
    const v = by ? String(params[by] ?? '') : ''
    const c = (counts[`${event}|${field}`] ??= {})
    c[v] = (c[v] ?? 0) + 1
  }
  return true
}
let counts: Record<string, Record<string, number>> = {}
/** session_end уже записан, а вкладка с тех пор не возвращалась (закрытие после ухода в фон - без второго session_end). */
let ended = false

function flush(beacon = false): void {
  if (!queue.length || !import.meta.env.PROD) return
  const batch = queue.splice(0, 50)
  const body = JSON.stringify({ events: batch })
  try {
    if (beacon && navigator.sendBeacon) {
      // Приёмник на другом домене (сборка для Яндекс Игр): браузер не шлёт beacon с типом application/json без CORS-проверки,
      // поэтому - простым текстом (приёмник читает тело как JSON при любом типе).
      navigator.sendBeacon(`${API}/events`, new Blob([body], { type: /^https?:/.test(API) ? 'text/plain' : 'application/json' }))
      return
    }
    fetch(`${API}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    // Приёмник недоступен - события пропадают, игра не страдает.
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
    // Установка на главный экран: Chrome присылает событие заранее - придерживаем его до кнопки «Добавить».
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      installEvent = e as InstallEvent
    })
    window.addEventListener('appinstalled', () => {
      installEvent = null
      webPlatform.track('install_done', {})
    })
    player = kvGet('thousands.player_id') ?? ''
    if (!player) {
      player = uuid()
      kvSet('thousands.player_id', player)
    }
    // Служебное устройство (R11 ТЗ удержания): ?internal=1 помечает, ?internal=0 снимает; все события идут с internal: 1,
    // приёмник не считает такого игрока в отчётах.
    const internal = new URLSearchParams(location.search).get('internal')
    if (internal === '1' || internal === '0') kvSet('thousands.internal', internal)
    if (kvGet('thousands.internal') === '1') context.internal = 1
    initMetrika()
    flags = await fetchFlags({ ...DEFAULT_FLAGS })
    webPlatform.flags = flags
    setInterval(() => flush(), 10000)
    document.addEventListener('visibilitychange', () => {
      // Сначала игра записывает session_end, затем очередь уходит через sendBeacon.
      if (document.visibilityState === 'visible') ended = false
      for (const h of pauseHandlers) h(document.visibilityState === 'hidden')
      if (document.visibilityState === 'hidden') flush(true)
    })
    // Закрытие вкладки без ухода в фон (часть браузеров): счётчики не должны пропасть.
    window.addEventListener('pagehide', () => {
      if (!ended) for (const h of pauseHandlers) h(true)
      flush(true)
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
    // Частые мелочи (вкладки, скорость) не пишутся строкой каждая: бесплатная D1 - 100 тысяч записей в сутки,
    // а их было почти треть всех событий. Копятся счётчиками и уходят одним полем в session_end.
    if (countEvent(counts, event, params)) return
    if (event === 'session_end') {
      params = { ...params, ...takeCounts(counts) }
      counts = {}
      ended = true
    }
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

  // «Жизнь дня» (worker/daily.ts): таблица дня, итог, ник. Без сети - null, игра идёт дальше без таблицы.
  async dailyBoard(date) {
    try {
      const res = await fetch(`${API}/daily?date=${encodeURIComponent(date)}&player=${encodeURIComponent(player)}`, { cache: 'no-store' })
      const data = res.ok ? ((await res.json()) as { ok?: boolean; board?: DailyBoard }) : null
      return data?.ok && data.board ? data.board : null
    } catch {
      return null
    }
  },

  async dailySubmit(result) {
    try {
      const res = await fetch(`${API}/daily/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...result, player_id: player }) })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; board?: DailyBoard } | null
      // 409 - итог за этот день уже записан: таблица всё равно приходит.
      return data?.board ?? null
    } catch {
      return null
    }
  },

  async setNick(nick, hidden) {
    try {
      const res = await fetch(`${API}/nick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player_id: player, nick, hidden }) })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      return data?.ok ? { ok: true } : { ok: false, error: data?.error ?? 'net' }
    } catch {
      return { ok: false, error: 'net' }
    }
  },

  async playersCount() {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(`${API}/players`, { signal: ctrl.signal })
      clearTimeout(timer)
      const data = res.ok ? ((await res.json()) as { n?: unknown }) : null
      return typeof data?.n === 'number' && data.n > 0 ? data.n : null
    } catch {
      return null
    }
  },

  flags,

  lang(): Lang {
    // Язык из адреса (/?lang=es - ссылки hreflang и превью на языке), иначе язык браузера.
    const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') ?? '' : ''
    if (['en', 'ru', 'tr', 'fr', 'es'].includes(fromUrl)) return fromUrl as Lang
    const l = typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : ''
    // Язык браузера: все пять языков игры; остальные - английский.
    return l.startsWith('ru') ? 'ru' : l.startsWith('tr') ? 'tr' : l.startsWith('es') ? 'es' : l.startsWith('fr') ? 'fr' : 'en'
  },

  ab: abBucket,
  installKind() {
    if (webPlatform.installed()) return null
    if (installEvent) return 'prompt'
    // На iPhone и iPad добавить на экран «Домой» умеет только Safari, и только вручную.
    const ua = navigator.userAgent
    return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(ua) ? 'ios' : null
  },
  installed() {
    return matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone
  },
  async install() {
    if (!installEvent) return false
    const e = installEvent
    installEvent = null
    await e.prompt()
    return (await e.userChoice).outcome === 'accepted'
  },
  playerId: () => player,
  bootId() {
    // Маяк boot из index.html кладёт id загрузки сюда (R4 ТЗ удержания).
    try {
      return sessionStorage.getItem('thousands.boot_id') ?? ''
    } catch {
      return ''
    }
  },
}
