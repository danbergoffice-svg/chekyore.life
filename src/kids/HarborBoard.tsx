import { useState } from 'preact/hooks'
import type { BoardProps, KidsPuzzle, Task } from './types'
import { harbor, reachable, type HarborMove, type HarborState } from './harbor'

const CELL = 54
const PIER = 30
const CARGO: Record<Task, { ru: string; en: string; tr: string }> = {
  body: { ru: 'зерно', en: 'grain', tr: 'tahıl' },
  mind: { ru: 'свитки', en: 'scrolls', tr: 'tomarlar' },
  people: { ru: 'шёлк', en: 'silk', tr: 'ipek' },
}
const HULLS = ['#a0612e', '#7a5a3a', '#8a6a4a', '#94562c', '#6f5038']

export function HarborBoard({ state: s, onMove, hinted, done, task, lang }: BoardProps<HarborState, HarborMove>) {
  const [sel, setSel] = useState<number | null>(null)
  const W = s.n * CELL + PIER
  const H = s.n * CELL
  const spots = sel !== null ? reachable(s, sel) : []
  const sh = sel !== null ? s.ships[sel] : null
  /** Клетка поля, куда встанет начало корабля для позиции t. */
  const cellFor = (ship: number, t: number) => (s.ships[ship].v ? t * s.n + s.ships[ship].x : s.ships[ship].y * s.n + t)
  const tapCell = (i: number) => {
    if (done || sel === null || !sh) return
    // Тап по клетке на линии корабля: ставим так, чтобы корабль дошёл до этой клетки.
    const x = i % s.n, y = Math.floor(i / s.n)
    const line = sh.v ? x === sh.x : y === sh.y
    if (!line) return setSel(null)
    const t = sh.v ? y : x
    const p = sh.v ? sh.y : sh.x
    const to = t < p ? t : t - sh.len + 1
    if (spots.includes(to)) {
      setSel(null)
      onMove({ ship: sel, to })
    }
  }
  const hintCells = hinted ? Array.from({ length: s.ships[hinted.ship].len }, (_, k) => cellFor(hinted.ship, hinted.to) + (s.ships[hinted.ship].v ? k * s.n : k)) : []
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="harbor">
      <rect width={s.n * CELL} height={H} fill="#3f78b0" />
      {Array.from({ length: s.n * s.n }, (_, i) => {
        const x = (i % s.n) * CELL
        const y = Math.floor(i / s.n) * CELL
        const xx = i % s.n, yy = Math.floor(i / s.n)
        const t = sh ? (sh.v ? yy : xx) : -1
        const onLine = sh && (sh.v ? xx === sh.x : yy === sh.y)
        const p = sh ? (sh.v ? sh.y : sh.x) : 0
        const can = !!sh && onLine && spots.includes(t < p ? t : t - sh.len + 1) && (t < p || t >= p + sh.len)
        const hint = hintCells.includes(i)
        return (
          <g
            class={hint ? 'kb-tap kb-hint' : 'kb-tap'}
            onClick={() => {
              if (hint && hinted && !done) {
                setSel(null)
                return onMove(hinted)
              }
              tapCell(i)
            }}
          >
            <rect x={x} y={y} width={CELL} height={CELL} fill={hint ? 'rgba(236,208,111,0.45)' : can ? 'rgba(236,208,111,0.25)' : 'transparent'} stroke="rgba(255,255,255,0.12)" />
          </g>
        )
      })}
      <rect x={s.n * CELL} y="0" width={PIER} height={H} fill="#2f5f8f" />
      <rect x={s.n * CELL} y={s.exit * CELL + 2} width={PIER} height={CELL - 4} fill="#c08a52" stroke="#6b4423" />
      {s.ships.map((ship, k) => {
        const x = ship.x * CELL + 3
        const y = ship.y * CELL + 3
        const w = (ship.v ? 1 : ship.len) * CELL - 6
        const h = (ship.v ? ship.len : 1) * CELL - 6
        const main = k === 0
        return (
          <g
            class="kb-tap"
            style={{ transition: 'transform .2s ease-out' }}
            onClick={() => !done && setSel(sel === k ? null : k)}
          >
            <rect x={x} y={y} width={w} height={h} rx={ship.v ? 14 : 20} fill={main ? '#7d3c8c' : HULLS[k % HULLS.length]} stroke={sel === k ? '#ecd06f' : '#2a1a10'} stroke-width={sel === k ? 4 : 2} />
            <rect x={x + w / 2 - 8} y={y + h / 2 - 10} width="16" height="20" fill={main ? '#ecd06f' : '#f3ead7'} opacity="0.92" />
            {main && (
              <text x={x + w / 2} y={y + h - 4} font-size="10" text-anchor="middle" fill="#f3ead7" font-weight="700">
                {CARGO[task][lang]}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export const harborPuzzle: KidsPuzzle<HarborState, HarborMove> = {
  id: 'harbor',
  era: 'BYZ',
  region: 'constantinople',
  place: 'harbor',
  logic: harbor,
  Board: HarborBoard,
  text: {
    ru: {
      title: 'Гавань Золотого Рога',
      story: 'Пурпурный корабль с грузом не может пройти к причалу: мешают другие.',
      rule: 'Нажми на корабль, потом на клетку на его линии: корабли плывут только вперёд и назад. Выведи пурпурный к причалу справа.',
      tasks: ['Зерно для квартала', 'Свитки для логофета', 'Шёлк для дворца'],
    },
    en: {
      title: 'The Golden Horn harbour',
      story: 'The purple ship with cargo cannot reach the pier: other ships are in the way.',
      rule: 'Tap a ship, then a square on its line: ships only move forward and back. Get the purple one to the pier on the right.',
      tasks: ['Grain for the quarter', 'Scrolls for the logothete', 'Silk for the palace'],
    },
    tr: {
      title: 'Haliç limanı',
      story: 'Yüklü mor gemi iskeleye ulaşamıyor: diğer gemiler yolu kapatıyor.',
      rule: 'Bir gemiye, sonra onun hattındaki bir kareye dokun: gemiler yalnızca ileri geri gider. Mor gemiyi sağdaki iskeleye çıkar.',
      tasks: ['Mahalleye tahıl', 'Logotete tomarlar', 'Saraya ipek'],
    },
  },
}
