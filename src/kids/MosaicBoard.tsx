// Доска «Мозаика из смальты»: выбрал цвет в палитре → тап по пустой клетке; тап своей клетки тем же цветом - стереть.
import { useEffect, useState } from 'preact/hooks'
import type { BoardProps, KidsPuzzle, Task } from './types'
import { conflicts, mosaic, type MosaicMove, type MosaicState } from './mosaic'

/** Смальта по заданию: термы - море и мрамор, библиотека - охра и олива, дом сенатора - пурпур и золото. */
export const MOSAIC_COLORS: Record<Task, string[]> = {
  body: ['#2f6f9a', '#efe6d2', '#c8553d', '#2e2a26', '#7fb06a'],
  mind: ['#c9772f', '#3e5f8a', '#efe6d2', '#5b7a3a', '#7a2f2a'],
  people: ['#a3263a', '#e0b43a', '#efe6d2', '#5b3a8f', '#2f7a6a'],
}

const CELL = 64
const PAD = 8

/** Оттенок камешка: чуть светлее или темнее, чтобы клетка была из четырёх кусочков смальты. */
const SHADE = [0, 0.1, -0.08, 0.05]

export function MosaicBoard({ state: s, onMove, hinted, done }: BoardProps<MosaicState, MosaicMove>) {
  const [sel, setSel] = useState(0)
  useEffect(() => {
    if (hinted) setSel(hinted.c)
  }, [hinted])
  const pal = MOSAIC_COLORS[s.task].slice(0, s.n)
  const bad = conflicts(s)
  const size = PAD * 2 + s.n * CELL
  const tap = (i: number) => {
    if (done || s.given[i]) return
    // Подсказанную клетку тап ставит как подсказано, какой бы цвет ни был выбран.
    if (hinted && hinted.i === i) return onMove(hinted)
    onMove({ i, c: sel })
  }
  return (
    <div>
      <svg class="kb-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="mosaic" style={{ maxWidth: `${s.n * 86}px`, margin: '0 auto' }}>
        <rect x="0" y="0" width={size} height={size} rx="10" fill="#bfae8a" />
        <rect x="3" y="3" width={size - 6} height={size - 6} rx="8" fill="none" stroke="#8a7656" stroke-width="2" />
        {s.cells.map((c, i) => {
          const x = PAD + (i % s.n) * CELL
          const y = PAD + Math.floor(i / s.n) * CELL
          const given = s.given[i]
          const h = hinted && hinted.i === i
          const q = (CELL - 10) / 2
          return (
            <g class={`kb-tile${h ? ' kb-hint' : ''}`} onClick={() => tap(i)}>
              <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} rx="5" fill={c < 0 ? '#a8977a' : '#8f7d5f'} />
              {c < 0 && <rect x={x + 9} y={y + 9} width={CELL - 18} height={CELL - 18} rx="4" fill="none" stroke="#8a7656" stroke-width="2" stroke-dasharray="5 4" />}
              {c >= 0 &&
                SHADE.map((sh, k) => (
                  <g>
                    <rect x={x + 4 + (k % 2) * (q + 2)} y={y + 4 + Math.floor(k / 2) * (q + 2)} width={q} height={q} rx="3" fill={pal[c]} />
                    {sh !== 0 && <rect x={x + 4 + (k % 2) * (q + 2)} y={y + 4 + Math.floor(k / 2) * (q + 2)} width={q} height={q} rx="3" fill={sh > 0 ? '#fff' : '#000'} opacity={Math.abs(sh) + ((i + k) % 3) * 0.03} />}
                  </g>
                ))}
              {given && <rect x={x + 1.5} y={y + 1.5} width={CELL - 3} height={CELL - 3} rx="5" fill="none" stroke="#4a3420" stroke-width="3.5" />}
              {given && <circle cx={x + CELL / 2} cy={y + CELL / 2} r="3.5" fill="#4a3420" opacity="0.55" />}
              {!given && bad.has(i) && (
                <g>
                  <circle cx={x + CELL - 12} cy={y + 12} r="8" fill="#d23b2b" stroke="#fff3e0" stroke-width="2" />
                  <path d={`M${x + CELL - 15} ${y + 9} l6 6 M${x + CELL - 9} ${y + 9} l-6 6`} stroke="#fff3e0" stroke-width="2" stroke-linecap="round" />
                </g>
              )}
            </g>
          )
        })}
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

export const mosaicPuzzle: KidsPuzzle<MosaicState, MosaicMove> = {
  id: 'mosaic',
  era: 'E03',
  region: 'rome',
  place: 'workshop',
  logic: mosaic,
  Board: MosaicBoard,
  text: {
    ru: {
      title: 'Мозаика из смальты',
      story: 'Мастер мозаики взял тебя в помощники. Пол почти готов - осталось доложить камешки.',
      rule: 'Выбери цвет и нажми на пустую клетку: в каждом ряду и каждом столбце все цвета должны быть разные.',
      tasks: ['Пол в термах', 'Пол в библиотеке', 'Пол в доме сенатора'],
    },
    en: {
      title: 'Glass mosaic',
      story: 'The mosaic master has taken you on as a helper. The floor is nearly done - only a few stones are left.',
      rule: 'Pick a colour and tap an empty square: every row and every column must have all different colours.',
      tasks: ['Floor of the baths', 'Floor of the library', "Floor of a senator's house"],
    },
    tr: {
      title: 'Cam mozaik',
      story: 'Mozaik ustası seni yardımcı olarak aldı. Zemin neredeyse bitti - yalnızca birkaç taş kaldı.',
      rule: 'Bir renk seç ve boş kareye dokun: her satırda ve her sütunda renkler farklı olmalı.',
      tasks: ['Hamamın zemini', 'Kütüphanenin zemini', 'Senatörün evinin zemini'],
    },
  },
}
