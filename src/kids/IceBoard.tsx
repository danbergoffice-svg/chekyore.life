import { useRef } from 'preact/hooks'
import type { BoardProps, KidsPuzzle, Task } from './types'
import { ice, ICE_DIRS, slide, type IceMove, type IceState } from './ice'

const CELL = 48
const ARROW: Record<IceMove, string> = { N: '↑', E: '→', S: '↓', W: '←' }
const HOME: Record<Task, { ru: string; en: string; tr: string; roof: string }> = {
  body: { ru: 'изба', en: 'hut', tr: 'kulübe', roof: '#8a4a2a' },
  mind: { ru: 'церковь', en: 'church', tr: 'kilise', roof: '#c9a24a' },
  people: { ru: 'терем', en: 'manor', tr: 'konak', roof: '#b5523b' },
}

export function IceBoard({ state: s, onMove, hinted, done, task, lang }: BoardProps<IceState, IceMove>) {
  const touch = useRef<[number, number] | null>(null)
  const W = s.w * CELL
  const H = s.h * CELL
  const sx = (s.sled % s.w) * CELL
  const sy = Math.floor(s.sled / s.w) * CELL
  const hx = (s.home % s.w) * CELL
  const hy = Math.floor(s.home / s.w) * CELL
  const preview = hinted ? slide(s, hinted).path : []
  const home = HOME[task]
  const push = (d: IceMove) => !done && onMove(d)
  return (
    <div>
      <svg
        class="kb-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="ice"
        onTouchStart={(e) => (touch.current = [e.touches[0].clientX, e.touches[0].clientY])}
        onTouchEnd={(e) => {
          if (!touch.current) return
          const dx = e.changedTouches[0].clientX - touch.current[0]
          const dy = e.changedTouches[0].clientY - touch.current[1]
          touch.current = null
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
          push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N')
        }}
      >
        <rect width={W} height={H} fill="#b5d6ea" />
        {[...s.cells].map((c, i) => {
          const x = (i % s.w) * CELL
          const y = Math.floor(i / s.w) * CELL
          return (
            <g>
              <rect x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} fill={preview.includes(i) ? '#f2e3b8' : '#d8ecf7'} />
              {c === '#' && <path d={`M${x + 2} ${y + CELL - 4} q${CELL / 2 - 2} ${-CELL + 6} ${CELL - 4} 0z`} fill="#ffffff" stroke="#c4dcea" />}
              {c === 'o' && <ellipse cx={x + CELL / 2} cy={y + CELL / 2} rx={CELL * 0.38} ry={CELL * 0.28} fill="#2f5a7a" />}
            </g>
          )
        })}
        <g>
          <path d={`M${hx + 6} ${hy + 22} l${CELL / 2 - 6} -16 ${CELL / 2 - 6} 16z`} fill={home.roof} />
          <rect x={hx + 10} y={hy + 22} width={CELL - 20} height={CELL - 28} fill="#c08a52" />
          <text x={hx + CELL / 2} y={hy + CELL - 1} font-size="9" text-anchor="middle" fill="#1b1a17" font-weight="700">{home[lang]}</text>
        </g>
        <g style={{ transition: 'transform .25s ease-out', transform: `translate(${sx}px, ${sy}px)` }}>
          <rect x="8" y="16" width={CELL - 16} height="14" rx="4" fill="#df6c4f" stroke="#7a2f1c" stroke-width="2" />
          <path d={`M6 32 h${CELL - 12}`} stroke="#5a3418" stroke-width="3" stroke-linecap="round" />
          <circle cx={CELL / 2} cy="12" r="6" fill="#f2d2b0" />
        </g>
      </svg>
      <div class="kb-arrows">
        {ICE_DIRS.map((d) => (
          <button
            class={`secondary${hinted === d ? ' kb-hint' : ''}`}
            style={{ gridColumn: d === 'W' ? 1 : d === 'E' ? 3 : 2, gridRow: d === 'N' ? 1 : 2 }}
            onClick={() => push(d)}
            aria-label={d}
          >
            {ARROW[d]}
          </button>
        ))}
      </div>
    </div>
  )
}

export const icePuzzle: KidsPuzzle<IceState, IceMove> = {
  id: 'ice',
  era: 'RUS',
  region: 'novgorod',
  place: 'river',
  logic: ice,
  Board: IceBoard,
  text: {
    ru: {
      title: 'Сани по льду',
      story: 'Река встала. Довези сани до цели и не угоди в полынью.',
      rule: 'Толкай сани стрелками или проведи пальцем: они скользят, пока не упрутся в сугроб, край или не доедут до цели.',
      tasks: ['Дрова домой', 'Грамоту дьячку', 'Гостинец боярыне'],
    },
    en: {
      title: 'Sled on the ice',
      story: 'The river has frozen. Get the sled to the goal without falling into a hole in the ice.',
      rule: 'Push the sled with the arrows or swipe: it slides until it hits a snowdrift, the edge or reaches the goal.',
      tasks: ['Firewood home', 'A letter for the deacon', "A gift for the boyar's wife"],
    },
    tr: {
      title: 'Buzda kızak',
      story: 'Nehir dondu. Kızağı buzdaki deliklere düşmeden hedefe ulaştır.',
      rule: 'Kızağı oklarla it ya da parmağını kaydır: bir kar yığınına, kenara çarpana ya da hedefe varana kadar kayar.',
      tasks: ['Odunları eve', 'Zangoca mektup', 'Boyar hanımına hediye'],
    },
  },
}
