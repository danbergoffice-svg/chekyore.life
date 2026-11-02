// «Повтори»: взрослый стучит мелодию на трёх барабанах (2, потом 3, потом 4 удара), ребёнок повторяет.
// Ошибка - мелодия звучит ещё раз. Звёзды - за ошибки.
import { useEffect, useRef, useState } from 'preact/hooks'
import { makeRng, randInt } from '../rng'
import { playNote } from '../../audio'
import type { KidsLang } from '../types'
import { Thing } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

const NOTES = [392, 523, 659] // соль, до, ми - всегда звучит приятно
const LENGTHS = [2, 3, 4]
const W = 400
const H = 230
const X = [70, 200, 330]

const SAY: Record<KidsLang, { listen: string; you: string; tune: string }> = {
  ru: { listen: 'Слушай…', you: 'Теперь ты!', tune: 'Песенка {n} из 3' },
  en: { listen: 'Listen…', you: 'Your turn!', tune: 'Tune {n} of 3' },
  tr: { listen: 'Dinle…', you: 'Sıra sende!', tune: 'Ezgi {n} / 3' },
}

function RhythmGame({ skin, lang, seed, onDone }: ToddlerProps) {
  const colors = skin.rhythm.colors
  const live = useRef({ seq: [] as number[], step: 0, level: 0, mistakes: 0, can: false, timers: [] as number[] })
  const [lit, setLit] = useState(-1)
  const [turn, setTurn] = useState<'listen' | 'you'>('listen')
  const [level, setLevel] = useState(0)
  const later = (fn: () => void, t: number) => live.current.timers.push(window.setTimeout(fn, t))
  useEffect(() => {
    const r = makeRng(seed)
    const a = randInt(r, 0, 2)
    const L = live.current
    L.seq = [a, (a + 1 + randInt(r, 0, 1)) % 3, randInt(r, 0, 2), randInt(r, 0, 2)]
    later(playSeq, 400)
    return () => L.timers.forEach(clearTimeout)
  }, [])

  const hit = (i: number) => {
    playNote(NOTES[i], 280)
    setLit(i)
    later(() => setLit(-1), 300)
  }
  const playSeq = () => {
    const L = live.current
    L.can = false
    L.step = 0
    setTurn('listen')
    const n = LENGTHS[L.level]
    for (let k = 0; k < n; k++) later(() => hit(L.seq[k]), 500 + k * 580)
    later(() => {
      L.can = true
      setTurn('you')
    }, 500 + n * 580)
  }
  const tap = (i: number) => {
    const L = live.current
    if (!L.can) return
    hit(i)
    if (i !== L.seq[L.step]) {
      L.mistakes++
      L.can = false
      later(() => playNote(196, 200, 'sine'), 120)
      later(playSeq, 800)
      return
    }
    L.step++
    if (L.step < LENGTHS[L.level]) return
    L.can = false
    L.level++
    if (L.level >= LENGTHS.length) {
      onDone({ stars: L.mistakes === 0 ? 3 : L.mistakes <= 2 ? 2 : 1, mistakes: L.mistakes })
      return
    }
    setLevel(L.level)
    later(playSeq, 900)
  }

  const say = SAY[lang]
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="rhythm">
      <rect x="0" y="0" width={W} height={H} rx="10" fill={skin.field} />
      <text x={W / 2} y="30" text-anchor="middle" font-size="20" font-weight="700" fill="#3b2a17">
        {turn === 'you' ? say.you : say.listen}
      </text>
      <text x={W / 2} y={H - 12} text-anchor="middle" font-size="14" fill="#5a4a3b">
        {say.tune.replace('{n}', String(level + 1))}
      </text>
      {X.map((x, i) => (
        <g class="kb-tap" onPointerDown={() => tap(i)} style={{ transformOrigin: `${x}px 120px`, transform: lit === i ? 'scale(1.12)' : 'none', transition: 'transform 120ms' }}>
          <circle cx={x} cy="120" r="58" fill={lit === i ? colors[i] : '#efe6d0'} opacity={lit === i ? 0.55 : 0.6} />
          <Thing kind="drum" color={colors[i]} x={x} y={122} size={92} />
        </g>
      ))}
    </svg>
  )
}

export const rhythmGame: ToddlerGame = {
  id: 'rhythm',
  task: 'people',
  Game: RhythmGame,
  rule: {
    ru: 'Послушай и повтори на барабанах.',
    en: 'Listen, then play it back on the drums.',
    tr: 'Dinle, sonra davullarda tekrar et.',
  },
}
