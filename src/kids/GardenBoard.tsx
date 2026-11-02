// Доска «Сад камней»: гравий, камни, борозда от входа. Тап по соседней клетке - вести борозду, по прошлой - шаг назад.
import type { BoardProps, KidsLang, KidsPuzzle } from './types'
import { garden, gravelCount, neighbors, type GardenState } from './garden'

const VW = 360
const TOP = 30

const L: Record<KidsLang, { left: string; done: string }> = {
  ru: { left: 'Осталось клеток: {n}', done: 'Весь сад расчёсан' },
  en: { left: 'Squares left: {n}', done: 'The whole garden is raked' },
  tr: { left: 'Kalan kare: {n}', done: 'Bütün bahçe tırmıklandı' },
}

export function GardenBoard({ state: s, onMove, hinted, done, lang }: BoardProps<GardenState, number>) {
  const t = L[lang] ?? L.en
  const cell = Math.min(64, Math.floor((VW - 20) / s.w))
  const gx = (VW - s.w * cell) / 2
  const gy = TOP
  const H = gy + s.h * cell + 10
  const cx = (i: number) => gx + (i % s.w) * cell + cell / 2
  const cy = (i: number) => gy + Math.floor(i / s.w) * cell + cell / 2
  const rocks = new Set(s.rocks)
  const onPath = new Set(s.path)
  const head = s.path[s.path.length - 1]
  const next = done ? [] : neighbors(s.w, s.h, head).filter((c) => !rocks.has(c) && !onPath.has(c))
  const left = gravelCount(s) - s.path.length
  const line = s.path.map((i) => `${cx(i)},${cy(i)}`).join(' ')
  const tap = (i: number) => !done && onMove(i)
  return (
    <svg class="kb-svg" viewBox={`0 0 ${VW} ${H}`} role="img" aria-label="garden">
      <text x={VW / 2} y="19" font-size="15" text-anchor="middle" fill="#e2d3b3" font-weight="700">
        {left > 0 ? t.left.replace('{n}', String(left)) : t.done}
      </text>
      {/* Деревянная рамка сада. */}
      <rect x={gx - 6} y={gy - 6} width={s.w * cell + 12} height={s.h * cell + 12} rx="6" fill="#6b4a2e" stroke="#4a311d" stroke-width="2" />
      {Array.from({ length: s.w * s.h }, (_, i) => {
        const x = gx + (i % s.w) * cell, y = gy + Math.floor(i / s.w) * cell
        return (
          <g class="kb-tap" onClick={() => tap(i)}>
            <rect x={x} y={y} width={cell} height={cell} fill={rocks.has(i) ? '#cfc3a6' : '#e8dec6'} stroke="#d2c4a2" stroke-width="1" />
            {!rocks.has(i) && !onPath.has(i) && (
              <>
                <circle cx={x + cell * 0.3} cy={y + cell * 0.32} r="1.6" fill="#c9b994" />
                <circle cx={x + cell * 0.7} cy={y + cell * 0.55} r="1.6" fill="#c9b994" />
                <circle cx={x + cell * 0.4} cy={y + cell * 0.76} r="1.6" fill="#c9b994" />
              </>
            )}
          </g>
        )
      })}
      {/* Борозда: гребни по краям и желобок посередине. */}
      {s.path.length === 1 && <circle cx={cx(s.path[0])} cy={cy(s.path[0])} r={cell * 0.31} fill="#efe6d0" stroke="#b9a57a" stroke-width={cell * 0.08} pointer-events="none" />}
      {s.path.length > 1 && (
        <g pointer-events="none" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points={line} stroke="#b9a57a" stroke-width={cell * 0.62} />
          <polyline points={line} stroke="#efe6d0" stroke-width={cell * 0.46} />
          <polyline points={line} stroke="#c2ae84" stroke-width={cell * 0.2} />
          <polyline points={line} stroke="#efe6d0" stroke-width={cell * 0.08} />
        </g>
      )}
      {/* Камни: мох и валун. */}
      {s.rocks.map((i) => (
        <g pointer-events="none">
          <ellipse cx={cx(i)} cy={cy(i) + cell * 0.08} rx={cell * 0.44} ry={cell * 0.34} fill="#6f8a45" />
          <ellipse cx={cx(i)} cy={cy(i) + cell * 0.02} rx={cell * 0.33} ry={cell * 0.26} fill="#6d6a63" stroke="#4a4842" stroke-width="2" />
          <ellipse cx={cx(i) - cell * 0.08} cy={cy(i) - cell * 0.07} rx={cell * 0.12} ry={cell * 0.07} fill="#8f8b82" />
        </g>
      ))}
      {/* Вход: маленькие красные ворота-тории в углу первой клетки. */}
      {(() => {
        const i = s.path[0]
        const x = gx + (i % s.w) * cell + 4, y = gy + Math.floor(i / s.w) * cell + 4
        const k = cell * 0.34
        return (
          <g pointer-events="none" stroke="#b0442e" stroke-width="3" stroke-linecap="round">
            <line x1={x + k * 0.2} y1={y + k * 0.15} x2={x + k * 0.2} y2={y + k} />
            <line x1={x + k * 0.8} y1={y + k * 0.15} x2={x + k * 0.8} y2={y + k} />
            <line x1={x - k * 0.05} y1={y + k * 0.12} x2={x + k * 1.05} y2={y + k * 0.12} />
            <line x1={x + k * 0.1} y1={y + k * 0.4} x2={x + k * 0.9} y2={y + k * 0.4} stroke-width="2" />
          </g>
        )
      })()}
      {/* Куда можно шагнуть. */}
      {next.map((i) => (
        <circle cx={cx(i)} cy={cy(i)} r={cell * 0.1} fill="#a08a5c" pointer-events="none" />
      ))}
      {/* Грабли - голова борозды. */}
      <g pointer-events="none">
        <circle cx={cx(head)} cy={cy(head)} r={cell * 0.23} fill="#7a5232" stroke="#f3ead7" stroke-width="2" />
        {/* Грабли: черенок, поперечина и зубья. */}
        <g stroke="#f3ead7" stroke-width="2" stroke-linecap="round">
          <line x1={cx(head)} y1={cy(head) - cell * 0.14} x2={cx(head)} y2={cy(head) + cell * 0.02} />
          <line x1={cx(head) - cell * 0.12} y1={cy(head) + cell * 0.02} x2={cx(head) + cell * 0.12} y2={cy(head) + cell * 0.02} />
          {[-0.12, -0.04, 0.04, 0.12].map((k) => (
            <line x1={cx(head) + cell * k} y1={cy(head) + cell * 0.02} x2={cx(head) + cell * k} y2={cy(head) + cell * 0.1} stroke-width="1.6" />
          ))}
        </g>
      </g>
      {hinted !== null && hinted !== undefined && (
        <rect class="kb-hint kb-tap" x={gx + (hinted % s.w) * cell + 3} y={gy + Math.floor(hinted / s.w) * cell + 3} width={cell - 6} height={cell - 6} rx="6" fill="rgba(236,208,111,0.3)" stroke="#ecd06f" stroke-width="4" onClick={() => tap(hinted)} />
      )}
    </svg>
  )
}

