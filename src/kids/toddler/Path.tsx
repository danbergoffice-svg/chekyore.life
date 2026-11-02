// «Домой»: поле 5×5, нажимай на соседние клетки, чтобы довести зверька до дома. Соседние клетки подсвечены.
// Звёзды - за длину пути относительно кратчайшего.
import { useMemo, useState } from 'preact/hooks'
import { makeRng, randInt } from '../rng'
import type { Rng } from '../types'
import { playNote } from '../../audio'
import { Thing } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

export const SIZE = 5
const CELL = 76
const PAD = 10
const W = PAD * 2 + SIZE * CELL

type P = [number, number]
const key = (p: P) => `${p[0]},${p[1]}`

export function shortest(from: P, to: P, block: Set<string>): number {
  const dist = new Map([[key(from), 0]])
  const q: P[] = [from]
  while (q.length) {
    const p = q.shift()!
    if (p[0] === to[0] && p[1] === to[1]) return dist.get(key(p))!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n: P = [p[0] + dx, p[1] + dy]
      if (n[0] < 0 || n[1] < 0 || n[0] >= SIZE || n[1] >= SIZE || block.has(key(n)) || dist.has(key(n))) continue
      dist.set(key(n), dist.get(key(p))! + 1)
      q.push(n)
    }
  }
  return Infinity
}

/** Расклад: старт в левом столбце, дом в правом, 5–6 препятствий, путь есть и не короче 6 шагов. */
export function makeLevel(r: Rng): { start: P; home: P; block: Set<string>; best: number } {
  for (;;) {
    const start: P = [0, randInt(r, 0, SIZE - 1)]
    const home: P = [SIZE - 1, randInt(r, 0, SIZE - 1)]
    const block = new Set<string>()
    const want = randInt(r, 5, 6)
    while (block.size < want) block.add(`${randInt(r, 1, SIZE - 2)},${randInt(r, 0, SIZE - 1)}`)
    const best = shortest(start, home, block)
    if (best >= 6 && best < Infinity) return { start, home, block, best }
  }
}

function PathGame({ skin, seed, onDone }: ToddlerProps) {
  const p = skin.path
  const lv = useMemo(() => makeLevel(makeRng(seed)), [seed])
  const [at, setAt] = useState<P>(lv.start)
  const [steps, setSteps] = useState(0)
  const [over, setOver] = useState(false)
  const near = (x: number, y: number) => Math.abs(x - at[0]) + Math.abs(y - at[1]) === 1 && !lv.block.has(`${x},${y}`)

  const go = (x: number, y: number) => {
    if (over) return
    if (!near(x, y)) {
      if (!(x === at[0] && y === at[1])) playNote(196, 150, 'sine')
      return
    }
    const n = steps + 1
    setAt([x, y])
    setSteps(n)
    playNote(440 + n * 20, 100)
    if (x === lv.home[0] && y === lv.home[1]) {
      setOver(true)
      const extra = n - lv.best
      onDone({ stars: extra <= 0 ? 3 : extra <= 2 ? 2 : 1, mistakes: extra })
    }
  }

  const cx = (x: number) => PAD + x * CELL + CELL / 2
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${W}`} role="img" aria-label="path">
      <rect x="0" y="0" width={W} height={W} rx="10" fill={skin.field} />
      {[...Array(SIZE * SIZE).keys()].map((i) => {
        const x = i % SIZE
        const y = Math.floor(i / SIZE)
        const glow = !over && near(x, y)
        return (
          <g class="kb-tap" onPointerDown={() => go(x, y)}>
            <rect x={PAD + x * CELL + 3} y={PAD + y * CELL + 3} width={CELL - 6} height={CELL - 6} rx="8" fill={glow ? '#f7efdc' : 'rgba(255,248,230,0.28)'} stroke={glow ? '#ecd06f' : 'rgba(59,42,23,0.15)'} stroke-width={glow ? 3 : 1.5} class={glow ? 'kt-glow' : ''} />
            {lv.block.has(`${x},${y}`) && <Thing kind={p.obstacle} x={cx(x)} y={cx(y)} size={58} />}
            {x === lv.home[0] && y === lv.home[1] && <Thing kind="house" x={cx(x)} y={cx(y)} size={60} />}
          </g>
        )
      })}
      <g style={{ transform: `translate(${cx(at[0])}px, ${cx(at[1])}px)`, transition: 'transform 180ms ease-out', pointerEvents: 'none' }}>
        <Thing kind={p.animal} color={p.color} size={60} />
      </g>
    </svg>
  )
}

export const pathGame: ToddlerGame = {
  id: 'path',
  task: 'mind',
  Game: PathGame,
  rule: {
    ru: 'Нажимай на светлые клетки рядом и доведи до дома.',
    en: 'Tap the glowing squares next to it to reach home.',
    tr: 'Yanındaki parlak karelere dokunarak eve götür.',
  },
}
