import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import { ERA_IDS, ERA_META, eraById, isEraLoaded, loadEra } from '../content'
import { choose, currentEvent, dismiss, finishYear, startYear } from '../engine/game'
import { continueWithHeir, heirs, highBirth, newLife, rollBirth } from '../engine/life'
import type { Birth } from '../engine/life'
import { newSeed } from '../engine/rng'
import type { GameState, LifeSummary } from '../engine/types'
import { createT, loadEraTexts } from '../i18n'
import { EXTERNAL, initPlatform, platform } from '../platform'
import { tickLife, trackChoice, trackLifeEnd, trackLifeStart, trackUserParams, trackYear } from '../telemetry'
import { clearAll, loadAchievements, loadPrefs, loadSave, parseSaveFile, saveAchievements, saveGame, saveMemorial, savePrefs } from '../storage'
import type { Prefs } from '../storage'
import { Life } from './Life'
import { About, ChallengeCard, CountryModal, CountryPrompt, FatePicker, Heirs, InstallCard, Memorial, Menu, Reveal, Settings, SetupModal } from './Screens'
import { Awards } from './Awards'
import { sendFeedback } from '../feedback'
import type { FeedbackData } from '../feedback'
import { Feedback, FeedbackPrompt } from './Feedback'
import { SlotMachine } from './Slots'
import { SoundControl } from './Sound'
import { initAudio, onIosHint, setMusic, setSound } from '../audio'
import { planReturn, routeTargets } from '../engine/abroad'
import { answerDream, dreamDef, resolveDream, trainingOutcome, trainingState } from '../engine/dreams'
import { DreamModal } from './Dream'
import { setArtStrength } from '../pixel/art'
import type { DreamResult } from './Dream'
import { ACH_BY_ID, checkLife, checkLive, checkMemorial, dreamLadder, nearMisses, nextGoals, schoolProgram } from '../engine/achievements'
import type { Earned } from '../engine/achievements'
import { EarlyDeath, Summary } from './Summary'
import { changes, snapshot, UiContext } from './text'
import type { Change, Snapshot } from './text'

type Screen = 'loading' | 'menu' | 'feedback' | 'reveal' | 'life' | 'death' | 'heirs' | 'memorial' | 'past' | 'settings' | 'about' | 'awards'

const defaultPrefs: Prefs = {
  lang: platform.lang(),
  font: 'm',
  contrast: false,
  theme: 'auto',
  // Первая жизнь — с настройками по умолчанию: быстрая, мягкая смертность, «как в жизни», без тяжёлых сцен.
  mode: 'quick',
  mortality: 'soft',
  softenHeavy: true,
  lottery: 'population',
}

/** Перезагрузить страницу один раз за сессию (новая версия сайта); false — уже перезагружали. */
/** До какого возраста защищена жизнь, если до неё прожито lives жизней: первые protected_lives — до first_life_min_age. */
function protectedAge(lives: number): number | undefined {
  return lives < (platform.flags.protected_lives ?? 1) ? platform.flags.first_life_min_age : undefined
}

/** Страна, выбранная игроком: только в пробный период и только после отзыва. */
function pickedCountry(prefs: Prefs): string | undefined {
  if (!EXTERNAL || !platform.flags.trial_country_pick || prefs.feedback?.state !== 'sent') return undefined
  return prefs.country && ERA_META[prefs.country] ? prefs.country : undefined
}

function reloadOnceForUpdate(): boolean {
  if (platform.sessionFlag('thousands.reloaded')) return false
  platform.setSessionFlag('thousands.reloaded')
  location.reload()
  return true
}

// Vite сообщает, что не смог подгрузить часть сборки (обычно после обновления сайта).
if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', () => reloadOnceForUpdate())

