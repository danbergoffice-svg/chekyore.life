// Платформа «CrazyGames» (SDK v3, подключается в index.html сборки build:crazygames).
// Всё остаётся внутри CrazyGames: нет Метрики, своего приёмника, ссылок на сайт и соцсети, формы отзывов.
// Статистику (запуски, загрузка, время в игре, удержание) CrazyGames собирает сам по сигналам SDK:
//   loadingStart/loadingStop — загрузка до главного меню;
//   gameplayStart/gameplayStop — идёт жизнь героя / меню, итоги, пауза, реклама;
//   happytime — праздничный момент (герой дожил до старости, род продолжился).
// Сохранения: на устройстве (IndexedDB) и копия в модуле data SDK — у вошедших в аккаунт она переезжает на другие устройства.
// Вне CrazyGames (environment 'disabled') SDK не вызывается, игра работает как обычная локальная.
import type { Lang } from '../engine/types'
import { fetchFlags, kvGet as localGet, kvSet as localSet, loadLocal, saveLocal, sessionFlag, setSessionFlag, uuid } from './local'
import { DEFAULT_FLAGS } from './types'
import type { Flags, Platform, SharePayload, ShareResult } from './types'

interface CrazySdk {
  init(): Promise<void>
  environment?: 'local' | 'crazygames' | 'disabled'
  game: {
    loadingStart(): void
    loadingStop(): void
    gameplayStart(): void
    gameplayStop(): void
    happytime(): void
    inviteLink(params: Record<string, string>): string | Promise<string>
    settings?: { muteAudio?: boolean }
    addSettingsChangeListener?(cb: (settings: { muteAudio?: boolean }) => void): void
  }
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: { adStarted(): void; adFinished(): void; adError(error: unknown): void }): void
  }
  data: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk }
  }
}

/** Облачная копия у CrazyGames ограничена 1 МБ на игрока: берём текущую жизнь и последние жизни мемориала, сколько влезет. */
const CLOUD_LIMIT = 900_000
const GAME_LIMIT = 500_000

let sdk: CrazySdk | null = null
let flags: Flags = { ...DEFAULT_FLAGS }
let player = ''
let playing = false
let loading = false
let pauseHandlers: ((paused: boolean) => void)[] = []

/**
 * Вызов SDK, который не роняет игру: вне CrazyGames или при ошибке SDK просто ничего не происходит.
 * label — имя сигнала для консоли (видно в QA Tool CrazyGames): «[CrazyGames SDK] gameplayStart».
 */
function call(run: (s: CrazySdk) => unknown, label?: string): void {
  if (!sdk) return
  try {
    const res = run(sdk)
    if (label) console.info('[CrazyGames SDK]', label)
    if (res && typeof (res as Promise<unknown>).catch === 'function') (res as Promise<unknown>).catch((e) => console.warn('[CrazyGames SDK]', label ?? '', e))
  } catch (e) {
    // SDK недоступен или модуль отключён при публикации.
    if (label) console.warn('[CrazyGames SDK]', label, e)
  }
}

function cloudGet(key: string): string | null {
  if (!sdk) return null
  try {
    return sdk.data.getItem(key)
  } catch {
    return null
  }
}

function cloudSet(key: string, value: string | null): void {
  call((s) => (value === null ? s.data.removeItem(key) : s.data.setItem(key, value)))
}

/** Копия в облако: текущая игра — если не слишком большая, мемориал — последние жизни в пределах остатка. */
const cloudSizes: Record<string, number> = {}
function mirror(key: string, value: unknown): void {
  if (!sdk || (key !== 'game' && key !== 'memorial')) return
  let json = JSON.stringify(value ?? null)
  if (key === 'game' && json.length > GAME_LIMIT) json = 'null'
  if (key === 'memorial' && Array.isArray(value)) {
    const budget = CLOUD_LIMIT - (cloudSizes.game ?? 0)
    let lives = value
    while (lives.length && json.length > budget) {
      lives = lives.slice(1)
      json = JSON.stringify(lives)
    }
  }
  cloudSizes[key] = json.length
  cloudSet(`thousands.${key}`, json)
}

