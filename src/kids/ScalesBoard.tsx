// Доска «Весы на базаре»: коромысло с двумя чашами, на левой - товар, ниже - стол с гирями.
// Тап по гире (где бы она ни лежала) переносит её дальше по кругу: стол → правая чаша → левая чаша → стол.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { BoardProps, KidsLang, KidsPuzzle, Task } from './types'
import { scales, tilt, type ScalesState } from './scales'

const W = 360
const H = 300
const PIVOT = 40
const PAN_Y = 182
const LX = 88
const RX = 272
const CELL = 46
const TABLE_Y = 236

const GOOD: Record<Task, { name: Record<KidsLang, string>; fill: string; ink: string }> = {
  body: { name: { ru: 'Мука', en: 'Flour', tr: 'Un' }, fill: '#efe6d2', ink: '#5a4630' },
  mind: { name: { ru: 'Груз из книги', en: 'Load from the book', tr: 'Kitaptaki yük' }, fill: '#c9a97a', ink: '#3b2a17' },
  people: { name: { ru: 'Шафран визирю', en: 'Saffron for the vizier', tr: 'Vezire safran' }, fill: '#e08a2e', ink: '#3b1d08' },
}
const UI: Record<KidsLang, { done: string }> = {
  ru: { done: 'Взвешено!' },
  en: { done: 'Weighed!' },
  tr: { done: 'Tartıldı!' },
}

/** Медная гиря с числом: x, y - левый верхний угол клетки CELL×CELL. */
function Weight({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <circle cx={x + CELL / 2} cy={y + 9} r="5.5" fill="none" stroke="#9c6b2a" stroke-width="3" />
      <path d={`M${x + 4} ${y + CELL - 2} L${x + CELL - 4} ${y + CELL - 2} L${x + CELL - 10} ${y + 14} L${x + 10} ${y + 14} Z`} fill="#d6a24e" stroke="#7d521c" stroke-width="1.5" />
      <text x={x + CELL / 2} y={y + CELL - 9} font-size="17" font-weight="800" text-anchor="middle" fill="#2a1a08">
        {w}
      </text>
    </g>
  )
}