export function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs(defaultPrefs))
  const [screen, setScreen] = useState<Screen>('loading')
  const [memorial, setMemorial] = useState<LifeSummary[]>([])
  const [earned, setEarned] = useState<Earned[]>([])
  const earnedRef = useRef<Earned[]>([])
  /** Игрок решил продолжить род после конца хроники страны. */
  const offChronicle = useRef(false)
  const [achToast, setAchToast] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const game = useRef<GameState | null>(null)
  // Снимки героя: в начале года (итоги прошлого года) и перед выбором в событии.
  const yearStart = useRef<Snapshot | null>(null)
  const [yearChanges, setYearChanges] = useState<Change[]>([])
  const [choiceChanges, setChoiceChanges] = useState<Change[]>([])
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  // Лотерея рождения, пока барабаны крутятся: что выпало и загружена ли страна.
  // respin — сколько раз уже перекрутили барабан для этой жизни; auto — барабан сам дёргает рычаг (перекрутка);
  // high — вариант b A/B второй жизни: сразу высокое положение.
  const [pending, setPending] = useState<{ seed: number; birth: Birth; respin: number; auto?: boolean; high?: boolean } | null>(null)
  const [loadedVersion, setLoadedVersion] = useState(0)
  // С какого экрана открыли отзыв — туда и вернуться; благодарность после отправки.
  const [feedbackFrom, setFeedbackFrom] = useState<Screen>('menu')
  const [thanks, setThanks] = useState(false)
  const [soundHint, setSoundHint] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  // Выбор страны следующей жизни (пробный период, награда за отзыв).
  const [countryOpen, setCountryOpen] = useState(false)
  // Ранняя смерть (до 15 лет, со второй жизни) сначала показывает короткий итог.
  const [fullSummary, setFullSummary] = useState(false)
  useEffect(() => {
    if (screen !== 'death') setFullSummary(false)
  }, [screen])

  const state = game.current
  const hero = state?.hero
  const ui = useMemo(
    () => ({ t: createT(prefs.lang, hero ? { region: hero.region, religion: hero.religion } : {}), lang: prefs.lang }),
    [prefs.lang, hero?.region, hero?.religion, loadedVersion],
  )
  const era = state && isEraLoaded(state.hero.era) ? eraById(state.hero.era) : null

  /** Загрузить страну и её тексты на текущем языке. */
  const [loadError, setLoadError] = useState(false)
  /** Загрузить страну и тексты; extra — страны, где герой (или жизнь из мемориала) жил раньше, — их тексты для дневника. */
  const ensure = (eraId: string, lang = prefs.lang, extra: string[] = []) => {
    setLoadError(false)
    return Promise.all([loadEra(eraId), loadEraTexts(lang, eraId), ...extra.filter((id) => id !== eraId).map((id) => loadEraTexts(lang, id))])
      .then(() => setLoadedVersion((v) => v + 1))
      .catch(() => {
        // Чаще всего это файлы прошлой версии сайта: один раз перезагружаем страницу, потом предлагаем повторить.
        if (reloadOnceForUpdate()) return
        setLoadError(true)
      })
  }

  useEffect(() => {
    initPlatform().then(() => setArtStrength(platform.flags.art_strength ?? 0.5)).then(loadSave).then(async (save) => {
      game.current = save.game && ERA_META[save.game.hero.era] ? save.game : null
      const lives = save.memorial.filter((l) => ERA_META[l.era])
      setMemorial(lives)
      // Награды: сохранённые плюс те, что положены задним числом по уже прожитым жизням.
      const got = await loadAchievements()
      const retro = checkMemorial(lives, new Set(got.map((e) => e.id)))
      earnedRef.current = [...got, ...retro]
      setEarned(earnedRef.current)
      if (retro.length) saveAchievements(earnedRef.current)
      platform.setContext({ lang: prefs.lang, life_index: lives.length + 1, mode: prefs.mode })
      const params = new URLSearchParams(location.search)
      let referrer = ''
      try {
        referrer = document.referrer ? new URL(document.referrer).hostname : ''
      } catch {
        referrer = ''
      }
      platform.track('app_open', { referrer, life_code: params.get('life') ?? '', load_ms: Math.round(performance.now()) })
      trackUserParams(lives)
      if (game.current) await ensure(game.current.hero.era, prefs.lang, game.current.hero.erasLived)
      setScreen('menu')
      platform.ready()
    })
  }, [])

  // При смене языка подгружаем тексты уже открытых стран.
  useEffect(() => {
    const ids = ERA_IDS.filter(isEraLoaded)
    if (ids.length) Promise.all(ids.map((id) => loadEraTexts(prefs.lang, id))).then(() => setLoadedVersion((v) => v + 1))
  }, [prefs.lang])

  useEffect(() => {
    const root = document.documentElement
    root.lang = prefs.lang
    root.dataset.font = prefs.font
    root.dataset.contrast = String(prefs.contrast)
    if (prefs.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = prefs.theme
    document.title = ui.t('app.title')
  }, [prefs, ui])

  useEffect(() => window.scrollTo(0, 0), [screen])

  // Сигналы платформе об игре: игра начинается с рывка рычага лотереи рождения (onPull); знакомство с семьёй —
  // перерыв, как заставка уровня; с «Начать жизнь» на экране жизни старт и паузу решает сам экран (пауза, глава,
  // реклама); меню, настройки, мемориал, смерть и итоги — остановка.
  useEffect(() => {
    if (screen === 'life') return
    platform.gameplayStop()
  }, [screen, setupOpen])

  // Музыка: у меню своя мелодия, в жизни героя — мелодия его страны и эпохи.
  const soundOn = prefs.sound ?? true
  const volume = prefs.volume ?? 0.6
  useEffect(() => {
    // Один раз за всё время на iPhone: музыку глушит переключатель беззвучного режима.
    onIosHint(() => {
      if (platform.kvGet('thousands.sound_hint')) return
      platform.kvSet('thousands.sound_hint', '1')
      setSoundHint(true)
      setTimeout(() => setSoundHint(false), 7000)
    })
    initAudio(soundOn, volume)
  }, [])
  useEffect(() => setSound(soundOn, volume), [soundOn, volume])
  const heroEra = state?.hero.era
  useEffect(() => {
    const inLife = screen === 'reveal' || screen === 'life' || screen === 'death' || screen === 'heirs'
    if (screen !== 'loading') setMusic(inLife && heroEra ? heroEra.toLowerCase() : 'menu')
  }, [screen, heroEra])

  // Переезд в другую страну: её события и тексты. Соседние страны (куда можно уехать) подгружаются заранее,
  // пока герой подрастает, — переезд предлагается только в уже загруженные.
  const heroAdult = !!state && state.hero.age >= 14
  useEffect(() => {
    if (!heroEra) return
    if (!isEraLoaded(heroEra)) ensure(heroEra, prefs.lang, state?.hero.erasLived)
    else loadEraTexts(prefs.lang, heroEra).then(() => setLoadedVersion((v) => v + 1))
    if (!heroAdult) return
    for (const id of routeTargets(heroEra)) Promise.all([loadEra(id), loadEraTexts(prefs.lang, id)]).catch(() => {})
  }, [heroEra, heroAdult])
  const lastEra = useRef<string | undefined>(undefined)
  const lastHero = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (lastEra.current && heroEra && lastEra.current !== heroEra && state?.hero.id === lastHero.current) platform.track('emigrated', { from: lastEra.current, to: heroEra })
    lastEra.current = heroEra
    lastHero.current = state?.hero.id
  }, [heroEra])

  // Время в жизни идёт, только пока открыт экран жизни и вкладка видна.
  useEffect(() => {
    if (screen !== 'life') return
    const id = setInterval(() => {
      if (game.current && document.visibilityState === 'visible') tickLife(game.current, 1)
    }, 1000)
    return () => clearInterval(id)
  }, [screen])

  // Уход со страницы: какой экран, возраст героя, сколько длилась сессия.
  const where = useRef({ screen, age: 0 })
  where.current = { screen, age: game.current?.hero.age ?? 0 }
  useEffect(() => {
    platform.onPause((paused) => {
      if (paused) platform.track('session_end', { screen: where.current.screen, age: where.current.age, sec_in_session: Math.round(performance.now() / 1000) })
    })
  }, [])

  const soundButton = <SoundControl on={soundOn} volume={volume} onChange={(sound, v) => setPrefs({ ...prefs, sound, volume: v })} />

  const setPrefs = (p: Prefs) => {
    setPrefsState(p)
    savePrefs(p)
    platform.setContext({ lang: p.lang, mode: p.mode })
    // Режим «убрать тяжёлые сцены» действует и на текущую жизнь.
    if (game.current) game.current.settings.softenHeavy = p.softenHeavy
  }

  const persist = () => {
    saveGame(game.current)
    rerender(0)
  }

  /** Выдать награды: сохранить, показать значок (время не останавливается), отметить в аналитике. */
  const grant = (ids: string[], lifeId: string) => {
    if (!ids.length) return
    const now = Date.now()
    earnedRef.current = [...earnedRef.current, ...ids.map((id) => ({ id, ts: now, lifeId }))]
    setEarned(earnedRef.current)
    saveAchievements(earnedRef.current)
    for (const id of ids) {
      const def = ACH_BY_ID.get(id)
      const rarity = platform.flags.ach_rarity?.[id]
      platform.track('achievement_unlocked', { id, rare: def?.secret || def?.hard || (rarity !== undefined && rarity < 0.05) ? 1 : 0 })
    }
    setAchToast(ids[ids.length - 1])
    clearTimeout(achTimer.current)
    achTimer.current = window.setTimeout(() => setAchToast(null), 3500)
  }
  const achTimer = useRef<number | undefined>(undefined)
  const have = () => new Set(earnedRef.current.map((e) => e.id))

  const afterTurn = () => {
    const s = game.current!
    if (s.phase !== 'dead') grant(checkLive(s, have()), s.hero.id)
    if (s.phase === 'dead') {
      const life = s.family.lives[s.family.lives.length - 1]
      life.record = memorial.length + 1
      const next = [...memorial, life]
      setMemorial(next)
      saveMemorial(next)
      grant(checkLife(life, next, have()), life.heroId)
      trackLifeEnd(s, life)
      platform.setContext({ life_index: next.length + 1 })
      trackUserParams(next)
      setScreen('death')
    }
    persist()
  }

  /** Жребий для барабана в меню: что выпадет при рывке рычага. Страну игрок может выбрать сам — в пробный период,
   *  после отзыва; год, край и сословие решает жребий. Страна грузится с рывка рычага (onPull). */
  const rollPending = (lottery = prefs.lottery, country = pickedCountry(prefs), respin = 0, fate = fatePick) => {
    const seed = newSeed()
    // Награда за испытание: страна по выбору — вместо жребия страны.
    const fateCountry = fate && fate !== 'high' ? fate : undefined
    const rolled = rollBirth(seed, lottery, (fateCountry ? [fateCountry] : country ? [country] : ERA_IDS).map((id) => ERA_META[id]))
    // A/B второй жизни (флаг ab_buckets, только сайт): a — положение как выпало, b — сразу высокое (знать или
    // землевладельцы), где бы ни родился. Обе вторые жизни защищены до 20 лет. Смотрим, кто дольше остаётся в игре.
    // Награда «знатная семья» за испытание — так же.
    const high = (platform.name === 'web' && platform.ab() === 'b' && memorial.length === 1) || fate === 'high'
    const birth = high ? highBirth(seed, rolled, ERA_META[rolled.era]) : rolled
    setPending({ seed, birth, respin, auto: respin > 0, high })
  }
  // Испытание (флаг challenge_age): после первой жизни прожить следующую дольше N лет → награда «выбор судьбы» у барабана:
  // знатная семья или страна по выбору (один раз). Не вышло — испытание переходит на следующую жизнь.
  const challengeAge = platform.flags.challenge_age ?? 0
  const challengeOn = challengeAge > 0 && !prefs.fate
  const [fatePick, setFatePick] = useState<string | null>(null)
  const [fateCountryOpen, setFateCountryOpen] = useState(false)
  const [challengeToast, setChallengeToast] = useState(false)
  const onFate = (kind: 'high' | 'country' | null) => {
    if (kind === 'country') return setFateCountryOpen(true)
    setFatePick(kind)
    rollPending(undefined, undefined, 0, kind)
  }
  useEffect(() => {
    // Считаются годы, прожитые в этой жизни: наследник, ставший героем взрослым, испытание сразу не проходит.
    if (!challengeOn || !state || state.phase === 'dead' || memorial.length < 1 || state.hero.age - (state.settings.startAge ?? 0) <= challengeAge) return
    setPrefs({ ...prefs, fate: 'ready' })
    platform.track('challenge_done', { age: state.hero.age })
    setChallengeToast(true)
    setTimeout(() => setChallengeToast(false), 5000)
  }, [state?.hero.age, challengeOn])
  // «На главный экран» после первой жизни: Android — системное окно, iPhone — подсказка. Отложили — снова через 3 жизни.
  const [installKind, setInstallKind] = useState<'prompt' | 'ios' | null>(null)
  useEffect(() => {
    const check = () => setInstallKind(platform.installKind())
    check()
    // Chrome присылает разрешение на установку не сразу после загрузки.
    const id = setInterval(check, 3000)
    return () => clearInterval(id)
  }, [])
  const showInstall =
    !!installKind && memorial.length >= 1 && (!prefs.install || (prefs.install.state === 'later' && memorial.length >= prefs.install.lives + 3))
  const installCard = showInstall ? (
    <InstallCard
      kind={installKind!}
      onInstall={async () => {
        platform.track('install_prompt', { kind: 'prompt' })
        const ok = await platform.install()
        platform.track('install_result', { accepted: ok ? 1 : 0 })
        setPrefs({ ...prefs, install: { state: ok ? 'done' : 'later', lives: memorial.length } })
        setInstallKind(platform.installKind())
      }}
      onDone={() => {
        platform.track('install_prompt', { kind: 'ios' })
        setPrefs({ ...prefs, install: { state: 'done', lives: memorial.length } })
      }}
      onLater={() => setPrefs({ ...prefs, install: { state: 'later', lives: memorial.length } })}
    />
  ) : undefined
  /** Карточка испытания на итогах: только что кончилась первая жизнь — новое; позже — «не вышло» или «награда ждёт». */
  const challengeCard = () =>
    prefs.fate === 'ready' ? (
      <ChallengeCard kind="ready" age={challengeAge} />
    ) : challengeOn && memorial.length >= 1 ? (
      <ChallengeCard kind={memorial.length === 1 ? 'start' : 'retry'} age={challengeAge} />
    ) : undefined
  /** Перекрутить барабан, пока жизнь не начата: флаг respins (0 — нельзя, -1 — без ограничений). */
  const respinLimit = platform.flags.respins ?? 0
  const respinsLeft = pending ? (respinLimit < 0 ? Infinity : Math.max(0, respinLimit - pending.respin)) : 0
  const onRespin = () => {
    if (!pending || respinsLeft <= 0) return
    platform.track('respin', { n: pending.respin + 1, era: pending.birth.era, cls: pending.birth.cls })
    rollPending(prefs.lottery, pickedCountry(prefs), pending.respin + 1, fatePick)
  }
  // На CrazyGames после бесплатных перекруток (всего три вращения) — ещё одно за рекламу; на сайте рекламы нет.
  const adRespin = !!platform.flags.respin_ad && platform.name === 'crazygames' && respinLimit >= 0
  const [adBusy, setAdBusy] = useState(false)
  const [adFail, setAdFail] = useState(false)
  const onAdRespin = async () => {
    if (!pending || adBusy) return
    setAdBusy(true)
    const rewarded = await platform.showRewarded('respin')
    setAdBusy(false)
    if (!rewarded) {
      setAdFail(true)
      setTimeout(() => setAdFail(false), 4000)
      return
    }
    platform.track('respin', { n: pending.respin + 1, era: pending.birth.era, cls: pending.birth.cls, ad: 1 })
    rollPending(prefs.lottery, pickedCountry(prefs), pending.respin + 1, fatePick)
  }
  // В меню барабан всегда заряжен.
  useEffect(() => {
    if (screen === 'menu' && !pending) rollPending()
  }, [screen, pending])
  /** «Новая жизнь» с итогов: в меню к барабану (жребий новый). */
  const [drumFocus, setDrumFocus] = useState(0)
  const startNew = (lottery = prefs.lottery, country = pickedCountry(prefs)) => {
    rollPending(lottery, country)
    setScreen('menu')
    setDrumFocus((n) => n + 1)
  }
  const onPull = () => {
    if (!pending) return
    // Рывок рычага: где теряются новички — до барабана или после результата.
    if (pending.respin === 0) platform.track('spin', {})
    ensure(pending.birth.era)
    platform.gameplayStart()
  }

  const bornAfterSpin = () => {
    if (!pending) return
    // Первые protected_lives жизней защищены до first_life_min_age лет (флаги): герой не погибает, а «выживает чудом».
    const protectedUntil = protectedAge(memorial.length)
    // Сон о будущем: в первой жизни — наверняка к dream_first_by годам, дальше — шанс dream_chance в год;
    // сложность — по лестнице: сначала лёгкие (5 класс), следующий уровень — после решённого сна.
    const ladder = dreamLadder(memorial)
    const settings = {
      mode: prefs.mode,
      mortality: prefs.mortality,
      softenHeavy: prefs.softenHeavy,
      protectedUntil,
      livesBefore: memorial.length,
      dreamChance: platform.flags.dream_chance,
      dreamFirstBy: platform.flags.dream_first_by,
      dreamLevel: ladder.level,
      dreamsSeen: ladder.seen,
    }
    game.current = newLife(ERA_META[pending.birth.era], settings, pending.seed, undefined, pending.birth)
    const h = game.current.hero
    void h
    platform.setContext({ mode: prefs.mode })
    trackLifeStart(game.current, pickedCountry(prefs) || (fatePick && fatePick !== 'high') ? 'country' : prefs.lottery, protectedUntil !== undefined, pending.respin, pending.high)
    // Награда за испытание потрачена (если игрок что-то выбрал; «жребий» её не тратит).
    if (prefs.fate === 'ready' && fatePick) {
      setPrefs({ ...prefs, fate: 'used' })
      platform.track('fate_used', { kind: fatePick === 'high' ? 'high' : 'country', era: game.current.hero.era })
      setFatePick(null)
    }
    setPending(null)
    setYearChanges([])
    setScreen('reveal')
    persist()
  }

  const openPast = (id: string) => {
    const life = memorial.find((l) => l.heroId === id)
    if (!life) return
    setOpened(id)
    ensure(life.era, prefs.lang, life.erasLived).then(() => isEraLoaded(life.era) && setScreen('past'))
  }

  const onStart = (focus: string | null) => {
    if (!era || game.current?.phase !== 'year') return
    yearStart.current = snapshot(game.current)
    startYear(game.current, era, focus)
    afterTurn()
  }

  const onFinish = () => {
    if (!era || game.current?.phase !== 'running') return
    finishYear(game.current, era)
    trackYear(game.current)
    if (yearStart.current) setYearChanges(changes(yearStart.current, game.current))
    afterTurn()
  }

  // Сон о будущем: ответы по шагам, подсказка, итог (итог показывается после того, как сон закрыт в игре).
  const [dreamResult, setDreamResult] = useState<DreamResult | null>(null)
  const dreamStart = useRef(0)
  // Тренировка сна из «Школьной программы»: одноразовое состояние, жизнь и награды не меняются.
  const [training, setTraining] = useState<{ state: GameState; result: DreamResult | null } | null>(null)
  const startTraining = (id: string) => {
    const where = schoolProgram(memorial).where.get(id)
    if (!where || !ERA_META[where.era]) return
    ensure(where.era).then(() => {
      setTraining({ state: trainingState(ERA_META[where.era], id, where.year, (Date.now() % 2147483646) + 1), result: null })
      dreamStart.current = Date.now()
      platform.track('dream_training', { dream: id })
    })
  }
  const trainingProps = training && {
    state: training.state,
    result: training.result,
    training: true,
    onAnswer: (value: unknown) => {
      const s = training.state
      const d = s.dream
      if (!d) return
      const step = d.step
      const kind = dreamDef(d.id)?.steps[step].items[d.item].kind ?? ''
      const correct = answerDream(s, value)
      platform.track('dream_step', { dream: d.id, step: step + 1, kind, correct: correct ? 1 : 0, value: JSON.stringify(value).slice(0, 80), sec: Math.round((Date.now() - dreamStart.current) / 1000), training: 1 })
      dreamStart.current = Date.now()
      setTraining({ ...training })
    },
    // В тренировке подсказка бесплатна везде.
    onHint: () => {
      if (training.state.dream) training.state.dream.hint = true
      setTraining({ ...training })
    },
    onWake: () => {
      const d = training.state.dream
      if (!d) return
      const outcome = trainingOutcome(d.score ?? 0)
      platform.track('dream_training_end', { dream: d.id, score: d.score ?? 0, hint_used: d.hint ? 1 : 0 })
      setTraining({ ...training, result: { dream: { ...d, outcome }, outcome, era: training.state.hero.era } })
    },
    onClose: () => setTraining(null),
  }
  const dreamProps = {
    result: dreamResult,
    onAnswer: (value: unknown) => {
      const s = game.current
      if (!s?.dream) return
      const d = s.dream
      const step = d.step
      const kind = dreamDef(d.id)?.steps[step].items[d.item].kind ?? ''
      const correct = answerDream(s, value)
      platform.track('dream_step', { dream: d.id, step: step + 1, kind, correct: correct ? 1 : 0, value: JSON.stringify(value).slice(0, 80), sec: Math.round((Date.now() - dreamStart.current) / 1000) })
      dreamStart.current = Date.now()
      persist()
    },
    onHint: async () => {
      const s = game.current
      if (!s?.dream || s.dream.hint) return
      // В Яндекс Играх подсказка — за рекламу с вознаграждением, на сайте и в CrazyGames — бесплатно.
      if (platform.name === 'yandex' && !(await platform.showRewarded('dream_hint'))) return
      s.dream.hint = true
      persist()
    },
    onWake: () => {
      const s = game.current
      if (!s?.dream || !era) return
      const snap = { ...s.dream }
      const outcome = resolveDream(s, era)
      platform.track('dream_end', { dream: snap.id, score: snap.score ?? 0, outcome, hint_used: snap.hint ? 1 : 0, known: s.hero.dreamSeen?.known ? 1 : 0 })
      setDreamResult({ dream: { ...snap, outcome, known: s.hero.dreamSeen?.known }, outcome, era: s.hero.era })
      persist()
    },
    onClose: () => {
      setDreamResult(null)
      onDismiss()
    },
  }

  const onChoose = (choiceId: string | null) => {
    if (!era) return
    const intro = game.current?.queue[0]
    if (intro?.dream && currentEvent(game.current!, era)?.id === 'dream_intro') {
      platform.track(choiceId === 'try' ? 'dream_start' : 'dream_skip', { dream: intro.dream })
      dreamStart.current = Date.now()
    }
    const before = snapshot(game.current!)
    choose(game.current!, era, choiceId)
    trackChoice(game.current!)
    setChoiceChanges(changes(before, game.current!))
    afterTurn()
  }

  const onDismiss = () => {
    if (!era) return
    setChoiceChanges([])
    dismiss(game.current!, era)
    afterTurn()
  }

  const onLifestyle = (category: string, option: string) => {
    if (!game.current) return
    game.current.hero.lifestyle[category] = option
    persist()
  }

  const onHeir = (childId: string) => {
    if (!era) return
    const prevYear = game.current!.year
    game.current = continueWithHeir(game.current!, era, childId)
    // Наследник — тоже одна из первых защищённых жизней (обычно вторая): до 20 лет не погибает.
    game.current.settings.protectedUntil = protectedAge(memorial.length)
    // Испытание считает годы этой жизни — с возраста, в котором наследник стал героем.
    game.current.settings.startAge = game.current.hero.age
    // Лестница снов — с учётом сна предка.
    const ladder = dreamLadder(memorial)
    game.current.settings.dreamLevel = ladder.level
    game.current.settings.dreamsSeen = ladder.seen
    // Продолжение после конца хроники страны: с этого года — без исторических событий, вестей и справок.
    if (offChronicle.current && game.current.offChronicle === undefined) game.current.offChronicle = prevYear
    offChronicle.current = false
    platform.track('heir_chosen', { generation: game.current.hero.generation })
    trackLifeStart(game.current, 'heir', game.current.settings.protectedUntil !== undefined)
    setYearChanges([])
    setScreen('reveal')
    persist()
  }

  const onExport = () => {
    const blob = new Blob([JSON.stringify({ version: 5, game: game.current, memorial })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'thousands-of-lives-save.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const onImport = async (file: File) => {
    const save = parseSaveFile(await file.text())
    if (!save) return false
    game.current = save.game && ERA_META[save.game.hero.era] ? save.game : null
    setMemorial(save.memorial)
    if (game.current) await ensure(game.current.hero.era)
    await Promise.all([saveGame(save.game), saveMemorial(save.memorial)])
    rerender(0)
    return true
  }

  const onReset = async () => {
    await clearAll()
    game.current = null
    setMemorial([])
    earnedRef.current = []
    setEarned([])
    rerender(0)
  }

  const toMenu = () => setScreen('menu')
  /** Откуда открыты настройки: из жизни «Назад» возвращает в жизнь. */
  const [settingsFrom, setSettingsFrom] = useState<'menu' | 'life'>('menu')

  const openFeedback = (from: Screen) => {
    setFeedbackFrom(from)
    setScreen('feedback')
  }
  const onSendFeedback = (data: FeedbackData) => {
    sendFeedback(data)
    setPrefs({ ...prefs, feedback: { state: 'sent', lives: memorial.length } })
    setScreen(feedbackFrom)
    // Пробный период: награда за отзыв — выбор страны; сразу предлагаем выбрать.
    if (platform.flags.trial_country_pick) setCountryOpen(true)
    else {
      setThanks(true)
      setTimeout(() => setThanks(false), 4000)
    }
  }
  /** Страна выбрана: запоминаем и сразу к лотерее (с экрана лотереи — тянем жребий заново). */
  const onCountry = (country: string | undefined) => {
    const next = { ...prefs, country }
    setPrefs(next)
    setCountryOpen(false)
    if (country) platform.track('country_pick', { era: country })
    if (screen === 'death' || screen === 'menu') startNew(next.lottery, pickedCountry(next))
  }
  // Просим отзыв после первой жизни; если отложили — ещё раз через две жизни; после отправки — больше нет.
  const askFeedback =
    EXTERNAL &&
    memorial.length >= 1 && (!prefs.feedback || (prefs.feedback.state === 'later' && memorial.length >= prefs.feedback.lives + 2))
  const feedbackContext = (life?: LifeSummary): FeedbackData['context'] => ({
    lang: prefs.lang,
    lives: memorial.length,
    ...(life ? { era: life.era, region: life.region, age: life.age, cls: life.cls } : {}),
  })

  // Звёздочки и строка игрока сохраняются и в мемориале, и в текущей игре.
  const onUpdateLife = (life: LifeSummary) => {
    const next = memorial.map((l) => (l.heroId === life.heroId ? life : l))
    setMemorial(next)
    saveMemorial(next)
    const lives = game.current?.family.lives
    const i = lives ? lives.findIndex((l) => l.heroId === life.heroId) : -1
    if (lives && i >= 0) {
      lives[i] = life
      saveGame(game.current)
    }
  }
  const lastLife = state?.phase === 'dead' ? memorial.find((l) => l.heroId === state.hero.id) ?? state.family.lives[state.family.lives.length - 1] : null
  const openedLife = memorial.find((l) => l.heroId === opened)
  const openedEra = openedLife && isEraLoaded(openedLife.era) ? eraById(openedLife.era) : null

  const slotMachine = pending ? (
    <SlotMachine
      key={pending.seed}
      birth={pending.birth}
      seed={pending.seed}
      ready={isEraLoaded(pending.birth.era) && loadedVersion > 0}
      error={loadError}
      onRetry={() => ensure(pending.birth.era)}
      onPull={onPull}
      onDone={bornAfterSpin}
      onRespin={respinLimit !== 0 ? onRespin : undefined}
      left={respinsLeft}
      onAdRespin={adRespin ? onAdRespin : undefined}
      adBusy={adBusy}
      autoSpin={!!pending.auto}
      onSetup={memorial.length > 0 ? () => setSetupOpen(true) : undefined}
      country={pickedCountry(prefs)}
      focus={drumFocus}
      fate={prefs.fate === 'ready' ? <FatePicker pick={fatePick} onPick={onFate} /> : undefined}
    />
  ) : null

  return (
    <UiContext.Provider value={ui}>
      <main class="app">
        {screen === 'loading' && <div class="screen" aria-busy="true" />}
        {screen === 'menu' && (
          <Menu
            current={state}
            memorial={memorial}
            slot={slotMachine}
            install={installCard}
            onContinue={() => {
              if (!state) return
              const go = () => setScreen(state.phase === 'dead' ? 'death' : 'life')
              if (isEraLoaded(state.hero.era)) go()
              else ensure(state.hero.era, prefs.lang, state.hero.erasLived).then(() => isEraLoaded(state.hero.era) && go())
            }}
            onOpenLife={openPast}
            onFeedback={() => openFeedback('menu')}
            onLang={(lang) => setPrefs({ ...prefs, lang })}
            go={setScreen}
            awards={earned.length}
            sound={soundButton}
          />
        )}
        {setupOpen && (
          <SetupModal
            prefs={prefs}
            onPrefs={(next) => {
              setPrefs(next)
              // Лотерея или страна поменялись до рывка рычага — тянем жребий заново по новому правилу.
              if (next.lottery !== prefs.lottery || next.country !== prefs.country) startNew(next.lottery, pickedCountry(next))
            }}
            onClose={() => setSetupOpen(false)}
            country={
              // Отзывы — только на сайте; на порталах (CrazyGames) выбора страны за отзыв нет.
              platform.flags.trial_country_pick && EXTERNAL
                ? {
                    unlocked: prefs.feedback?.state === 'sent',
                    onFeedback: () => {
                      setSetupOpen(false)
                      openFeedback('menu')
                    },
                  }
                : undefined
            }
          />
        )}
        {countryOpen && <CountryModal current={prefs.country} onPick={onCountry} onClose={() => setCountryOpen(false)} />}
        {fateCountryOpen && (
          <CountryModal
            current={fatePick && fatePick !== 'high' ? fatePick : undefined}
            lead={ui.t('fate.country.lead')}
            onPick={(era) => {
              setFateCountryOpen(false)
              setFatePick(era ?? null)
              rollPending(undefined, undefined, 0, era ?? null)
            }}
            onClose={() => setFateCountryOpen(false)}
          />
        )}
        {screen === 'reveal' && state && era && (
          <Reveal
            state={state}
            era={era}
            onStart={() => setScreen('life')}
            note={challengeOn && memorial.length >= 1 ? ui.t('challenge.note', { n: challengeAge, m: challengeAge + 1 }) : undefined}
          />
        )}
        {screen === 'life' && state && era && state.phase !== 'dead' && (
          <Life
            state={state}
            era={era}
            onStart={onStart}
            onFinish={onFinish}
            onChoose={onChoose}
            onDismiss={onDismiss}
            onLifestyle={onLifestyle}
            onPlanReturn={() => {
              if (!game.current) return
              planReturn(game.current)
              persist()
            }}
            onMenu={toMenu}
            onSettings={() => {
              setSettingsFrom('life')
              setScreen('settings')
            }}
            choiceChanges={choiceChanges}
            yearChanges={yearChanges}
            yearSec={prefs.yearSec}
            sound={soundButton}
            dream={dreamProps}
          />
        )}
        {screen === 'death' && state && era && lastLife && !fullSummary && lastLife.age < 15 && memorial.length > 1 && (
          <EarlyDeath
            life={lastLife}
            era={era}
            onAgain={() => {
              platform.track('summary_action', { action: 'reborn', early: true })
              startNew()
            }}
            onFull={() => {
              platform.track('summary_action', { action: 'full', early: true })
              setFullSummary(true)
            }}
            challenge={
              <>
                {challengeCard()}
                {installCard}
              </>
            }
          />
        )}
        {screen === 'death' && state && era && lastLife && (fullSummary || lastLife.age >= 15 || memorial.length <= 1) && (
          <Summary
            life={lastLife}
            era={era}
            canContinue={heirs(state).length > 0}
            onContinue={() => {
              offChronicle.current = false
              setScreen('heirs')
            }}
            onOffChronicle={() => {
              offChronicle.current = true
              setScreen('heirs')
            }}
            onAgain={() => startNew()}
            onMemorial={() => setScreen('memorial')}
            onMenu={toMenu}
            onUpdate={onUpdateLife}
            challenge={
              <>
                {challengeCard()}
                {installCard}
              </>
            }
            awards={{
              got: earned.filter((e) => e.lifeId === lastLife.heroId).map((e) => e.id),
              near: nearMisses(lastLife, memorial, new Set(earned.map((e) => e.id))),
              goals: nextGoals(lastLife, new Set(earned.map((e) => e.id))),
            }}
            feedback={
              askFeedback ? (
                <FeedbackPrompt
                  reward={!!platform.flags.trial_country_pick}
                  onOpen={() => openFeedback('death')}
                  onLater={() => setPrefs({ ...prefs, feedback: { state: 'later', lives: memorial.length } })}
                />
              ) : platform.flags.trial_country_pick && prefs.feedback?.state === 'sent' ? (
                <CountryPrompt country={prefs.country} onOpen={() => setCountryOpen(true)} />
              ) : undefined
            }
          />
        )}
        {screen === 'feedback' && (
          <Feedback context={feedbackContext(lastLife ?? memorial[memorial.length - 1])} onSend={onSendFeedback} onBack={() => setScreen(feedbackFrom)} />
        )}
        {screen === 'past' && openedLife && openedEra && (
          <Summary
            life={openedLife}
            era={openedEra}
            canContinue={false}
            onAgain={() => startNew()}
            onMemorial={() => setScreen('memorial')}
            onMenu={toMenu}
            onUpdate={onUpdateLife}
          />
        )}
        {screen === 'heirs' && state && era && <Heirs state={state} era={era} onChoose={onHeir} onBack={() => setScreen('death')} />}
        {screen === 'memorial' && (
          <Memorial
            memorial={memorial}
            onOpen={openPast}
            onBack={toMenu}
          />
        )}
        {screen === 'settings' && <Settings prefs={prefs} onPrefs={setPrefs} onReset={onReset} onExport={onExport} onImport={onImport} onBack={() => {
          const back = settingsFrom
          setSettingsFrom('menu')
          if (back === 'life' && game.current && game.current.phase !== 'dead') setScreen('life')
          else toMenu()
        }} />}
        {screen === 'about' && <About onBack={toMenu} />}
        {achToast && (
          <p class="toast ach-toast" role="status" onClick={() => setAchToast(null)}>
            <span aria-hidden="true">🏅</span> {ui.t('ach.toast')} <strong>{ui.t(`ach.${achToast}.title`)}</strong>
          </p>
        )}
        {screen === 'awards' && <Awards earned={earned} memorial={memorial} onBack={toMenu} onTrain={startTraining} />}
        {screen === 'awards' && trainingProps && <DreamModal {...trainingProps} />}
        {soundHint && (
          <p class="toast" role="status" onClick={() => setSoundHint(false)}>
            {ui.t('sound.ios_hint')}
          </p>
        )}
        {thanks && (
          <p class="toast" role="status">
            {ui.t('feedback.thanks')}
          </p>
        )}
        {challengeToast && (
          <p class="toast ach-toast" role="status" onClick={() => setChallengeToast(false)}>
            <span aria-hidden="true">🏆</span> {ui.t('challenge.toast')}
          </p>
        )}
        {adFail && (
          <p class="toast" role="status" onClick={() => setAdFail(false)}>
            {ui.t('spin.ad.fail')}
          </p>
        )}
      </main>
    </UiContext.Provider>
  )
}
