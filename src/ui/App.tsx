import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import { ERA_IDS, ERA_META, eraById, isEraLoaded, loadEra } from '../content'
import { choose, dismiss, finishYear, startYear } from '../engine/game'
import { continueWithHeir, heirs, newLife, rollBirth } from '../engine/life'
import type { Birth } from '../engine/life'
import { newSeed } from '../engine/rng'
import type { GameState, LifeSummary } from '../engine/types'
import { createT, loadEraTexts } from '../i18n'
import { initPlatform, platform } from '../platform'
import { clearAll, loadPrefs, loadSave, parseSaveFile, saveGame, saveMemorial, savePrefs } from '../storage'
import type { Prefs } from '../storage'
import { Life } from './Life'
import { About, Heirs, Memorial, Menu, Reveal, Settings, SetupModal } from './Screens'
import { sendFeedback } from '../feedback'
import type { FeedbackData } from '../feedback'
import { Feedback, FeedbackPrompt } from './Feedback'
import { Slots } from './Slots'
import { Summary } from './Summary'
import { changes, snapshot, UiContext } from './text'
import type { Change, Snapshot } from './text'

type Screen = 'loading' | 'menu' | 'spin' | 'feedback' | 'reveal' | 'life' | 'death' | 'heirs' | 'memorial' | 'past' | 'settings' | 'about'

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
  const [setupOpen, setSetupOpen] = useState(false)

  const state = game.current
  const hero = state?.hero
  const ui = useMemo(
    () => ({ t: createT(prefs.lang, hero ? { region: hero.region, religion: hero.religion } : {}), lang: prefs.lang }),
    [prefs.lang, hero?.region, hero?.religion, loadedVersion],
  )
  const era = state && isEraLoaded(state.hero.era) ? eraById(state.hero.era) : null

  /** Загрузить страну и её тексты на текущем языке. */
  const [loadError, setLoadError] = useState(false)
  const ensure = (eraId: string, lang = prefs.lang) => {
    setLoadError(false)
    return Promise.all([loadEra(eraId), loadEraTexts(lang, eraId)])
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
      setMemorial(save.memorial.filter((l) => ERA_META[l.era]))
      if (game.current) await ensure(game.current.hero.era)
      setScreen('menu')
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

  const setPrefs = (p: Prefs) => {
    setPrefsState(p)
    savePrefs(p)
    // Режим «убрать тяжёлые сцены» действует и на текущую жизнь.
    if (game.current) game.current.settings.softenHeavy = p.softenHeavy
  }

  const persist = () => {
    saveGame(game.current)
    rerender(0)
  }

  const afterTurn = () => {
    const s = game.current!
    if (s.phase === 'dead') {
      const life = s.family.lives[s.family.lives.length - 1]
      life.record = memorial.length + 1
      const next = [...memorial, life]
      setMemorial(next)
      saveMemorial(next)
      platform.track('life_end', { era: life.era, region: life.region, age: life.age, cause: life.cause, generation: life.generation })
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
    const settings = { mode: prefs.mode, mortality: prefs.mortality, softenHeavy: prefs.softenHeavy }
    game.current = newLife(ERA_META[pending.birth.era], settings, pending.seed, undefined, pending.birth)
    const h = game.current.hero
    platform.track('life_start', { era: h.era, region: h.region, cls: h.cls, sex: h.sex, mode: prefs.mode, lottery: prefs.lottery })
    setPending(null)
    setYearChanges([])
    setScreen('reveal')
    persist()
  }

  const openPast = (id: string) => {
    const life = memorial.find((l) => l.heroId === id)
    if (!life) return
    setOpened(id)
    ensure(life.era).then(() => isEraLoaded(life.era) && setScreen('past'))
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
    if (yearStart.current) setYearChanges(changes(yearStart.current, game.current))
    afterTurn()
  }

  const onChoose = (choiceId: string | null) => {
    if (!era) return
    const before = snapshot(game.current!)
    choose(game.current!, era, choiceId)
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
    game.current = continueWithHeir(game.current!, era, childId)
    platform.track('heir_chosen', { generation: game.current.hero.generation })
    setYearChanges([])
    setScreen('reveal')
    persist()
  }

  const onExport = () => {
    const blob = new Blob([JSON.stringify({ version: 4, game: game.current, memorial })], { type: 'application/json' })
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
              else ensure(state.hero.era).then(() => isEraLoaded(state.hero.era) && go())
            }}
            onOpenLife={openPast}
            onFeedback={() => openFeedback('menu')}
            onLang={(lang) => setPrefs({ ...prefs, lang })}
            go={setScreen}
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
            onMenu={toMenu}
            choiceChanges={choiceChanges}
            yearChanges={yearChanges}
          />
        )}
        {screen === 'death' && state && era && lastLife && (
          <Summary
            life={lastLife}
            era={era}
            canContinue={heirs(state).length > 0}
            onContinue={() => setScreen('heirs')}
            onAgain={() => startNew()}
            onMemorial={() => setScreen('memorial')}
            onMenu={toMenu}
            onUpdate={onUpdateLife}
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
        {thanks && (
          <p class="toast" role="status">
            {ui.t('feedback.thanks')}
          </p>
        )}
      </main>
    </UiContext.Provider>
  )
}
