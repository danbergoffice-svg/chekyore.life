// Стенд детских головоломок: все страны, уровень 1–5, новое поле, язык. Собирается и в один HTML (npm run kids:page).
import { render } from 'preact'
import { useState } from 'preact/hooks'
import '@fontsource-variable/alegreya'
import '../src/style.css'
import '../src/skin.css'
import { KIDS_PUZZLES } from '../src/kids'
import { KidsGame, Stars } from '../src/kids/KidsGame'
import type { KidsResult } from '../src/kids/KidsGame'
import type { KidsLang } from '../src/kids/types'

const NAMES: Record<string, string> = {
  ANE: 'Египет и Двуречье', E03: 'Античность', MAY: 'Майя', AMR: 'Ацтеки и инки', CHN: 'Китай', JPN: 'Япония', IND: 'Индия',
  ISL: 'Исламский мир', BYZ: 'Византия', EUR: 'Европа', RUS: 'Русь', ETH: 'Эфиопия', WAF: 'Мали и Сонгай',
}

function App() {
  const q = new URLSearchParams(location.search)
  const [id, setId] = useState(q.get('game') ?? KIDS_PUZZLES[0].id)
  const [level, setLevel] = useState(Number(q.get('level') ?? 2))
  const [seed, setSeed] = useState(Number(q.get('seed') ?? 1 + Math.floor(Math.random() * 1e6)))
  const [lang, setLang] = useState<KidsLang>((q.get('lang') as KidsLang) ?? 'ru')
  const [log, setLog] = useState<(KidsResult & { level: number })[]>([])
  const puzzle = KIDS_PUZZLES.find((p) => p.id === id) ?? KIDS_PUZZLES[0]
  return (
    <div class="kp">
      <header class="kp-head">
        <select value={id} onChange={(e) => { setId(e.currentTarget.value); setSeed(seed + 1) }}>
          {KIDS_PUZZLES.map((p) => (
            <option value={p.id}>{NAMES[p.era] ?? p.era} - {p.text[lang].title}</option>
          ))}
        </select>
        <div class="kp-row">
          <span>Уровень</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button class={`chip${n === level ? ' on' : ''}`} onClick={() => { setLevel(n); setSeed(seed + 1) }}>{n}</button>
          ))}
          <button class="chip" onClick={() => setSeed(seed + 1)}>Новое поле</button>
          <select value={lang} onChange={(e) => setLang(e.currentTarget.value as KidsLang)}>
            <option value="ru">RU</option>
            <option value="en">EN</option>
            <option value="tr">TR</option>
          </select>
        </div>
      </header>
      <KidsGame key={`${id}-${level}-${seed}-${lang}`} puzzle={puzzle} difficulty={level} seed={seed} lang={lang} onFinish={(r) => { setLog([{ ...r, level }, ...log].slice(0, 20)); setSeed(seed + 1) }} />
      {log.length > 0 && (
        <section class="kp-log">
          <h3>Сыграно</h3>
          {log.map((r) => (
            <p>
              <Stars n={r.stars} /> {r.puzzle} · ур. {r.level} · ходов {r.moves} (лучше {r.par}){r.hints ? ` · подсказок ${r.hints}` : ''}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}

render(<App />, document.getElementById('app')!)
