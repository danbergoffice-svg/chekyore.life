import { useState } from 'preact/hooks'
import { useUi } from './text'

// Простые SVG-графики шириной под экран 360 px. У каждого есть таблица значений для скринридеров.

export interface Point {
  x: number
  y: number
}

interface LineChartProps {
  points: Point[]
  yMin?: number
  yMax?: number
  /** Цветные полосы фона: например, сословия на графике положения. */
  bands?: { from: number; to: number; label: string }[]
  /** Отмеченные точки: например, годы резких изменений достатка. */
  marks?: number[]
  /** Вертикальная рамка: ожидаемая продолжительность жизни. */
  frameX?: number
  label: string
  format?: (v: number) => string
}

const VW = 340
const VH = 150
const PAD = { l: 34, r: 8, t: 8, b: 20 }

export function LineChart({ points, yMin, yMax, bands, marks, frameX, label, format = String }: LineChartProps) {
  if (points.length === 0) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs, x0 + 1)
  const lo = yMin ?? Math.min(0, ...ys)
  const hi = yMax ?? Math.max(...ys, lo + 1)
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (VW - PAD.l - PAD.r)
  const sy = (y: number) => VH - PAD.b - ((y - lo) / (hi - lo || 1)) * (VH - PAD.t - PAD.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const ticks = [lo, (lo + hi) / 2, hi]
  return (
    <svg class="chart" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={label}>
      {bands?.map((b, i) => (
        <g>
          <rect x={PAD.l} y={sy(b.to)} width={VW - PAD.l - PAD.r} height={Math.max(0, sy(b.from) - sy(b.to))} class={i % 2 ? 'band-a' : 'band-b'} />
          <text x={VW - PAD.r - 2} y={sy(b.to) + 9} class="band-label" text-anchor="end">
            {b.label}
          </text>
        </g>
      ))}
      {frameX !== undefined && frameX >= x0 && frameX <= x1 && <line x1={sx(frameX)} x2={sx(frameX)} y1={PAD.t} y2={VH - PAD.b} class="frame-line" />}
      {lo < 0 && hi > 0 && <line x1={PAD.l} x2={VW - PAD.r} y1={sy(0)} y2={sy(0)} class="zero-line" />}
      {ticks.map((v) => (
        <text x={PAD.l - 4} y={sy(v) + 3} class="tick" text-anchor="end">
          {format(Math.round(v))}
        </text>
      ))}
      {[x0, Math.round((x0 + x1) / 2), x1].map((v) => (
        <text x={sx(v)} y={VH - 6} class="tick" text-anchor="middle">
          {v}
        </text>
      ))}
      <path d={path} class="chart-line" />
      {marks?.map((m) => {
        const p = points.find((q) => q.x === m)
        return p ? <circle cx={sx(p.x)} cy={sy(p.y)} r={3.5} class="chart-mark" /> : null
      })}
    </svg>
  )
}

export function BarList({ items, label }: { items: { label: string; value: number }[]; label: string }) {
  return (
    <div class="barlist" role="list" aria-label={label}>
      {items.map((i) => (
        <div class="barlist-row" role="listitem">
          <span class="barlist-label">{i.label}</span>
          <span class="barlist-track">
            <span class="barlist-fill" style={{ width: `${i.value}%` }} />
          </span>
          <span class="barlist-value">{i.value}%</span>
        </div>
      ))}
    </div>
  )
}

/** Кнопка «посмотреть цифры» и таблица под графиком. */
export function Numbers({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const { t } = useUi()
  const [open, setOpen] = useState(false)
  return (
    <div class="numbers">
      <button class="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? t('charts.hide') : t('charts.numbers')}
      </button>
      {open && (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>{head.map((h) => <th>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>{r.map((c) => <td>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
