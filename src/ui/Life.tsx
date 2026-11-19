import { mourning, mourningLeft } from '../engine/emotions'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  availableFocuses,
  rerollNames,
  careerOptions,
  changeCareer,
  CHANGE_EVERY,
  novice,
  choiceAvailable,
  lockReason,
  currentEvent,
  eventChoices,
  eventParams,
  eventTextKey,
  expectedAge,
  lifestyleDefs,
  lifestyleOption,
  riskChance,
  stageOf,
} from '../engine/game'
import { checkAll, contextParams, maritalStatus, npcAge, regionOf, roleKey, scaledMoney, statusOf } from '../engine/rules'
import { isPet } from '../engine/pets'
import { rentPerMonth } from '../engine/household'
import { estatePrice } from '../engine/estate'
import LONGEVITY from '../content/longevity.json'
import { ATTRIBUTES } from '../engine/types'
import type { ChoiceDef, DiaryEntry, EraDef, Effect, FocusDef, GameState, Hero, Lang, Npc, SceneTime } from '../engine/types'
import type { AvatarInput } from '../pixel/avatar'
import { lifeMarks } from '../pixel/avatar'
import { formatMoney, formatYear, hasKey, nameOf, variantKey } from '../i18n'
import type { T } from '../i18n'
import { platform } from '../platform'
import { lifeStats, lossRoleOf, trackEventShown, trackLossShown } from '../telemetry'
import { isLossCard } from '../engine/illness'
import { Scene } from '../pixel/SceneView'
import { Illustration } from '../pixel/Illustration'
import { momentOf } from '../pixel/illustrations'
import { moodFor, weatherFor } from '../pixel/season'
import { Avatar } from '../pixel/AvatarView'
import { eventCast, eventRoles, familyCast } from './cast'
import { DreamModal } from './Dream'
import type { DreamResult } from './Dream'
import { entryScene } from './Summary'
import { attitudeText, diaryText, feelings, useUi } from './text'
import type { Change } from './text'
import { Icon, IconText } from './Icon'
import { EarlyGame } from '../kids/EarlyGame'
import { Children } from './Children'
import { Arms, houseName } from './Arms'
import { familyGoalProgress } from '../engine/dynasty'
import { Estate } from './Estate'
import { Trade } from './Trade'
import { GOAL_STEPS, goalMark, professionClosesGoal } from '../engine/goals'
import type { GoalId } from '../engine/goals'
import type { GoalGroup } from '../goal'
import { goalDue as isGoalDue } from '../goal'
import { GoalBar, GoalPick } from './GoalPick'
import { HudHeader, MilestoneChip, TimeBar } from './LifeHud'
import { Tour, TOUR } from './Tour'
import { DiceGame } from './DiceGame'
import { CrisisBoard } from './CrisisBoard'
import type { StanceId } from '../engine/crisis'
import { diceStakes } from '../engine/dice'
import type { DiceResult } from '../engine/dice'
import type { GoalChoice } from './GoalPick'
import { earlySeed, kidsOn, SEEN_KEY } from '../kids/early'
import type { EarlyResult } from '../kids/early'
import { faceOf } from '../engine/life'

type Tab = 'life' | 'hero' | 'people' | 'diary'

/** Записи от новых лет к старым, но внутри года - по порядку: «заболел» выше «умер», а не наоборот. */
function yearsBackward<T extends readonly [{ year: number }, number]>(list: T[]): T[] {
  return [...list].sort((a, b) => b[0].year - a[0].year || a[1] - b[1])
}

/**
 * Длительность года на скорости ×1. Стандартная - из флагов (в детстве, до child_age лет, короче).
 * Если игрок выбрал свою (до минуты), детство удлиняется в той же пропорции.
 */
function yearMs(age: number, custom?: number, quiet = false): number {
  const f = platform.flags
  const adult = custom ?? f.year_sec
  if (age > f.child_age) return adult * 1000
  // Детский год без событий впереди - быстрее (Р2 аудита 18.11): пустые паузы детства были главной скукой первых минут.
  const child = quiet ? Math.min(f.year_sec_child_quiet ?? f.year_sec_child, f.year_sec_child) : f.year_sec_child
  return ((adult * child) / f.year_sec) * 1000
}
const TICK_MS = 100
/** Выборы события костей, которые открывают стол с мини-игрой. */
const DICE_TABLE = ['play', 'road']

/**
 * Кнопки выбора события включаются через полторы секунды (пакет 1, 06.11): игроки случайно нажимали в событие,
 * которое всплыло в ту же секунду, когда они переключали фокус года. Без задержки - в тестах, под автоматом
 * (navigator.webdriver, скрипты tools/qa) и с ?delay=0.
 */
const CHOICE_DELAY = (() => {
  if (import.meta.env?.MODE === 'test') return 0
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 0
  if (typeof location !== 'undefined' && /[?&]delay=0\b/.test(location.search)) return 0
  return 1500
})()
/** Порядок подсказок: раньше - важнее. */
const HINT_ORDER = ['speed', 'year_len', 'focus', 'hero', 'tab_life']
export const SPEEDS = [0, 0.5, 1, 2, 4, 10] as const
export type Speed = (typeof SPEEDS)[number]

interface LifeProps {
  /** Пропустить детство: годы до 13 проходят сами (кнопка в шапке). */
  onSkipChildhood?: () => void
  /** «Другая судьба» (П4): пока герой младенец (до 2 лет) в первой жизни - один раз к барабану. */
  onRebirth?: () => void
  state: GameState
  era: EraDef
  onStart: (focus: string | null) => void
  onFinish: () => void
  /** ms - сколько окно события было открыто до выбора (аналитика). */
  onChoose: (choiceId: string | null, ms?: number) => void
  onDismiss: () => void
  onLifestyle: (category: string, option: string) => void
  /** Воспитание и учёба детей поменялись: сохранить и перерисовать. */
  onFamily?: () => void
  /** На чужбине: «Задумать возвращение». */
  onPlanReturn?: () => void
  onMenu: () => void
  /** Поверх жизни открыто меню-лист: время стоит. */
  frozen?: boolean
  /** Эксперимент X0: первые три события жизни - короткий текст, без справки и «Близких». */
  shortFirst?: boolean
  /** Эксперимент XA: 'b' - компактная шапка, веха и нижняя панель времени (макет 06). */
  layout?: 'a' | 'b'
  /** Кости: партия сыграна - записать сразу. */
  onDiceGame?: (r: DiceResult) => void
  /** Перелом: шар брошен - сохранить игру (исход уже выбран движком). */
  onCrisisSave?: () => void
  /** Меняется - открыть обучение заново («Как играть» в меню). */
  tourNonce?: number
  /** Рукав XT (аудит 18.11): обучение по одному шагу по ходу жизни, а не шесть карточек до первого выбора. */
  tourDrip?: boolean
  /** Открыть настройки из жизни («Назад» вернёт в жизнь). */
  onSettings?: () => void
  choiceChanges: Change[]
  yearChanges: Change[]
  /** Своя длительность года из настроек (секунды); не задана - стандартная. */
  yearSec?: number
  /** Кнопка музыки. */
  sound?: preact.ComponentChildren
  /** Ранняя детская игра сыграна (src/kids/early.ts): прибавка, запись, отметка в жизни. */
  onKids?: (r: EarlyResult) => void
  /** Цель жизни (docs/TZ_goal.md): группа A/B игрока и выбор/смена цели. */
  goal?: { group: GoalGroup; fromAge?: number; onPick: (c: GoalChoice, change: boolean) => void }
  /** Сон о будущем: ответы, подсказка, «Проснуться», закрыть итог. */
  dream?: { result: DreamResult | null; onAnswer: (value: unknown) => void; onHint: () => void; onWake: () => void; onClose: () => void }
  /** Строка вестей под шапкой (отзыв владельца 10.11: всплывающие плашки закрывали панель управления). false - скрыта. */
  notices?: boolean
  onNotices?: (on: boolean) => void
  /** Весть от игры (награда, дар): в строке вестей вместо всплывающей плашки. */
  notice?: { id: string; text: preact.ComponentChildren; onClose: () => void } | null
}

/** Какие вести показывать плашкой (вид - для «не показывать такое в этой жизни»). */
function plaqueKind(key: string): string | null {
  if (key.startsWith('diary.death_')) return 'death'
  if (key === 'diary.child_married' || key.startsWith('diary.match_')) return 'wedding'
  if (key.startsWith('diary.grandchild_born') || key.startsWith('diary.great_grandchild_born')) return 'grandchild'
  if (key === 'diary.expecting' || key === 'diary.expecting_self') return 'expecting'
  if (key.startsWith('diary.edu_done') || key === 'diary.edu_refused') return 'school'
  return null
}

/** Видна ли запись дневника: записи текущего года появляются по ходу года. */
function visible(state: GameState, index: number, entry: DiaryEntry, progress: number): boolean {
  if (state.phase !== 'running' || entry.year !== state.year) return true
  const at = state.reveal[index]
  return at === undefined || at <= progress
}

