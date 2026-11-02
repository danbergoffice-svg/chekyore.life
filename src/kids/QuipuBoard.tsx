// Доска «Кипу»: главная верёвка сверху, шнуры свисают вниз, на каждом ярусе - узлы. Тап по ярусу шнура - узел
// (вязать или развязывать - переключатель под полем). Внизу шнура - табличка с числом (у итогового - «?»).
import { useEffect, useState } from 'preact/hooks'
import type { BoardProps, KidsLang, KidsPuzzle, Task } from './types'
import { cordOk, quipu, type QuipuMove, type QuipuState } from './quipu'

const W = 360
const LABEL = 64
const TOP = 46
const BAND = 86
const TAB = 44

const TIER_NAMES: Record<KidsLang, string[]> = {
  ru: ['сотни', 'десятки', 'единицы'],
  en: ['hundreds', 'tens', 'ones'],
  tr: ['yüzler', 'onlar', 'birler'],
}
const WHAT: Record<Task, Record<KidsLang, string>> = {
  body: { ru: 'Считаем лам', en: 'Counting llamas', tr: 'Lamaları sayıyoruz' },
  mind: { ru: 'Считаем мешки маиса', en: 'Counting sacks of maize', tr: 'Mısır çuvallarını sayıyoruz' },
  people: { ru: 'Считаем дары Инке', en: 'Counting gifts for the Inca', tr: "İnka'ya armağanları sayıyoruz" },
}
const UI: Record<KidsLang, { tie: string; untie: string; total: string }> = {
  ru: { tie: 'Вязать узел', untie: 'Развязать', total: 'всего' },
  en: { tie: 'Tie a knot', untie: 'Untie', total: 'total' },
  tr: { tie: 'Düğüm at', untie: 'Çöz', total: 'toplam' },
}
// Цвета шнуров: шерсть лам, жёлтый маис, красный для даров.
const CORD: Record<Task, string[]> = {
  body: ['#d8b98a', '#b58a5c', '#e8d6b4'],
  mind: ['#e6c24f', '#cf9a34', '#f0d77c'],
  people: ['#d2603f', '#b7452f', '#e48a5d'],
}
const TOTAL_CORD = '#7fb0c9'

/** Где на ярусе рисовать k-й узел (по пять, с промежутком - так легче считать). */
const knotY = (top: number, k: number) => top + 9 + k * 8 + (k >= 5 ? 5 : 0)

