// Доска «Столики для гостей»: зал из клеток сверху, лоток со столиками снизу.
// Тап по столику в лотке - выбрать (ещё тап - повернуть), тап по клетке зала - поставить; тап по стоящему столику - убрать.
import { useState } from 'preact/hooks'
import type { BoardProps, KidsLang, KidsPuzzle } from './types'
import { coverMap, dims, placeAt, rectOf, tables, type TablesMove, type TablesState } from './tables'

const VW = 360
const TC = 20
const SLOT = 84

/** Цвет столика по форме: лавка 1×2 - светлое дерево, 1×3 - красный лак, 2×2 - тёмное дерево. */
function woodFor(p: [number, number]): [string, string] {
  const k = p[0] * p[1]
  if (k === 4) return ['#7a5232', '#4f3320']
  if (k === 3) return ['#b0442e', '#6f2717']
  return ['#c4884a', '#87582b']
}

const L: Record<KidsLang, { rotate: string; tray: string; pick: string }> = {
  ru: { rotate: 'Повернуть', tray: 'Теперь нажми на клетку зала', pick: 'Выбери столик' },
  en: { rotate: 'Turn', tray: 'Now tap a square in the hall', pick: 'Pick a table' },
  tr: { rotate: 'Döndür', tray: 'Şimdi salonda bir kareye dokun', pick: 'Bir masa seç' },
}

/** Столик: столешница, ободок и чашки (по одной на клетку). */
function Table({ x, y, w, h, cell, color }: { x: number; y: number; w: number; h: number; cell: number; color: [string, string] }) {
  const pad = Math.max(2, cell * 0.07)
  const cups = []
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) cups.push(<circle cx={x + (xx + 0.5) * cell} cy={y + (yy + 0.5) * cell} r={cell * 0.12} fill="#f3ead7" stroke="#8c7a5c" stroke-width={Math.max(1, cell * 0.03)} />)
  return (
    <>
      <rect x={x + pad} y={y + pad} width={w * cell - pad * 2} height={h * cell - pad * 2} rx={cell * 0.16} fill={color[0]} stroke={color[1]} stroke-width={Math.max(1.5, cell * 0.06)} />
      <rect x={x + pad * 2.6} y={y + pad * 2.6} width={w * cell - pad * 5.2} height={h * cell - pad * 5.2} rx={cell * 0.1} fill="none" stroke="rgba(255,235,190,0.35)" stroke-width={Math.max(1, cell * 0.03)} />
      {cups}
    </>
  )
}