export function Life({ onSkipChildhood, onRebirth, state, era, onStart, onFinish, onChoose, onDismiss, onLifestyle, onFamily, onPlanReturn, onMenu, frozen, shortFirst, layout, tourNonce, tourDrip, onDiceGame, onCrisisSave, onSettings, choiceChanges, yearChanges, yearSec, sound, onKids, goal, dream, notices = true, onNotices, notice }: LifeProps) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const coin = regionOf(era, hero.region).coin
  const [tab, setTab] = useState<Tab>('life')
  const focuses = availableFocuses(state, era)
  const [focus, setFocus] = useState<string | null>(state.lastFocus)
  const selected = focuses.find((f) => f.id === focus)?.id ?? focuses.find((f) => f.id === 'work')?.id ?? focuses[0]?.id ?? null
  const [speed, setSpeed] = useState<Speed>(1)
  // Вкладка «Герой» ставит паузу (жалобы 19.11: пока настраиваешь хозяйство, выскакивают события года).
  // Скорость до паузы - здесь; вернулся на другую вкладку - время идёт как шло. Игрок сам тронул скорость - не вмешиваемся.
  const autoPaused = useRef<Speed | null>(null)
  const changeSpeed = (s: Speed) => {
    autoPaused.current = null
    setSpeed(s)
  }
  const openTab = (id: Tab) => {
    if (id === 'hero' && tab !== 'hero' && speed > 0) {
      autoPaused.current = speed
      setSpeed(0)
    } else if (id !== 'hero' && autoPaused.current !== null) {
      setSpeed(autoPaused.current)
      autoPaused.current = null
    }
    setTab(id)
  }
  const [focusOpen, setFocusOpen] = useState(false)
  // Одноразовые подсказки (ТЗ P3): не ставят игру на паузу, закрываются касанием.
  const [hints, setHints] = useState<string[]>(() => (platform.kvGet('thousands.hints') ?? '').split(',').filter(Boolean))
  const [lifeSec, setLifeSec] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setLifeSec((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  // Пока идёт обучение, подсказок нет.
  const tourOn = useRef(false)
  // Подсказки по одной (правка 10): из ожидающих показывается только первая, следующая - после «Понятно».
  const hintWhen: Record<string, boolean> = {}
  const hintFor = (id: string, when: boolean) => {
    hintWhen[id] = when && !hints.includes(id)
    return !tourOn.current && hintWhen[id] && HINT_ORDER.find((h) => hintWhen[h] ?? hintDue(h)) === id
  }
  const hintDue = (id: string) =>
    !hints.includes(id) &&
    (id === 'hero' ? hero.age >= 12 && tab === 'life' : id === 'speed' ? tab === 'life' && lifeSec >= 3 && hero.age < 2 : id === 'year_len' ? tab === 'life' && hero.age >= 2 && hero.age <= 6 : id === 'focus' ? hero.age >= 5 : id === 'tab_life' ? tab === 'life' && hero.age >= 3 : false)
  // Подсказки вкладок (просьба владельца 10.11): при первом открытии вкладки - что здесь за что отвечает; ✕ - навсегда.
  const tabHint = (id: string) => !tourOn.current && !hints.includes(id)
  const closeHint = (id: string) => {
    const next = [...hints, id]
    setHints(next)
    platform.kvSet('thousands.hints', next.join(','))
  }
  const [progress, setProgress] = useState(0)

  const next = state.queue[0]
  // Экран-глава в 16, 30, 45, 60 лет (флаг chapter_ages): год не начинается, пока игрок не нажмёт «Дальше».
  const [, bump] = useState(0)
  // Пока показывается реклама после главы, время стоит.
  const [adOpen, setAdOpen] = useState(false)
  const chapterDue = state.phase === 'year' && platform.flags.chapter_ages.includes(hero.age) && !(lifeStats(state).chapters ?? []).includes(hero.age)
  const closeChapter = () => {
    const s = lifeStats(state)
    s.chapters = [...(s.chapters ?? []), hero.age]
    platform.track('chapter_seen', { age: hero.age })
    setAdOpen(true)
    platform.showInterstitial('F2').finally(() => {
      setAdOpen(false)
      bump((x) => x + 1)
    })
  }
  // Ранняя детская игра: раз за жизнь в kids_age лет (после 1–2 событий детства), у доли kids_share игроков.
  const f = platform.flags
  const kidsDue = !!onKids && state.phase === 'year' && f.kids_age > 0 && hero.age === f.kids_age && !lifeStats(state).kids && kidsOn(platform.playerId(), f)
  // Цель жизни: перед первым годом (после лотереи; у наследника - в начале его жизни; в старом сохранении - сразу), один раз за жизнь.
  // В рукаве XG - не раньше goal.fromAge лет: мать загадывает желание, когда игрок уже прожил с героем детство.
  const goalDue = !!goal && isGoalDue(state, goal.group, goal.fromAge ?? 0)
  const [changing, setChanging] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  // Новый шаг к цели - строка на три секунды (и событие аналитики); шаги, сделанные до выбора цели, не объявляются.
  const [goalToast, setGoalToast] = useState<string | null>(null)
  const goalDone = hero.goal?.steps.length ?? 0
  useEffect(() => {
    const s = lifeStats(state)
    const g = hero.goal
    if (!g || goalDone <= (s.goalSeen ?? 0)) return
    for (let n = (s.goalSeen ?? 0) + 1; n <= goalDone; n++) platform.track('goal_step', { goal: g.id, step: n, age: g.steps[n - 1] })
    s.goalSeen = goalDone
    const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
    setGoalToast(goalDone >= GOAL_STEPS ? t('goal.toast_done', { goal: t(`goal.${g.id}.title`, {}, o) }, o) : t('goal.toast', { step: t(`goal.${g.id}.step.${goalDone}`, {}, o) }, o))
    const id = setTimeout(() => setGoalToast(null), 3500)
    return () => clearTimeout(id)
  }, [goalDone, hero.goal?.id])
  const modalOpen = (state.phase === 'running' && !!next && progress >= next.at) || chapterDue || adOpen || kidsDue || goalDue
  // Смерть близкого (отец, мать, супруг, ребёнок) - отдельная карточка, время стоит, пока её не закроют: в ленте её легко
  // пролистать. Старые сохранения не показывают прошлые утраты: отсчёт - с записи, на которой открыли жизнь.
  const ls = lifeStats(state)
  if (ls.lossSeen === undefined) ls.lossSeen = hero.diary.length
  const lossAt = hero.alive && !modalOpen ? hero.diary.findIndex((d, i) => i >= (ls.lossSeen ?? 0) && isLossCard(d) && visible(state, i, d, progress)) : -1
  const loss = lossAt >= 0 ? hero.diary[lossAt] : null
  // Родство для аналитики: у обычной записи о смерти (diary.death_father…) параметра role нет - берём из ключа (A-01, 16.11).
  const lossRole = loss ? lossRoleOf(loss) : ''
  useEffect(() => {
    if (loss) trackLossShown(lossRole || 'other')
  }, [lossAt])
  const closeLoss = () => {
    ls.lossSeen = lossAt + 1
    bump((x) => x + 1)
  }
  // Обучение: один раз в первой жизни, после выбора цели и без открытых окон; из меню - заново.
  const [tour, setTour] = useState(false)
  useEffect(() => {
    if (tourNonce) setTour(true)
  }, [tourNonce])
  const firstLife = (state.settings.livesBefore ?? 0) === 0
  const tourDue = !tourDrip && !tour && firstLife && !platform.kvGet('thousands.tour') && !modalOpen && !loss && !goalDue && hero.alive
  useEffect(() => {
    if (tourDue) setTour(true)
  }, [tourDue])
  // Обучение по ходу жизни (рукав XT): те же шаги, но по одному - когда элемент впервые нужен, и не больше шага за игровой год.
  // Пройденные шаги - в thousands.tour.drip: «speed:0,skip:1» (шаг:возраст героя). Подсказки о скорости и о герое, уже
  // закрытые игроком, считаются пройденными.
  const dripSeen = (platform.kvGet('thousands.tour.drip') ?? '').split(',').filter(Boolean).map((x) => x.split(':'))
  const dripDone = (key: string) => dripSeen.some(([k]) => k === key) || ((key === 'speed' || key === 'hero') && hints.includes(key))
  const choicesMade = lifeStats(state).choices
  const dripWhen: Record<string, boolean> = { speed: choicesMade >= 1, skip: choicesMade >= 2, hero: hero.age >= 3, tabs: hero.age >= 5, goal: !!hero.goal, menu: hero.age >= 8 }
  const [drip, setDrip] = useState<string | null>(null)
  const dripDue =
    tourDrip && !tour && !drip && firstLife && !platform.kvGet('thousands.tour') && !modalOpen && !loss && !goalDue && hero.alive && !dripSeen.some(([, a]) => Number(a) === hero.age)
      ? (TOUR.find((s) => !dripDone(s.key) && dripWhen[s.key])?.key ?? null)
      : null
  useEffect(() => {
    if (dripDue) setDrip(dripDue)
  }, [dripDue])
  const endDrip = (_step: number, skipped: boolean) => {
    if (!drip) return
    const seen = [...dripSeen.map((p) => p.join(':')), `${drip}:${hero.age}`]
    platform.kvSet('thousands.tour.drip', seen.join(','))
    platform.track('tour_step', { key: drip, age: hero.age, skipped: skipped ? 1 : 0 })
    if (drip === 'speed' || drip === 'hero') closeHint(drip)
    if (TOUR.every((s) => s.key === drip || dripDone(s.key))) {
      platform.kvSet('thousands.tour', '1')
      platform.track('tour_end', { step: TOUR.length, skipped: 0, mode: 'drip' })
    }
    setDrip(null)
  }
  const endTour = (step: number, skipped: boolean) => {
    setTour(false)
    platform.kvSet('thousands.tour', '1')
    platform.track('tour_end', { step: step + 1, skipped: skipped ? 1 : 0 })
    // Подсказки о скорости и о герое обучение уже показало.
    const next = [...new Set([...hints, 'speed', 'hero'])]
    setHints(next)
    platform.kvSet('thousands.hints', next.join(','))
  }
  const hold = modalOpen || !!loss || tour || !!drip
  tourOn.current = tour || tourDue || !!drip
  // Сигналы платформе: игра идёт, пока время не на паузе или открыто решение события; экран-глава (с рекламой),
  // пауза без решения и уход с экрана жизни - остановка.
  const playing = (speed > 0 || hold) && !chapterDue && !adOpen && !frozen && state.phase !== 'dead'
  useEffect(() => {
    if (playing) platform.gameplayStart()
    else platform.gameplayStop()
  }, [playing])
  useEffect(() => () => platform.gameplayStop(), [])

  // Часы года. Ссылки на свежие значения, чтобы таймер не держал устаревшие.
  const live = useRef({ state, progress, speed, hold, selected, onStart, onFinish, yearSec, frozen })
  live.current = { state, progress, speed, hold, selected, onStart, onFinish, yearSec, frozen }
  useEffect(() => {
    const id = setInterval(() => {
      const c = live.current
      if (!c.speed || c.hold || c.frozen || c.state.phase === 'dead') return
      if (c.state.phase === 'year') {
        setProgress(0)
        c.onStart(c.selected)
        return
      }
      const ev = c.state.queue[0]
      const np = c.progress + (TICK_MS * c.speed) / yearMs(c.state.hero.age, c.yearSec, !ev)
      if (ev && np >= ev.at) setProgress(ev.at)
      else if (np >= 1 && !ev) {
        setProgress(0)
        c.onFinish()
      } else setProgress(Math.min(np, 1))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  /** Перемотать к следующему событию или к концу года. */
  const skip = () => {
    platform.track('next_event_click', {})
    if (state.phase === 'year') return onStart(selected)
    if (next) setProgress(next.at)
    else {
      setProgress(0)
      onFinish()
    }
  }

  // Дневник: только важное; раскрытые записи - полный текст события и чем кончился выбор.
  const [onlyMajor, setOnlyMajor] = useState(false)
  // Вести мира за годы жизни героя - отдельным списком по кнопке (отзыв 04.11), с первого года, а не с шести лет.
  const [worldOpen, setWorldOpen] = useState(false)
  const worldNews = era.news.filter((n) => n.year >= hero.birthYear && n.year <= state.year && !n.exclude_regions?.includes(hero.region)).sort((a, b) => b.year - a.year)
  const [openRows, setOpenRows] = useState<number[]>([])
  const fullText = (d: DiaryEntry): string[] | null => {
    const v = typeof d.params?.v === 'number' ? d.params.v : undefined
    const opts = { sex: hero.sex, region: d.reg ?? hero.region, religion: d.rel ?? hero.religion }
    const params = { ...contextParams(opts.region, opts.religion, d.year), ...d.params }
    const textKey = variantKey(lang, `ev.${d.eventId}.text`, v)
    if (!hasKey(lang, textKey)) return null
    const out = [t(textKey, params, opts)]
    const choice = d.params?.choice
    const result = d.params?.result
    if (choice && typeof choice === 'object' && 'key' in choice && typeof result === 'string') {
      const rk = variantKey(lang, `${choice.key}.${result}`, v)
      if (hasKey(lang, rk)) out.push(t(rk, params, opts))
    }
    return out
  }
  const stage = stageOf(state, era)
  const entries = hero.diary.map((d, i) => [d, i] as const).filter(([d, i]) => visible(state, i, d, progress) && !d.key.startsWith('diary.stage_'))
  // В ленте - справки только последнего года с ними, прошлые остаются во вкладке «Дневник».
  const primerYear = Math.max(-Infinity, ...entries.filter(([d]) => d.primer).map(([d]) => d.year))
  const feed = yearsBackward(entries.filter(([d]) => !d.primer || d.year === primerYear).slice(-14))
  // Плашка семейной вести: заметно, на несколько секунд, без остановки времени; «не показывать такое в этой жизни»
  // (отзыв игрока 08.11: свадьбы детей, внуки и смерть сестры терялись в ленте).
  const seenUpTo = useRef(hero.diary.length)
  const [plaque, setPlaque] = useState<{ index: number; kind: string } | null>(null)
  const lastVisible = entries.length ? entries[entries.length - 1][1] : -1
  useEffect(() => {
    if (lastVisible < seenUpTo.current) return
    const muted = state.plaqueMuted ?? []
    let found: { index: number; kind: string } | null = null
    for (const [d, i] of entries) {
      if (i < seenUpTo.current) continue
      const kind = plaqueKind(d.key)
      if (kind && !muted.includes(kind)) found = { index: i, kind }
    }
    seenUpTo.current = lastVisible + 1
    if (!found) return
    setPlaque(found)
  }, [lastVisible])
  // Плашка висит 5 секунд, пока не открыто окно события (под окном её не видно - ждёт).
  useEffect(() => {
    if (!plaque || modalOpen) return
    const id = setTimeout(() => setPlaque(null), 5000)
    return () => clearTimeout(id)
  }, [plaque, modalOpen])
  // Вверху - дом героя: семья, животные и дом нужного размера; если в этом году случилось бедствие, оно видно на доме.
  const disaster = [...entries]
    .reverse()
    .map(([d]) => (d.year === state.year && d.eventId ? entryScene(d, era).disaster : undefined))
    .find(Boolean)
  const TIMES = ['day', 'dawn', 'day', 'sunset', 'overcast'] as const
  const yearTime: SceneTime = disaster === 'fire' ? 'night' : TIMES[Math.abs(state.year) % TIMES.length]
  const yearScene = { place: 'yard' as const, time: yearTime, props: [yearTime === 'night' ? ('moon' as const) : ('sun' as const)], disaster }
  void stage
  // Время года на картинке двора идёт вместе с полоской года.
  const season = state.phase === 'running' ? progress : 0
  const kids = hero.npcs.filter((n) => n.role === 'child' && n.alive)
  const heroName = nameOf(hero.name, lang)
  const b = layout === 'b'

  const plaqueEntry = plaque ? hero.diary[plaque.index] : undefined
  // Строка вестей: что сейчас свежего - весть игры (награда), шаг к цели, семейная весть. Пока свежих нет, видна
  // последняя (бледнее): строка не прыгает и не закрывает ни вкладки, ни скорость, ни окно события.
  const fresh: { id: string; text: preact.ComponentChildren; mute?: () => void; close?: () => void } | null = notice
    ? { id: `n:${notice.id}`, text: notice.text, close: notice.onClose }
    : goalToast
      ? { id: `g:${goalToast}`, text: goalToast, close: () => setGoalToast(null) }
      : plaqueEntry
        ? {
            id: `p:${plaque!.index}`,
            text: diaryText(t, plaqueEntry, hero.sex, hero.region, hero.religion, lang),
            close: () => setPlaque(null),
            mute: () => {
              state.plaqueMuted = [...(state.plaqueMuted ?? []), plaque!.kind]
              setPlaque(null)
              onFamily?.()
            },
          }
        : null
  const [lastNotice, setLastNotice] = useState<preact.ComponentChildren>(null)
  useEffect(() => {
    if (fresh) setLastNotice(fresh.text)
  }, [fresh?.id])
  // Пустую полосу-заглушку не показываем (Р3 аудита 18.11): строка появляется с первой вестью и дальше не прячется.
  const noticeBar = notices && (fresh || lastNotice) && (
    <div class={`notice-bar ${fresh ? 'fresh' : ''}`} role="status" aria-live="polite">
      <span class="notice-text" onClick={fresh?.close}>
        {fresh?.text ?? lastNotice}
      </span>
      {fresh?.mute && (
        <button type="button" class="link small notice-mute" onClick={fresh.mute} title={t('plaque.mute')}>
          {t('notice.mute')}
        </button>
      )}
      <button type="button" class="notice-x" onClick={() => onNotices?.(false)} aria-label={t('notice.hide')} title={t('notice.hide')}>
        ✕
      </button>
    </div>
  )
  return (
    <div class={b ? 'life layout-b' : 'life'}>
      {b ? (
        <HudHeader state={state} coin={coin} look={heroLook(hero)} onMenu={onMenu} onSkipChildhood={firstLife && hero.age < 3 ? undefined : onSkipChildhood} onRebirth={hero.age < 2 ? onRebirth : undefined} details={
          <>
            <p class="hero-meta">
              {t(`region.${hero.region}`)} · {hero.profession ? t(`prof.${hero.profession}`, {}, o) : t('life.no_profession')}
              {hero.band !== undefined && hero.age >= era.stages.youth && <span title={t('band.tip', { n: statusOf(hero, era) })}> · {t(`band.${hero.band}`)}</span>}
            </p>
            {mourning(hero) && <p class="hero-meta small warn grief-left">{t('life.grief_left', { n: Math.max(1, mourningLeft(state)) }, o)}</p>}
            {hero.age >= 12 && <p class="hero-meta small">{t('life.expected', { n: expectedAge(state, era) })}</p>}
            {state.offChronicle !== undefined && <p class="hero-meta small muted">{t('life.off_chronicle', { year: formatYear(state.offChronicle, lang) })}</p>}
            {hero.abroad && !hero.abroad.naturalized && <p class="hero-meta small muted">{t(hero.sex === 'f' ? 'life.foreigner_f' : 'life.foreigner', { year: formatYear(hero.abroad.since, lang) })}</p>}
            <div class="hud-sound">{sound}</div>
          </>
        } />
      ) : (
      <header class="hero-bar">
        <div class="hero-bar-row">
          <Avatar input={heroLook(hero)} label={t('life.portrait', { n: hero.age }, o)} />
          <div class="hero-bar-info">
            <div class="hero-bar-top">
              {/* Длинное имя мельче: «Летопись» широкая, а «Меню» должно оставаться на месте. */}
              <h1 class={`hero-name ${heroName.length > 13 ? 'longer' : heroName.length > 8 ? 'long' : ''}`}>{heroName}</h1>
              <div class="hero-bar-actions">
                {sound}
                <button class="link" onClick={onMenu}>{t('life.menu')}</button>
              </div>
            </div>
            <p class="hero-meta">
              {t('life.age', { n: hero.age })} · {formatYear(state.year, lang)} · {t(`region.${hero.region}`)}
            </p>
            <p class="hero-meta">
              {hero.profession ? t(`prof.${hero.profession}`, {}, o) : t('life.no_profession')} · {formatMoney(t, hero.money, coin)}
              {hero.band !== undefined && hero.age >= era.stages.youth && <span title={t('band.tip', { n: statusOf(hero, era) })}> · {t(`band.${hero.band}`)}</span>}
              {hero.money < 0 && <span class="warn"> · {t('life.debt')}</span>}
              {hero.tags.includes('ill') && <span class="warn"> · {t('life.ill', {}, o)}</span>}
              {mourning(hero) && <span class="warn" title={t('life.grief_tip')}> · {t('life.grief')}</span>}
            </p>
            <Bar label={t('attr.health')} value={hero.attrs.health} />
            <GoalBar state={state} open={goalOpen} onToggle={() => setGoalOpen(!goalOpen)} />
            {mourning(hero) && <p class="hero-meta small warn grief-left">{t('life.grief_left', { n: Math.max(1, mourningLeft(state)) }, o)}</p>}
            {hero.age >= 12 && <p class="hero-meta small">{t('life.expected', { n: expectedAge(state, era) })}</p>}
            {state.offChronicle !== undefined && <p class="hero-meta small muted">{t('life.off_chronicle', { year: formatYear(state.offChronicle, lang) })}</p>}
            {hero.abroad && !hero.abroad.naturalized && <p class="hero-meta small muted">{t(hero.sex === 'f' ? 'life.foreigner_f' : 'life.foreigner', { year: formatYear(hero.abroad.since, lang) })}</p>}
          </div>
        </div>
      </header>
      )}

      {hintFor('hero', hero.age >= 12) && tab === 'life' && <Hint text={t('hint.hero')} onClose={() => closeHint('hero')} />}
      {/* Вкладки и скорость - вверху и прилипают при прокрутке: скорость рядом с картинкой, а не под лентой.
          Время идёт на любой вкладке, поэтому скорость и пауза - тоже на всех. */}
      <div class="life-top">
        {noticeBar}
        <nav class="tabs" role="tablist">
          {(['life', 'hero', 'people', 'diary'] as Tab[]).map((id) => (
            <button role="tab" aria-selected={tab === id} class={tab === id ? 'tab active' : 'tab'} onClick={() => {
                openTab(id)
                platform.track('tab_open', { tab: id })
              }}>
              {t(`tab.${id}`)}
            </button>
          ))}
        </nav>
        {!b && <div class="speed-bar">
          <div class="speed" role="group" aria-label={t('life.speed')}>
            {SPEEDS.map((s) => (
              <button class={speed === s ? 'chip active' : 'chip'} aria-pressed={speed === s} aria-label={s === 0 ? t('life.pause') : `×${s}`} onClick={() => {
                changeSpeed(s)
                platform.track('speed_change', { speed: s })
              }}>
                {s === 0 ? <Icon name="pause" /> : s === 0.5 ? '×½' : `×${s}`}
              </button>
            ))}
            <button class="chip" onClick={skip} aria-label={t('life.skip')} title={t('life.skip')}>
              <Icon name="skip" />
            </button>
          </div>
          <div class="year-clock" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t('life.year_progress')}>
            <span class="year-label">{formatYear(state.year, lang)}</span>
            <span class="year-track">
              <span class="year-fill" style={{ width: `${Math.round((state.phase === 'running' ? progress : 0) * 100)}%` }} />
            </span>
          </div>
          {speed === 0 && <p class="small muted center paused-note">{t('life.paused')}</p>}
        </div>}
      </div>
      {tab === 'life' && hintFor('tab_life', hero.age >= 3) && <Hint text={t(b ? 'hint.tab_life_b' : 'hint.tab_life')} onClose={() => closeHint('tab_life')} />}
      {tab === 'life' && hintFor('speed', lifeSec >= 3 && hero.age < 2) && <Hint text={t(b ? 'hint.speed_b' : 'hint.speed')} onClose={() => closeHint('speed')} />}
      {/* Первые годы жизни: длительность года меняется в настройках. */}
      {tab === 'life' && hintFor('year_len', hero.age >= 2 && hero.age <= 6) && (
        <Hint
          text={t('hint.year_len')}
          onClose={() => closeHint('year_len')}
          action={
            onSettings && {
              label: t('hint.year_len.open'),
              run: () => {
                platform.track('tab_open', { tab: 'settings_from_hint' })
                onSettings()
              },
            }
          }
        />
      )}

      {b && tab === 'life' && (
        <div class="hud-goal">
          <GoalBar state={state} open={goalOpen} onToggle={() => setGoalOpen(!goalOpen)} />
          <MilestoneChip state={state} era={era} />
        </div>
      )}
      {tab === 'life' && (
        <section class="panel">
          <Scene scene={yearScene} region={hero.region} seed={`${hero.id}:home`} cast={familyCast(state)} paused={speed === 0} season={season} weather={weatherFor(hero.region, season, state.year, hero.id)} mood={moodFor(hero.tags, hero.diary, state.year)} year={state.year} ambient />

          {stage === 'infancy' || focuses.length === 0 ? (
            <p class="muted">{t('life.infancy', {}, o)}</p>
          ) : (
            <FocusPanel
              focuses={focuses}
              selected={selected}
              open={focusOpen}
              onToggle={() => {
                setFocusOpen(!focusOpen)
                if (!focusOpen) platform.track('tab_open', { tab: 'focus' })
              }}
              onPick={setFocus}
              o={o}
              hint={hintFor('focus', hero.age >= 5) ? <Hint text={t('hint.focus', {}, o)} onClose={() => closeHint('focus')} /> : null}
              lifestyle={lifestyleDefs(state, era).length > 0 ? () => openTab('hero') : null}
            />
          )}

          {yearChanges.length > 0 && (
            <>
              <p class="small muted">{t('life.last_year')}</p>
              <ChangeList changes={yearChanges} coin={coin} />
            </>
          )}

          <h2 class="section-title">{t('life.feed')}</h2>
          {feed.length === 0 ? (
            <p class="muted">{t('life.nothing')}</p>
          ) : (
            <ul class="feed">
              {groupPrimers(feed).map((item) => {
                if ('primers' in item) return <PrimerGroup key={item.key} ids={item.primers} o={o} />
                const [d, i] = item
                return (
                <li key={i} class={`${d.news ? 'news' : ''} ${d.major ? 'major' : ''} ${d.year === state.year ? 'now' : ''}`}>
                  <span class="diary-age">{d.news ? t('life.news') : t('diary.age', { n: d.age })}</span>
                  <span>{diaryText(t, d, hero.sex, hero.region, hero.religion, lang)}</span>
                </li>
                )
              })}
            </ul>
          )}

          {kids.length > 0 && (
            <>
              <h2 class="section-title">{t('life.children')}</h2>
              <ul class="kids">
                {kids.map((k) => (
                  <ChildRow child={k} year={state.year} all={hero.npcs} />
                ))}
              </ul>
            </>
          )}

        </section>
      )}

      {tab === 'hero' && (
        <section class="panel">
          {tabHint('tab_hero') && <Hint text={t('hint.tab_hero', {}, o)} onClose={() => closeHint('tab_hero')} />}
          {speed === 0 && state.phase !== 'dead' && (
            <div class="hero-paused" role="status">
              <span class="small">{t('hero.paused')}</span>
              <button type="button" class="primary small" onClick={() => {
                changeSpeed(autoPaused.current ?? 1)
                platform.track('hero_resume', {})
              }}>
                <Icon name="play" /> {t('hero.resume')}
              </button>
            </div>
          )}
          <FamilyLine state={state} />
          {/* Деньги - первой строкой (отзыв игрока 03.11: «не нашёл, где моё богатство»). */}
          <p class="hero-money"><strong>{t('hero.money')}:</strong> {formatMoney(t, hero.money, coin)}{hero.money < 0 ? ` · ${t('hero.in_debt')}` : ''}</p>
          {/* Как устроена жизнь героя (отзывы игроков 03–08.11: «не понимаю, что значат параметры и фокус»). */}
          <details class="howto small">
            <summary>{t('howto.title')}</summary>
            <p>{t('howto.focus')}</p>
            <p>{t('howto.attrs')}</p>
            <p>{t('howto.feelings')}</p>
            <p>{t('howto.money')}</p>
            <p>{t('howto.family')}</p>
          </details>
          <h2 class="section-title">{t('hero.feelings')}</h2>
          <ul class="plain">{feelings(t, hero).map((f) => <li>{f}</li>)}</ul>
          <p class="small">
            <strong>{t('reveal.faith')}:</strong> <span class="cap">{t(`religion.${hero.religion}`, {}, o)}</span>
            <span class="muted">{'\u00a0— '}{t(`religion.${hero.religion}.desc`, {}, o)}</span>
          </p>
          <p class="small">
            <strong>{t('hero.family')}:</strong> {maritalText(t, hero, lang, 'marital')}
          </p>
          {hero.abroad && (
            // Чужбина: откуда родом, как вжился, и кнопка «Задумать возвращение».
            <div class="note-box small abroad-box">
              <p>
                {t(hero.abroad.naturalized ? 'abroad.naturalized' : 'abroad.status', {
                  homeland: { key: `era.${hero.abroad.homeland.era}` },
                  year: formatYear(hero.abroad.since, lang),
                  n: state.year - hero.abroad.since,
                }, o)}
              </p>
              <p class="muted">{t('abroad.feel', { i: hero.abroad.integration, h: hero.abroad.homesick, a: hero.abroad.acceptance })}</p>
              {onPlanReturn && !hero.abroad.planned && (
                <button class="secondary" onClick={onPlanReturn}>
                  {t('abroad.plan_return')}
                </button>
              )}
              {hero.abroad.planned && <p>{t('abroad.planned')}</p>}
            </div>
          )}
          <p class="small">
            <strong>{t('hero.home')}:</strong> {t(`home.${hero.home ?? 1}`, {}, o)}
            {hero.rent && <> ({t('hero.rent', { sum: formatMoney(t, rentPerMonth(hero.rent), coin) })})</>}
            {!!hero.land && <> · <strong>{t('hero.land')}:</strong> {t('hero.land_n', { n: hero.land })}</>}
            {!!hero.slaves && <> · <strong>{t('hero.slaves')}:</strong> {hero.slaves}</>} · <strong>{t('hero.animals')}:</strong>{' '}
            {hero.animals?.length
              ? hero.animals
                  .map((a) =>
                    // Питомец - с кличкой и возрастом: «пёс Полкан, 7 лет».
                    isPet(a.kind)
                      ? `${t(`pet.${a.kind}`, {}, o)}${a.name ? ` ${nameOf(a.name, lang)}` : ''}${a.born !== undefined ? `, ${t('hero.pet_age', { n: Math.max(0, state.year - a.born) })}` : ''}`
                      : t(`animal.${a.kind}`, {}, o),
                  )
                  .join('; ')
              : t('hero.no_animals')}
          </p>
          <div class="bars">
            {ATTRIBUTES.map((id) => <Bar label={t(`attr.${id}`)} value={hero.attrs[id]} />)}
          </div>
          {era.vices.some((v) => hero.tags.includes(v.tag)) && (
            <>
              <h2 class="section-title">{t('hero.vices')}</h2>
              <p class="warn">{era.vices.filter((v) => hero.tags.includes(v.tag)).map((v) => t(`vice.${v.tag}`, {}, o)).join(', ')}</p>
            </>
          )}
          <Lifestyle state={state} era={era} coin={coin} onChange={onLifestyle} />
          <Career state={state} era={era} onChange={() => onFamily?.()} />
          <Estate state={state} era={era} onChange={() => onFamily?.()} />
          <Trade state={state} era={era} onChange={() => onFamily?.()} />
          <h2 class="section-title">{t('hero.traits')}</h2>
          <p>{hero.traits.map((tr) => t(`trait.${tr}`)).join(', ')}</p>
          <h2 class="section-title">{t('hero.skills')}</h2>
          {Object.entries(hero.skills).filter(([, v]) => v >= 1).length === 0 ? (
            <p class="muted">{t('hero.no_skills')}</p>
          ) : (
            <div class="bars">
              {Object.entries(hero.skills)
                .filter(([, v]) => v >= 1)
                .sort((a, b) => b[1] - a[1])
                .map(([id, v]) => <Bar label={t(`skill.${id}`)} value={v} />)}
            </div>
          )}
        </section>
      )}

      {tab === 'people' && (
        <>
          {tabHint('tab_people') && <Hint text={t('hint.tab_people', {}, o)} onClose={() => closeHint('tab_people')} />}
          <Children state={state} era={era} onChange={() => onFamily?.()} />
          <People state={state} />
        </>
      )}

      {tab === 'diary' && (
        <section class="panel">
          {tabHint('tab_diary') && <Hint text={t('hint.tab_diary', {}, o)} onClose={() => closeHint('tab_diary')} />}
          {entries.length === 0 ? (
            <p class="muted">{t('diary.empty')}</p>
          ) : (
            <>
            <div class="filters" role="group">
              <button class={onlyMajor ? 'chip' : 'chip active'} aria-pressed={!onlyMajor} onClick={() => setOnlyMajor(false)}>{t('diary.all')}</button>
              <button class={onlyMajor ? 'chip active' : 'chip'} aria-pressed={onlyMajor} onClick={() => setOnlyMajor(true)}>{t('diary.major_only')}</button>
              {worldNews.length > 0 && (
                <button class={worldOpen ? 'chip active' : 'chip'} aria-expanded={worldOpen} onClick={() => {
                  if (!worldOpen) platform.track('tab_open', { tab: 'world_news' })
                  setWorldOpen(!worldOpen)
                }}>
                  {t('diary.world', { n: worldNews.length })}
                </button>
              )}
            </div>
            {worldOpen && (
              <ol class="diary world-news">
                {worldNews.map((n) => (
                  <li class="news">
                    <span class="diary-age">{formatYear(n.year, lang)}</span>
                    <span>{t(`news.${n.id}`, contextParams(hero.region, hero.religion, n.year), o)}</span>
                  </li>
                ))}
              </ol>
            )}
            <ol class="diary">
              {groupPrimers(yearsBackward(onlyMajor ? entries.filter(([d]) => d.major) : entries)).map((item) => {
                if ('primers' in item) return <PrimerGroup key={item.key} ids={item.primers} o={o} />
                const [d, i] = item
                const full = d.eventId && d.key.startsWith('ev.') ? fullText(d) : null
                const open = openRows.includes(i)
                return (
                <li key={i} class={`${d.major ? 'major' : ''} ${d.news ? 'news' : ''}`}>
                  <span class="diary-age">{t('diary.age', { n: d.age })}</span>
                  {full ? (
                    <span>
                      <button class="diary-open" aria-expanded={open} onClick={() => setOpenRows(open ? openRows.filter((x) => x !== i) : [...openRows, i])}>
                        {diaryText(t, d, hero.sex, hero.region, hero.religion, lang)} <span class="muted">{open ? '▴' : '▾'}</span>
                      </button>
                      {open && full.map((p) => <span class="diary-full">{p}</span>)}
                    </span>
                  ) : (
                    <span>{diaryText(t, d, hero.sex, hero.region, hero.religion, lang)}</span>
                  )}
                </li>
                )
              })}
            </ol>
            </>
          )}
        </section>
      )}

      {b && (
        <TimeBar
          speed={speed}
          onSpeed={(s) => {
            changeSpeed(s as Speed)
            platform.track('speed_change', { speed: s })
          }}
          progress={state.phase === 'running' ? progress : 0}
          year={state.year}
          onSkip={skip}
          waiting={modalOpen}
        />
      )}
      {tour && !modalOpen && <Tour onEnd={endTour} />}
      {drip && !tour && !modalOpen && <Tour only={drip} onEnd={endDrip} />}
      {loss && (
        <div class="modal-backdrop">
          <div class="modal loss-card" role="dialog" aria-modal="true" aria-labelledby="loss-title">
            <div class="modal-body">
              <p class="eyebrow">{t('event.loss')} · {t('diary.age', { n: loss.age })}</p>
              <h2 id="loss-title">{diaryText(t, loss, hero.sex, hero.region, hero.religion, lang)}</h2>
              <button class="primary" onClick={closeLoss} autoFocus>
                {t('event.next')}
              </button>
            </div>
          </div>
        </div>
      )}
      {goalDue && goal && <GoalPick state={state} mode="birth" onPick={(c) => goal.onPick(c, false)} />}
      {kidsDue && onKids && !goalDue && (
        <div class="modal-backdrop">
          <div class="modal kids-modal" role="dialog" aria-modal="true">
            <EarlyGame
              era={hero.era}
              region={hero.region}
              lang={lang === 'fr' || lang === 'es' ? 'en' : lang}
              age={hero.age}
              livesBefore={state.settings.livesBefore ?? 0}
              seen={(platform.kvGet(SEEN_KEY) ?? '').split(',').filter(Boolean)}
              seed={earlySeed(hero.id)}
              onFinish={onKids}
            />
          </div>
        </div>
      )}
      {chapterDue && !kidsDue && changing && goal && (
        <GoalPick
          state={state}
          mode="change"
          onPick={(c) => {
            setChanging(false)
            goal.onPick(c, true)
          }}
          onKeep={() => setChanging(false)}
        />
      )}
      {chapterDue && !kidsDue && !changing && <Chapter state={state} era={era} onNext={closeChapter} onChangeGoal={goal && goal.group > 0 && hero.goal && !hero.goal.changed && hero.age === platform.flags.goal_change_age && hero.goal.steps.length < GOAL_STEPS ? () => setChanging(true) : undefined} />}
      {modalOpen && !kidsDue && !chapterDue && !adOpen && !goalDue && dream && (state.dream || dream.result) ? (
        <DreamModal state={state} result={dream.result} onAnswer={dream.onAnswer} onHint={dream.onHint} onWake={dream.onWake} onClose={dream.onClose} />
      ) : (
        modalOpen && !kidsDue && !chapterDue && !adOpen && !goalDue && <EventModal state={state} era={era} onChoose={onChoose} onDismiss={onDismiss} changes={choiceChanges} marks={goal?.group === 2 ? hero.goal?.id : undefined} short={!!shortFirst && lifeStats(state).choices < 3} onDiceGame={onDiceGame} onCrisisSave={onCrisisSave} />
      )}
    </div>
  )
}

/** Как выглядит герой на портрете сейчас. */
export function heroLook(hero: Hero): AvatarInput {
  return {
    region: hero.region,
    sex: hero.sex,
    age: hero.age,
    seed: hero.id,
    face: faceOf(hero),
    cls: hero.cls,
    body: hero.body ?? 0,
    happiness: hero.hidden.happiness,
    ill: hero.tags.includes('ill'),
    married: hero.npcs.some((n) => n.role === 'spouse'),
    widow: maritalStatus(hero).kind === 'widowed',
    homeRegion: hero.abroad?.homeland.region,
    integrated: !!hero.abroad && (!!hero.abroad.naturalized || hero.abroad.integration >= 60),
    dead: !hero.alive,
    enslaved: hero.tags.includes('enslaved'),
    stress: hero.hidden.stress,
    ...lifeMarks(hero.diary, hero.traits),
  }
}

/** Порядок кнопок фокуса: самые частые - первыми. */
const FOCUS_ORDER = ['play', 'learn', 'help_family', 'work', 'study', 'family', 'health', 'rest', 'religion', 'trade', 'travel', 'savings', 'service']
const FOCUS_CHIPS = 6

/**
 * Фокус года над лентой событий. Свёрнуто - до шести коротких кнопок и строка о выбранном;
 * «Подробнее» раскрывает пояснение и все варианты с описаниями.
 */
function FocusPanel({ focuses, selected, open, onToggle, onPick, o, hint, lifestyle }: {
  focuses: FocusDef[]
  selected: string | null
  open: boolean
  onToggle: () => void
  onPick: (id: string) => void
  o: { sex: Hero['sex']; region: string; religion: string }
  hint: preact.ComponentChildren
  lifestyle: (() => void) | null
}) {
  const { t } = useUi()
  const sorted = [...focuses].sort((a, b) => FOCUS_ORDER.indexOf(a.id) - FOCUS_ORDER.indexOf(b.id))
  const more = sorted.length > FOCUS_CHIPS
  let chips = more ? sorted.slice(0, FOCUS_CHIPS - 1) : sorted
  if (selected && !chips.some((f) => f.id === selected)) chips = [...chips.slice(0, chips.length - 1), sorted.find((f) => f.id === selected)!]
  return (
    <section class={open ? 'focus-panel open' : 'focus-panel'} aria-labelledby="focus-title">
      {hint}
      <div class="focus-head">
        <h2 id="focus-title" class="section-title">{t('life.focus_title')}</h2>
        <button class="link small" aria-expanded={open} onClick={onToggle}>
          {open ? t('life.focus_less') : t('life.focus_more')} {open ? '▴' : '▾'}
        </button>
      </div>
      {open ? (
        <>
          <p class="small focus-explain">{t('life.focus_explain')}</p>
          <div class="focus-grid">
            {sorted.map((f) => (
              <button class={f.id === selected ? 'focus active' : 'focus'} aria-pressed={f.id === selected} onClick={() => onPick(f.id)}>
                <span class="focus-name">
                  {f.id === selected && <span aria-hidden="true">✓ </span>}
                  {t(`focus.${f.id}`, {}, o)}
                </span>
                <span class="focus-desc">{t(`focus.${f.id}.desc`, {}, o)}</span>
              </button>
            ))}
          </div>
          <p class="small muted">{t('life.focus_hint')}</p>
          {lifestyle && (
            <button class="link small" onClick={lifestyle}>
              {t('life.lifestyle_link')} →
            </button>
          )}
        </>
      ) : (
        <>
          <div class="focus-chips" role="group" aria-label={t('life.focus_title')}>
            {chips.map((f) => (
              <button class={f.id === selected ? 'focus-chip active' : 'focus-chip'} aria-pressed={f.id === selected} title={t(`focus.${f.id}.desc`, {}, o)} onClick={() => onPick(f.id)}>
                {t(`focus_short.${f.id}`, {}, o)}
              </button>
            ))}
            {more && (
              <button class="focus-chip more" aria-expanded={false} onClick={onToggle}>
                {t('life.focus_others')}
              </button>
            )}
          </div>
          {selected && <p class="small muted focus-now">{t(`focus.${selected}.desc`, {}, o)}</p>}
        </>
      )}
    </section>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  const v = Math.round(value)
  return (
    <div class="bar">
      <span class="bar-label">{label}</span>
      <span class="bar-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
        <span class="bar-fill" style={{ width: `${v}%` }} />
      </span>
      <span class="bar-value">{v}</span>
    </div>
  )
}

function ChangeList({ changes, coin }: { changes: Change[]; coin: string }) {
  const { t } = useUi()
  return (
    <ul class="changes" aria-label={t('event.changes')}>
      {changes.map((c) => (
        <li class={c.delta > 0 ? 'up' : 'down'}>
          {t(c.key)} {c.delta > 0 ? '+' : '−'}
          {c.money ? formatMoney(t, Math.abs(c.delta), coin) : Math.abs(c.delta)}
        </li>
      ))}
    </ul>
  )
}

/** Подсказка: пузырь с текстом, исчезает по касанию; action - кнопка-действие внутри (например, «Открыть настройки»). */
function Hint({ text, onClose, action }: { text: string; onClose: () => void; action?: { label: string; run: () => void } }) {
  if (!action) {
    return (
      <button class="hint" onClick={onClose}>
        <span>
          <IconText text={text} />
        </span>
        <span class="hint-x" aria-hidden="true">✕</span>
      </button>
    )
  }
  return (
    <div class="hint" role="note">
      <span>
        {text}{' '}
        <button
          class="hint-action"
          onClick={() => {
            onClose()
            action.run()
          }}
        >
          {action.label}
        </button>
      </span>
      <button class="hint-x" onClick={onClose} aria-label="✕">
        ✕
      </button>
    </div>
  )
}

/** Экран-глава: итог прожитого отрезка в 2–3 строках и «Дальше». */
function Chapter({ state, era, onNext, onChangeGoal }: { state: GameState; era: EraDef; onNext: () => void; onChangeGoal?: () => void }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const ages = platform.flags.chapter_ages
  const from = Math.max(0, ...ages.filter((a) => a < hero.age))
  const spouse = hero.npcs.find((n) => n.role === 'spouse' && n.alive)
  const kids = hero.npcs.filter((n) => n.role === 'child' && n.alive).length
  const best = hero.diary
    .filter((d) => d.age >= from && d.age < hero.age && !d.primer && !d.news && d.key !== 'diary.born' && !d.key.startsWith('diary.stage_') && !(spouse && d.key === 'diary.married'))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  const title = hasKey(lang, `chapter.${hero.age}`) ? t(`chapter.${hero.age}`, {}, o) : t('chapter.other', { n: hero.age }, o)
  return (
    <div class="modal-backdrop">
      <div class="modal chapter" role="dialog" aria-modal="true" aria-labelledby="chapter-title">
        <Scene art="full" frame year={state.year} scene={{ place: 'landmark', time: 'sunset', people: 3, props: ['sun'] }} region={hero.region} seed={`${hero.id}:ch${hero.age}`} cast={familyCast(state)} />
        <div class="modal-body">
          <p class="eyebrow">{t('chapter.eyebrow', { n: hero.age, year: formatYear(state.year, lang) })}</p>
          <h2 id="chapter-title">{title}</h2>
          <p>
            {hero.profession ? t('chapter.work', { prof: t(`prof.${hero.profession}`, {}, o).toLocaleLowerCase(lang) }, o) : t('chapter.no_work', {}, o)}{' '}
            {maritalText(t, hero, lang, 'chapter')}{' '}
            {kids > 0 && t('chapter.kids', { n: kids })}
          </p>
          {best && (
            <p class="muted">
              {t('chapter.best')} {diaryText(t, best, hero.sex, hero.region, hero.religion, lang)}
            </p>
          )}
          {hero.goal && (
            <p class="goal-chapter">
              {hero.goal.steps.length >= GOAL_STEPS
                ? t('goal.chapter_done', { goal: t(`goal.${hero.goal.id}.title`, {}, o) }, o)
                : t('goal.chapter', { goal: t(`goal.${hero.goal.id}.title`, {}, o), n: hero.goal.steps.length }, o)}
            </p>
          )}
          {onChangeGoal && (
            <button class="secondary" onClick={onChangeGoal}>
              {t('goal.change')}
            </button>
          )}
          <button class="primary" onClick={onNext} autoFocus>
            {t('chapter.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Справки «О твоём мире» подряд - одна компактная карточка: заголовок и начало текста в строку, «Читать» раскрывает. Год не останавливается. */
function PrimerGroup({ ids, o }: { ids: string[]; o: { sex: Hero['sex']; region: string; religion: string } }) {
  const { t } = useUi()
  const [open, setOpen] = useState<string | null>(null)
  const read = (id: string) => {
    setOpen(open === id ? null : id)
    if (open !== id) platform.track('tab_open', { tab: 'primer' })
  }
  return (
    <li class="primer">
      <span class="eyebrow">{t('primer.label')}</span>
      <div class="primer-list">
        {ids.map((id) => (
          <div key={id} class={open === id ? 'primer-item open' : 'primer-item'}>
            <button class="primer-row" aria-expanded={open === id} onClick={() => read(id)}>
              <span class="primer-line">
                <strong class="primer-title">{t(`primer.${id}.title`, {}, o)}</strong>
              </span>
              <span class="primer-more">{open === id ? '−' : t('primer.read')}</span>
            </button>
            {open === id && <p class="primer-text">{t(`primer.${id}.text`, {}, o)}</p>}
          </div>
        ))}
      </div>
    </li>
  )
}

/** Подряд идущие справки склеиваются в одну группу. */
function groupPrimers(list: (readonly [DiaryEntry, number])[]): (readonly [DiaryEntry, number] | { primers: string[]; key: number })[] {
  const out: (readonly [DiaryEntry, number] | { primers: string[]; key: number })[] = []
  for (const item of list) {
    const last = out[out.length - 1]
    if (item[0].primer && last && 'primers' in last) last.primers.push(item[0].primer)
    else if (item[0].primer) out.push({ primers: [item[0].primer], key: item[1] })
    else out.push(item)
  }
  return out
}

function ChildRow({ child, year, all }: { child: Npc; year: number; all: Npc[] }) {
  const { t, lang } = useUi()
  const grand = all.filter((g) => g.role === 'grandchild' && g.parentId === child.id && g.alive).length
  const bits = [t('life.age', { n: Math.max(0, npcAge(child, year)) })]
  if (child.profession) bits.push(t(`prof.${child.profession}`, {}, { sex: child.sex }).toLocaleLowerCase(lang))
  if (child.married) bits.push(t('people.married', { sex: child.sex }))
  if (grand) bits.push(t('people.grandkids', { n: grand }))
  return (
    <li class="person">
      <span class="person-role">{t('npc.child', { sex: child.sex })}</span>
      <span class="person-name">{nameOf(child.name, lang)}</span>
      <span class="muted">{bits.join(' · ')}</span>
    </li>
  )
}

/** Род: имя и герб, цель рода и сколько уже сделано. */
function FamilyLine({ state }: { state: GameState }) {
  const { t } = useUi()
  const f = state.family
  if (!f.house && !f.goal) return null
  const g = f.goal
  const have = g ? Math.min(g.target, familyGoalProgress(g, f.lives)) : 0
  return (
    <div class="family-line">
      {f.house && <Arms of={f} size={32} label={houseName(t, f)} />}
      <div>
        {f.house && <strong>{houseName(t, f)}</strong>}
        {g && (
          <p class="small">
            {t('fgoal.line_label')} - {t(`fgoal.${g.id}`)}: {g.done !== undefined ? t('fgoal.done_short') : t('fgoal.progress', { have: g.kind === 'rank' ? have : Math.round(have), need: g.target })}
          </p>
        )}
      </div>
    </div>
  )
}

/** Дело жизни: нынешнее, «новичок» после смены и смена дела (раз в пять лет). */
function Career({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t, lang } = useUi()
  const hero = state.hero
  if (!hero.profession || hero.age < era.stages.adult) return null
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const options = careerOptions(state, era)
  const k = novice(state)
  return (
    <section class="estate career">
      <h2 class="section-title">{t('career.title')}</h2>
      <p class="small">{t('career.now', { prof: { key: `prof.${hero.profession}` } }, o)}</p>
      {k < 1 && <p class="small warn">{t('career.novice', { n: Math.round(k * 100) })}</p>}
      <p class="small muted">{t('career.hint')}</p>
      {options.length > 0 ? (
        <div class="choice-row">
          <span class="small">{t('career.change')}</span>
          {options.map((c) => (
            <button type="button" class="option small" onClick={() => changeCareer(state, era, c.id) && onChange()}>
              {t(`prof.${c.id}`, {}, o)}
            </button>
          ))}
        </div>
      ) : (
        hero.professionSince !== undefined && hero.age < 55 && <p class="small muted">{t('career.wait', { year: formatYear(hero.professionSince + CHANGE_EVERY, lang) })}</p>
      )}
    </section>
  )
}

function Lifestyle({ state, era, coin, onChange }: { state: GameState; era: EraDef; coin: string; onChange: (c: string, o: string) => void }) {
  const { t } = useUi()
  const defs = lifestyleDefs(state, era)
  if (defs.length === 0) return null
  const healthPerYear = (effects: Effect[] | undefined) => (effects ?? []).reduce((s, e) => s + ('param' in e && e.param === 'health' ? e.delta : 0), 0)
  return (
    <>
      <h2 class="section-title">{t('lifestyle.title')}</h2>
      <p class="expected">{t('lifestyle.expected', { n: expectedAge(state, era) })}</p>
      <p class="small muted">{t('lifestyle.hint')}</p>
      {/* Цифра - из симуляции (npm run longevity): сколько лет добавляет взрослому бережный образ жизни в этой стране. */}
      <p class="small">{t('lifestyle.bonus', { n: (LONGEVITY.eras as Record<string, { bonus: number }>)[era.id]?.bonus ?? LONGEVITY.bonusMin })}</p>
      {defs.map((def) => {
        const current = lifestyleOption(state, def).id
        return (
          <fieldset class="choice-group lifestyle">
            <legend>{t(`lifestyle.${def.id}`)}</legend>
            {def.options.map((opt) => {
              const ok = checkAll(state, opt.requirements)
              return (
                <button type="button" class={opt.id === current ? 'option active' : 'option'} aria-pressed={opt.id === current} disabled={!ok} onClick={() => onChange(def.id, opt.id)}>
                  <span class="option-label">{t(`lifestyle.${def.id}.${opt.id}`)}</span>
                  <span class="option-desc">{t(`lifestyle.${def.id}.${opt.id}.desc`)}</span>
                  <span class="option-desc">
                    {opt.cost > 0 ? t('lifestyle.cost', { cost: formatMoney(t, opt.cost, coin) }) : opt.cost < 0 ? t('lifestyle.saves', { cost: formatMoney(t, -opt.cost, coin) }) : t('lifestyle.free')}
                  </span>
                  {(healthPerYear(opt.effects) !== 0 || (opt.mortality ?? 1) !== 1) && (
                    <span class="option-effect">
                      {[
                        healthPerYear(opt.effects) ? t('lifestyle.health_year', { d: `${healthPerYear(opt.effects) > 0 ? '+' : '−'}${Math.abs(healthPerYear(opt.effects))}` }) : '',
                        (opt.mortality ?? 1) !== 1 ? t('lifestyle.risk', { d: `${(opt.mortality ?? 1) > 1 ? '+' : '−'}${Math.round(Math.abs((opt.mortality ?? 1) - 1) * 100)}` }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </button>
              )
            })}
          </fieldset>
        )
      })}
    </>
  )
}

/**
 * Семейное положение словами: для экрана-главы (`chapter.*`, целая фраза) или строки «Семья» во вкладке «Герой» (`marital.*`).
 * Тот, кто был в браке, никогда не «семьи не завёл»: вдовец, вдова, в разводе, снова в браке.
 */
function maritalText(t: T, hero: Hero, lang: Lang, prefix: 'chapter' | 'marital'): string {
  const m = maritalStatus(hero)
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const params = { who: { name: m.spouse?.name ?? '' }, psex: m.spouse?.sex ?? 'm', year: m.since !== undefined ? formatYear(m.since, lang) : '' }
  const key =
    m.kind === 'never' ? (prefix === 'chapter' ? 'chapter.single' : 'marital.never') : m.kind === 'widowed' && m.widowed > 1 ? `${prefix}.widowed_again` : `${prefix}.${m.kind}`
  return t(key, params, o)
}

/** Роль, возраст, отношение, занятие - строкой; для вкладки «Люди» и для строки «кто это» в окне события. */
/** Живёт под одной крышей с героем: супруг, неженатые дети, родители и братья-сёстры, пока герой молод. */
function livesWithHero(hero: Hero, n: Npc, year: number): boolean {
  if (!n.alive || n.away) return false
  if (n.role === 'spouse') return true
  if (n.role === 'child') return !n.married
  if (n.role === 'father' || n.role === 'mother') return hero.age < 25 || year - n.birthYear >= 60
  if (n.role === 'sibling') return hero.age < 18 && !n.married
  return false
}

/** Подробности о человеке: год рождения, черты, учёба, дети. */
function npcMore(t: T, lang: Lang, all: Npc[], n: Npc): string {
  const kids = all.filter((x) => x.parentId === n.id).length
  const e = n.education
  const edu = e?.completedYear ? t('people.more.edu_done', { path: t(`children.path.${e.path}`), sex: n.sex }) : e?.startedYear && !e.refusedYear ? t('people.more.edu_now', { path: t(`children.path.${e.path}`) }) : ''
  return [
    t('people.more.born', { year: formatYear(n.birthYear, lang), sex: n.sex }),
    n.traits.length ? n.traits.map((tr) => t(`trait.${tr}`)).join(', ') : '',
    edu,
    kids ? t('people.more.kids', { n: kids }) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function npcFacts(t: T, lang: Lang, n: Npc, year: number): string {
  if (n.alive && n.away) return t(`people.away.${n.away.reason}`, { sex: n.sex, year: formatYear(n.away.since, lang) })
  if (!n.alive) {
    const died = t('npc.dead', { sex: n.sex, year: formatYear(n.deathYear ?? year, lang) })
    const age = n.deathYear !== undefined ? t('life.age', { n: Math.max(0, n.deathYear - n.birthYear) }) : ''
    const cause = n.deathCause ? t(`cause.${n.deathCause}`, {}, { sex: n.sex }) : ''
    return [died, age, cause].filter(Boolean).join(' · ')
  }
  return [
    t('life.age', { n: Math.max(0, npcAge(n, year)) }),
    attitudeText(t, n),
    n.profession ? t(`prof.${n.profession}`, {}, { sex: n.sex }).toLocaleLowerCase(lang) : '',
    n.married ? t('people.married', { sex: n.sex }) : '',
    // Тяжёлая болезнь - с названием («больна: чахотка», engine/illness.ts).
    n.ill ? t('npc.ill', { sex: n.sex, ill: { key: `cause.${n.ill.cause}`, sex: n.sex } }) : '',
    ...(n.tags ?? []).filter((tag) => hasKey(lang, `npctag.${tag}`)).map((tag) => t(`npctag.${tag}`, { sex: n.sex })),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Люди героя; aliveOnly - только живые рядом (список «Близкие» в окне события). */
function People({ state, aliveOnly }: { state: GameState; aliveOnly?: boolean }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const alive = hero.npcs.filter((n) => n.alive && !n.away)
  const far = aliveOnly ? [] : hero.npcs.filter((n) => n.alive && n.away)
  const dead = aliveOnly ? [] : hero.npcs.filter((n) => !n.alive)
  // Нажать на человека - подробности (отзыв игроков 03–08.11: «хочу нажать на родственника», «кто живёт со мной»).
  const row = (n: Npc) => (
    <li class="person">
      <details class="person-more">
        <summary>
          <span class="person-role">{t(`npc.${roleKey(hero.npcs, n)}`, { sex: n.sex })}</span>
          <span class="person-name">{nameOf(n.name, lang)}</span>
          {livesWithHero(hero, n, state.year) && <span class="small home-badge">{t('people.at_home')}</span>}
          {n.alive && n.ill && <span class="small ill-badge">{t('people.ill_badge', { sex: n.sex })}</span>}
          <span class="muted">{npcFacts(t, lang, n, state.year)}</span>
        </summary>
        <span class="small">{npcMore(t, lang, hero.npcs, n)}</span>
      </details>
    </li>
  )
  if (aliveOnly) return alive.length ? <ul class="people">{alive.map(row)}</ul> : <p class="muted">{t('people.empty')}</p>
  return (
    <section class="panel">
      {hero.npcs.length === 0 && <p class="muted">{t('people.empty')}</p>}
      {alive.length > 0 && (
        <>
          <h2 class="section-title">{t('people.alive')}</h2>
          <ul class="people">{alive.map(row)}</ul>
        </>
      )}
      {far.length > 0 && (
        <>
          <h2 class="section-title">{t('people.far')}</h2>
          <ul class="people far">{far.map(row)}</ul>
        </>
      )}
      {dead.length > 0 && (
        <>
          <h2 class="section-title">{t('people.dead')}</h2>
          <ul class="people dead">{dead.map(row)}</ul>
        </>
      )}
    </section>
  )
}

interface EventProps {
  state: GameState
  era: EraDef
  onChoose: (id: string | null, ms?: number) => void
  short?: boolean
  onDiceGame?: (r: DiceResult) => void
  onCrisisSave?: () => void
  onDismiss: () => void
  changes: Change[]
  /** Цель героя, если игрок в группе с метками ▲▼ (A/B goal_marks_share). */
  marks?: GoalId
}

function EventModal({ state, era, onChoose, onDismiss, changes, marks, short, onDiceGame, onCrisisSave }: EventProps) {
  // «Другие имена»: окно перерисовывается само, состояние меняет движок (rerollNames).
  const [, redrawNames] = useState(0)
  const { t, lang } = useUi()
  const ev = currentEvent(state, era)
  const [noteOpen, setNoteOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  // Кости: какой выбор открыл стол (play / road); null - выбор ещё не сделан.
  const [table, setTable] = useState<string | null>(null)
  // Перелом: какая тактика открыла доску; шар уже брошен (сохранение посреди перелома) - доска сразу открыта.
  const [crisisStance, setCrisisStance] = useState<StanceId | null>(() => state.queue[0]?.crisis?.stance ?? null)
  const crisisKey = state.queue[0]?.eventId === 'crisis_turn' ? `${state.year}:${state.queue[0]?.at}` : ''
  useEffect(() => {
    if (crisisKey && !state.queue[0]?.outcome && !state.queue[0]?.crisis) platform.track('crisis_offer', { age: state.hero.age, era: state.hero.era, cls: state.hero.cls })
  }, [crisisKey])
  const offered = state.queue[0]?.dream
  useEffect(() => {
    if (offered && ev?.id === 'dream_intro' && !state.queue[0]?.outcome) platform.track('dream_offer', { dream: offered, era: state.hero.era, age: state.hero.age })
  }, [offered])
  // Клавиатура: 1–4 выбирают вариант, Enter - «Далее» после итога (доступность, критерии ТЗ).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  // Когда окно этого события открылось: время до выбора уходит в choice_made.ms_to_choice.
  const shown = useRef({ id: '', at: 0 })
  const eventKey = `${state.queue[0]?.eventId}:${state.queue[0]?.at}:${state.year}`
  if (shown.current.id !== eventKey) shown.current = { id: eventKey, at: Date.now() }
  // Окно открылось (аналитика event_shown; итог того же события - не новое окно).
  useEffect(() => {
    if (ev && !state.queue[0]?.outcome) trackEventShown(state, ev)
  }, [eventKey])
  // Кнопки выбора оживают через CHOICE_DELAY после того, как событие появилось.
  const [armedKey, setArmedKey] = useState(CHOICE_DELAY ? '' : eventKey)
  const armed = !CHOICE_DELAY || armedKey === eventKey
  useEffect(() => {
    if (!CHOICE_DELAY || armedKey === eventKey) return
    const id = setTimeout(() => setArmedKey(eventKey), CHOICE_DELAY)
    return () => clearTimeout(id)
  }, [eventKey])
  const pick = (id: string | null) => {
    if (!armed) return
    if (ev?.dynamic === 'dice' && id && (ev.dice_play ?? DICE_TABLE).includes(id) && onDiceGame) return setTable(id)
    if (ev?.dynamic === 'crisis' && id && onCrisisSave) {
      platform.track('crisis_stance', { stance: id })
      return setCrisisStance(id as StanceId)
    }
    onChoose(id, Date.now() - shown.current.at)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  if (!ev) return null
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const coin = regionOf(era, hero.region).coin
  const active = state.queue[0]
  const outcome = active?.outcome
  const who = active?.npcId ? hero.npcs.find((n) => n.id === active.npcId) : undefined
  const params = { ...contextParams(hero.region, hero.religion, state.year), ...(active ? eventParams(state, active) : {}) }
  const choices = eventChoices(state, era, ev)
  const isProfession = ev.dynamic === 'profession'
  const isName = ev.dynamic === 'name'
  const v = active?.variant
  const label = (c: ChoiceDef) => (isName ? nameOf(c.id, lang) : isProfession ? t(`prof.${c.id}`, {}, o) : t(variantKey(lang, `ev.${ev.id}.${c.id}`, v), params, o))
  const lockText = (c: ChoiceDef) => {
    const r = lockReason(state, c, ev)
    return r ? t(r.key, r.params, o) : t('event.locked')
  }
  const cost = (c: ChoiceDef) => {
    // Цена - как её возьмёт движок: богатый платит больше написанного (scaledMoney).
    // Покупка владений - полная цена за все наделы или рабов разом (отзыв игрока 08.11: «показана цена только за один»).
    const buy = (e: Effect) => ('buy' in e ? -estatePrice(state, e.buy) * ('n' in e && e.buy !== 'home' ? Math.max(1, e.n ?? 1) : 1) : 0)
    const m = (c.effects ?? []).reduce((sum, e) => sum + ('param' in e && e.param === 'money' && e.delta < 0 ? scaledMoney(hero, era, e.delta) : 0) + buy(e), 0)
    return m < 0 ? formatMoney(t, Math.round(-m), coin) : null
  }
  const resultKey = outcome && outcome.choiceId !== 'ok' && !isProfession && !isName ? variantKey(lang, `ev.${ev.id}.${outcome.choiceId}.${outcome.result}`, v) : null
  const resultText = resultKey && hasKey(lang, resultKey) ? t(resultKey, params, o) : null

  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return
    if (state.queue[0]?.outcome || table || crisisStance || !armed) return
    const n = Number(e.key)
    const c = choices[n - 1]
    if (n >= 1 && n <= 4 && c && choiceAvailable(state, c, ev)) {
      e.preventDefault()
      pick(c.id)
    }
  }
  // У момента жизни заголовка нет: если он всё же попал в окно (очередь старого сохранения), служебный ключ не показываем.
  const titleKey = variantKey(lang, `ev.${ev.id}.title`, v)
  const title = hasKey(lang, titleKey) ? t(titleKey, params, o) : ''
  return (
    <div class="modal-backdrop event-backdrop">
      <div class={`modal event-sheet ${ev.turning ? 'turning' : ''}`} role="dialog" aria-modal="true" aria-labelledby={title ? 'ev-title' : undefined}>
        <Illustration era={hero.era} moment={momentOf(ev)} label={title} fire={ev.scene?.disaster === 'fire'}>
          <Scene ambient art="full" frame year={state.year} scene={ev.scene ?? { place: 'landmark' }} region={hero.region} seed={ev.id} cast={eventCast(state, active?.npcId, ev.scene?.place, eventRoles(ev), ev.topic === 'work' && (hero.cls === 'trader' || hero.cls === 'craftsman'))} label={title} />
        </Illustration>
        <div class="modal-body">
          <div class="ev-head">
            <div>
              <p class="eyebrow">{ev.turning ? `${t('event.turning')} · ` : ''}{t('diary.age', { n: hero.age })}</p>
              {title && <h2 id="ev-title">{title}</h2>}
            </div>
            {/* Справка историка - по кнопке «i» в заголовке (макет 07), раскрывается под текстом. */}
            {ev.historian_note && !short && (
              <button type="button" class="ev-info" aria-expanded={noteOpen} aria-label={t('event.note')} onClick={() => {
                if (!noteOpen) platform.track('historian_open', {})
                setNoteOpen(!noteOpen)
              }}>
                <Icon name="info" />
              </button>
            )}
          </div>
          {who && (
            <p class="event-who">
              <b>{nameOf(who.name, lang)}</b>{'\u00a0— '}{t(`npc.${roleKey(hero.npcs, who)}`, { sex: who.sex }).toLocaleLowerCase(lang)} · {npcFacts(t, lang, who, state.year)}
            </p>
          )}
          <p class="event-text">{t(short && hasKey(lang, `ev.${ev.id}.short`) ? `ev.${ev.id}.short` : eventTextKey(ev, active?.variant), params, o)}</p>
          {noteOpen && ev.historian_note && (
            <div class="note">
              <p>{t(`ev.${ev.id}.note`)}</p>
              {ev.confidence && <p class="confidence">{t(`event.confidence.${ev.confidence}`)}</p>}
            </div>
          )}

          {/* Сначала решение, потом справка и близкие (правка 04): варианты видны сразу после текста. */}
          {!outcome && table && onDiceGame && (
            <DiceGame
              state={state}
              stakes={diceStakes(state, era)}
              coin={coin}
              onGame={onDiceGame}
              onDone={() => {
                const played = !!state.queue[0]?.dice?.length
                const id = table
                setTable(null)
                if (played) onChoose(id, Date.now() - shown.current.at)
              }}
            />
          )}
          {!outcome && crisisStance && onCrisisSave && (
            <CrisisBoard
              state={state}
              era={era}
              stance={crisisStance}
              coin={coin}
              onSave={onCrisisSave}
              onDone={() => {
                const id = state.queue[0]?.crisis?.stance ?? crisisStance
                setCrisisStance(null)
                onChoose(id, Date.now() - shown.current.at)
              }}
            />
          )}
          {!outcome && !table && !crisisStance && (
            <div class={`choices ${armed ? '' : 'arming'}`} style={{ '--arm': `${CHOICE_DELAY}ms` }} aria-busy={!armed}>
              {!armed && <span class="choices-arm" aria-hidden="true" />}
              {choices.length === 0 && (
                <button class="primary" aria-disabled={!armed} onClick={() => pick(null)}>{t('event.ok')}</button>
              )}
              {choices.map((c) => {
                const ok = choiceAvailable(state, c, ev)
                const p = riskChance(state, c)
                const price = cost(c)
                const mark = marks && ok ? goalMark(marks, c) : null
                return (
                  <button class="choice" disabled={!ok} aria-disabled={!armed || undefined} onClick={() => pick(c.id)}>
                    <span>{label(c)}</span>
                    {isProfession && <span class="choice-desc">{t(`prof.${c.id}.desc`)}</span>}
                    {isProfession && hero.goal && professionClosesGoal(hero, c.id) && <span class="choice-desc goal-closes">{t('event.goal_closes', { goal: t(`goal.${hero.goal.id}.title`, {}, o) }, o)}</span>}
                    <span class="choice-meta">
                      {mark && <span class={`chip-static goal-mark ${mark}`}>{t(`event.mark.${mark}`)}</span>}
                      {price && <span class="chip-static">−{price}</span>}
                      {p !== null && <span class="chip-static">{t('event.chance', { n: Math.round(p * 100) })}</span>}
                      {!ok && <span class="chip-static lock">{lockText(c)}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {!outcome && isName && (
            <button
              type="button"
              class="link"
              onClick={() => {
                rerollNames(state)
                redrawNames((n) => n + 1)
              }}
            >
              {t('event.more_names')}
            </button>
          )}
          {!outcome && ev.id === 'estate_home' && <p class="small muted ev-note">{t('event.home_once')}</p>}
          {!outcome && !crisisStance && choices.length > 1 && <p class="ev-keys">{t('event.keys', { n: Math.min(4, choices.length) })}</p>}
          {outcome && (
            <div class="outcome">
              {outcome.result !== 'ok' && <p class={`result ${outcome.result}`}>{t(`event.${outcome.result}`)}</p>}
              {resultText && <p>{resultText}</p>}
              {outcome.rescued !== undefined && hero.diary[outcome.rescued] && <p>{diaryText(t, hero.diary[outcome.rescued], hero.sex, hero.region, hero.religion, lang)}</p>}
              {changes.length > 0 && <ChangeList changes={changes} coin={coin} />}
              <button class="primary" onClick={onDismiss} autoFocus>{t('event.next')}</button>
            </div>
          )}


          {!outcome && !crisisStance && !short && choices.length > 1 && hero.npcs.some((n) => n.alive && !n.away) && (
            <div class="note">
              <button class="link" aria-expanded={peopleOpen} onClick={() => {
                  if (!peopleOpen) platform.track('people_open', {})
                  setPeopleOpen(!peopleOpen)
                }}>
                {t('event.people')} {peopleOpen ? '▴' : '▾'}
              </button>
              {peopleOpen && <People state={state} aliveOnly />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