export const gardenPuzzle: KidsPuzzle<GardenState, number> = {
  id: 'garden',
  era: 'JPN',
  region: 'kyoto',
  place: 'temple',
  logic: garden,
  Board: GardenBoard,
  text: {
    ru: {
      title: 'Сад камней',
      story: 'Старый монах дал тебе грабли. Расчеши гравий в саду одной бороздой и не наступи на свои следы.',
      rule: 'Нажимай на соседнюю клетку, чтобы вести борозду от ворот. Пройди весь гравий по одному разу, обходя камни; тап по прошлой клетке - шаг назад.',
      tasks: ['Большой сад у ворот', 'Задача настоятеля', 'Сад к приезду гостей'],
    },
    en: {
      title: 'The rock garden',
      story: 'The old monk hands you a rake. Comb the gravel with one single furrow and never step on your own tracks.',
      rule: 'Tap a neighbouring square to draw the furrow from the gate. Cover all the gravel exactly once and go around the rocks; tap the previous square to step back.',
      tasks: ['The big garden by the gate', "The abbot's puzzle", 'A garden for the guests'],
    },
    tr: {
      title: 'Taş bahçesi',
      story: 'Yaşlı keşiş sana bir tırmık verdi. Çakılı tek bir izle tara ve kendi izine basma.',
      rule: 'İzi kapıdan sürmek için komşu kareye dokun. Taşların çevresinden dolaşarak bütün çakıldan bir kez geç; bir önceki kareye dokunursan geri adım atarsın.',
      tasks: ['Kapının yanındaki büyük bahçe', 'Başrahibin bilmecesi', 'Misafirler için bahçe'],
    },
  },
}