export function TablesBoard({ state: s, onMove, hinted, done, lang }: BoardProps<TablesState, TablesMove>) {
  const [sel, setSel] = useState<number | null>(null)
  const [rots, setRots] = useState<Record<number, number>>({})
  const t = L[lang] ?? L.en
  const selected = sel !== null && !s.placed[sel] && !done ? sel : null
  const rotOf = (i: number) => rots[i] ?? 0
  const turn = (i: number) => setRots({ ...rots, [i]: (rotOf(i) + 1) % 2 })

  const cell = Math.min(54, Math.floor((VW - 16) / s.w))
  const gx = (VW - s.w * cell) / 2
  const gy = 6
  const cover = coverMap(s)
  const trayTop = gy + s.h * cell + 34
  const perRow = 4
  const rows = Math.ceil(s.pieces.length / perRow)
  const trayX = (VW - perRow * SLOT) / 2
  const H = done ? gy + s.h * cell + 8 : trayTop + rows * SLOT + 4
  const hintPlace = hinted && !('remove' in hinted) ? hinted : null
  const hintRemove = hinted && 'remove' in hinted ? hinted.remove : -1

  const tapCell = (x: number, y: number) => {
    if (done) return
    const i = cover[y * s.w + x]
    if (i >= 0) {
      onMove({ remove: i })
      return
    }
    if (selected === null) return
    const m = placeAt(s, selected, rotOf(selected), x, y)
    if (m) {
      onMove(m)
      setSel(null)
    }
  }
  const tapTray = (i: number) => {
    if (done || s.placed[i]) return
    if (selected === i) turn(i)
    else setSel(i)
  }

  return (
    <div>
      <svg class="kb-svg" viewBox={`0 0 ${VW} ${H}`} role="img" aria-label="tables">
        {/* Пол зала и пустые клетки - сюда можно ставить. */}
        {s.cells.map((c, i) => {
          if (!c) return null
          const x = i % s.w, y = Math.floor(i / s.w)
          return <rect class="kb-tap" x={gx + x * cell + 1} y={gy + y * cell + 1} width={cell - 2} height={cell - 2} rx="3" fill={selected !== null ? '#efdcae' : '#e3cb96'} stroke="#b89a5e" stroke-width="1.5" onClick={() => tapCell(x, y)} />
        })}
        {/* Стоящие столики. */}
        {s.pieces.map((p, i) => {
          const r = rectOf(s, i)
          if (!r) return null
          const isHint = hintRemove === i
          return (
            <g class={`kb-tile${isHint ? ' kb-hint' : ''}`} onClick={() => !done && onMove({ remove: i })}>
              <Table x={gx + r.x * cell} y={gy + r.y * cell} w={r.w} h={r.h} cell={cell} color={woodFor(p)} />
              {isHint && <rect x={gx + r.x * cell + 1} y={gy + r.y * cell + 1} width={r.w * cell - 2} height={r.h * cell - 2} rx="6" fill="none" stroke="#ecd06f" stroke-width="4" />}
            </g>
          )
        })}
        {/* Подсказка: куда поставить столик - тап по рамке ставит его. */}
        {hintPlace &&
          (() => {
            const [w, h] = dims(s.pieces[hintPlace.piece], hintPlace.rot)
            return (
              <g class="kb-hint kb-tap" onClick={() => !done && onMove(hintPlace)}>
                <rect x={gx + hintPlace.x * cell + 2} y={gy + hintPlace.y * cell + 2} width={w * cell - 4} height={h * cell - 4} rx="6" fill="rgba(236,208,111,0.35)" stroke="#ecd06f" stroke-width="4" stroke-dasharray="8 5" />
              </g>
            )
          })()}
        {!done && (
          <>
          <text x={VW / 2} y={trayTop - 12} font-size="14" text-anchor="middle" fill="#e2d3b3" font-weight="700">
            {selected === null ? (s.placed.every((p) => p) ? '' : t.pick) : t.tray}
          </text>
          {/* Лоток. */}
          {s.pieces.map((p, i) => {
            const sx = trayX + (i % perRow) * SLOT
            const sy = trayTop + Math.floor(i / perRow) * SLOT
            const placed = !!s.placed[i]
            const [w, h] = dims(p, rotOf(i))
            const on = selected === i
            const hintHere = hintPlace?.piece === i
            return (
              <g class="kb-tap" onClick={() => tapTray(i)}>
                <rect x={sx + 3} y={sy + 3} width={SLOT - 6} height={SLOT - 6} rx="8" fill={on ? 'rgba(236,208,111,0.22)' : 'rgba(243,234,215,0.06)'} stroke={on || hintHere ? '#ecd06f' : 'rgba(243,234,215,0.18)'} stroke-width={on ? 3 : hintHere ? 2 : 1} stroke-dasharray={hintHere && !on ? '5 4' : undefined} />
                {!placed && <Table x={sx + (SLOT - w * TC) / 2} y={sy + (SLOT - h * TC) / 2} w={w} h={h} cell={TC} color={woodFor(p)} />}
              </g>
            )
          })}
          </>
        )}
      </svg>
      {!done && (
        <div class="kb-palette">
          <button class="secondary" style={{ width: 'auto', minWidth: '160px', minHeight: '44px', padding: '0 20px' }} disabled={selected === null} onClick={() => selected !== null && turn(selected)}>
            <svg viewBox="0 0 24 24" width="18" height="18" style={{ verticalAlign: '-3px', marginRight: '6px' }} fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" />
            </svg>
            {t.rotate}
          </button>
        </div>
      )}
    </div>
  )
}

export const tablesPuzzle: KidsPuzzle<TablesState, TablesMove> = {
  id: 'tables',
  era: 'CHN',
  region: 'hangzhou',
  place: 'home',
  logic: tables,
  Board: TablesBoard,
  text: {
    ru: {
      title: 'Столики для гостей',
      story: 'В доме ждут гостей. Мама просит расставить столики так, чтобы в зале не осталось пустого места.',
      rule: 'Выбери столик внизу (ещё тап - повернуть) и нажми на клетку зала. Заставь весь зал без щелей.',
      tasks: ['Обед для работников', 'Задача учителя', 'Пир чиновника'],
    },
    en: {
      title: 'Tables for the guests',
      story: 'Guests are coming. Mother asks you to set out the tables so that no empty floor is left in the hall.',
      rule: 'Pick a table below (tap again to turn it) and tap a square in the hall. Fill the whole hall with no gaps.',
      tasks: ['Lunch for the workers', "The teacher's puzzle", "The official's feast"],
    },
    tr: {
      title: 'Misafir masaları',
      story: 'Eve misafir geliyor. Annen masaları salonda boş yer kalmayacak şekilde dizmeni istiyor.',
      rule: 'Aşağıdan bir masa seç (döndürmek için bir kez daha dokun) ve salonda bir kareye dokun. Salonu boşluksuz doldur.',
      tasks: ['İşçilere öğle yemeği', 'Öğretmenin bilmecesi', 'Memurun ziyafeti'],
    },
  },
}
