import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import { ERA_IDS, ERA_META, eraById, isEraLoaded, loadEra } from '../content'
import { choose, dismiss, finishYear, startYear } from '../engine/game'
import { continueWithHeir, heirs, newLife, rollBirth } from '../engine/life'
import type { Birth } from '../engine/life'
import { newSeed } from '../engine/rng'
import type { GameState, LifeSummary } from '../engine/types'
import { createT, loadEraTexts } from '../i18n'
import { EXTERNAL, initPlatform, platform } from '../platform'
import { tickLife, trackChoice, trackLifeEnd, trackLifeStart, trackUserParams, trackYear } from '../telemetry'
import { clearAll, loadAchievements, loadPrefs, loadSave, parseSaveFile, saveAchievements, saveGame, saveMemorial, savePrefs } from '../storage'
import type { Prefs } from '../storage'
import { Life } from './Life'
import { About, Heirs, Memorial, Menu, Reveal, Settings, SetupModal } from './Screens'
import { Awards } from './Awards'
import { sendFeedback } from '../feedback'
import type { FeedbackData } from '../feedback'
import { Feedback, FeedbackPrompt } from './Feedback'
import { Slots } from './Slots'
import { SoundControl } from './Sound'
import { initAudio, onIosHint, setMusic, setSound } from '../audio'
import { planReturn, routeTargets } from '../engine/abroad'
import { ACH_BY_ID, checkLife, checkLive, checkMemorial, nearMisses, nextGoals } from '../engine/achievements'
import type { Earned } from '../engine/achievements'
import { EarlyDeath, Summary } from './Summary'
import { changes, snapshot, UiContext } from './text'
import type { Change, Snapshot } from './text'

type Screen = 'loading' | 'menu' | 'spin' | 'feedback' | 'reveal' | 'life' | 'death' | 'heirs' | 'memorial' | 'past' | 'settings' | 'about' | 'awards'

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
  const [pending, setPending] = useState<{ seed: number; birth: Birth } | null>(null)
  const [loadedVersion, setLoadedVersion] = useState(0)
  // С какого экрана открыли отзыв — туда и вернуться; благодарность после отправки.
  const [feedbackFrom, setFeedbackFrom] = useState<Screen>('menu')
  const [thanks, setThanks] = useState(false)
  const [soundHint, setSoundHint] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
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
    initPlatform().then(loadSave).then(async (save) => {
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

  // Сигналы платформе об игре: игра начинается с нажатия «Новая жизнь» (лотерея рождения); знакомство с семьёй —
  // перерыв, как заставка уровня; с «Начать жизнь» на экране жизни старт и паузу решает сам экран (пауза, глава,
  // реклама); меню, настройки, мемориал, смерть и итоги — остановка.
  useEffect(() => {
    if (screen === 'life') return
    if (screen === 'spin' && !setupOpen) platform.gameplayStart()
    else platform.gameplayStop()
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

  /** «Родиться»: тянем жребий и показываем барабаны, страна тем временем загружается. */
  const startNew = (lottery = prefs.lottery) => {
    const seed = newSeed()
    const birth = rollBirth(seed, lottery, ERA_IDS.map((id) => ERA_META[id]))
    setPending({ seed, birth })
    setScreen('spin')
    ensure(birth.era)
  }

  const bornAfterSpin = () => {
    if (!pending) return
    // Первая жизнь защищена до first_life_min_age лет (флаг): герой не погибает, а «выживает чудом».
    const protectedUntil = memorial.length === 0 ? platform.flags.first_life_min_age : undefined
    const settings = { mode: prefs.mode, mortality: prefs.mortality, softenHeavy: prefs.softenHeavy, protectedUntil }
    game.current = newLife(ERA_META[pending.birth.era], settings, pending.seed, undefined, pending.birth)
    const h = game.current.hero
    void h
    platform.setContext({ mode: prefs.mode })
    trackLifeStart(game.current, prefs.lottery, memorial.length === 0)
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

  const onChoose = (choiceId: string | null) => {
    if (!era) return
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
    // Продолжение после конца хроники страны: с этого года — без исторических событий, вестей и справок.
    if (offChronicle.current && game.current.offChronicle === undefined) game.current.offChronicle = prevYear
    offChronicle.current = false
    platform.track('heir_chosen', { generation: game.current.hero.generation })
    trackLifeStart(game.current, 'heir', false)
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

  const openFeedback = (from: Screen) => {
    setFeedbackFrom(from)
    setScreen('feedback')
  }
  const onSendFeedback = (data: FeedbackData) => {
    sendFeedback(data)
    setPrefs({ ...prefs, feedback: { state: 'sent', lives: memorial.length } })
    setThanks(true)
    setTimeout(() => setThanks(false), 4000)
    setScreen(feedbackFrom)
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

  return (
    <UiContext.Provider value={ui}>
      <main class="app">
        {screen === 'loading' && <div class="screen" aria-busy="true" />}
        {screen === 'menu' && (
          <Menu
            current={state}
            memorial={memorial}
            onNew={() => startNew()}
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
        {screen === 'spin' && pending && (
          <Slots
            birth={pending.birth}
            seed={pending.seed}
            ready={isEraLoaded(pending.birth.era) && loadedVersion > 0}
            error={loadError}
            onRetry={() => ensure(pending.birth.era)}
            onDone={bornAfterSpin}
            onBack={toMenu}
            onSetup={memorial.length > 0 ? () => setSetupOpen(true) : undefined}
          />
        )}
        {setupOpen && (
          <SetupModal
            prefs={prefs}
            onPrefs={(next) => {
              setPrefs(next)
              // Лотерея поменялась до рывка рычага — тянем жребий заново по новому правилу.
              if (next.lottery !== prefs.lottery) startNew(next.lottery)
            }}
            onClose={() => setSetupOpen(false)}
          />
        )}
        {screen === 'reveal' && state && era && <Reveal state={state} era={era} onStart={() => setScreen('life')} />}
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
            choiceChanges={choiceChanges}
            yearChanges={yearChanges}
            yearSec={prefs.yearSec}
            sound={soundButton}
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
            awards={{
              got: earned.filter((e) => e.lifeId === lastLife.heroId).map((e) => e.id),
              near: nearMisses(lastLife, memorial, new Set(earned.map((e) => e.id))),
              goals: nextGoals(lastLife, new Set(earned.map((e) => e.id))),
            }}
            feedback={
              askFeedback ? (
                <FeedbackPrompt onOpen={() => openFeedback('death')} onLater={() => setPrefs({ ...prefs, feedback: { state: 'later', lives: memorial.length } })} />
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
        {screen === 'settings' && <Settings prefs={prefs} onPrefs={setPrefs} onReset={onReset} onExport={onExport} onImport={onImport} onBack={toMenu} />}
        {screen === 'about' && <About onBack={toMenu} />}
        {achToast && (
          <p class="toast ach-toast" role="status" onClick={() => setAchToast(null)}>
            <span aria-hidden="true">🏅</span> {ui.t('ach.toast')} <strong>{ui.t(`ach.${achToast}.title`)}</strong>
          </p>
        )}
        {screen === 'awards' && <Awards earned={earned} memorial={memorial} onBack={toMenu} />}
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
      </main>
    </UiContext.Provider>
  )
}
