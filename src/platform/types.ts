// Платформа: всё, что зависит от того, где запущена игра (сайт или Яндекс Игры).
// Код игры обращается к сохранениям, аналитике, шерингу, рекламе, флагам, языку и времени только через неё.
import type { Lang } from '../engine/types'

/** Удалённые настройки: на сайте — /flags.json, в Яндекс Играх — ysdk.getFlags(). */
export interface Flags {
  /** До какого возраста первая жизнь защищена от смерти. */
  first_life_min_age: number
  /** Секунд на год на скорости ×1: детство (0–5) и дальше. */
  year_sec_child: number
  year_sec: number
  /** Возрасты заставок глав. */
  chapter_ages: number[]
  /** Минимальный промежуток между полноэкранной рекламой, сек. */
  fullscreen_gap_sec: number
  /** Варианты A/B: имя → доля (сумма 1). */
  ab_buckets: Record<string, number>
  /** Редкость достижений: id → доля игроков. */
  ach_rarity: Record<string, number>
  /** Стиль портрета героя. */
  portrait_style: string
}

export const DEFAULT_FLAGS: Flags = {
  first_life_min_age: 20,
  year_sec_child: 8,
  year_sec: 15,
  chapter_ages: [16, 30, 45, 60],
  fullscreen_gap_sec: 180,
  ab_buckets: { a: 1 },
  ach_rarity: {},
  portrait_style: 'painting',
}

export type ShareResult = 'shared' | 'copied' | 'downloaded' | 'failed'

export interface SharePayload {
  text: string
  url?: string
  file?: File
  /** Только скопировать текст, без системного меню. */
  copyOnly?: boolean
}

export interface Platform {
  name: 'web' | 'yandex'
  /** Загрузить флаги, SDK, идентификатор игрока. Вызывается до отрисовки. */
  init(): Promise<void>
  /** Игра готова к игре (кнопка «Новая жизнь» активна). */
  ready(): void
  /** Время года пошло / остановилось (пауза, меню, итоги, реклама). */
  gameplayStart(): void
  gameplayStop(): void
  /** Платформа просит поставить игру на паузу или снять с неё. */
  onPause(cb: (paused: boolean) => void): void
  /** Долговременное хранилище (сохранение игры, мемориал, достижения). */
  save(key: string, value: unknown): Promise<void>
  load<T>(key: string): Promise<T | undefined>
  /** Маленькие настройки (язык, шрифт): синхронно. */
  kvGet(key: string): string | null
  kvSet(key: string, value: string): void
  /** Флаг на одну вкладку (например, «уже перезагружали»). */
  sessionFlag(key: string): boolean
  setSessionFlag(key: string): void
  track(event: string, params?: Record<string, unknown>): void
  /** Параметры посетителя в аналитике (lives_total, best_age…). */
  userParams(params: Record<string, unknown>): void
  /** Общие параметры всех событий (life_index, mode…). */
  setContext(params: Record<string, string | number>): void
  share(payload: SharePayload): Promise<ShareResult>
  /** Отправить отзыв игрока на свой приёмник; без сети — сохранить и дослать позже. */
  sendFeedback(data: Record<string, unknown>): Promise<void>
  showInterstitial(slot: string): Promise<boolean>
  showRewarded(slot: string): Promise<boolean>
  submitScore(board: string, score: number): Promise<void>
  serverTime(): Promise<number>
  flags: Flags
  /** Язык платформы (если игрок ещё не выбирал). */
  lang(): Lang
  /** Вариант A/B игрока. */
  ab(): string
  playerId(): string
}
