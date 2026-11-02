// Доска «Гебета»: две строки по 6 лунок, нижняя - твоя. Тап по своей лунке - рассев против часовой стрелки.
// Ниже - сколько собрано и сколько ходов осталось; когда ходы кончились - кнопка «Заново» (это тоже ход).
import type { BoardProps, KidsLang, KidsPuzzle, Task } from './types'
import { gebeta, type GebetaMove, type GebetaState } from './gebeta'

const W = 360
const H = 300
const STEP = 56
const X0 = W / 2 - STEP * 2.5
const TOP_Y = 68
const BOT_Y = 124
const R = 24

const RIVAL: Record<Task, Record<KidsLang, string>> = {
  body: { ru: 'Напротив - пастухи', en: 'Across from you: the herders', tr: 'Karşında: çobanlar' },
  mind: { ru: 'Напротив - дедушка', en: 'Across from you: grandfather', tr: 'Karşında: deden' },
  people: { ru: 'Напротив - сын раса', en: "Across from you: the ras's son", tr: 'Karşında: rasın oğlu' },
}
const UI: Record<KidsLang, { got: string; left: string; again: string; you: string }> = {
  ru: { got: 'Собрано: {n} из {t}', left: 'Ходов осталось: {n}', again: 'Заново', you: 'твои лунки' },
  en: { got: 'Collected: {n} of {t}', left: 'Moves left: {n}', again: 'Start over', you: 'your pits' },
  tr: { got: 'Toplanan: {n} / {t}', left: 'Kalan hamle: {n}', again: 'Baştan', you: 'senin çukurların' },
}
const fill = (s: string, v: Record<string, number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]))

// Где лежат семена в лунке: центр, кольцо из 6, кольцо из 12.
const SEEDS: [number, number][] = [[0, 0]]
for (let i = 0; i < 6; i++) SEEDS.push([Math.cos((i * Math.PI) / 3) * 9, Math.sin((i * Math.PI) / 3) * 9])
for (let i = 0; i < 12; i++) SEEDS.push([Math.cos((i * Math.PI) / 6 + 0.26) * 17.5, Math.sin((i * Math.PI) / 6 + 0.26) * 17.5])

/** Центр лунки: 0..5 - нижняя строка слева направо, 6..11 - верхняя справа налево. */
const pitXY = (i: number): [number, number] => (i < 6 ? [X0 + i * STEP, BOT_Y] : [X0 + (11 - i) * STEP, TOP_Y])

