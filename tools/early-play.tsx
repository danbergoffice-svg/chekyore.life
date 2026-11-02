// Стенд ранней игры (2–4 года): страна, сколько жизней прожито, язык; сыгранные игры копятся, как у игрока.
import { render } from 'preact'
import { useState } from 'preact/hooks'
import '@fontsource-variable/alegreya'
import '../src/style.css'
import '../src/skin.css'
import { EarlyGame } from '../src/kids/EarlyGame'
import type { EarlyResult } from '../src/kids/early'
import { Stars } from '../src/kids/KidsGame'
import type { KidsLang } from '../src/kids/types'

const ERAS: Record<string, string> = {
  ANE: 'Египет и Двуречье', E03: 'Античность', MAY: 'Майя', AMR: 'Ацтеки и инки', CHN: 'Китай', JPN: 'Япония', IND: 'Индия',
  ISL: 'Исламский мир', BYZ: 'Византия', EUR: 'Европа', RUS: 'Русь', ETH: 'Эфиопия', WAF: 'Мали и Сонгай',
}
const REGION: Record<string, string> = {
  ANE: 'thebes', E03: 'rome', MAY: 'tikal', AMR: 'cusco', CHN: 'hangzhou', JPN: 'kyoto', IND: 'delhi', ISL: 'baghdad',
  BYZ: 'constantinople', EUR: 'florence', RUS: 'novgorod', ETH: 'shewa', WAF: 'timbuktu',
}

function App() {
  const q = new URLSearchParams(location.search)
  const [era, setEra] = useState(q.get('era') ?? 'CHN')
  const [lives, setLives] = useState(Number(q.get('lives') ?? 0))
  const [lang, setLang] = useState<KidsLang>((q.get('lang') as KidsLang) ?? 'ru')
  const [seen, setSeen] = useState<string[]>(q.get('seen')?.split(',').filter(Boolean) ?? [])
  const [seed, setSeed] = useState(Number(q.get('seed') ?? 1 + Math.floor(Math.random() * 1e6)))
  const [log, setLog] = useState<EarlyResult[]>([])
  const done = (r: EarlyResult) => {
    setLog([r, ...log].slice(0, 20))
    setSeen([...seen, r.id])
    setLives(lives + 1)
    setSeed(seed + 1)
  }
  return (
    <div class="kp">
      <header class="kp-head">
        <select value={era} onChange={(e) => { setEra(e.currentTarget.value); setSeed(seed + 1) }}>
          {Object.entries(ERAS).map(([k, v]) => <option value={k}>{v}</option>)}
        </select>
        <div class="kp-row">
          <span>Жизнь №{lives + 1}</span>
          {[0, 2, 4, 8].map((n) => (
            <button class={`chip${n === lives ? ' on' : ''}`} onClick={() => { setLives(n); setSeed(seed + 1) }}>{n + 1}</button>
          ))}
          <button class="chip" onClick={() => { setSeen([]); setSeed(seed + 1) }}>Забыть сыгранное</button>
          <select value={lang} onChange={(e) => setLang(e.currentTarget.value as KidsLang)}>
            <option value="ru">RU</option>
            <option value="en">EN</option>
            <option value="tr">TR</option>
          </select>
        </div>
        <div class="kp-row">Сыграно: {seen.join(' → ') || 'ничего'}</div>
      </header>
      <EarlyGame key={`${era}-${lives}-${seed}-${lang}`} era={era} region={REGION[era]} lang={lang} age={2} livesBefore={lives} seen={seen} seed={seed} onFinish={done} />
      {log.length > 0 && (
        <section class="kp-log">
          <h3>Сыграно</h3>
          {log.map((r) => (
            <p>
              <Stars n={r.stars} /> {r.id} ({r.kind}) · {r.task} · +{r.gain} · {r.sec} с
            </p>
          ))}
        </section>
      )}
    </div>
  )
}

render(<App />, document.getElementById('app')!)
