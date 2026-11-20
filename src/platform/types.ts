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
  /** Детский год, в котором больше нет событий (пустой или все события уже прошли), сек. на ×1 (Р2 аудита 18.11: 6 → 3). */
  year_sec_child_quiet: number
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
  /** Сколько первых жизней уникальны: события прошлых жизней не повторяются, у каждой своё число детей; 0 - выключено. */
  unique_lives: number
  /** Ранняя детская игра (src/kids/early.ts): в каком возрасте героя (после 1–2 событий детства); 0 - выключена. */
  kids_age: number
  /** Доля игроков, у которых ранняя игра есть (A/B по своему хешу id игрока, не по ab_buckets); 1 - у всех. */
  kids_share: number
  /** Цель жизни (src/goal.ts, docs/TZ_goal.md): доля игроков с целью (свой хеш id); 0 - выключена. */
  goal_share: number
  /** Среди игроков с целью - доля тех, кто видит метки ▲▼ на вариантах (свой хеш). */
  goal_marks_share: number
  /** События, где есть вариант к цели, выпадают чаще во столько раз. */
  goal_weight: number
  /** Возраст, в котором можно один раз сменить цель (на экране-главе); 0 - нельзя. */
  goal_change_age: number
  /** С какой по счёту жизни можно жить без цели (четвёртая карточка). */
  goal_free_from: number
  /** Эксперимент X0 (ТЗ редизайна, правка 01): доля игроков, у которых первые три события жизни короткие (текст .short),
   *  без «Справки историка» и «Близких» (свой хеш id); 0 - у всех как было. */
  short_first_share: number
  /** Эксперимент XA (этап 2): доля игроков с новой раскладкой экрана жизни - компактная шапка и нижняя панель времени. */
  layout_share: number
  /** Эксперимент XC (10.11.2026): доля игроков с переломом сорокалетия (engine/crisis.ts), свой хеш id; 0 - выключен. */
  crisis_share: number
  /** Эксперимент XM (12.11.2026): доля игроков с новой музыкой (public/music/v2, src/goal.ts musicNew), свой хеш id;
   *  0 - у всех старая. По умолчанию 0: сборки порталов (CrazyGames, Яндекс) остаются со старой, сайт берёт долю из flags.json. */
  music_share: number
  /** Живописные сцены из слоёв (public/art, src/pixel/painted.ts): > 0 - есть у всех (по умолчанию, пиксельные - в настройках),
   *  0 - у всех пиксельные и переключателя нет. На порталах слоёв нет (не влезают в лимит), там всегда 0. */
  painted_share: number
  /** Эксперимент XT (аудит 18.11): доля новичков, у которых обучение идёт по шагу «по ходу жизни» (Tour drip), а не шестью
   *  карточками до первого выбора; свой хеш id, ?tour=wall|drip. 0 - у всех как было. */
  /** Эксперимент П4 (аудит 18.11): доля игроков с кнопкой «Другая судьба» в первый год первой жизни. */
  rebirth_share: number
  /** Эксперимент П2 (аудит 18.11): доля игроков с «тихой главной» - пока нет прожитой жизни, внизу меню только «Об игре». */
  home_quiet_share: number
  tour_drip_share: number
  /** Эксперимент XG (аудит 18.11): доля игроков, у которых цель жизни выбирается в goal_late_age лет, а не сразу после
   *  рождения; свой хеш id, ?goalat=0|6. У взрослого наследника цель - как раньше, сразу. */
  goal_late_share: number
  /** Возраст героя, в котором в рукаве XG мать загадывает желание (окно выбора цели). */
  goal_late_age: number
  /** Эксперимент XS (ТЗ удержания R9, 20.11): доля новичков, у которых барабан в меню запускается сам; свой хеш id,
   *  ?autospin=0|1. 0 - у всех как было. */
  auto_spin_share: number
  /** Эксперимент XR (ТЗ удержания R10): доля игроков с облегчённым знакомством с семьёй в первой жизни; ?reveal=lite|full. */
  reveal_lite_share: number
}

export const DEFAULT_FLAGS: Flags = {
  first_life_min_age: 20,
  protected_lives: 2,
  year_sec_child: 6,
  year_sec: 10,
  year_sec_child_quiet: 3,
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
  unique_lives: 10,
  kids_age: 2,
  kids_share: 1,
  // 08.11: цель у всех (жалобы игроков «цели нет» - это была контрольная группа 20%); 0.8 вернёт A/B.
  goal_share: 1,
  // Тесты закрыты 17.11 (решение владельца): метки ▲▼, короткие первые события и перелом - у всех, «вторая жизнь знатным» выключена.
  goal_marks_share: 1,
  goal_weight: 1.5,
  goal_change_age: 16,
  goal_free_from: 4,
  short_first_share: 1,
  layout_share: 1,
  crisis_share: 1,
  music_share: 0,
  // Живопись - у всех с 17.11; по умолчанию 1, чтобы до загрузки flags.json не мелькала пиксельная манера (П3 аудита 18.11).
  painted_share: 1,
  // XT и XG по умолчанию выключены (порталы - как было); сайт берёт доли из flags.json.
  rebirth_share: 0,
  home_quiet_share: 0,
  tour_drip_share: 0,
  goal_late_share: 0,
  goal_late_age: 6,
  // XS и XR (ТЗ удержания) по умолчанию выключены; включать на сайте через flags.json.
  auto_spin_share: 0,
  reveal_lite_share: 0,
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
  /** Id этой загрузки страницы из маяка boot (index.html, только свой сайт); без метода или '' - маяка не было. */
  bootId?(): string
  /** Игра на главном экране телефона: prompt - есть системное окно установки (Android, Chrome), ios - только подсказка
   *  «Поделиться → На экран „Домой“» (Safari), null - нельзя или уже установлена. */
  installKind(): 'prompt' | 'ios' | null
  /** Игра открыта с главного экрана (установлена как приложение). */
  installed(): boolean
  /** Показать системное окно установки; true - игрок согласился. */
  install(): Promise<boolean>
  /** Языки сборки (переключатель языка показывает только их); нет поля - все языки игры. */
  languages?: Lang[]
  /** События, которых в этой сборке нет (портал с возрастным рейтингом: CrazyGames - PEGI 12). */
  blockedEvents?: string[]
  /** Игрок портала (имя и аватар) или null - гость; без метода - у платформы нет аккаунтов. Подписка - вход посреди игры. */
  account?(): Promise<{ name: string; avatar?: string } | null>
  onAccount?(cb: (user: { name: string; avatar?: string } | null) => void): void
  /** У игрока блокировщик рекламы: реклама за награду недоступна (кнопку не показываем, только пояснение). */
  adsBlocked?(): boolean
}