export function QuipuBoard({ state, onMove, hinted, done, lang, task }: BoardProps<QuipuState, QuipuMove>) {
  const s = state
  const [mode, setMode] = useState<1 | -1>(1)
  // Подсказка «развязать» сама переключает режим, чтобы было видно, что делать.
  useEffect(() => {
    if (hinted) setMode(hinted.d)
  }, [hinted])
  const n = s.cords.length
  const colW = (W - LABEL - 4) / n
  const firstTier = 3 - s.tiers
  const H = TOP + s.tiers * BAND + TAB + 22
  const ui = UI[lang] ?? UI.en
  const colors = CORD[task]
  return (
    <div>
      <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="quipu">
        <text x="6" y="18" font-size="15" font-weight="700" fill="#f3ead7">
          {WHAT[task][lang]}
        </text>
        {/* Ярусы: подписи слева и полосы. */}
        {Array.from({ length: s.tiers }, (_, t) => (
          <g>
            <rect x="2" y={TOP + t * BAND + 2} width={W - 4} height={BAND - 4} rx="6" fill={t % 2 ? 'rgba(243,234,215,0.04)' : 'rgba(243,234,215,0.09)'} />
            <text x="8" y={TOP + t * BAND + BAND / 2 + 5} font-size="13" fill="#e2d3b3">
              {TIER_NAMES[lang][firstTier + t]}
            </text>
          </g>
        ))}
        {/* Главная верёвка. */}
        <path d={`M4 ${TOP - 12} Q${W / 2} ${TOP - 4} ${W - 4} ${TOP - 12}`} stroke="#a9874f" stroke-width="7" fill="none" stroke-linecap="round" />
        <path d={`M4 ${TOP - 12} Q${W / 2} ${TOP - 4} ${W - 4} ${TOP - 12}`} stroke="#7a5d32" stroke-width="2" stroke-dasharray="3 5" fill="none" />
        {s.cords.map((c, ci) => {
          const cx = LABEL + colW * ci + colW / 2
          const color = c.total ? TOTAL_CORD : colors[ci % colors.length]
          const bottom = TOP + s.tiers * BAND
          const ok = cordOk(c)
          return (
            <g>
              <line x1={cx} y1={TOP - 8} x2={cx} y2={bottom + 6} stroke={color} stroke-width="4" />
              <line x1={cx} y1={TOP - 8} x2={cx} y2={bottom + 6} stroke="rgba(0,0,0,0.25)" stroke-width="4" stroke-dasharray="2 4" />
              {c.knots.map((k, t) => {
                const top = TOP + t * BAND
                const isHint = !!hinted && hinted.c === ci && hinted.t === t
                return (
                  <g class={`kb-tap${isHint ? ' kb-hint' : ''}`} onClick={() => !done && onMove(isHint ? hinted! : { c: ci, t, d: mode })}>
                    <rect x={cx - colW / 2 + 3} y={top + 4} width={colW - 6} height={BAND - 8} rx="6" fill={isHint ? 'rgba(236,208,111,0.28)' : 'rgba(0,0,0,0.001)'} stroke={isHint ? '#ecd06f' : 'none'} stroke-width="2" />
                    {Array.from({ length: k }, (_, i) => (
                      <g>
                        <ellipse cx={cx} cy={knotY(top, i)} rx="9" ry="3.6" fill={color} stroke="#3b2a17" stroke-width="1.2" />
                        <line x1={cx - 5} y1={knotY(top, i) - 1} x2={cx + 5} y2={knotY(top, i) + 1} stroke="#3b2a17" stroke-width="1" />
                      </g>
                    ))}
                    {k > 0 && (
                      <text x={cx + 16} y={top + BAND / 2 + 5} font-size="13" fill="#bfa987">
                        {k}
                      </text>
                    )}
                  </g>
                )
              })}
              {/* Табличка с числом. */}
              <g>
                <rect x={cx - Math.min(30, colW / 2 - 4)} y={bottom + 8} width={Math.min(60, colW - 8)} height={TAB - 8} rx="6" fill={ok ? '#9cc77a' : c.total ? '#2b3d5e' : '#e9dcbc'} stroke={c.total ? TOTAL_CORD : '#b4955c'} stroke-width="2" />
                <text x={cx} y={bottom + 8 + (TAB - 8) / 2 + 7} font-size="20" font-weight="800" text-anchor="middle" fill={c.total && !ok ? '#f3ead7' : '#1b1a17'}>
                  {c.total && !ok ? '?' : c.target}
                </text>
                {c.total && (
                  <text x={cx} y={bottom + TAB + 16} font-size="12" text-anchor="middle" fill="#bfa987">
                    {ui.total}
                  </text>
                )}
              </g>
            </g>
          )
        })}
      </svg>
      <div class="kb-palette">
        <button class={`chip${mode === 1 ? ' active' : ''}`} disabled={done} onClick={() => setMode(1)}>
          {ui.tie}
        </button>
        <button class={`chip${mode === -1 ? ' active' : ''}`} disabled={done} onClick={() => setMode(-1)}>
          {ui.untie}
        </button>
      </div>
    </div>
  )
}

export const quipuPuzzle: KidsPuzzle<QuipuState, QuipuMove> = {
  id: 'quipu',
  era: 'AMR',
  region: 'cusco',
  place: 'field',
  logic: quipu,
  Board: QuipuBoard,
  text: {
    ru: {
      title: 'Кипу',
      story: 'У инков нет букв, зато есть кипу - шнуры с узлами. Писарь-кипукамайок доверил тебе записать счёт.',
      rule: 'Нажимай на ярус шнура, чтобы завязать узел: сколько узлов на ярусе - столько сотен, десятков или единиц.',
      tasks: ['Сосчитать лам в стаде', 'Записать мешки маиса', 'Записать дары Инке'],
    },
    en: {
      title: 'Quipu',
      story: 'The Inca have no letters, but they have quipu - cords with knots. The record keeper lets you write the count.',
      rule: 'Tap a level of a cord to tie a knot: the knots on a level are the hundreds, tens or ones.',
      tasks: ['Count the llamas in the herd', 'Record the sacks of maize', 'Record the gifts for the Inca'],
    },
    tr: {
      title: 'Kipu',
      story: 'İnkaların yazısı yok ama kipuları var - düğümlü ipler. Kayıt tutan usta sayımı yazmayı sana bıraktı.',
      rule: 'Düğüm atmak için ipin bir katına dokun: bir kattaki düğümler yüzleri, onları ya da birleri gösterir.',
      tasks: ['Sürüdeki lamaları say', 'Mısır çuvallarını kaydet', "İnka'ya armağanları kaydet"],
    },
  },
}
