import { useState } from 'preact/hooks'
import type { BoardProps, KidsPuzzle } from './types'
import { knights, targets, type KnightsMove, type KnightsState } from './knights'

const CELL = 72
const KNIGHT = 'M8 26 h16 v-3 h-2 c0-6 -1-9 1-13 l-3-5 c-4 0 -9 3 -11 8 l3 2 3-2 c0 3 -4 5 -6 8 v2 h-2z'

export function KnightsBoard({ state: s, onMove, hinted, done }: BoardProps<KnightsState, KnightsMove>) {
  const [sel, setSel] = useState<number | null>(null)
  const can = sel !== null ? targets(s, sel) : []
  const W = s.w * CELL
  const H = s.h * CELL
  const tap = (i: number) => {
    if (done) return
    if (hinted && i === hinted.to && (sel === null || sel === hinted.from)) {
      setSel(null)
      return onMove(hinted)
    }
    if (sel !== null && can.includes(i)) {
      setSel(null)
      return onMove({ from: sel, to: i })
    }
    setSel(s.cells[i] === 'W' || s.cells[i] === 'B' ? (sel === i ? null : i) : null)
  }
  return (
    <svg class="kb-svg" viewBox={`-4 -4 ${W + 8} ${H + 8}`} role="img" aria-label="knights">
      <rect x="-4" y="-4" width={W + 8} height={H + 8} rx="8" fill="#4a2e18" />
      {[...s.cells].map((c, i) => {
        if (c === '#') return null
        const x = (i % s.w) * CELL
        const y = Math.floor(i / s.w) * CELL
        const dark = ((i % s.w) + Math.floor(i / s.w)) % 2 === 1
        const goal = s.goal[i]
        const isHintFrom = hinted && hinted.from === i
        const isHintTo = hinted && hinted.to === i
        return (
          <g class={`kb-tap${isHintTo ? ' kb-hint' : ''}`} onClick={() => tap(i)}>
            <rect x={x} y={y} width={CELL} height={CELL} fill={dark ? '#8a5a32' : '#e3c48f'} />
            {goal !== '.' && <circle cx={x + CELL - 12} cy={y + 12} r="6" fill={goal === 'W' ? '#f7efdc' : '#2b2622'} stroke={goal === 'W' ? '#2b2622' : '#f7efdc'} stroke-width="1.2" />}
            {sel === i && <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} fill="none" stroke="#ecd06f" stroke-width="4" />}
            {isHintFrom && <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} fill="none" stroke="#df6c4f" stroke-width="3" stroke-dasharray="6 4" />}
            {(can.includes(i) || isHintTo) && <circle cx={x + CELL / 2} cy={y + CELL / 2} r="11" fill={isHintTo ? '#df6c4f' : 'rgba(236,208,111,0.8)'} />}
            {(c === 'W' || c === 'B') && (
              <path transform={`translate(${x + 4} ${y + 2}) scale(2)`} d={KNIGHT} fill={c === 'W' ? '#f7efdc' : '#2b2622'} stroke={c === 'W' ? '#2b2622' : '#f7efdc'} stroke-width="0.9" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export const knightsPuzzle: KidsPuzzle<KnightsState, KnightsMove> = {
  id: 'knights',
  era: 'EUR',
  region: 'florence',
  place: 'home',
  logic: knights,
  Board: KnightsBoard,
  text: {
    ru: {
      title: 'Задача о конях',
      story: 'Старый нотариус показал шахматную загадку из итальянской рукописи.',
      rule: 'Поменяй белых и чёрных коней местами: нажми на коня, потом на клетку. Конь ходит буквой «Г». Кружок в углу клетки - кто должен там стоять.',
      tasks: ['Сыграть с конюхом', 'Загадка нотариуса', 'Партия с сыном сеньора'],
    },
    en: {
      title: 'The knights puzzle',
      story: 'The old notary shows you a chess riddle from an Italian manuscript.',
      rule: 'Swap the white and black knights: tap a knight, then a square. A knight moves in an L. The dot in a corner shows who must stand there.',
      tasks: ['Play with the stable boy', "The notary's riddle", "A game with the lord's son"],
    },
    tr: {
      title: 'Atlar bilmecesi',
      story: 'Yaşlı noter sana İtalyan bir el yazmasından bir satranç bilmecesi gösterdi.',
      rule: 'Beyaz ve siyah atların yerini değiştir: önce ata, sonra kareye dokun. At «L» biçiminde gider. Köşedeki nokta orada kimin durması gerektiğini gösterir.',
      tasks: ['Seyisle oyna', 'Noterin bilmecesi', 'Beyin oğluyla bir oyun'],
    },
  },
}
