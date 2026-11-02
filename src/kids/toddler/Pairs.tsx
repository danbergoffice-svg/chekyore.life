// «Найди пару»: 6 карточек, 3 пары. Сначала все открыты - запомни, потом переворачиваются.
// Звёзды - за попытки: 3 попытки - идеально.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { makeRng, shuffle } from '../rng'
import { playNote } from '../../audio'
import { Thing } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

const W = 400
const H = 300
const CW = 116
const CH = 132

function PairsGame({ skin, seed, onDone }: ToddlerProps) {
  const deck = useMemo(() => shuffle(makeRng(seed), [0, 0, 1, 1, 2, 2]), [seed])
  const [peek, setPeek] = useState(true)
  const [open, setOpen] = useState<number[]>([])
  const [found, setFound] = useState<number[]>([])
  const [tries, setTries] = useState(0)
  const [lock, setLock] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setPeek(false), 2000)
    return () => clearTimeout(id)
  }, [])

  const flip = (i: number) => {
    if (peek || lock || open.includes(i) || found.includes(i)) return
    playNote(523, 90)
    const now = [...open, i]
    if (now.length < 2) return setOpen(now)
    const t = tries + 1
    setTries(t)
    setOpen(now)
    if (deck[now[0]] === deck[now[1]]) {
      const f = [...found, ...now]
      window.setTimeout(() => {
        setFound(f)
        setOpen([])
        playNote(784, 160)
        if (f.length === 6) onDone({ stars: t <= 4 ? 3 : t <= 6 ? 2 : 1, mistakes: t - 3 })
      }, 250)
    } else {
      setLock(true)
      window.setTimeout(() => {
        setOpen([])
        setLock(false)
      }, 800)
    }
  }

  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="pairs">
      <defs>
        <pattern id="kt-back" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="#8e3b22" />
          <rect width="8" height="16" fill="#a8573a" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="10" fill={skin.field} />
      {deck.map((k, i) => {
        const x = 12 + (i % 3) * (CW + 14)
        const y = 12 + Math.floor(i / 3) * (CH + 12)
        const shown = peek || open.includes(i) || found.includes(i)
        const [thing, color] = skin.pairs.things[k]
        return (
          <g class="kb-tap" onPointerDown={() => flip(i)}>
            <rect x={x} y={y} width={CW} height={CH} rx="10" fill={shown ? '#f3ead7' : 'url(#kt-back)'} stroke={found.includes(i) ? '#ecd06f' : '#7a5232'} stroke-width={found.includes(i) ? 5 : 3} />
            {shown && <Thing kind={thing} color={color} x={x + CW / 2} y={y + CH / 2} size={78} />}
          </g>
        )
      })}
    </svg>
  )
}

export const pairsGame: ToddlerGame = {
  id: 'pairs',
  task: 'mind',
  Game: PairsGame,
  rule: {
    ru: 'Запомни картинки и найди пары.',
    en: 'Remember the pictures and find the pairs.',
    tr: 'Resimleri aklında tut ve eşlerini bul.',
  },
}
