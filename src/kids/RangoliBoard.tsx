// Доска «Ранголи»: выбрал цвет в палитре → тап по клетке; тап своей клетки тем же цветом - стереть.
// Пустые клетки - меловые точки (как разметка настоящего ранголи), оси симметрии - пунктир мелом.
import { useEffect, useState } from 'preact/hooks'
import type { BoardProps, KidsPuzzle, Task } from './types'
import { rangoli, type RangoliMove, type RangoliState } from './rangoli'

/** Порошок по заданию: порог - рис, куркума, кумкум; двери гуру - шафран и бархатцы; ворота раджи - золото и пурпур. */
export const RANGOLI_COLORS: Record<Task, string[]> = {
  body: ['#f4efe4', '#e8b021', '#c8323a', '#4f9a4a', '#3b4fa0'],
  mind: ['#ef8a1f', '#f4efe4', '#3f8a4f', '#4aa0d0', '#b5223b'],
  people: ['#b5223b', '#e0b43a', '#2a4fa8', '#1f8a6a', '#c4378f'],
}

const PAD = 8
const CHALK = '#f4efe4'

export function RangoliBoard({ state: s, onMove, hinted, done }: BoardProps<RangoliState, RangoliMove>) {
  const [sel, setSel] = useState(0)
  useEffect(() => {
    if (hinted) setSel(hinted.c)
  }, [hinted])
  const pal = RANGOLI_COLORS[s.task].slice(0, s.k)
  const CELL = s.n <= 4 ? 70 : s.n <= 6 ? 58 : 50
  const side = s.n * CELL
  const size = PAD * 2 + side
  const mid = PAD + side / 2
  const tap = (i: number) => {
    if (done || s.given[i]) return
    // Подсказанную клетку тап ставит как подсказано, какой бы цвет ни был выбран.
    if (hinted && hinted.i === i) return onMove(hinted)
    onMove({ i, c: sel })
  }
  return (
    <div>
      <svg class="kb-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="rangoli" style={{ maxWidth: `${s.n * 80}px`, margin: '0 auto' }}>
        <rect x="0" y="0" width={size} height={size} rx="10" fill="#6b3a24" />
        {s.cells.map((c, i) => {
          const x = PAD + (i % s.n) * CELL
          const y = PAD + Math.floor(i / s.n) * CELL
          const cx = x + CELL / 2, cy = y + CELL / 2
          const h = hinted && hinted.i === i
          const r = CELL / 2 - 4
          return (
            <g class={`kb-tile${h ? ' kb-hint' : ''}`} onClick={() => tap(i)}>
              <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx="4" fill={c < 0 ? '#7a4630' : pal[c]} />
              {c < 0 && <circle cx={cx} cy={cy} r="3.5" fill={CHALK} opacity="0.8" />}
              {/* Лепесток-ромб поверх цвета - чтобы узор выглядел нарисованным порошком. */}
              {c >= 0 && <path d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`} fill="#000" opacity="0.1" />}
              {c >= 0 && <circle cx={cx} cy={cy} r={CELL * 0.09} fill={c === 0 && pal[0] === CHALK ? '#c9b98f' : CHALK} opacity="0.75" />}
              {s.given[i] && <rect x={x + 3.5} y={y + 3.5} width={CELL - 7} height={CELL - 7} rx="3" fill="none" stroke={CHALK} stroke-width="2" opacity="0.85" />}
            </g>
          )
        })}
        {/* Оси симметрии. */}
        <g stroke={CHALK} stroke-width="2.5" stroke-dasharray="6 5" opacity={done ? 0.25 : 0.7} pointer-events="none">
          <line x1={mid} y1={PAD - 4} x2={mid} y2={size - PAD + 4} />
          {s.sym !== 'lr' && <line x1={PAD - 4} y1={mid} x2={size - PAD + 4} y2={mid} />}
          {s.sym === 'd4' && <line x1={PAD} y1={PAD} x2={size - PAD} y2={size - PAD} />}
          {s.sym === 'd4' && <line x1={size - PAD} y1={PAD} x2={PAD} y2={size - PAD} />}
        </g>
      </svg>
      {!done && (
        <div class="kb-palette">
          {pal.map((col, c) => (
            <button class={`kb-swatch${c === sel ? ' on' : ''}`} style={{ background: col }} aria-label={`${c + 1}`} onClick={() => setSel(c)} />
          ))}
        </div>
      )}
    </div>
  )
}

export const rangoliPuzzle: KidsPuzzle<RangoliState, RangoliMove> = {
  id: 'rangoli',
  era: 'IND',
  region: 'vijayanagara',
  place: 'home',
  logic: rangoli,
  Board: RangoliBoard,
  text: {
    ru: {
      title: 'Ранголи у порога',
      story: 'Каждое утро мама рисует у дома узор из цветного порошка. Сегодня она начала узор, а закончить его доверила тебе.',
      rule: 'Выбери цвет и нажми на клетку: узор должен отражаться как в зеркале по пунктирным линиям.',
      tasks: ['Узор у порога дома', 'Узор у дверей гуру', 'Узор у ворот раджи'],
    },
    en: {
      title: 'Rangoli at the door',
      story: 'Every morning mother draws a pattern of coloured powder by the house. Today she started it and lets you finish.',
      rule: 'Pick a colour and tap a square: the pattern must mirror itself across the dotted lines.',
      tasks: ['Pattern at the home threshold', "Pattern at the guru's door", "Pattern at the raja's gate"],
    },
    tr: {
      title: 'Kapı önünde rangoli',
      story: 'Annen her sabah evin önüne renkli tozla bir desen çizer. Bugün deseni başlattı, bitirmeyi sana bıraktı.',
      rule: 'Bir renk seç ve kareye dokun: desen kesikli çizgilere göre ayna gibi yansımalı.',
      tasks: ['Ev eşiğinde desen', 'Gurunun kapısında desen', 'Racanın kapısında desen'],
    },
  },
}
