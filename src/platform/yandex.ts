// Платформа «Яндекс Игры» (SDK v2, /sdk.js подключается в index.html сборки build:yandex).
// Основа - сайт (webPlatform): сохранения на устройстве, флаги, своя аналитика (адрес приёмника - VITE_API_BASE,
// приёмник разрешает запросы с доменов Яндекса) и Метрика. Поверх - то, что требует Яндекс:
//   LoadingAPI.ready - игра загрузилась и готова; GameplayAPI start/stop - идёт жизнь героя / меню, итоги, реклама;
//   пауза по сигналам портала (game_api_pause/resume); реклама только через SDK; язык - из настроек Яндекса.
// Наружу не ведём (EXTERNAL = false): нет ссылок на сайт, соцсети, Boosty, формы отзывов и входа по почте.
// Облачных сохранений Яндекса пока нет: сохранения - на устройстве, как на сайте.
// Вне Яндекса (нет window.YaGames) SDK не вызывается, игра работает как обычная локальная.
import type { Lang } from '../engine/types'
import { webPlatform } from './web'
import type { Platform, SharePayload, ShareResult } from './types'

interface YaCallbacks {
  onOpen?(): void
  onClose?(wasShown?: boolean): void
  onError?(error: unknown): void
  onOffline?(): void
  onRewarded?(): void
}

interface YaSdk {
  environment?: { i18n?: { lang?: string } }
  features?: {
    LoadingAPI?: { ready(): void }
    GameplayAPI?: { start(): void; stop(): void }
  }
  adv: {
    showFullscreenAdv(opts: { callbacks: YaCallbacks }): void
    showRewardedVideo(opts: { callbacks: YaCallbacks }): void
  }
  on?(event: 'game_api_pause' | 'game_api_resume', cb: () => void): void
  serverTime?(): number
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YaSdk> }
  }
}

let sdk: YaSdk | null = null
let playing = false
let loaded = false
let adOpen = false
const pauseHandlers: ((paused: boolean) => void)[] = []
const pause = (paused: boolean) => pauseHandlers.forEach((h) => h(paused))

/** Вызов SDK, который не роняет игру: вне Яндекса или при ошибке SDK ничего не происходит. */
function call(run: (s: YaSdk) => unknown, label?: string): void {
  if (!sdk) return
  try {
    run(sdk)
    if (label) console.info('[Yandex SDK]', label)
  } catch (e) {
    if (label) console.warn('[Yandex SDK]', label, e)
  }
}

/** Языки Яндекса → языки игры: соседние с русским - русский, остальное без перевода - английский. */
export function mapYandexLang(l: string | undefined): Lang {
  const x = (l ?? '').toLowerCase()
  if (['ru', 'be', 'kk', 'uk', 'uz'].includes(x)) return 'ru'
  if (x === 'tr' || x === 'fr' || x === 'es') return x
  return 'en'
}

/** Реклама через SDK: на время показа игра на паузе и без звука; true - показали (за награду - досмотрели). */
function ad(kind: 'fullscreen' | 'rewarded'): Promise<boolean> {
  if (!sdk || adOpen) return Promise.resolve(false)
  const wasPlaying = playing
  return new Promise<boolean>((resolve) => {
    let rewarded = false
    let finished = false
    adOpen = true
    const done = (shown: boolean) => {
      if (finished) return
      finished = true
      adOpen = false
      pause(false)
      if (wasPlaying) yandexPlatform.gameplayStart()
      resolve(shown)
    }
    const open = () => {
      yandexPlatform.gameplayStop()
      pause(true)
    }
    try {
      if (kind === 'fullscreen')
        sdk!.adv.showFullscreenAdv({ callbacks: { onOpen: open, onClose: (shown) => done(!!shown), onError: () => done(false), onOffline: () => done(false) } })
      else sdk!.adv.showRewardedVideo({ callbacks: { onOpen: open, onRewarded: () => (rewarded = true), onClose: () => done(rewarded), onError: () => done(false) } })
    } catch {
      done(false)
    }
  })
}

export const yandexPlatform: Platform = {
  ...webPlatform,
  name: 'yandex',
  external: false,

  async init() {
    // Сначала SDK: язык и пауза приходят от Яндекса. Без SDK (открыто не на Яндексе) - как сайт.
    if (window.YaGames) {
      try {
        sdk = await window.YaGames.init()
      } catch {
        sdk = null
      }
    }
    // Мобильный портал: без лупы и меню выделения текста при долгом касании (style.css, html.portal).
    document.documentElement.classList.add('portal')
    await webPlatform.init()
    yandexPlatform.flags = webPlatform.flags
    call((s) => {
      s.on?.('game_api_pause', () => pause(true))
      s.on?.('game_api_resume', () => !adOpen && pause(false))
    })
  },

  ready() {
    if (loaded) return
    loaded = true
    call((s) => s.features?.LoadingAPI?.ready(), 'LoadingAPI.ready')
  },

  // Отметка «игра идёт» меняется только после вызова SDK: пара старт/стоп не сбивается.
  gameplayStart() {
    if (playing || !sdk) return
    playing = true
    call((s) => s.features?.GameplayAPI?.start(), 'GameplayAPI.start')
  },

  gameplayStop() {
    if (!playing || !sdk) return
    playing = false
    call((s) => s.features?.GameplayAPI?.stop(), 'GameplayAPI.stop')
  },

  onPause(cb) {
    pauseHandlers.push(cb)
    webPlatform.onPause(cb)
  },

  // Делиться - только текстом, без ссылки наружу.
  async share(payload: SharePayload): Promise<ShareResult> {
    try {
      await navigator.clipboard.writeText(payload.text)
      return 'copied'
    } catch {
      return 'failed'
    }
  },

  // Формы отзывов на свой приёмник на портале нет.
  async sendFeedback() {},

  showInterstitial: () => ad('fullscreen'),
  showRewarded: () => ad('rewarded'),

  async serverTime() {
    try {
      return sdk?.serverTime?.() ?? Date.now()
    } catch {
      return Date.now()
    }
  },

  // На портале игра живёт на его странице - на главный экран её не ставят.
  installKind: () => null,
  installed: () => false,
  install: async () => false,

  lang(): Lang {
    return sdk ? mapYandexLang(sdk.environment?.i18n?.lang) : webPlatform.lang()
  },
}