export function ScalesBoard({ state, onMove, hinted, done, lang, task }: BoardProps<ScalesState, number>) {
  const s = state
  const t = tilt(s)
  const d = t === 0 ? 0 : Math.sign(t) * Math.min(16, 6 + Math.abs(t))
  const ly = PAN_Y + d
  const ry = PAN_Y - d
  const g = s.goods[Math.min(s.round, s.goods.length - 1)]
  const good = GOOD[task]
  // Когда товар взвешен, следующий ложится сам - на миг показать «Взвешено!».
  const [flash, setFlash] = useState(false)
  const prev = useRef(s.round)
  useEffect(() => {
    if (s.round > prev.current) {
      setFlash(true)
      const id = setTimeout(() => setFlash(false), 1300)
      prev.current = s.round
      return () => clearTimeout(id)
    }
    prev.current = s.round
  }, [s.round])
  const tap = (i: number) => !done && onMove(i)
  // Гири по местам: на чаше тяжёлые внизу.
  const idx = s.weights.map((_, i) => i).sort((a, b) => s.weights[b] - s.weights[a])
  const onLeft = idx.filter((i) => s.at[i] === 2)
  const onRight = idx.filter((i) => s.at[i] === 1)
  const leftSum = g + onLeft.reduce((a, i) => a + s.weights[i], 0)
  const rightSum = onRight.reduce((a, i) => a + s.weights[i], 0)
  const cellPos = (k: number, x0: number, y: number): [number, number] => [x0 + (k % 2) * CELL, y - CELL - 2 - Math.floor(k / 2) * CELL]
  const pos = new Map<number, [number, number]>()
  onLeft.forEach((i, k) => pos.set(i, cellPos(k, LX - 18, ly)))
  onRight.forEach((i, k) => pos.set(i, cellPos(k, RX - CELL, ry)))
  const n = s.weights.length
  const slotX = (i: number) => W / 2 + (i - (n - 1) / 2) * 62 - CELL / 2
  s.weights.forEach((_, i) => s.at[i] === 0 && pos.set(i, [slotX(i), TABLE_Y]))
  const shown = Math.min(s.round + 1, s.goods.length)
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="scales">
      <text x="6" y="18" font-size="15" font-weight="700" fill="#f3ead7">
        {good.name[lang]} · {shown}/{s.goods.length}
      </text>
      {flash && (
        <text x={W - 6} y="18" font-size="15" font-weight="800" text-anchor="end" fill="#9cc77a">
          {UI[lang].done}
        </text>
      )}
      {/* Стойка и коромысло. */}
      <rect x={W / 2 - 4} y={PIVOT} width="8" height={TABLE_Y - PIVOT - 4} fill="#8a6a3a" />
      <path d={`M${W / 2 - 26} ${TABLE_Y - 2} L${W / 2 + 26} ${TABLE_Y - 2} L${W / 2 + 10} ${TABLE_Y - 10} L${W / 2 - 10} ${TABLE_Y - 10} Z`} fill="#8a6a3a" />
      <line x1={LX} y1={PIVOT + d} x2={RX} y2={PIVOT - d} stroke="#c9a04f" stroke-width="6" stroke-linecap="round" />
      <circle cx={W / 2} cy={PIVOT} r="7" fill="#e3c06a" stroke="#7d521c" stroke-width="2" />
      <path d={`M${W / 2 - 5} ${PIVOT - 6} L${W / 2} ${PIVOT - 22} L${W / 2 + 5} ${PIVOT - 6} Z`} fill={t === 0 ? '#9cc77a' : '#e3c06a'} />
      {/* Нити и чаши. */}
      {[
        [LX, ly, PIVOT + d],
        [RX, ry, PIVOT - d],
      ].map(([x, y, by]) => (
        <g>
          <line x1={x} y1={by} x2={x - 78} y2={y} stroke="#c9a04f" stroke-width="1.2" opacity="0.6" />
          <line x1={x} y1={by} x2={x + 78} y2={y} stroke="#c9a04f" stroke-width="1.2" opacity="0.6" />
          <path d={`M${x - 80} ${y} Q${x} ${y + 26} ${x + 80} ${y} Z`} fill="#c9a04f" stroke="#7d521c" stroke-width="1.5" />
        </g>
      ))}
      {/* Товар на левой чаше. */}
      <g>
        <path d={`M${LX - 72} ${ly - 2} Q${LX - 76} ${ly - 46} ${LX - 56} ${ly - 54} L${LX - 34} ${ly - 54} Q${LX - 16} ${ly - 46} ${LX - 22} ${ly - 2} Z`} fill={good.fill} stroke={good.ink} stroke-width="1.5" />
        <rect x={LX - 54} y={ly - 62} width="18" height="9" rx="3" fill={good.ink} />
        <text x={LX - 46} y={ly - 18} font-size="20" font-weight="800" text-anchor="middle" fill={good.ink}>
          {g}
        </text>
      </g>
      {/* Сколько на каждой чаше. */}
      <text x={LX} y={PAN_Y + 40} font-size="15" font-weight="700" text-anchor="middle" fill="#e2d3b3">
        {leftSum}
      </text>
      <circle cx={W / 2} cy={PAN_Y + 34} r="12" fill="#16213a" stroke={t === 0 ? '#9cc77a' : '#ecd06f'} stroke-width="1.5" />
      <text x={W / 2} y={PAN_Y + 40} font-size="17" font-weight="800" text-anchor="middle" fill={t === 0 ? '#9cc77a' : '#ecd06f'}>
        {t > 0 ? '>' : t < 0 ? '<' : '='}
      </text>
      <text x={RX} y={PAN_Y + 40} font-size="15" font-weight="700" text-anchor="middle" fill="#e2d3b3">
        {rightSum}
      </text>
      {/* Стол: место каждой гири. */}
      <rect x="10" y={TABLE_Y + CELL} width={W - 20} height="10" rx="3" fill="#8a6a3a" />
      {s.weights.map((_, i) => (
        <rect x={slotX(i)} y={TABLE_Y} width={CELL} height={CELL} rx="6" fill="none" stroke="rgba(243,234,215,0.18)" stroke-dasharray="4 4" />
      ))}
      {s.weights.map((w, i) => {
        const [x, y] = pos.get(i)!
        return (
          <g class={`kb-tap${hinted === i ? ' kb-hint' : ''}`} onClick={() => tap(i)}>
            <rect x={x} y={y} width={CELL} height={CELL} rx="6" fill={hinted === i ? 'rgba(236,208,111,0.3)' : 'rgba(0,0,0,0.001)'} />
            <Weight x={x} y={y} w={w} />
          </g>
        )
      })}
    </svg>
  )
}

export const scalesPuzzle: KidsPuzzle<ScalesState, number> = {
  id: 'scales',
  era: 'ISL',
  region: 'baghdad',
  place: 'market',
  logic: scales,
  Board: ScalesBoard,
  text: {
    ru: {
      title: 'Весы на базаре',
      story: 'Дядя-купец уступил тебе место у весов. Покупатели ждут: сколько весит товар?',
      rule: 'Нажимай на гирю, чтобы положить её на правую чашу или вернуть на стол; на трудных уровнях гирю можно класть и к товару. Сделай чаши равными.',
      tasks: ['Взвесить мешки муки', 'Задача из книги аль-Хорезми', 'Шафран для визиря'],
    },
    en: {
      title: 'Scales at the bazaar',
      story: 'Your merchant uncle lets you stand at the scales. The buyers are waiting: how much does it weigh?',
      rule: 'Tap a weight to put it on the right pan or back on the table; on harder levels it can also go next to the goods. Make the pans even.',
      tasks: ['Weigh the sacks of flour', "A problem from al-Khwarizmi's book", 'Saffron for the vizier'],
    },
    tr: {
      title: 'Çarşıda terazi',
      story: 'Tüccar amcan teraziyi sana bıraktı. Müşteriler bekliyor: mal kaç tartı?',
      rule: 'Ağırlığı sağ kefeye koymak ya da masaya geri almak için ona dokun; zor seviyelerde malın yanına da konabilir. Kefeleri eşitle.',
      tasks: ['Un çuvallarını tart', "Harezmî'nin kitabından bir soru", 'Vezire safran'],
    },
  },
}