export function GebetaBoard({ state, onMove, hinted, done, lang, task }: BoardProps<GebetaState, GebetaMove>) {
  const s = state
  const ui = UI[lang] ?? UI.en
  const showAgain = !done && (s.left === 0 || hinted === 'reset')
  const x1 = X0 - R - 6, x2 = X0 + STEP * 5 + R + 6
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="gebeta">
      <text x={W / 2} y="16" font-size="14" font-weight="700" text-anchor="middle" fill="#e2d3b3">
        {RIVAL[task][lang]}
      </text>
      {/* Доска-корыто и стрелка рассева против часовой. */}
      <rect x={x1} y={TOP_Y - R - 6} width={x2 - x1} height={BOT_Y - TOP_Y + 2 * R + 12} rx="18" fill="#7a5230" stroke="#4e321b" stroke-width="2" />
      <path d={`M${X0} ${BOT_Y + R + 30} L${X0 + STEP * 5} ${BOT_Y + R + 30}`} stroke="#ecd06f" stroke-width="2" fill="none" opacity="0.7" />
      <path d={`M${X0 + STEP * 5 - 8} ${BOT_Y + R + 25} L${X0 + STEP * 5} ${BOT_Y + R + 30} L${X0 + STEP * 5 - 8} ${BOT_Y + R + 35}`} stroke="#ecd06f" stroke-width="2" fill="none" opacity="0.7" />
      <text x={W / 2} y={BOT_Y + R + 46} font-size="12" text-anchor="middle" fill="#bfa987">
        {ui.you}
      </text>
      <path d={`M${x2 + 4} ${BOT_Y} L${x2 + 4} ${TOP_Y}`} stroke="#ecd06f" stroke-width="2" opacity="0.7" />
      <path d={`M${x2} ${TOP_Y + 8} L${x2 + 4} ${TOP_Y} L${x2 + 8} ${TOP_Y + 8}`} stroke="#ecd06f" stroke-width="2" fill="none" opacity="0.7" />
      <path d={`M${x1 - 4} ${TOP_Y} L${x1 - 4} ${BOT_Y}`} stroke="#ecd06f" stroke-width="2" opacity="0.7" />
      <path d={`M${x1 - 8} ${BOT_Y - 8} L${x1 - 4} ${BOT_Y} L${x1} ${BOT_Y - 8}`} stroke="#ecd06f" stroke-width="2" fill="none" opacity="0.7" />
      {s.pits.map((n, i) => {
        const [cx, cy] = pitXY(i)
        const mine = i < 6
        const isHint = hinted === i
        const isLast = s.last === i
        const can = mine && n > 0 && s.left > 0 && !done
        return (
          <g class={mine ? `kb-tap${isHint ? ' kb-hint' : ''}` : undefined} onClick={() => can && onMove(i)} opacity={mine && !n ? 0.85 : 1}>
            <circle cx={cx} cy={cy} r={R} fill={mine ? '#4f321a' : '#3a2412'} stroke={isHint ? '#ecd06f' : isLast ? (s.took ? '#9cc77a' : '#e2d3b3') : mine ? '#c9a04f' : '#2e1d0e'} stroke-width={isHint || isLast ? 3 : 1.5} />
            {SEEDS.slice(0, n).map(([dx, dy], k) => (
              <ellipse cx={cx + dx} cy={cy + dy} rx="4.2" ry="3" transform={`rotate(${(k * 47) % 180} ${cx + dx} ${cy + dy})`} fill={k % 3 ? '#e2c37e' : '#cfa65c'} stroke="#6b4a22" stroke-width="0.6" />
            ))}
            <text x={cx} y={mine ? cy + R + 18 : cy - R - 10} font-size="13" font-weight="700" text-anchor="middle" fill={n ? '#f3ead7' : '#8d7a5c'}>
              {n}
            </text>
            {isLast && s.took > 0 && (
              <text x={cx} y={cy + 5} font-size="16" font-weight="800" text-anchor="middle" fill="#9cc77a">
                +{s.took}
              </text>
            )}
          </g>
        )
      })}
      {/* Сколько собрано и сколько ходов. */}
      <text x={W / 2} y={BOT_Y + R + 72} font-size="16" font-weight="800" text-anchor="middle" fill={s.score >= s.goal ? '#9cc77a' : '#ecd06f'}>
        {fill(ui.got, { n: s.score, t: s.goal })}
      </text>
      <text x={W / 2} y={BOT_Y + R + 94} font-size="14" text-anchor="middle" fill="#e2d3b3">
        {fill(ui.left, { n: s.left })}
      </text>
      {showAgain && (
        <g class={`kb-tap${hinted === 'reset' ? ' kb-hint' : ''}`} onClick={() => onMove('reset')}>
          <rect x={W / 2 - 70} y={H - 46} width="140" height="42" rx="8" fill="#f3ead7" stroke={hinted === 'reset' ? '#ecd06f' : 'none'} stroke-width="3" />
          <text x={W / 2} y={H - 19} font-size="16" font-weight="800" text-anchor="middle" fill="#16213a">
            {ui.again}
          </text>
        </g>
      )}
    </svg>
  )
}

export const gebetaPuzzle: KidsPuzzle<GebetaState, GebetaMove> = {
  id: 'gebeta',
  era: 'ETH',
  region: 'lalibela',
  place: 'yard',
  logic: gebeta,
  Board: GebetaBoard,
  text: {
    ru: {
      title: 'Гебета',
      story: 'Во дворе выдолбили в доске две строки лунок. Сыграй в гебету и собери побольше семян!',
      rule: 'Нажми на свою лунку: семена пойдут по одному против часовой стрелки. Если последнее семя сделало в лунке ровно 4 - они твои.',
      tasks: ['Сыграть с пастухами', 'Обыграть дедушку', 'Сыграть с сыном раса'],
    },
    en: {
      title: 'Gebeta',
      story: 'In the yard there is a board with two rows of pits. Play gebeta and collect as many seeds as you can!',
      rule: 'Tap one of your pits: the seeds go one by one counterclockwise. If the last seed makes exactly 4 in a pit, they are yours.',
      tasks: ['Play with the herders', 'Beat grandfather', "Play with the ras's son"],
    },
    tr: {
      title: 'Gebeta',
      story: 'Avluda iki sıra çukurlu bir tahta var. Gebeta oyna, olabildiğince çok tohum topla!',
      rule: 'Kendi çukurlarından birine dokun: tohumlar saat yönünün tersine birer birer dağılır. Son tohum bir çukurda tam 4 yaparsa onlar senin.',
      tasks: ['Çobanlarla oyna', 'Dedeni yen', 'Rasın oğluyla oyna'],
    },
  },
}
