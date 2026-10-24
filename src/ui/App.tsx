import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import { track } from '../analytics'
import { DEFAULT_ERA, eraById } from '../content'
import { choose, dismiss, liveYear } from '../engine/game'
import { continueWithHeir, heirs, newLife } from '../engine/life'
import { newSeed } from '../engine/rng'
import type { GameState, LifeSummary } from '../engine/types'
import { createT, detectLang } from '../i18n'
import { clearAll, loadPrefs, loadSave, parseSaveFile, saveGame, saveMemorial, savePrefs } from '../storage'
import type { Prefs } from '../storage'
import { Life } from './Life'
import { About, Heirs, Memorial, Menu, Reveal, Settings, Setup } from './Screens'
import { Summary } from './Summary'
import { changes, snapshot, UiContext } from './text'
import type { Change, Snapshot } from './text'

type Screen = 'loading' | 'menu' | 'setup' | 'reveal' | 'life' | 'death' | 'heirs' | 'memorial' | 'past' | 'settings' | 'about'

const defaultPrefs: Prefs = {
  lang: detectLang(),
  font: 'm',
  contrast: false,
  theme: 'auto',
  mode: 'quick',
  mortality: 'soft',
  softenHeavy: false,
}

export function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs(defaultPrefs))
  const [screen, setScreen] = useState<Screen>('loading')
  const [memorial, setMemorial] = useState<LifeSummary[]>([])
  const [opened, setOpened] = useState<string | null>(null)
  const game = useRef<GameState | null>(null)
  const before = useRef<Snapshot | null>(null)
  const [lastChanges, setLastChanges] = useState<Change[]>([])
  const [, rerender] = useReducer((x: number) => x + 1, 0)

  const ui = useMemo(() => ({ t: createT(prefs.lang), lang: prefs.lang }), [prefs.lang])
  const state = game.current
  const era = state ? eraById(state.hero.era) : eraById(DEFAULT_ERA)

  useEffect(() => {
    loadSave().then((save) => {
      game.current = save.game
      setMemorial(save.memorial)
      setScreen('menu')
    })
  }, [])

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
    if (before.current) setLastChanges(changes(before.current, s))
    if (s.phase === 'dead') {
      const life = s.family.lives[s.family.lives.length - 1]
      life.record = memorial.length + 1
      const next = [...memorial, life]
      setMemorial(next)
      saveMemorial(next)
      track('life_end', { era: life.era, region: life.region, age: life.age, cause: life.cause, generation: life.generation })
      setScreen('death')
    }
    persist()
  }

  const startNew = () => {
    const settings = { mode: prefs.mode, mortality: prefs.mortality, softenHeavy: prefs.softenHeavy }
    game.current = newLife(eraById(DEFAULT_ERA), settings, newSeed())
    const h = game.current.hero
    track('life_start', { era: h.era, region: h.region, cls: h.cls, sex: h.sex, mode: prefs.mode })
    setLastChanges([])
    setScreen('reveal')
    persist()
  }

  const onLive = (focus: string | null) => {
    before.current = snapshot(game.current!)
    liveYear(game.current!, era, focus)
    afterTurn()
  }

  const onChoose = (choiceId: string | null) => {
    before.current = snapshot(game.current!)
    choose(game.current!, era, choiceId)
    afterTurn()
  }

  const onDismiss = () => {
    before.current = null
    setLastChanges([])
    dismiss(game.current!, era)
    afterTurn()
  }

  const onHeir = (childId: string) => {
    game.current = continueWithHeir(game.current!, era, childId)
    track('heir_chosen', { generation: game.current.hero.generation })
    setLastChanges([])
    setScreen('reveal')
    persist()
  }

  const onExport = () => {
    const blob = new Blob([JSON.stringify({ version: 2, game: game.current, memorial })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'thousands-of-lives-save.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const onImport = async (file: File) => {
    const save = parseSaveFile(await file.text())
    if (!save) return false
    game.current = save.game
    setMemorial(save.memorial)
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
  const canContinue = !!state

  return (
    <UiContext.Provider value={ui}>
      <main class="app">
        {screen === 'loading' && <div class="screen" aria-busy="true" />}
        {screen === 'menu' && (
          <Menu
            canContinue={canContinue}
            onNew={() => setScreen('setup')}
            onContinue={() => setScreen(state?.phase === 'dead' ? 'death' : 'life')}
            go={setScreen}
          />
        )}
        {screen === 'setup' && <Setup prefs={prefs} onPrefs={setPrefs} onStart={startNew} onBack={toMenu} />}
        {screen === 'reveal' && state && <Reveal state={state} era={era} onStart={() => setScreen('life')} />}
        {screen === 'life' && state && state.phase !== 'dead' && (
          <Life state={state} era={era} onLive={onLive} onChoose={onChoose} onDismiss={onDismiss} onMenu={toMenu} lastChanges={lastChanges} />
        )}
        {screen === 'death' && state && lastLife && (
          <Summary
            life={lastLife}
            era={era}
            canContinue={heirs(state).length > 0}
            onContinue={() => setScreen('heirs')}
            onAgain={() => setScreen('setup')}
            onMemorial={() => setScreen('memorial')}
            onMenu={toMenu}
            onUpdate={onUpdateLife}
          />
        )}
        {screen === 'past' && openedLife && (
          <Summary
            life={openedLife}
            era={eraById(openedLife.era)}
            canContinue={false}
            onAgain={() => setScreen('setup')}
            onMemorial={() => setScreen('memorial')}
            onMenu={toMenu}
            onUpdate={onUpdateLife}
          />
        )}
        {screen === 'heirs' && state && <Heirs state={state} era={era} onChoose={onHeir} onBack={() => setScreen('death')} />}
        {screen === 'memorial' && (
          <Memorial
            memorial={memorial}
            onOpen={(id) => {
              setOpened(id)
              setScreen('past')
            }}
            onBack={toMenu}
          />
        )}
        {screen === 'settings' && <Settings prefs={prefs} onPrefs={setPrefs} onReset={onReset} onExport={onExport} onImport={onImport} onBack={toMenu} />}
        {screen === 'about' && <About onBack={toMenu} />}
      </main>
    </UiContext.Provider>
  )
}