function ad(type: 'midgame' | 'rewarded'): Promise<boolean> {
  if (!sdk || sdk.environment === 'disabled') return Promise.resolve(false)
  const wasPlaying = playing
  return new Promise<boolean>((resolve) => {
    let started = false
    // Если реклама не началась за 5 секунд — продолжаем без неё.
    const timer = setTimeout(() => !started && done(false), 5000)
    const done = (shown: boolean) => {
      clearTimeout(timer)
      for (const h of pauseHandlers) h(false)
      if (wasPlaying) crazyPlatform.gameplayStart()
      resolve(shown)
    }
    try {
      sdk!.ad.requestAd(type, {
        adStarted() {
          started = true
          crazyPlatform.gameplayStop()
          for (const h of pauseHandlers) h(true)
        },
        adFinished: () => done(true),
        adError: () => done(false),
      })
    } catch {
      done(false)
    }
  })
}

export const crazyPlatform: Platform = {
  name: 'crazygames',
  external: false,

  async init() {
    const s = window.CrazyGames?.SDK
    if (s) {
      try {
        await s.init()
        if (s.environment !== 'disabled') sdk = s
      } catch {
        sdk = null
      }
    }
    if (sdk) {
      loading = true
      call((s) => s.game.loadingStart(), 'loadingStart')
    }
    player = crazyPlatform.kvGet('thousands.player_id') ?? ''
    if (!player) {
      player = uuid()
      crazyPlatform.kvSet('thousands.player_id', player)
    }
    flags = await fetchFlags({ ...DEFAULT_FLAGS })
    crazyPlatform.flags = flags
    document.addEventListener('visibilitychange', () => {
      for (const h of pauseHandlers) h(document.visibilityState === 'hidden')
    })
  },

  ready() {
    if (!loading) return
    loading = false
    call((s) => s.game.loadingStop(), 'loadingStop')
  },

  gameplayStart() {
    if (playing) return
    playing = true
    call((s) => s.game.gameplayStart(), 'gameplayStart')
  },

  gameplayStop() {
    if (!playing) return
    playing = false
    call((s) => s.game.gameplayStop(), 'gameplayStop')
  },

  onPause(cb) {
    pauseHandlers.push(cb)
  },

  // Настройка портала «без звука»: сразу и при каждом изменении.
  onAudio(cb) {
    if (!sdk) return
    call((s) => {
      cb(!s.game.settings?.muteAudio)
      s.game.addSettingsChangeListener?.((settings) => cb(!settings?.muteAudio))
    })
  },

  async save(key, value) {
    await saveLocal(key, value)
    mirror(key, value)
  },

  async load<T>(key: string) {
    const local = await loadLocal<T>(key)
    if (local !== undefined && local !== null) return local
    // На новом устройстве — облачная копия CrazyGames.
    const raw = cloudGet(`thousands.${key}`)
    try {
      return raw ? (JSON.parse(raw) as T) : local
    } catch {
      return local
    }
  },

  kvGet(key) {
    return cloudGet(key) ?? localGet(key)
  },

  kvSet(key, value) {
    localSet(key, value)
    cloudSet(key, value)
  },

  sessionFlag,
  setSessionFlag,

  // Свою аналитику не ведём: только сигналы SDK.
  track(event, params = {}) {
    if (event === 'life_end' && Number(params.age) >= 60) call((s) => s.game.happytime(), 'happytime')
    if (event === 'heir_chosen') call((s) => s.game.happytime(), 'happytime')
  },
  userParams() {},
  setContext() {},

  async share(payload: SharePayload): Promise<ShareResult> {
    // Ссылка-приглашение ведёт на страницу игры на CrazyGames, а не на внешний сайт.
    let link = ''
    if (sdk) {
      try {
        link = await sdk.game.inviteLink({ from: 'share' })
      } catch {
        link = ''
      }
    }
    try {
      await navigator.clipboard.writeText(link && !payload.copyOnly ? `${payload.text} ${link}` : payload.text)
      return 'copied'
    } catch {
      return 'failed'
    }
  },

  async sendFeedback() {},

  showInterstitial: () => ad('midgame'),
  showRewarded: () => ad('rewarded'),

  async submitScore(board, score) {
    const key = `thousands.best.${board}`
    if (score > Number(crazyPlatform.kvGet(key) ?? 0)) crazyPlatform.kvSet(key, String(score))
  },

  async serverTime() {
    return Date.now()
  },

  flags,

  // На CrazyGames игра всегда начинается на английском; русский игрок выбирает сам (RU в меню или настройках).
  lang(): Lang {
    return 'en'
  },

  ab: () => 'a',
  playerId: () => player,
}
