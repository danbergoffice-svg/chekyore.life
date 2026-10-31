// Платформа: всё, что зависит от того, где запущена игра (сайт, Яндекс Игры, CrazyGames).
// Код игры обращается к сохранениям, аналитике, шерингу, рекламе, флагам, языку и времени только через неё.
import type { Lang } from '../engine/types'

/** Удалённые настройки: на сайте - /flags.json, в Яндекс Играх - ysdk.getFlags(). */
export interface Flags {
  /** До какого возраста защищены первые жизни от смерти. */
  first_life_min_age: number
  /** Сколько первых жизней защищены (вместе с наследником, если он - одна из них). */
  protected_lives: number
  /** Секунд на год на скорости ×1: детство (0 … child_age лет) и дальше. */
  year_sec_child: number
  year_sec: number
  /** До какого возраста героя (включительно) год идёт в детском темпе year_sec_child. */
  child_age: number
  /** Возрасты заставок глав. */
  chapter_ages: number[]
  /** Минимальный промежуток между полноэкранной рекламой, сек. */
  fullscreen_gap_sec: number
  /** Варианты A/B: имя → доля (сумма 1). */
  ab_buckets: Record<string, number>
  /** Шанс сна о будущем в год (со второй жизни, 15–40 лет). */
  dream_chance: number
  /** В первой жизни сон приходит наверняка - в 15 лет … к этому возрасту; 0 - в первой жизни снов нет. */
  dream_first_by: number
  /** Пробный период: за отзыв после смерти игрок сам выбирает страну следующих жизней. */
  trial_country_pick: boolean
  /** Сколько раз можно перекрутить барабан после результата, пока не начата жизнь: 0 - нельзя, -1 - без ограничений. */
  respins: number
  /** Испытание после первой жизни: прожить следующую дольше стольких лет → награда «выбор судьбы»; 0 - выключено. */
  challenge_age: number
  /** Когда бесплатные перекрутки кончились - ещё за рекламу (на порталах с рекламой за награду, сейчас CrazyGames). */
  respin_ad: boolean
  /** Редкость достижений: id → доля игроков. */
  ach_rarity: Record<string, number>
  /** Стиль портрета героя. */
  portrait_style: string
  /** Сила стиля искусства страны на сценах 0–1 (палитра, фактура, контур). */
  art_strength: number
}

export const DEFAULT_FLAGS: Flags = {
  first_life_min_age: 20,
  protected_lives: 2,
  year_sec_child: 6,
  year_sec: 10,
  child_age: 12,
  chapter_ages: [16, 30, 45, 60],
  fullscreen_gap_sec: 180,
  ab_buckets: { a: 1 },
  dream_chance: 0.05,
  dream_first_by: 25,
  trial_country_pick: true,
  respins: 2,
  challenge_age: 30,
  respin_ad: true,
  ach_rarity: {},
  portrait_style: 'painting',
  art_strength: 0.5,
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
  name: 'web' | 'yandex' | 'crazygames'
  /** Можно ли выводить игрока и данные за пределы платформы: ссылки на сайт и соцсети, свой приёмник аналитики, отзывы. */
  external: boolean
  /** Загрузить флаги, SDK, идентификатор игрока. Вызывается до отрисовки. */
  init(): Promise<void>
  /** Игра готова к игре (кнопка «Новая жизнь» активна). */
  ready(): void
  /** Время года пошло / остановилось (пауза, меню, итоги, реклама). */
  gameplayStart(): void
  gameplayStop(): void
  /** Платформа просит поставить игру на паузу или снять с неё. */
  onPause(cb: (paused: boolean) => void): void
  /** Платформа разрешает или запрещает звук (настройка портала «без звука»). Нет метода - звук всегда разрешён. */
  onAudio?(cb: (allowed: boolean) => void): void
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
  /** Отправить отзыв игрока на свой приёмник; без сети - сохранить и дослать позже. */
  sendFeedback(data: Record<string, unknown>): Promise<void>
  showInterstitial(slot: string): Promise<boolean>
  showRewarded(slot: string): Promise<boolean>
  submitScore(board: string, score: number): Promise<void>
  serverTime(): Promise<number>
  /** Сколько всего игроков заходило в игру (свой приёмник); null - нет данных или платформе нельзя наружу. */
  playersCount(): Promise<number | null>
  flags: Flags
  /** Язык платформы (если игрок ещё не выбирал). */
  lang(): Lang
  /** Вариант A/B игрока. */
  ab(): string
  playerId(): string
  /** Игра на главном экране телефона: prompt - есть системное окно установки (Android, Chrome), ios - только подсказка
   *  «Поделиться → На экран „Домой“» (Safari), null - нельзя или уже установлена. */
  installKind(): 'prompt' | 'ios' | null
  /** Игра открыта с главного экрана (установлена как приложение). */
  installed(): boolean
  /** Показать системное окно установки; true - игрок согласился. */
  install(): Promise<boolean>
}
