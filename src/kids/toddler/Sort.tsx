// «Разложи»: вверху вещь одного из двух цветов, нажми на миску того же цвета. 8 штук.
// Ошибка не наказывает: миска качается, вещь ждёт. Звёзды - за ошибки.
import { useMemo, useState } from 'preact/hooks'
import { makeRng, shuffle } from '../rng'
import { playNote } from '../../audio'
import { shade, Thing } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

const N = 8
const W = 400
const H = 330

function SortGame({ skin, seed, onDone }: ToddlerProps) {
  const s = skin.sort
  const color = { a: s.a, b: s.b }
  const items = useMemo(() => {
    const xs = shuffle(makeRng(seed), ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b'] as const)
    // Первые два - разных цветов: правило видно сразу.
    if (xs[0] === xs[1]) {
      const j = xs.findIndex((k, n) => n > 1 && k !== xs[0])
      ;[xs[1], xs[j]] = [xs[j], xs[1]]
    }
    return xs
  }, [seed])
  const [i, setI] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [shake, setShake] = useState<{ k: string; n: number } | null>(null)
  const [fly, setFly] = useState<string | null>(null)

  const pick = (k: 'a' | 'b') => {
    if (i >= N || fly) return
    if (k !== items[i]) {
      setMistakes(mistakes + 1)
      setShake({ k, n: (shake?.n ?? 0) + 1 })
      playNote(196, 180, 'sine')
      return
    }
    playNote(587, 120)
    setFly(k)
    window.setTimeout(() => {
      setFly(null)
      const next = i + 1
      setI(next)
      if (next >= N) onDone({ stars: mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1, mistakes })
    }, 300)
  }

  const inBowl = (k: string) => items.slice(0, i).filter((x) => x === k).length
  const cur = items[Math.min(i, N - 1)]
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="sort">
      <rect x="0" y="0" width={W} height={H} rx="10" fill={skin.field} />
      {i < N && (
        <g key={i} class={fly ? `kt-fly-${fly}` : 'kt-in'} style={{ transformOrigin: '200px 80px' }}>
          <Thing kind={s.thing} color={color[cur]} x={200} y={80} size={110} />
        </g>
      )}
      {(['a', 'b'] as const).map((k, n) => {
        const cx = n === 0 ? 105 : 295
        const c = color[k]
        return (
          <g key={`${k}${shake?.k === k ? shake.n : 0}`} class={`kb-tap${shake?.k === k ? ' kt-shake' : ''}`} style={{ transformOrigin: `${cx}px 250px` }} onPointerDown={() => pick(k)}>
            <path d={`M${cx - 85} 200 L${cx + 85} 200 C${cx + 80} 290 ${cx - 80} 290 ${cx - 85} 200 Z`} fill="#efe6d0" stroke={shade('#efe6d0', 0.6)} stroke-width="3" />
            <ellipse cx={cx} cy="200" rx="85" ry="14" fill={c} stroke={shade(c, 0.6)} stroke-width="3" />
            <ellipse cx={cx} cy="201" rx="70" ry="8" fill={shade(c, 0.8)} />
            {[...Array(inBowl(k)).keys()].map((m) => (
              <Thing kind={s.thing} color={c} x={cx - 45 + (m % 4) * 30} y={232 + Math.floor(m / 4) * 22} size={30} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

export const sortGame: ToddlerGame = {
  id: 'sort',
  task: 'mind',
  Game: SortGame,
  rule: {
    ru: 'Нажми на миску того же цвета.',
    en: 'Tap the bowl of the same colour.',
    tr: 'Aynı renkteki kâseye dokun.',
  },
}
