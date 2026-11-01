import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import { ERA_IDS, ERA_META, eraById, isEraLoaded, loadEra } from '../content'
import { choose, currentEvent, dismiss, finishYear, startYear } from '../engine/game'
import { continueWithHeir, heirs, highBirth, newLife, pickKidsTarget, rollBirth, royalBirth } from '../engine/life'
import type { Birth } from '../engine/life'
import { newSeed, next } from '../engine/rng'
import type { GameState, LifeSummary } from '../engine/types'
import { createT, loadEraTexts } from '../i18n'
import { EXTERNAL, initPlatform, platform } from '../platform'
import { tickLife, trackChoice, trackLifeEnd, trackLifeStart, trackUserParams, trackYear } from '../telemetry'
import { clearAll, loadAchievements, loadPrefs, loadSave, parseSaveFile, saveAchievements, saveGame, saveMemorial, savePrefs } from '../storage'
import type { Prefs } from '../storage'
import { Life } from './Life'
import { About, ChallengeCard, CountryModal, DailyCard, FatePicker, GiftsSheet, Heirs, InstallCard, Memorial, Menu, Reveal, Settings, SetupModal } from './Screens'
import { CHEST_GIFT, dailyNext, dayKey, GIFT_ICON, GIFTS, HEALTH_GIFT, RESPIN_GIFT, spendGifts } from '../daily'
import type { Gift } from '../daily'
import { Awards } from './Awards'
import { sendFeedback } from '../feedback'
import type { FeedbackData } from '../feedback'
import { Feedback, FeedbackPrompt } from './Feedback'
import { SlotMachine } from './Slots'
import { Icon } from './Icon'
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
  // Первая жизнь - с настройками по умолчанию: быстрая, мягкая смертность, «как в жизни», без тяжёлых сцен.
  mode: 'quick',
  mortality: 'soft',
  softenHeavy: true,
  lottery: 'population',
}

