import type { BoardProps, KidsPuzzle } from './types'
import { herd, type HerdMove, type HerdState } from './herd'

const CELL = 56

export function HerdBoard({ state, onMove, hinted, done }: BoardProps<HerdState, HerdMove>) {
  const s = state
  const W = s.w * CELL
  const H = s.h * CELL
  const rx = (s.rider % s.w) * CELL
  const ry = Math.floor(s.rider / s.w) * CELL
  // Клетка рядом со всадником - ход в ту сторону.
  const dirOf = (i: number): HerdMove | null => {
    const dx = (i % s.w) - (s.rider % s.w)
    const dy = Math.floor(i / s.w) - Math.floor(s.rider / s.w)
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null
    return (dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3) as HerdMove
  }
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="herd">
      {[...s.cells].map((c, i) => {
        const x = (i % s.w) * CELL
        const y = Math.floor(i / s.w) * CELL
        const d = dirOf(i)
        return (
          <g class={d !== null && hinted === d ? 'kb-hint' : ''} onClick={() => !done && d !== null && onMove(d)}>
            <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx="5" fill={d !== null ? '#b6c27a' : '#a8b46e'} stroke="#8e9a58" />
            {c === '#' && <path d={`M${x + 12} ${y + 42} L${x + 20} ${y + 18} L${x + 34} ${y + 12} L${x + 46} ${y + 30} L${x + 42} ${y + 44} Z`} fill="#8a8478" stroke="#6a6460" />}
            {i === s.pen && (
              <g>
                {[8, 18, 28, 38, 48].map((px) => (
                  <line x1={x + px} y1={y + 10} x2={x + px} y2={y + 48} stroke="#7a5a3a" stroke-width="3" />
                ))}
                <line x1={x + 6} y1={y + 20} x2={x + 50} y2={y + 20} stroke="#7a5a3a" stroke-width="3" />
                <line x1={x + 6} y1={y + 38} x2={x + 50} y2={y + 38} stroke="#7a5a3a" stroke-width="3" />
              </g>
            )}
          </g>
        )
      })}
      {s.sheep.map((i) => {
        const x = (i % s.w) * CELL + CELL / 2
        const y = Math.floor(i / s.w) * CELL + CELL / 2
        return (
          <g>
            <ellipse cx={x} cy={y + 2} rx="17" ry="12" fill="#f2eee2" stroke="#c9c0a8" />
            <circle cx={x + 15} cy={y - 4} r="6" fill="#3a3430" />
            <line x1={x - 9} y1={y + 12} x2={x - 9} y2={y + 19} stroke="#3a3430" stroke-width="3" />
            <line x1={x + 8} y1={y + 12} x2={x + 8} y2={y + 19} stroke="#3a3430" stroke-width="3" />
          </g>
        )
      })}
      <g>
        <ellipse cx={rx + 28} cy={ry + 34} rx="20" ry="9" fill="#8a5a34" />
        <path d={`M${rx + 44} ${ry + 30} L${rx + 52} ${ry + 18} L${rx + 48} ${ry + 32} Z`} fill="#8a5a34" />
        {[14, 22, 34, 42].map((lx) => (
          <line x1={rx + lx} y1={ry + 40} x2={rx + lx} y2={ry + 52} stroke="#5a3a20" stroke-width="3" />
        ))}
        <rect x={rx + 22} y={ry + 12} width="10" height="16" rx="3" fill="#3a5a8a" />
        <circle cx={rx + 27} cy={ry + 9} r="5" fill="#d4a87c" />
        <path d={`M${rx + 21} ${ry + 7} L${rx + 27} ${ry + 1} L${rx + 33} ${ry + 7} Z`} fill="#a83a2f" />
      </g>
    </svg>
  )
}

export const herdPuzzle: KidsPuzzle<HerdState, HerdMove> = {
  id: 'herd',
  era: 'MNG',
  region: 'onon',
  place: 'field',
  logic: herd,
  Board: HerdBoard,
  text: {
    ru: {
      title: 'Отара',
      story: 'Вечер, пора загонять овец. Отец посадил тебя на старого мерина: справишься сам?',
      rule: 'Нажимай на клетку рядом со всадником, чтобы шагнуть. Овца бежит от коня на клетку дальше. Загони всех в загон.',
      tasks: ['Загнать до темноты', 'Обойтись без лишних шагов', 'Помочь соседской юрте'],
    },
    en: {
      title: 'The flock',
      story: 'Evening, time to pen the sheep. Father has put you on the old gelding: can you manage on your own?',
      rule: 'Tap a square next to the rider to step there. A sheep runs one square away from the horse. Get them all into the pen.',
      tasks: ['Pen them before dark', 'No wasted steps', 'Help the neighbours\' yurt'],
    },
    tr: {
      title: 'Sürü',
      story: 'Akşam oldu, koyunları ağıla sokma vakti. Babam seni yaşlı iğdişe bindirdi: tek başına başarabilir misin?',
      rule: 'Atlının yanındaki bir kareye dokunarak adım at. Koyun attan bir kare uzağa kaçar. Hepsini ağıla sok.',
      tasks: ['Karanlıktan önce ağıla sok', 'Gereksiz adım atmadan', 'Komşu çadıra yardım et'],
    },
  },
}
