// Стенд партии в кости: страна, мастерство, азарт, деньги - и сама мини-игра, как в окне события.
// ?era=EUR&skill=65&lust=75&money=-20
import { render } from 'preact'
import { useMemo, useReducer, useState } from 'preact/hooks'
import '@fontsource-variable/alegreya'
import '../src/style.css'
import '../src/skin.css'
import { ERA_IDS, loadEra } from '../src/content'
import { newLife } from '../src/engine/life'
import { applyDice, diceOf, diceStakes } from '../src/engine/dice'
import type { EraDef } from '../src/engine/types'
import { createT, loadEraTexts, loadTexts } from '../src/i18n'
import { regionOf } from '../src/engine/rules'
import { UiContext } from '../src/ui/text'
import { DiceGame } from '../src/ui/DiceGame'

const q = new URLSearchParams(location.search)
await loadTexts('ru', 'common')
const eras: Record<string, EraDef> = {}
for (const id of ERA_IDS) {
  eras[id] = await loadEra(id)
  await loadEraTexts('ru', id)
}

function App() {
  const [era, setEra] = useState(q.get('era') ?? 'EUR')
  const [skill, setSkill] = useState(Number(q.get('skill') ?? 65))
  const [lust, setLust] = useState(Number(q.get('lust') ?? 75))
  const [money, setMoney] = useState(Number(q.get('money') ?? -20))
  const [n, bump] = useReducer((x: number) => x + 1, 0)
  const state = useMemo(() => {
    const s = newLife(eras[era], { mode: 'quick', mortality: 'soft', softenHeavy: false }, 4242 + n)
    s.hero.age = 34
    s.hero.money = money
    const d = diceOf(s.hero)
    d.skill = skill
    d.lust = lust
    return s
  }, [era, skill, lust, money, n])
  const [, re] = useReducer((x: number) => x + 1, 0)
  const [log, setLog] = useState<string[]>([])
  const t = createT('ru', { region: state.hero.region })
  const num = (v: number, set: (x: number) => void) => <input type="number" value={v} onChange={(e) => set(Number(e.currentTarget.value))} />
  return (
    <UiContext.Provider value={{ t, lang: 'ru' }}>
      <div class="dp">
        <div class="dp-head">
          <select value={era} onChange={(e) => setEra(e.currentTarget.value)}>{ERA_IDS.map((id) => <option>{id}</option>)}</select>
          мастерство {num(skill, setSkill)} азарт {num(lust, setLust)} деньги {num(money, setMoney)}
          <button class="chip" onClick={bump}>Новый герой</button>
        </div>
        <div class="modal event-sheet"><div class="modal-body">
          <h2>{t('ev.dice_table.title')}</h2>
          <p class="event-text">{t('ev.dice_table.text', { game: { key: 'dice.game' } })}</p>
          <DiceGame state={state} stakes={diceStakes(state, eras[era])} coin={regionOf(eras[era], state.hero.region).coin} onGame={(r) => {
            applyDice(state, eras[era], r)
            setLog([...log, `${r.stake.kind} ${r.won ? 'выигрыш' : 'проигрыш'}${r.cheated ? ', жульничал' : ''}${r.caught ? ', пойман' : ''}${r.exposed ? ', уличил' : ''} → деньги ${state.hero.money}, азарт ${state.hero.dice!.lust}`])
            re()
          }} onDone={() => setLog([...log, '— встал из-за стола'])} />
        </div></div>
        <div class="dp-log">{log.map((l) => <p>{l}</p>)}</div>
      </div>
    </UiContext.Provider>
  )
}
render(<App />, document.getElementById('app')!)