/** Перезагрузить страницу один раз за сессию (новая версия сайта); false - уже перезагружали. */
/** До какого возраста защищена жизнь, если до неё прожито lives жизней: первые protected_lives - до first_life_min_age. */
function protectedAge(lives: number): number | undefined {
  return lives < (platform.flags.protected_lives ?? 1) ? platform.flags.first_life_min_age : undefined
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
  const [prefs, setPrefsState] = useState<Prefs>(() => {
    const p = loadPrefs(defaultPrefs)
    // Сборка только с частью языков (CrazyGames - английский): сохранённый язык вне сборки не берём.
    return platform.languages && !platform.languages.includes(p.lang) ? { ...p, lang: platform.languages[0] } : p
  })
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
  // respin - сколько раз уже перекрутили барабан для этой жизни; auto - барабан сам дёргает рычаг (перекрутка);
  // high - вариант b A/B второй жизни: сразу высокое положение.
  const [pending, setPending] = useState<{ seed: number; birth: Birth; respin: number; auto?: boolean; high?: boolean; royal?: boolean } | null>(null)
  const [loadedVersion, setLoadedVersion] = useState(0)
  // С какого экрана открыли отзыв - туда и вернуться; благодарность после отправки.
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
    // Пол героя - по умолчанию для всех текстов: {g:он|она} без явного пола иначе брал бы мужскую форму.
    // Без текущего героя (меню, награды) - пол последнего прожитого.
    () => ({ t: createT(prefs.lang, hero ? { region: hero.region, religion: hero.religion, sex: hero.sex } : { sex: memorial[memorial.length - 1]?.sex }), lang: prefs.lang }),
    [prefs.lang, hero?.region, hero?.religion, hero?.sex, memorial, loadedVersion],
  )
  const era = state && isEraLoaded(state.hero.era) ? eraById(state.hero.era) : null

  /** Загрузить страну и её тексты на текущем языке. */
  const [loadError, setLoadError] = useState(false)
  /** Загрузить страну и тексты; extra - страны, где герой (или жизнь из мемориала) жил раньше, - их тексты для дневника. */
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
      // Сборка для портала без части событий (PEGI 12): и в сохранённой жизни их больше нет.
      if (game.current && platform.blockedEvents) game.current.settings.blockedEvents = platform.blockedEvents
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
    document.title = `${ui.t('app.title')}: ${ui.t('menu.subtitle')}`
  }, [prefs, ui])

  // Новый экран - с начала (во вложенном окне прокручивается body, см. style.css html.framed).
  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.scrollTop = 0
  }, [screen])

  // Сигналы платформе об игре: игра начинается с рывка рычага лотереи рождения (onPull); знакомство с семьёй -
  // перерыв, как заставка уровня; с «Начать жизнь» на экране жизни старт и паузу решает сам экран (пауза, глава,
  // реклама); меню, настройки, мемориал, смерть и итоги - остановка.
  useEffect(() => {
    if (screen === 'life') return
    platform.gameplayStop()
  }, [screen, setupOpen])

  // Музыка: у меню своя мелодия, в жизни героя - мелодия его страны и эпохи.
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
  // пока герой подрастает, - переезд предлагается только в уже загруженные.
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
  const where = useRef({ screen, age: 0, lives: 0, hero: false })
  where.current = { screen, age: game.current?.hero.age ?? 0, lives: memorial.length, hero: !!state && state.phase !== 'dead' }
  useEffect(() => {
    platform.onPause((paused) => {
      if (paused) platform.track('session_end', { screen: where.current.screen, age: where.current.age, sec_in_session: Math.round(performance.now() / 1000) })
      if (where.current.screen !== 'menu') return
      const m = menuVisit.current
      if (paused) {
        platform.track('menu_leave', {
          sec: Math.round((performance.now() - m.since) / 1000),
          drum: m.drum,
          button: m.button ? 1 : 0,
          spun: m.spun ? 1 : 0,
          gifts: m.gifts ? 1 : 0,
          scroll: m.scroll,
          vw: window.innerWidth,
          vh: window.innerHeight,
          lives: where.current.lives,
          hero: where.current.hero ? 1 : 0,
          played: playedThisVisit.current ? 1 : 0,
        })
      } else m.since = performance.now()
    })
  }, [])

  // Уход из меню (menu_leave, docs/ANALYTICS.md): сколько секунд пробыл, какую часть барабана видел (процент),
  // видел ли кнопку «Крути» целиком, крутил ли, открывал ли дары, насколько прокрутил страницу.
  const menuVisit = useRef({ since: 0, drum: 0, button: false, spun: false, gifts: false, scroll: 0 })
  useEffect(() => {
    if (screen !== 'menu') return
    menuVisit.current = { since: performance.now(), drum: 0, button: false, spun: false, gifts: false, scroll: 0 }
    // Прокрутка окна или body (во вложенном окне): события прокрутки элементов не всплывают - ловим на погружении.
    const onScroll = () => (menuVisit.current.scroll = Math.max(menuVisit.current.scroll, Math.round(window.scrollY), document.body.scrollTop))
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [screen])
  // Барабан пересоздаётся с каждым жребием - следим за новым.
  useEffect(() => {
    if (screen !== 'menu' || typeof IntersectionObserver === 'undefined') return
    const drum = document.querySelector('.menu .spin')
    const button = document.querySelector('.menu .spin-button')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === drum) menuVisit.current.drum = Math.max(menuVisit.current.drum, Math.round(e.intersectionRatio * 100))
          else if (e.intersectionRatio >= 0.9) menuVisit.current.button = true
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 0.9, 1] },
    )
    if (drum) io.observe(drum)
    if (button) io.observe(button)
    return () => io.disconnect()
  }, [screen, pending?.seed])

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

  // Дары за вход (src/daily.ts): каждый день серии - дар на следующую жизнь с барабана, на седьмой - царская семья.
  // Календарь - с конца первой жизни (новичок сразу идёт к барабану): на итогах и в меню под «Продолжить»; над барабаном -
  // кнопка «Дар дня N ждёт» и дары, которые сработают в этой жизни. День - по времени сервера.
  const gifts = prefs.gifts ?? []
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    let offset = 0
    const tick = () => setToday(dayKey(Date.now() + offset))
    platform.serverTime().then((ms) => {
      offset = ms - Date.now()
      tick()
    })
    // Вкладка открыта за полночь - новый день наступает и без перезагрузки.
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [])
  const dailyNow = today && memorial.length >= 1 ? dailyNext(prefs.daily, today) : null
  const [giftToast, setGiftToast] = useState<Gift | null>(null)
  const claimDaily = () => {
    if (!dailyNow || !today) return
    const gift = GIFTS[dailyNow.day - 1]
    setPrefs({ ...prefs, daily: { last: today, day: dailyNow.day }, gifts: [...gifts, gift] })
    platform.track('daily_claim', { day: dailyNow.day, gift, ...(dailyNow.broken ? { broken: 1 } : {}) })
    setGiftToast(gift)
    setTimeout(() => setGiftToast(null), 4000)
  }
  const dailyCard =
    today && memorial.length >= 1 ? <DailyCard day={dailyNow?.day ?? prefs.daily?.day ?? 1} claimable={!!dailyNow} broken={dailyNow?.broken} onClaim={claimDaily} /> : undefined
  // Дар «Страна по выбору» (дар первого дня и награда за отзыв): страну игрок выбирает у барабана; не выбрал - дар ждёт
  // следующей жизни.
  const [giftCountry, setGiftCountry] = useState<string | null>(null)
  const [giftCountryOpen, setGiftCountryOpen] = useState(false)
  const chosenCountry = () => (gifts.includes('country') && giftCountry) || null
  const royalWanted = prefs.royal === 'ready' || gifts.includes('royal')

  /** Жребий для барабана в меню: что выпадет при рывке рычага. Страну игрок может выбрать сам - по дару «Страна по
   *  выбору» (null - жребий); год, край и сословие решает жребий. Страна грузится с рывка рычага (onPull). */
  const rollPending = (lottery = prefs.lottery, country: string | null = chosenCountry(), respin = 0, fate = fatePick, royal = royalWanted) => {
    const seed = newSeed()
    // Награда за испытание: страна по выбору - вместо жребия страны.
    const fateCountry = fate && fate !== 'high' ? fate : undefined
    const rolled = rollBirth(seed, lottery, (fateCountry ? [fateCountry] : country ? [country] : ERA_IDS).map((id) => ERA_META[id]))
    // A/B второй жизни (флаг ab_buckets, только сайт): a - положение как выпало, b - сразу высокое (знать или
    // землевладельцы), где бы ни родился. Обе вторые жизни защищены до 20 лет. Смотрим, кто дольше остаётся в игре.
    // Награда «знатная семья» за испытание и дар четвёртого дня - так же.
    const high = (platform.name === 'web' && platform.ab() === 'b' && memorial.length === 1) || fate === 'high' || gifts.includes('noble')
    // Награда за главный экран и дар седьмого дня - царская семья, где бы ни родился (поверх A/B и «знатной семьи»).
    const birth = royal ? royalBirth(seed, rolled, ERA_META[rolled.era]) : high ? highBirth(seed, rolled, ERA_META[rolled.era]) : rolled
    setPending({ seed, birth, respin, auto: respin > 0, high, royal })
  }
  // Испытание (флаг challenge_age): после первой жизни прожить следующую дольше N лет → награда «выбор судьбы» у барабана:
  // знатная семья или страна по выбору (один раз). Не вышло - испытание переходит на следующую жизнь.
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
  // «На главный экран» после первой жизни: Android - системное окно, iPhone - подсказка. Отложили - снова через 3 жизни.
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
  // Награда за установку - следующая жизнь в царской семье (один раз): Android - как только игрок согласился в системном
  // окне; iPhone (и любая установка не через карточку) - при первом запуске с главного экрана. На iPhone игра с главного
  // экрана хранит жизни отдельно от Safari, поэтому награда и должна появиться там.
  const [royalToast, setRoyalToast] = useState(false)
  const royalReward = (via: 'prompt' | 'home'): Partial<Prefs> => {
    if (prefs.royal) return {}
    platform.track('install_reward', { via })
    setRoyalToast(true)
    setTimeout(() => setRoyalToast(false), 5000)
    return { royal: 'ready' }
  }
  useEffect(() => {
    if (platform.installed() && !prefs.royal) setPrefs({ ...prefs, ...royalReward('home') })
  }, [])
  // Награда или дар пришли, когда барабан в меню уже заряжен, - перезарядить: царской семьёй (выбор судьбы подождёт)
  // или знатной.
  useEffect(() => {
    if (screen !== 'menu' || !pending) return
    if (royalWanted && !pending.royal) {
      setFatePick(null)
      rollPending(prefs.lottery, chosenCountry(), 0, null, true)
    } else if (!royalWanted && gifts.includes('noble') && !pending.high) rollPending(prefs.lottery, chosenCountry(), 0)
  }, [screen, pending, royalWanted, prefs.gifts])
  const installCardFor = (compact = false) =>
    showInstall ? (
    <InstallCard
      compact={compact}
      kind={installKind!}
      reward={!prefs.royal}
      onInstall={async () => {
        platform.track('install_prompt', { kind: 'prompt' })
        const ok = await platform.install()
        platform.track('install_result', { accepted: ok ? 1 : 0 })
        setPrefs({ ...prefs, install: { state: ok ? 'done' : 'later', lives: memorial.length }, ...(ok ? royalReward('prompt') : {}) })
        setInstallKind(platform.installKind())
      }}
      onDone={() => {
        platform.track('install_prompt', { kind: 'ios' })
        setPrefs({ ...prefs, install: { state: 'done', lives: memorial.length } })
      }}
      onLater={() => setPrefs({ ...prefs, install: { state: 'later', lives: memorial.length } })}
    />
  ) : undefined
  const installCard = installCardFor()
  /** Карточка испытания на итогах: только что кончилась первая жизнь - новое; позже - «не вышло» или «награда ждёт». */
  const challengeCard = () =>
    prefs.fate === 'ready' ? (
      <ChallengeCard kind="ready" age={challengeAge} />
    ) : challengeOn && memorial.length >= 1 ? (
      <ChallengeCard kind={memorial.length === 1 ? 'start' : 'retry'} age={challengeAge} />
    ) : undefined
  /** Перекрутить барабан, пока жизнь не начата: флаг respins (0 - нельзя, -1 - без ограничений) и дар второго дня. */
  const baseRespins = platform.flags.respins ?? 0
  const respinLimit = baseRespins >= 0 && gifts.includes('respins') ? baseRespins + RESPIN_GIFT : baseRespins
  const respinsLeft = pending ? (respinLimit < 0 ? Infinity : Math.max(0, respinLimit - pending.respin)) : 0
  const onRespin = () => {
    if (!pending || respinsLeft <= 0) return
    platform.track('respin', { n: pending.respin + 1, era: pending.birth.era, cls: pending.birth.cls })
    rollPending(prefs.lottery, chosenCountry(), pending.respin + 1, fatePick)
  }
  // На CrazyGames после бесплатных перекруток (всего три вращения) - ещё одно за рекламу; на сайте рекламы нет.
  const adsBlocked = !!platform.adsBlocked?.()
  const adRespin = !!platform.flags.respin_ad && platform.name === 'crazygames' && respinLimit >= 0 && !adsBlocked
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
    rollPending(prefs.lottery, chosenCountry(), pending.respin + 1, fatePick)
  }
  // В меню барабан всегда заряжен.
  useEffect(() => {
    if (screen === 'menu' && !pending) rollPending()
  }, [screen, pending])
  /** «Новая жизнь» с итогов: в меню к барабану (жребий новый). */
  const [drumFocus, setDrumFocus] = useState(0)
  const startNew = (lottery = prefs.lottery, country: string | null = chosenCountry()) => {
    rollPending(lottery, country)
    setScreen('menu')
    setDrumFocus((n) => n + 1)
  }
  const onPull = () => {
    if (!pending) return
    // Рывок рычага: где теряются новички - до барабана или после результата.
    if (pending.respin === 0) platform.track('spin', {})
    menuVisit.current.spun = true
    ensure(pending.birth.era)
    platform.gameplayStart()
  }

  const bornAfterSpin = () => {
    if (!pending) return
    // Первые protected_lives жизней защищены до first_life_min_age лет (флаги): герой не погибает, а «выживает чудом».
    const protectedUntil = protectedAge(memorial.length)
    // Сон о будущем: в первой жизни - наверняка к dream_first_by годам, дальше - шанс dream_chance в год;
    // сложность - по лестнице: сначала лёгкие (5 класс), следующий уровень - после решённого сна.
    const ladder = dreamLadder(memorial)
    // Дары за вход, которые срабатывают в этой жизни: каждый вид - один раз; царская семья перекрывает знатную;
    // страна - если игрок её выбрал (и не выбрал другую за испытание).
    const fateCountry = fatePick && fatePick !== 'high' ? fatePick : null
    const used: Gift[] = []
    if (gifts.includes('royal') && pending.royal && prefs.royal !== 'ready') used.push('royal')
    if (gifts.includes('noble') && !pending.royal) used.push('noble')
    if (gifts.includes('country') && giftCountry && !fateCountry && pending.birth.era === giftCountry) used.push('country')
    for (const g of ['respins', 'health', 'dream', 'chest'] as const) if (gifts.includes(g)) used.push(g)
    const unique = memorial.length < (platform.flags.unique_lives ?? 0)
    const settings = {
      mode: prefs.mode,
      mortality: prefs.mortality,
      softenHeavy: prefs.softenHeavy,
      protectedUntil,
      livesBefore: memorial.length,
      blockedEvents: platform.blockedEvents,
      dreamChance: platform.flags.dream_chance,
      dreamFirstBy: platform.flags.dream_first_by,
      dreamLevel: ladder.level,
      dreamsSeen: ladder.seen,
      dreamSure: used.includes('dream') || undefined,
      // Истории рождения прошлых жизней (события первого года) - чтобы начало жизни не повторялось.
      birthSeen: [...new Set(memorial.flatMap((l) => (l.diary ?? []).filter((d) => d.age === 0 && d.eventId).map((d) => d.eventId!)))],
      // Первые жизни игрока уникальны: события прошлых жизней не повторяются, детей - своё число в каждой.
      ...(unique
        ? {
            eventsSeen: [...new Set(memorial.flatMap((l) => (l.diary ?? []).map((d) => d.eventId).filter((id): id is string => !!id)))],
            kidsTarget: pickKidsTarget(memorial.filter((l) => l.age >= 25).map((l) => l.children), ((h) => () => next(h))({ rng: (pending.seed ^ 0x9e3779b9) >>> 0 })),
          }
        : {}),
    }
    const boons = { health: used.includes('health') ? HEALTH_GIFT : 0, wealth: used.includes('chest') ? CHEST_GIFT : 0 }
    const birth = boons.health || boons.wealth ? { ...pending.birth, boons } : pending.birth
    game.current = newLife(ERA_META[pending.birth.era], settings, pending.seed, undefined, birth)
    platform.setContext({ mode: prefs.mode })
    trackLifeStart(game.current, chosenCountry() || fateCountry ? 'country' : prefs.lottery, protectedUntil !== undefined, pending.respin, pending.high, pending.royal, used)
    // Награды потрачены: за испытание (если игрок что-то выбрал; «жребий» её не тратит), за главный экран и дары за вход.
    const spent: Partial<Prefs> = {}
    if (used.length) spent.gifts = spendGifts(gifts, used)
    if (used.includes('country')) setGiftCountry(null)
    if (prefs.fate === 'ready' && fatePick) {
      spent.fate = 'used'
      platform.track('fate_used', { kind: fatePick === 'high' ? 'high' : 'country', era: game.current.hero.era })
      setFatePick(null)
    }
    if (pending.royal && prefs.royal === 'ready') {
      spent.royal = 'used'
      platform.track('royal_used', { era: game.current.hero.era, region: game.current.hero.region })
    }
    if (Object.keys(spent).length) setPrefs({ ...prefs, ...spent })
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
      // В Яндекс Играх подсказка - за рекламу с вознаграждением, на сайте и в CrazyGames - бесплатно.
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
    // Наследник - тоже одна из первых защищённых жизней (обычно вторая): до 20 лет не погибает.
    game.current.settings.protectedUntil = protectedAge(memorial.length)
    // Испытание считает годы этой жизни - с возраста, в котором наследник стал героем.
    game.current.settings.startAge = game.current.hero.age
    // Лестница снов - с учётом сна предка.
    const ladder = dreamLadder(memorial)
    game.current.settings.dreamLevel = ladder.level
    game.current.settings.dreamsSeen = ladder.seen
    // Дар «Вещий сон» был у предка, а не у наследника.
    game.current.settings.dreamSure = undefined
    // Продолжение после конца хроники страны: с этого года - без исторических событий, вестей и справок.
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
    setScreen(feedbackFrom)
    // Пробный период: награда за отзыв - дар «Страна по выбору» на одну жизнь; сразу предлагаем выбрать.
    const reward = !!platform.flags.trial_country_pick
    setPrefs({ ...prefs, feedback: { state: 'sent', lives: memorial.length }, ...(reward ? { gifts: [...gifts, 'country'] } : {}) })
    if (reward) setCountryOpen(true)
    else {
      setThanks(true)
      setTimeout(() => setThanks(false), 4000)
    }
  }
  /** Страна за отзыв выбрана: сразу к барабану (с итогов или из меню - жребий заново). Не выбрал - дар ждёт у барабана. */
  const onCountry = (country: string | undefined) => {
    setCountryOpen(false)
    setGiftCountry(country ?? null)
    if (country) platform.track('country_pick', { era: country })
    if (screen === 'death' || screen === 'menu') startNew(prefs.lottery, country ?? null)
  }
  // Просим отзыв после первой жизни; если отложили - ещё раз через две жизни; после отправки - больше нет.
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

  // «Дары» (макет A): всё, что меняет следующую жизнь, - в одной панели; кнопка над барабаном показывает, сколько ждёт.
  const [giftsOpen, setGiftsOpen] = useState(false)
  const royalSource = prefs.royal === 'ready' ? 'install' : gifts.includes('royal') ? 'daily' : undefined
  const activeGifts = [...new Set(gifts)].filter((g) => g !== 'royal' && !(g === 'noble' && royalWanted))
  const fateWaiting = prefs.fate === 'ready' && !royalWanted
  const giftsCount = (dailyNow ? 1 : 0) + (fateWaiting ? 1 : 0) + (royalWanted ? 1 : 0) + activeGifts.length
  const openGifts = () => {
    platform.track('gifts_open', { auto: 0, n: giftsCount })
    menuVisit.current.gifts = true
    setGiftsOpen(true)
  }
  // Дар дня ждёт - панель сама открывается один раз в день, при входе в игру (после жизни дар дня и так на итогах).
  const playedThisVisit = useRef(false)
  if (screen === 'life' || screen === 'death' || screen === 'reveal') playedThisVisit.current = true
  useEffect(() => {
    if (screen !== 'menu' || playedThisVisit.current || !dailyNow || !today || prefs.dailyShown === today) return
    setPrefs({ ...prefs, dailyShown: today })
    setGiftsOpen(true)
    menuVisit.current.gifts = true
    platform.track('gifts_open', { auto: 1, n: giftsCount })
  }, [screen, dailyNow?.day, today])
  const giftsButton =
    memorial.length >= 1 ? (
      <button class={giftsCount ? 'gifts-btn has' : 'gifts-btn'} onClick={openGifts}>
        <Icon name="gift" /> {ui.t('gifts.button')}
        {giftsCount > 0 && <span class="n">{giftsCount}</span>}
      </button>
    ) : undefined
  /** Ярлыки наград на окнах барабана: страна по дару или за испытание, знать или царская семья. */
  const drumTags = (royal?: boolean) => {
    const fateCountry = fatePick && fatePick !== 'high' ? fatePick : null
    const country = fateCountry ?? (gifts.includes('country') ? giftCountry : null)
    return {
      where: country ? { icon: 'lock' as const, text: ui.t(`era.${country}.short`) } : undefined,
      status: royal ? { icon: 'crown' as const, text: ui.t('drum.tag.royal') } : gifts.includes('noble') || fatePick === 'high' ? { icon: 'crown' as const, text: ui.t('drum.tag.noble') } : undefined,
    }
  }
  const giftsSheet = giftsOpen && (
    <GiftsSheet
      onClose={() => setGiftsOpen(false)}
      royal={royalSource}
      fate={fateWaiting ? <FatePicker pick={fatePick} onPick={(kind) => {
        if (kind === 'country') setGiftsOpen(false)
        onFate(kind)
      }} /> : undefined}
      daily={today && memorial.length >= 1 ? <DailyCard compact day={dailyNow?.day ?? prefs.daily?.day ?? 1} claimable={!!dailyNow} broken={dailyNow?.broken} onClaim={claimDaily} /> : undefined}
      dailyDay={dailyNow?.day ?? prefs.daily?.day}
      country={gifts.includes('country') ? { value: giftCountry, onPick: () => {
        setGiftsOpen(false)
        setGiftCountryOpen(true)
      } } : undefined}
      gifts={activeGifts}
      install={installCardFor(true)}
    />
  )

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
      adsBlocked={adsBlocked}
      autoSpin={!!pending.auto}
      onSetup={memorial.length > 0 ? () => setSetupOpen(true) : undefined}
      focus={drumFocus}
      gifts={giftsButton}
      tags={drumTags(pending.royal)}
    />
  ) : null

  return (
    <UiContext.Provider value={ui}>
      <main class="app">
        {screen === 'loading' && <div class="screen" aria-busy="true" />}
        {screen === 'menu' && (
          <Menu
            current={state}
            slot={slotMachine}
            onContinue={() => {
              if (!state) return
              const go = () => setScreen(state.phase === 'dead' ? 'death' : 'life')
              if (isEraLoaded(state.hero.era)) go()
              else ensure(state.hero.era, prefs.lang, state.hero.erasLived).then(() => isEraLoaded(state.hero.era) && go())
            }}
            onFeedback={() => openFeedback('menu')}
            onLang={(lang) => setPrefs({ ...prefs, lang })}
            go={setScreen}
            sound={soundButton}
          />
        )}
        {screen === 'menu' && giftsSheet}
        {setupOpen && (
          <SetupModal
            prefs={prefs}
            onPrefs={(next) => {
              setPrefs(next)
              // Лотерея поменялась до рывка рычага - тянем жребий заново по новому правилу.
              if (next.lottery !== prefs.lottery) startNew(next.lottery)
            }}
            onClose={() => setSetupOpen(false)}
            onFeedback={
              // Отзывы - только на сайте; на порталах (CrazyGames) награды за отзыв нет.
              platform.flags.trial_country_pick && EXTERNAL && prefs.feedback?.state !== 'sent'
                ? () => {
                    setSetupOpen(false)
                    openFeedback('menu')
                  }
                : undefined
            }
          />
        )}
        {countryOpen && <CountryModal current={giftCountry ?? undefined} onPick={onCountry} onClose={() => setCountryOpen(false)} />}
        {giftCountryOpen && (
          <CountryModal
            current={giftCountry ?? undefined}
            lead={ui.t('gift.country.lead')}
            onPick={(era) => {
              setGiftCountryOpen(false)
              setGiftCountry(era ?? null)
              rollPending(undefined, era ?? null)
            }}
            onClose={() => setGiftCountryOpen(false)}
          />
        )}
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
                {dailyCard}
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
                {dailyCard}
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
            <Icon name="medal" /> {ui.t('ach.toast')} <strong>{ui.t(`ach.${achToast}.title`)}</strong>
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
            <Icon name="trophy" /> {ui.t('challenge.toast')}
          </p>
        )}
        {giftToast && (
          <p class="toast ach-toast" role="status" onClick={() => setGiftToast(null)}>
            <Icon name={GIFT_ICON[giftToast]} /> {ui.t('daily.toast', { gift: { key: `gift.${giftToast}` } })}
          </p>
        )}
        {royalToast && (
          <p class="toast ach-toast" role="status" onClick={() => setRoyalToast(false)}>
            <Icon name="crown" /> {ui.t('royal.toast')}
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
