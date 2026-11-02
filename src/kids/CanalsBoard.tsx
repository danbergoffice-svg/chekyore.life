import type { BoardProps, KidsPuzzle, Task } from './types'
import { canals, flood, openings, type CanalState } from './canals'

const CELL = 60
const LEFT = 30
const RIGHT = 58
const TOP = 6
const SIDES: [number, number, number][] = [
  [1, 0, -1], // север
  [2, 1, 0], // восток
  [4, 0, 1], // юг
  [8, -1, 0], // запад
]
const TARGET: Record<Task, { ru: string; en: string; tr: string; color: string }> = {
  body: { ru: 'поле', en: 'field', tr: 'tarla', color: '#6f9a4a' },
  mind: { ru: 'школа', en: 'school', tr: 'okul', color: '#b98a6a' },
  people: { ru: 'храм', en: 'temple', tr: 'tapınak', color: '#d9b04a' },
}

export function CanalsBoard({ state, onMove, hinted, done, lang }: BoardProps<CanalState, number>) {
  const s = state
  const wet = flood(s)
  const W = LEFT + s.w * CELL + RIGHT
  const H = TOP * 2 + s.h * CELL
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="canals">
      <rect x="0" y="0" width={LEFT - 4} height={H} fill="#3f7fc4" />
      <path d={`M4 ${H * 0.2} q8 10 0 20 M14 ${H * 0.55} q8 10 0 20 M6 ${H * 0.8} q8 10 0 20`} stroke="#9cc7f0" stroke-width="2" fill="none" />
      <rect x={LEFT - 6} y={TOP + s.src * CELL + CELL * 0.36} width="10" height={CELL * 0.28} fill="#3f7fc4" />
      {s.tiles.map((t, i) => {
        const x = LEFT + (i % s.w) * CELL
        const y = TOP + Math.floor(i / s.w) * CELL
        const o = openings(t)
        const isWet = wet.has(i)
        const c = CELL / 2
        return (
          <g class={`kb-tile${hinted === i ? ' kb-hint' : ''}`} onClick={() => !done && onMove(i)}>
            <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} rx="6" fill={isWet ? '#e3cf9c' : '#d9c18f'} stroke="#b4955c" />
            {SIDES.filter(([d]) => o & d).map(([, dx, dy]) => (
              <line x1={x + c} y1={y + c} x2={x + c + dx * c} y2={y + c + dy * c} stroke={isWet ? '#3f7fc4' : '#a8844c'} stroke-width={CELL * 0.26} stroke-linecap="butt" />
            ))}
            <circle cx={x + c} cy={y + c} r={CELL * 0.13} fill={isWet ? '#3f7fc4' : '#a8844c'} />
          </g>
        )
      })}
      {(Object.keys(TARGET) as Task[]).map((task) => {
        const row = s.targets[task]
        const y = TOP + row * CELL
        const goal = row === s.goal
        const reached = goal && canals.solved(s)
        const tg = TARGET[task]
        return (
          <g opacity={goal ? 1 : 0.45}>
            <rect x={LEFT + s.w * CELL + 4} y={y + 6} width={RIGHT - 8} height={CELL - 12} rx="6" fill={tg.color} stroke={goal ? '#ecd06f' : 'none'} stroke-width="3" />
            {reached && <rect x={LEFT + s.w * CELL + 4} y={y + CELL - 18} width={RIGHT - 8} height="12" rx="4" fill="#3f7fc4" />}
            <text x={LEFT + s.w * CELL + RIGHT / 2} y={y + CELL / 2 + 4} font-size="12" text-anchor="middle" fill="#1b1a17" font-weight="700">
              {tg[lang]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export const canalsPuzzle: KidsPuzzle<CanalState, number> = {
  id: 'canals',
  era: 'ANE',
  region: 'thebes',
  place: 'river',
  logic: canals,
  Board: CanalsBoard,
  text: {
    ru: {
      title: 'Каналы на разливе',
      story: 'Нил разлился. Отец доверил тебе открыть заслонки: куда пойдёт вода?',
      rule: 'Нажимай на плитку, чтобы повернуть её. Проведи воду от реки до цели.',
      tasks: ['Вода к полю семьи', 'Пруд у школы писцов', 'Сад при храме'],
    },
    en: {
      title: 'Canals in the flood',
      story: 'The Nile has risen. Father lets you open the sluices: where will the water go?',
      rule: 'Tap a tile to turn it. Lead the water from the river to the goal.',
      tasks: ["Water for the family's field", 'The pond by the scribe school', 'The temple garden'],
    },
    tr: {
      title: 'Taşkında kanallar',
      story: 'Nil taştı. Babam kapakları açmayı sana bıraktı: su nereye gidecek?',
      rule: 'Döndürmek için bir taşa dokun. Suyu nehirden hedefe ulaştır.',
      tasks: ['Ailenin tarlasına su', 'Kâtip okulunun havuzu', 'Tapınak bahçesi'],
    },
  },
}
