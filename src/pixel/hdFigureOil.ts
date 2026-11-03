// Люди маслом мастихином (пилот 03.11): каждый персонаж сцены в нужных позах рисуется один раз на общий лист
// 960×300, лист целиком переписывается маслом (impasto), кадр берёт готовую позу с листа. Анимация остаётся,
// а кадр стоит как раньше. Лист запоминается по внешности (возраст - ступенями: ребёнок, подросток, взрослый,
// старик), так что люди не перерисовываются каждый год.
import type { FigureSpec } from './figures'
import { drawHdFigure } from './hdFigure'
import { paintImpasto, recorder } from './impasto/record'

type Ctx = CanvasRenderingContext2D

export interface FigureJob {
  spec: FigureSpec
  k: number
  prof?: string
  poses: number[]
}

/** Клетка листа: место под фигуру с убором, предметом и отметкой героя. */
const CW = 80
const CH = 110
const LEFT = 22
const FOOT = 100
const COLS = Math.floor(960 / CW)
const ROWS = Math.floor(300 / CH)

export interface FigureSheet {
  /** Нарисовать позу фигуры: x - левый край туловища, base - низ ступней (точки HD). false - на листе её нет. */
  draw: (ctx: Ctx, job: number, pose: number, x: number, base: number) => boolean
}

const SHEETS = new Map<string, FigureSheet>()

const ageStep = (a: number) => (a < 10 ? 5 : a < 12 ? 11 : a < 15 ? 13 : a < 18 ? 16 : a < 62 ? 30 : 70)

function keyOf(jobs: FigureJob[]): string {
  return JSON.stringify(jobs.map((j) => [{ ...j.spec, age: ageStep(j.spec.age) }, Math.round(j.k * 100), j.prof ?? '', j.poses]))
}

/** Лист поз маслом; null - масло недоступно (нет WebGL2) - люди рисуются векторно. */
export function figureSheet(jobs: FigureJob[], seed: number): FigureSheet | null {
  const key = keyOf(jobs)
  const hit = SHEETS.get(key)
  if (hit) return hit
  const rec = recorder(960, 300)
  const cells = new Map<string, [number, number]>()
  let n = 0
  jobs.forEach((j, i) => {
    for (const pose of j.poses) {
      if (n >= COLS * ROWS) return
      const cx = (n % COLS) * CW
      const cy = Math.floor(n / COLS) * CH
      n++
      rec.ctx.save()
      rec.ctx.beginPath()
      rec.ctx.rect(cx, cy, CW, CH)
      rec.ctx.clip()
      drawHdFigure(rec.ctx, cx + LEFT, cy + FOOT, { ...j.spec, age: j.spec.age }, j.k, pose, j.prof)
      rec.ctx.restore()
      cells.set(`${i}:${pose}`, [cx, cy])
    }
  })
  // Мелкие мазки: фигура - около 70 точек ростом, лицо - несколько точек.
  if (!paintImpasto(rec, { seed, radii: [4, 2.2, 1.3, 0.9], norm: 2.4, blur: 0 })) return null
  // На таком росте мазки съедают лицо и контур: поверх краски - тот же рисунок полупрозрачно, лицо - целиком.
  const x = rec.ref.ctx
  jobs.forEach((j, i) => {
    for (const pose of j.poses) {
      const c = cells.get(`${i}:${pose}`)
      if (!c) continue
      x.save()
      x.beginPath()
      x.rect(c[0], c[1], CW, CH)
      x.clip()
      x.globalAlpha = 0.7
      drawHdFigure(x, c[0] + LEFT, c[1] + FOOT, j.spec, j.k, pose, j.prof)
      x.restore()
    }
  })
  const sheet: FigureSheet = {
    draw: (ctx, job, pose, x, base) => {
      const c = cells.get(`${job}:${pose}`)
      if (!c) return false
      ctx.drawImage(rec.canvas, c[0], c[1], CW, CH, x - LEFT, base - FOOT, CW, CH)
      return true
    },
  }
  SHEETS.set(key, sheet)
  if (SHEETS.size > 16) SHEETS.delete(SHEETS.keys().next().value!)
  return sheet
}
