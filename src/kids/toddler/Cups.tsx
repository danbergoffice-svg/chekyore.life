// «Прятки»: питомец прячется под одной из трёх корзинок, корзинки меняются местами. Где он?
// Три раунда, каждый чуть быстрее. Ошибка просто показывает, где он был. Звёзды = угаданные раунды (не меньше одной).
import { useEffect, useRef, useState } from 'preact/hooks'
import { makeRng, randInt } from '../rng'
import { playNote } from '../../audio'
import type { KidsLang } from '../types'
import { Thing } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

const ROUNDS = [
  { swaps: 2, ms: 650 },
  { swaps: 3, ms: 560 },
  { swaps: 4, ms: 480 },
]
const W = 400
const H = 250
const SLOT = [70, 200, 330]
const LIFT = -78

const SAY: Record<KidsLang, { watch: string; pick: string; round: string }> = {
  ru: { watch: 'Смотри внимательно…', pick: 'Где он?', round: 'Раунд {n} из 3' },
  en: { watch: 'Watch closely…', pick: 'Where is it?', round: 'Round {n} of 3' },
  tr: { watch: 'Dikkatle bak…', pick: 'Nerede?', round: 'Tur {n} / 3' },
}

function CupsGame({ skin, lang, seed, onDone }: ToddlerProps) {
  const c = skin.cups
  const rng = useRef(makeRng(seed)).current
  // pos[чашка] = место 0..2
  const [pos, setPos] = useState([0, 1, 2])
  const [up, setUp] = useState<boolean[]>([false, false, false])
  const [pet, setPet] = useState(0)
  const [ms, setMs] = useState(ROUNDS[0].ms)
  const [phase, setPhase] = useState<'watch' | 'pick' | 'show'>('watch')
  const [round, setRound] = useState(0)
  const live = useRef({ pos: [0, 1, 2], found: 0, timers: [] as number[] })
  const later = (fn: () => void, t: number) => live.current.timers.push(window.setTimeout(fn, t))
  useEffect(() => () => live.current.timers.forEach(clearTimeout), [])

  const play = (r: number) => {
    const R = ROUNDS[r]
    setPhase('watch')
    setMs(R.ms)
    const p = randInt(rng, 0, 2)
    setPet(p)
    setUp([true, true, true])
    later(() => {
      setUp([false, false, false])
      let s = 0
      const swap = () => {
        if (s >= R.swaps) return setPhase('pick')
        const a = randInt(rng, 0, 2)
        const b = (a + 1 + randInt(rng, 0, 1)) % 3
        const P = [...live.current.pos]
        const ca = P.indexOf(a)
        const cb = P.indexOf(b)
        ;[P[ca], P[cb]] = [P[cb], P[ca]]
        live.current.pos = P
        setPos(P)
        s++
        later(swap, R.ms + 80)
      }
      later(swap, 650)
    }, 1300)
  }
  useEffect(() => {
    later(() => play(0), 300)
  }, [])

  const choose = (i: number) => {
    if (phase !== 'pick') return
    setPhase('show')
    const hit = i === pet
    if (hit) live.current.found++
    playNote(hit ? 784 : 196, 200, hit ? 'triangle' : 'sine')
    setUp(up.map((_, n) => n === i))
    if (!hit) later(() => setUp([true, false, false].map((_, n) => n === i || n === pet)), 450)
    const next = round + 1
    later(() => {
      if (next >= ROUNDS.length) onDone({ stars: Math.max(1, live.current.found), mistakes: 3 - live.current.found })
      else {
        setRound(next)
        play(next)
      }
    }, 1500)
  }

  const say = SAY[lang]
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="cups">
      <rect x="0" y="0" width={W} height={H} rx="10" fill={skin.field} />
      <text x={W / 2} y="28" text-anchor="middle" font-size="18" font-weight="700" fill="#3b2a17">
        {phase === 'pick' ? say.pick : phase === 'watch' ? say.watch : say.round.replace('{n}', String(round + 1))}
      </text>
      {[0, 1, 2].map((i) => (
        <g class="kb-tap" style={{ transform: `translateX(${SLOT[pos[i]]}px)`, transition: `transform ${ms}ms ease-in-out` }} onPointerDown={() => choose(i)}>
          <rect x="-60" y="50" width="120" height="190" fill="transparent" />
          {i === pet && up[i] && <Thing kind={c.pet} color={c.color} x={0} y={196} size={62} />}
          <g style={{ transform: `translateY(${up[i] ? LIFT : 0}px)`, transition: 'transform 300ms' }}>
            <Thing kind={c.box} x={0} y={186} size={110} />
          </g>
        </g>
      ))}
    </svg>
  )
}

export const cupsGame: ToddlerGame = {
  id: 'cups',
  task: 'people',
  Game: CupsGame,
  rule: {
    ru: 'Следи, куда он спрячется, и нажми на эту корзинку.',
    en: 'Watch where it hides, then tap that basket.',
    tr: 'Nereye saklandığını izle, sonra o sepete dokun.',
  },
}
