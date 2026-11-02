// Доска «Рукописи Тимбукту»: ряд сундуков с книгами. Тап по сундуку - взять верхнюю книгу, тап по другому - положить.
import { useState } from 'preact/hooks'
import type { BoardProps, KidsLang, KidsPuzzle, Task } from './types'
import { canMove, manuscripts, type MsMove, type MsState } from './manuscripts'

const VW = 360
const CAP_Y = 20
/** Обложки: охра, индиго, зелёный, красная кожа, слива; на корешке - столько точек, какой это цвет по счёту. */
const COVERS: [string, string][] = [
  ['#d29b3a', '#8a5f1c'],
  ['#3d5a8a', '#22355a'],
  ['#5f8a3a', '#355220'],
  ['#b0442e', '#6f2717'],
  ['#7b4a7a', '#4a2a4a'],
]

const CAPTION: Record<Task, Record<KidsLang, string>> = {
  body: { ru: 'Сундуки для каравана', en: 'Chests for the caravan', tr: 'Kervan için sandıklar' },
  mind: { ru: 'Книги учёного', en: "The scholar's books", tr: 'Âlimin kitapları' },
  people: { ru: 'Библиотека мансы', en: "The mansa's library", tr: "Mansa'nın kütüphanesi" },
}

const same = (a: MsMove | null, f: number) => !!a && (a.from === f || a.to === f)

export function ManuscriptsBoard({ state: s, onMove, hinted, done, lang, task }: BoardProps<MsState, MsMove>) {
  const [sel, setSel] = useState<number | null>(null)
  const n = s.stacks.length
  const colW = Math.min(68, Math.floor((VW - 8) / n))
  const x0 = (VW - colW * n) / 2
  const bh = s.cap > 3 ? 26 : 30
  const bw = colW - 14
  const lift = CAP_Y + 8
  const chestTop = lift + bh + 14
  const chestH = s.cap * bh + 14
  const H = chestTop + chestH + 8
  const selected = sel !== null && s.stacks[sel]?.length && !done ? sel : null

  const tap = (c: number) => {
    if (done) return
    if (selected === null) {
      if (s.stacks[c].length) setSel(c)
      return
    }
    if (selected === c) return setSel(null)
    if (canMove(s, selected, c)) {
      onMove({ from: selected, to: c })
      setSel(null)
    } else setSel(s.stacks[c].length ? c : null)
  }

  const book = (x: number, y: number, color: number) => {
    const [f, d] = COVERS[color % COVERS.length]
    const dots = []
    for (let k = 0; k <= color; k++) dots.push(<circle cx={x + bw / 2 + (k - color / 2) * 6} cy={y + (bh - 3) / 2} r="1.9" fill="#f3d98a" />)
    return (
      <g pointer-events="none">
        <rect x={x} y={y} width={bw} height={bh - 3} rx="3" fill={f} stroke={d} stroke-width="2" />
        <rect x={x + 3} y={y + 3} width="4" height={bh - 9} fill={d} opacity="0.7" />
        <rect x={x + bw - 7} y={y + 3} width="4" height={bh - 9} fill={d} opacity="0.7" />
        {dots}
      </g>
    )
  }

  return (
    <svg class="kb-svg" viewBox={`0 0 ${VW} ${H}`} role="img" aria-label="manuscripts">
      <text x={VW / 2} y="16" font-size="15" text-anchor="middle" fill="#e2d3b3" font-weight="700">
        {CAPTION[task][lang] ?? CAPTION[task].en}
      </text>
      {s.stacks.map((st, c) => {
        const x = x0 + c * colW
        const bx = x + (colW - bw) / 2
        const full = st.length === s.cap && st.every((b) => b === st[0])
        return (
          <g class="kb-tap" onClick={() => tap(c)}>
            <rect x={x} y={lift} width={colW} height={H - lift} fill="transparent" />
            {/* Сундук: задняя стенка, книги, передний бортик. */}
            <rect x={x + 3} y={chestTop} width={colW - 6} height={chestH} rx="4" fill="#5a3a22" stroke={full ? '#ecd06f' : '#3b2414'} stroke-width={full ? 3 : 2} />
            {st.map((b, k) => (selected === c && k === st.length - 1 ? null : book(bx, chestTop + chestH - 7 - (k + 1) * bh + 3, b)))}
            <rect x={x + 3} y={chestTop + chestH - 9} width={colW - 6} height="9" rx="3" fill="#7a5232" stroke="#3b2414" stroke-width="1.5" />
            <circle cx={x + colW / 2} cy={chestTop + chestH - 4.5} r="2.2" fill="#d9b04a" pointer-events="none" />
            {selected === c && book(bx, lift + 2, top(st))}
          </g>
        )
      })}
      {/* Подсказка: оба сундука мигают, тап по любому делает ход. */}
      {hinted &&
        s.stacks.map((_, c) =>
          same(hinted, c) ? (
            <rect class="kb-hint kb-tap" x={x0 + c * colW + 1} y={lift} width={colW - 2} height={H - lift - 2} rx="6" fill="rgba(236,208,111,0.18)" stroke="#ecd06f" stroke-width="3" stroke-dasharray={hinted.to === c ? '7 4' : undefined} onClick={() => !done && (onMove(hinted), setSel(null))} />
          ) : null,
        )}
      {hinted && (
        <path
          pointer-events="none"
          d={(() => {
            const a = x0 + hinted.from * colW + colW / 2, b = x0 + hinted.to * colW + colW / 2
            const y = lift + 4
            return `M${a} ${y + 10} Q${(a + b) / 2} ${y - 14} ${b} ${y + 10} M${b - 6} ${y + 2} L${b} ${y + 10} L${b + 6} ${y + 3}`
          })()}
          stroke="#ecd06f"
          stroke-width="3"
          fill="none"
          stroke-linecap="round"
        />
      )}
    </svg>
  )
}

const top = (a: number[]) => a[a.length - 1]

export const manuscriptsPuzzle: KidsPuzzle<MsState, MsMove> = {
  id: 'manuscripts',
  era: 'WAF',
  region: 'timbuktu',
  place: 'school',
  logic: manuscripts,
  Board: ManuscriptsBoard,
  text: {
    ru: {
      title: 'Рукописи Тимбукту',
      story: 'В библиотеке перепутались книги. Учитель просит разложить их по сундукам, каждому цвету - свой сундук.',
      rule: 'Нажми на сундук, чтобы взять верхнюю книгу, и на другой, чтобы положить: на книгу того же цвета или в пустой сундук. Последнюю книгу можно вернуть назад.',
      tasks: ['Сундуки для каравана', 'Книги учёного', 'Библиотека мансы'],
    },
    en: {
      title: 'The manuscripts of Timbuktu',
      story: 'The books in the library got mixed up. The teacher asks you to sort them into chests, one colour per chest.',
      rule: 'Tap a chest to take its top book, then another to put it down: on a book of the same colour or into an empty chest. You can always put the last book back.',
      tasks: ['Chests for the caravan', "The scholar's books", "The mansa's library"],
    },
    tr: {
      title: 'Timbuktu el yazmaları',
      story: 'Kütüphanedeki kitaplar karıştı. Öğretmen onları sandıklara ayırmanı istiyor: her renge bir sandık.',
      rule: 'En üstteki kitabı almak için bir sandığa, bırakmak için başka birine dokun: aynı renk kitabın üstüne ya da boş sandığa. Son kitabı her zaman geri koyabilirsin.',
      tasks: ['Kervan için sandıklar', 'Âlimin kitapları', "Mansa'nın kütüphanesi"],
    },
  },
}
