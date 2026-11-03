// Люди детальной сцены (пилот, 03.11): Европа XIV–XV веков в сетке 960×300 - рисунком, а не геометрией:
// профиль лица (лоб, нос, губы, подбородок), глаз, ухо, пряди волос и бороды; руки и ноги - сужающиеся формы
// с локтем и коленом, кисти с большим пальцем, кулак на предмете; одежда - силуэт с волнистым подолом,
// складками и тенью по форме; башмаки с подошвой и носком. Контур - тёмно-коричневый, свет слева.
// Та же FigureSpec, что у пиксельных человечков (figures.ts): кожа, волосы, одежда, убор, борода - как на портрете героя.
// Позы: 0 - стоит, 1 - шаг, 2–3 - замах при работе (как poseAt в scene.ts).
import type { FigureSpec, Tool } from './figures'
import { toolFor } from './figures'

type Ctx = CanvasRenderingContext2D
type Pt = [number, number]

const CLERGY = ['priest', 'monk', 'hegumen', 'shrine_priest', 'marabout', 'faqir', 'muezzin', 'debtera']
const INK = 'rgba(38,24,16,0.85)'

/** Рост на детальной сцене: втрое больше, чем в сетке 320×100. */
export const HD_SCALE = 3

function shade(hex: string, k: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

/** Плавная линия через точки (середины отрезков - узлы кривых). */
function smooth(ctx: Ctx, pts: Pt[], closed: boolean) {
  const n = pts.length
  if (closed) {
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2)
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % n]
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    }
    ctx.closePath()
  } else {
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1])
  }
}

function shape(ctx: Ctx, pts: Pt[], fill: string | CanvasGradient, ink = 1) {
  ctx.beginPath()
  smooth(ctx, pts, true)
  ctx.fillStyle = fill
  ctx.fill()
  if (ink > 0) {
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK
    ctx.lineWidth = ink
    ctx.stroke()
  }
}

function stroke(ctx: Ctx, pts: Pt[], color: string, w: number) {
  ctx.beginPath()
  smooth(ctx, pts, false)
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.lineCap = 'butt'
}

/** Конечность-трубка: по осевым точкам с толщиной в каждой - контур с двух сторон, концы скруглены. */
function tube(ctx: Ctx, axis: [number, number, number][], fill: string | CanvasGradient, ink = 0.9) {
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < axis.length; i++) {
    const a = axis[Math.max(0, i - 1)]
    const b = axis[Math.min(axis.length - 1, i + 1)]
    let dx = b[0] - a[0]
    let dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const w = axis[i][2] / 2
    left.push([axis[i][0] - dy * w, axis[i][1] + dx * w])
    right.push([axis[i][0] + dy * w, axis[i][1] - dx * w])
  }
  const end = axis[axis.length - 1]
  const start = axis[0]
  shape(ctx, [...left, [end[0], end[1]], ...right.reverse(), [start[0], start[1]]], fill, ink)
}

/** Кисть: ладонь вдоль предплечья, большой палец, пальцы; fist - сжата на предмете. */
function hand(ctx: Ctx, wx: number, wy: number, dx: number, dy: number, size: number, skin: string, fist: boolean) {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Поперёк: «вперёд» - к носу (вправо), там большой палец.
  const vx = -uy
  const vy = ux
  const side = vx >= 0 ? 1 : -1
  const at = (a: number, b: number): Pt => [wx + ux * a * size + vx * b * size * side, wy + uy * a * size + vy * b * size * side]
  const pts: Pt[] = fist
    ? [at(0, -0.42), at(0.45, -0.55), at(0.95, -0.42), at(1.05, 0.05), at(0.85, 0.45), at(0.45, 0.62), at(0.2, 0.75), at(0.05, 0.42)]
    : [at(0, -0.4), at(0.55, -0.48), at(1.25, -0.35), at(1.45, -0.05), at(1.3, 0.25), at(0.8, 0.38), at(0.55, 0.62), at(0.45, 0.8), at(0.25, 0.62), at(0.05, 0.4)]
  shape(ctx, pts, skin, 0.8)
  ctx.strokeStyle = 'rgba(80,40,30,0.45)'
  ctx.lineWidth = 0.6
  const lines = fist ? [[-0.25, 0.75, 1.0], [0.05, 0.75, 1.0], [0.3, 0.75, 1.0]] : [[-0.2, 0.9, 1.35], [0.05, 0.9, 1.35]]
  for (const [b, a1, a2] of lines) {
    const p = at(a1, b)
    const q = at(a2, b)
    ctx.beginPath()
    ctx.moveTo(p[0], p[1])
    ctx.lineTo(q[0], q[1])
    ctx.stroke()
  }
}

/** Башмак: пятка, подошва, носок (у знати длинный - пулены), подъём к щиколотке. */
function shoe(ctx: Ctx, x: number, base: number, s: number, color: string, pointed: boolean) {
  const toe = pointed ? 2.4 : 1.5
  shape(
    ctx,
    [
      [x - s * 0.45, base - s * 0.9],
      [x - s * 0.62, base - s * 0.25],
      [x - s * 0.4, base],
      [x + s * toe * 0.6, base],
      [x + s * toe, base - s * 0.12],
      [x + s * toe * 0.7, base - s * 0.45],
      [x + s * 0.35, base - s * 0.7],
      [x + s * 0.3, base - s * 1.0],
    ],
    color,
    0.8,
  )
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(x - s * 0.5, base - s * 0.12, s * (toe * 0.6 + 0.4), s * 0.12)
}

/**
 * Человек: x - левый край туловища, base - низ ступней (точки HD), k - затемнение по времени суток,
 * pose - кадр позы. Смотрит вправо.
 */
export function drawHdFigure(ctx: Ctx, x: number, base: number, f: FigureSpec, k: number, pose = 0, profession?: string): void {
  const c = (hex: string, d = 0) => shade(hex, k * 0.5 + d)
  const H = f.h * HD_SCALE
  const child = f.age < 10
  const teen = f.age >= 10 && f.age < 15
  const elder = f.age >= 62
  const clergy = !!profession && CLERGY.includes(profession)
  const noble = f.cls === 'noble'
  const slave = f.cls === 'slave'
  const woman = f.sex === 'f'
  const tool: Tool | undefined = f.tool ?? toolFor(profession) ?? (elder && !child ? 'staff' : undefined)
  ctx.save()
  ctx.lineJoin = 'round'

  const headH = H * (child ? 0.27 : teen ? 0.22 : 0.19)
  const sw = H * (child ? 0.34 : 0.29)
  const cx = x + sw / 2 + H * 0.02
  const stoop = elder ? H * 0.045 : 0
  const bob = pose === 1 ? -H * 0.012 : 0
  const top = base - H + bob
  const shY = top + headH + H * 0.025
  const waistY = top + H * (child ? 0.56 : 0.5)
  const long = woman || clergy || (noble && f.age >= 15) || f.cls === 'trader'
  const hemY = long ? base - H * (woman || clergy ? 0.02 : f.cls === 'trader' ? 0.14 : 0.07) : top + H * (child ? 0.74 : 0.69)
  const step = pose === 1 ? H * 0.07 : 0
  const cloth = clergy ? '#3a3230' : slave ? '#c8b89a' : f.cloth
  const legC = child && !noble ? f.skin : noble ? shade(f.accent ?? '#8a2a2a', -0.1) : '#4a3a2c'
  const skin = c(f.skin)

  // Тень под ногами.
  ctx.fillStyle = 'rgba(20,14,10,0.28)'
  ctx.beginPath()
  ctx.ellipse(cx + H * 0.04, base + 1, sw * 0.8, H * 0.03, 0, 0, Math.PI * 2)
  ctx.fill()

  // Отметка героя: золотой треугольник над головой.
  if (f.hero) {
    const y = top - H * (f.hat === 'tall' ? 0.2 : 0.11)
    ctx.fillStyle = '#f2c94c'
    ctx.strokeStyle = 'rgba(90,60,10,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx + stoop - 6, y)
    ctx.lineTo(cx + stoop + 6, y)
    ctx.lineTo(cx + stoop, y + 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Ноги - всегда от пояса до ступней: под длинной одеждой их просто закрывает подол (раньше у купца и знати
  // между подолом и башмаками была пустота).
  const legW = sw * 0.27
  const knee = waistY + (base - waistY) * 0.5
  const leg = (hipX: number, footX: number, color: string) => {
    tube(ctx, [
      [hipX, waistY + H * 0.03, legW * 1.15],
      [(hipX + footX) / 2 + legW * 0.12, knee, legW * 0.95],
      [footX + legW * 0.1, knee + (base - knee) * 0.45, legW * 0.88],
      [footX, base - legW * 0.55, legW * 0.6],
    ], color, 0.8)
    shoe(ctx, footX, base, legW * 0.95, c(noble ? '#2a1e18' : '#3a2a1e'), noble && !woman)
  }
  leg(cx - sw * 0.12 + step * 0.4, cx - sw * 0.16 - step, c(legC, -0.15))

  // Задняя рука - за туловищем, темнее.
  const armW = sw * 0.27
  const work = (pose === 2 || pose === 3) && !!tool
  const bSh: Pt = [cx - sw * 0.26 + stoop, shY + armW * 0.55]
  const bEl: Pt = [cx - sw * 0.36 + stoop - step * 0.4, shY + (waistY - shY) * 0.58]
  const bWr: Pt = [cx - sw * 0.26 + stoop + (work ? sw * 0.5 : -step * 0.6), waistY + H * 0.07]
  tube(ctx, [[bSh[0], bSh[1], armW], [bEl[0], bEl[1], armW * 0.92], [bWr[0], bWr[1], armW * 0.72]], c(cloth, -0.18))
  hand(ctx, bWr[0], bWr[1], bWr[0] - bEl[0], bWr[1] - bEl[1], armW * 0.95, c(f.skin, -0.12), work)

  leg(cx + sw * 0.1 - step * 0.4, cx + sw * 0.06 + step, c(legC))

  // Одежда: силуэт с плечами, напуском над поясом, волнистым подолом.
  const hemW = long ? sw * (woman ? 1.5 : 1.32) : sw * 1.14
  const s = stoop
  const hemShift = pose === 1 ? step * 0.5 : 0
  const hem: Pt[] = []
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    hem.push([cx + hemW / 2 + hemShift - t * hemW, hemY + Math.sin(t * Math.PI * 3 + (pose === 1 ? 1 : 0)) * H * 0.008 + Math.sin(t * Math.PI) * H * 0.012])
  }
  const body: Pt[] = [
    [cx - sw * 0.15 + s, shY - 1.5],
    [cx + sw * 0.18 + s, shY - 1.5],
    [cx + sw * 0.52 + s, shY + sw * 0.12],
    [cx + sw * 0.5 + s * 0.6, shY + sw * 0.55],
    [cx + sw * 0.47 + s * 0.4, waistY - H * 0.04],
    [cx + sw * 0.54 + s * 0.3, waistY - H * 0.005],
    [cx + sw * 0.45, waistY + H * 0.02],
    ...hem,
    [cx - sw * 0.45, waistY + H * 0.02],
    [cx - sw * 0.54, waistY - H * 0.005],
    [cx - sw * 0.48, waistY - H * 0.04],
    [cx - sw * 0.52 + s, shY + sw * 0.5],
    [cx - sw * 0.5 + s, shY + sw * 0.1],
  ]
  const grad = ctx.createLinearGradient(cx - hemW / 2, 0, cx + hemW / 2, 0)
  grad.addColorStop(0, c(cloth, 0.1))
  grad.addColorStop(0.45, c(cloth))
  grad.addColorStop(1, c(cloth, -0.25))
  shape(ctx, body, grad, 1.1)
  ctx.save()
  ctx.beginPath()
  smooth(ctx, body, true)
  ctx.clip()
  // Тень по форме: правый бок.
  ctx.fillStyle = 'rgba(30,18,24,0.18)'
  ctx.beginPath()
  smooth(ctx, [[cx + sw * 0.28, shY], [cx + sw * 0.6, shY + sw * 0.3], [cx + sw * 0.5, waistY], [cx + hemW * 0.55, hemY + 4], [cx + hemW * 0.22, hemY + 4], [cx + sw * 0.25, waistY + H * 0.05], [cx + sw * 0.18, shY + sw * 0.5]], true)
  ctx.fill()
  // Складки: от пояса расходятся к подолу, тёмные кривые и светлые блики.
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5
    const fx = cx - hemW / 2 + hemShift + t * hemW
    const bx = cx - sw * 0.35 + t * sw * 0.7
    stroke(ctx, [[bx, waistY + H * 0.025], [bx + (fx - bx) * 0.5 + (i % 2 ? 1.5 : -1.5), (waistY + hemY) / 2], [fx, hemY - 1]], c(cloth, -0.35), 0.9)
    if (i % 2 === 0) stroke(ctx, [[bx + 2, waistY + H * 0.04], [bx + (fx - bx) * 0.5 + 2.5, (waistY + hemY) / 2 + 3], [fx + 2, hemY - 3]], c(cloth, 0.18), 0.6)
  }
  // Складки напуска над поясом.
  for (let i = 0; i < 3; i++) stroke(ctx, [[cx - sw * 0.3 + i * sw * 0.3, waistY - H * 0.045], [cx - sw * 0.26 + i * sw * 0.3, waistY - H * 0.015], [cx - sw * 0.3 + i * sw * 0.3, waistY]], c(cloth, -0.3), 0.7)
  // Фартук: кожаный у ремесленника, льняной у работницы.
  if ((f.cls === 'craftsman' || (woman && (f.cls === 'peasant' || f.cls === 'craftsman'))) && !child && !clergy) {
    const ay = woman ? waistY : shY + H * 0.07
    shape(ctx, [[cx - sw * 0.02, ay], [cx + sw * 0.5, ay], [cx + sw * 0.62, hemY - H * 0.06], [cx + sw * 0.25, hemY - H * 0.04], [cx - sw * 0.08, hemY - H * 0.06]], c(woman ? '#ece4d2' : '#8a6038'), 0.7)
    stroke(ctx, [[cx + sw * 0.2, ay + 2], [cx + sw * 0.24, hemY - H * 0.08]], c(woman ? '#cfc6b2' : '#6a4428'), 0.7)
  }
  // Меховая опушка подола (купец, знать): светлый мех с короткими штрихами.
  if ((noble || f.cls === 'trader') && f.age >= 15) {
    const furTop = hem.map(([px, py]) => [px, py - H * 0.04] as Pt)
    ctx.beginPath()
    smooth(ctx, [...hem, ...furTop.reverse()], true)
    ctx.fillStyle = c('#d8cbb4')
    ctx.fill()
    ctx.strokeStyle = c('#9a8a72')
    ctx.lineWidth = 0.6
    for (let fx = cx - hemW / 2; fx < cx + hemW / 2; fx += 2.5) {
      ctx.beginPath()
      ctx.moveTo(fx, hemY - H * 0.035)
      ctx.lineTo(fx + 0.8, hemY - H * 0.012)
      ctx.stroke()
    }
  }
  if (f.trim && !slave && !noble) stroke(ctx, hem.map(([px, py]) => [px, py - H * 0.015] as Pt), c(f.trim), H * 0.018)
  ctx.restore()

  // Пояс: верёвка у крестьян и духовных, кожа с пряжкой у горожан, золото у знати.
  const beltY = waistY + (noble && !woman ? H * 0.05 : 0)
  const beltC = noble ? c('#d8b040') : clergy ? c('#cdbf9a') : c(f.cls === 'peasant' || slave ? '#a8946a' : '#4a3220')
  const belt: Pt[] = [[cx - sw * 0.5, beltY], [cx, beltY + H * 0.008], [cx + sw * 0.5, beltY - H * 0.004]]
  stroke(ctx, belt, INK, H * 0.03 + 1.4)
  stroke(ctx, belt, beltC, H * 0.03)
  if (!clergy && !slave && f.cls !== 'peasant') {
    ctx.strokeStyle = c('#c9a24a')
    ctx.lineWidth = 1.1
    ctx.strokeRect(cx + sw * 0.08, beltY - H * 0.016, H * 0.026, H * 0.032)
  }
  if (clergy || f.cls === 'peasant') stroke(ctx, [[cx + sw * 0.22, beltY], [cx + sw * 0.28, beltY + H * 0.1], [cx + sw * 0.24, beltY + H * 0.18]], beltC, 1.3)
  if (f.cls === 'trader' && !woman) shape(ctx, [[cx - sw * 0.42, beltY + 1], [cx - sw * 0.3, beltY + 1], [cx - sw * 0.27, beltY + H * 0.07], [cx - sw * 0.38, beltY + H * 0.09], [cx - sw * 0.46, beltY + H * 0.06]], c('#6a4228'), 0.8)

  // Передняя рука и предмет.
  const shX = cx + sw * 0.2 + stoop
  let hx = cx + sw * 0.42 + stoop
  let hy = waistY + H * 0.08
  if (work) {
    hx = cx + sw * (pose === 2 ? 0.55 : 0.75)
    hy = pose === 2 ? shY - H * 0.05 : waistY + H * 0.02
  } else if (tool === 'staff' || tool === 'spear') {
    hx = cx + sw * 0.62
    hy = waistY - H * 0.02
  } else if (tool === 'scales' || tool === 'scroll' || tool === 'basket') {
    hx = cx + sw * 0.7
    hy = waistY - H * 0.04
  }
  drawTool(ctx, tool, hx, hy, base, top, H, c, pose)
  if (noble && f.age >= 15) {
    // Висячий рукав упелянда - за рукой.
    shape(ctx, [[shX - armW * 0.4, shY + 2], [shX + sw * 0.45, shY + H * 0.12], [shX + sw * 0.25, waistY + H * 0.12], [shX + sw * 0.05, waistY + H * 0.2], [shX - sw * 0.08, waistY + H * 0.08]], c(cloth, -0.12), 0.9)
  }
  const el: Pt = [shX + (hx - shX) * 0.35 - sw * 0.07, shY + (hy - shY) * 0.56]
  const wr: Pt = [hx - (hx - el[0]) * 0.16, hy - (hy - el[1]) * 0.16]
  tube(ctx, [[shX, shY + armW * 0.5, armW * 1.05], [el[0], el[1], armW * 0.95], [wr[0], wr[1], armW * 0.78]], c(cloth, -0.04))
  stroke(ctx, [[wr[0] - armW * 0.35, wr[1] - 1], [wr[0] + armW * 0.35, wr[1] + 1]], c(cloth, -0.32), 1.2)
  hand(ctx, wr[0], wr[1], wr[0] - el[0], wr[1] - el[1], armW * 0.95, skin, !!tool)

  // Ворот: льняная рубаха из-под котты, мех у знати и купцов.
  if ((noble || f.cls === 'trader') && f.age >= 15) shape(ctx, [[cx - sw * 0.38 + s, shY + 1], [cx + s, shY - 2.5], [cx + sw * 0.4 + s, shY + 1], [cx + s, shY + H * 0.035]], c('#d8cbb4'), 0.6)
  else if (!clergy) shape(ctx, [[cx - sw * 0.18 + s, shY], [cx + s + 1, shY - 2], [cx + sw * 0.24 + s, shY], [cx + s + 1, shY + H * 0.02]], c('#ece4d2'), 0.5)

  drawHead(ctx, f, cx + stoop * 1.6 + H * 0.015, top + headH * 0.5, headH, c, woman, clergy, noble, slave, elder)
  ctx.restore()
}

function drawHead(ctx: Ctx, f: FigureSpec, hx: number, hy: number, headH: number, c: (h: string, d?: number) => string, woman: boolean, clergy: boolean, noble: boolean, slave: boolean, elder: boolean) {
  const rx = headH * 0.4
  const ry = headH * 0.5
  const P = (a: number, b: number): Pt => [hx + a * rx, hy + b * ry]
  const hair = c(f.bald ? f.skin : f.hair)
  const hairDark = c(f.bald ? f.skin : f.hair, -0.3)
  const hairLight = c(f.bald ? f.skin : f.hair, 0.25)
  const married = woman && f.age >= 18
  const veil = (f.hat === 'cover' || married) && woman
  const veilC = c(f.hatColor && f.hatColor !== '#5a3a2a' ? f.hatColor : '#f0ebe0')
  const childish = f.age < 12

  // Волосы сзади у девушек: коса за спиной.
  if (woman && !veil) {
    shape(ctx, [P(-0.75, -0.6), P(-1.25, 0.3), P(-1.05, 1.4), P(-0.8, 2.3), P(-0.45, 2.2), P(-0.55, 1.2), P(-0.25, 0.4)], hair, 0.8)
    for (let i = 0; i < 3; i++) stroke(ctx, [P(-0.85 + i * 0.12, -0.2), P(-1.05 + i * 0.12, 0.9), P(-0.75 + i * 0.1, 2.0)], i === 1 ? hairLight : hairDark, 0.6)
  }
  // Покрывало замужней - за головой, ниспадает на плечи.
  if (veil) shape(ctx, [P(-1.25, -0.35), P(-0.4, -1.45), P(0.85, -1.05), P(1.0, -0.35), P(0.6, -0.2), P(-0.3, 0.3), P(-1.0, 1.2), P(-1.7, 2.1), P(-1.55, 0.7)], veilC, 0.9)

  // Шея.
  shape(ctx, [P(-0.35, 0.65), P(0.35, 0.75), P(0.4, 1.45), P(-0.35, 1.45)], c(f.skin, -0.12), 0.7)
  // Профиль головы: затылок, темя, лоб, переносица, нос, губы, подбородок, челюсть.
  const face: Pt[] = [
    P(-0.38, 0.95),
    P(-1.0, 0.25),
    P(-0.85, -0.75),
    P(-0.1, -1.05),
    P(0.7, -0.75),
    P(0.92, -0.3),
    P(0.95, -0.08),
    P(childish ? 1.1 : 1.22, 0.24),
    P(1.0, 0.36),
    P(1.06, 0.47),
    P(0.98, 0.55),
    P(1.03, 0.63),
    P(0.92, childish ? 0.82 : 0.9),
    P(0.55, 1.0),
  ]
  const g = ctx.createRadialGradient(hx - rx * 0.35, hy - ry * 0.3, 1, hx, hy, ry * 1.3)
  g.addColorStop(0, c(f.skin, 0.1))
  g.addColorStop(1, c(f.skin, -0.14))
  shape(ctx, face, g, 1)
  // Глаз: миндаль с белком и радужкой, верхнее веко.
  shape(ctx, [P(0.33, -0.08), P(0.5, -0.2), P(0.7, -0.08), P(0.52, 0.02)], c('#f4efe6'), 0)
  ctx.fillStyle = '#3a2a20'
  ctx.beginPath()
  ctx.arc(hx + rx * 0.57, hy - ry * 0.08, Math.max(0.9, rx * 0.11), 0, Math.PI * 2)
  ctx.fill()
  stroke(ctx, [P(0.3, -0.07), P(0.5, -0.22), P(0.72, -0.08)], INK, 0.9)
  // Бровь, ноздря, рот, носогубная складка.
  stroke(ctx, [P(0.3, -0.35), P(0.55, -0.42), P(0.8, -0.33)], elder ? c('#c8c4bc') : hairDark, 1.1)
  stroke(ctx, [P(0.95, 0.3), P(1.02, 0.33)], c(f.skin, -0.35), 0.8)
  stroke(ctx, [P(0.78, 0.55), P(0.98, 0.55)], c('#8a4a3a'), 0.9)
  if (!childish) stroke(ctx, [P(0.75, 0.22), P(0.7, 0.4), P(0.74, 0.5)], c(f.skin, -0.2), 0.6)
  // Ухо с завитком.
  if (!veil && !(woman && !f.bald)) {
    shape(ctx, [P(-0.25, -0.12), P(0.02, -0.15), P(0.05, 0.2), P(-0.1, 0.32), P(-0.28, 0.2)], c(f.skin, -0.06), 0.7)
    stroke(ctx, [P(-0.05, -0.05), P(-0.17, 0.08), P(-0.06, 0.2)], c(f.skin, -0.3), 0.6)
  }
  if (childish) {
    ctx.fillStyle = 'rgba(220,120,110,0.35)'
    ctx.beginPath()
    ctx.arc(hx + rx * 0.45, hy + ry * 0.3, rx * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  if (elder) {
    stroke(ctx, [P(0.6, 0.15), P(0.62, 0.38), P(0.72, 0.6)], c(f.skin, -0.28), 0.6)
    stroke(ctx, [P(0.72, -0.05), P(0.82, -0.02)], c(f.skin, -0.28), 0.5)
    stroke(ctx, [P(0.72, 0.02), P(0.82, 0.06)], c(f.skin, -0.28), 0.5)
  }

  // Волосы: тонзура у монаха, стрижка «под горшок» с прядями у мужчин, пробор у женщин без покрывала.
  if (!veil && !f.bald) {
    const cap: Pt[] = clergy && !woman
      ? [P(-1.02, 0.25), P(-1.08, -0.45), P(-0.75, -0.75), P(-0.55, -0.55), P(0.2, -0.75), P(0.7, -0.55), P(0.85, -0.42), P(0.55, -0.48), P(-0.2, -0.5), P(-0.55, -0.1), P(-0.7, 0.35)]
      : woman
        ? [P(-1.05, 0.3), P(-1.08, -0.55), P(-0.5, -1.12), P(0.35, -1.1), P(0.85, -0.65), P(0.88, -0.38), P(0.45, -0.62), P(0.0, -0.65), P(-0.45, -0.3), P(-0.65, 0.35)]
        : [P(-1.05, 0.32), P(-1.12, -0.5), P(-0.55, -1.15), P(0.3, -1.12), P(0.88, -0.75), P(0.95, -0.42), P(0.62, -0.5), P(0.3, -0.45), P(-0.1, -0.5), P(-0.45, -0.2), P(-0.62, 0.38)]
    shape(ctx, cap, hair, 0.9)
    for (let i = 0; i < 4; i++) {
      const a = -0.85 + i * 0.4
      stroke(ctx, [P(a, -0.95 + Math.abs(a) * 0.15), P(a + 0.15, -0.65), P(a + 0.05, -0.35)], i === 1 ? hairLight : hairDark, 0.6)
    }
  }
  // Борода и усы прядями.
  if (f.beard && f.age >= 18 && !woman) {
    shape(ctx, [P(-0.3, 0.2), P(0.1, 0.45), P(0.62, 0.45), P(0.98, 0.5), P(1.0, 0.75), P(0.85, 1.05), P(0.45, 1.25), P(0.05, 1.05), P(-0.2, 0.7)], hair, 0.8)
    for (let i = 0; i < 4; i++) stroke(ctx, [P(0.05 + i * 0.22, 0.6), P(0.1 + i * 0.22, 0.85), P(0.05 + i * 0.2, 1.08)], i === 2 ? hairLight : hairDark, 0.55)
    stroke(ctx, [P(0.68, 0.48), P(0.9, 0.46), P(1.0, 0.52)], hair, 1.4)
  }
  if (slave) return

  // Уборы.
  const hat = c(f.hatColor)
  if (f.hat === 'cap' && !woman) {
    if (noble || f.cls === 'trader') {
      // Шаперон: валик на голове и свисающий конец.
      const hc = f.hatColor === '#5a3a2a' ? '#6a2a2a' : f.hatColor
      shape(ctx, [P(-0.95, -0.55), P(-1.25, 0.25), P(-1.55, 1.2), P(-1.3, 1.35), P(-1.0, 0.4), P(-0.6, -0.4)], c(hc, -0.12), 0.9)
      shape(ctx, [P(-1.15, -0.55), P(-0.8, -1.2), P(0.2, -1.3), P(1.0, -0.95), P(1.05, -0.55), P(0.3, -0.42), P(-0.6, -0.4)], c(hc), 1)
      for (let i = 0; i < 4; i++) stroke(ctx, [P(-0.8 + i * 0.45, -1.15), P(-0.7 + i * 0.45, -0.85), P(-0.8 + i * 0.45, -0.5)], c(hc, -0.3), 0.7)
    } else {
      // Льняной чепец-койф с завязками.
      shape(ctx, [P(-1.05, 0.15), P(-1.1, -0.6), P(-0.5, -1.18), P(0.35, -1.12), P(0.88, -0.7), P(0.8, -0.42), P(0.0, -0.55), P(-0.4, 0.0), P(-0.45, 0.55)], c('#ece4d2'), 0.9)
      stroke(ctx, [P(-0.45, 0.5), P(-0.2, 0.85), P(0.1, 0.95)], c('#d8d0c0'), 0.8)
    }
  } else if (f.hat === 'cover' && !woman) {
    // Капюшон с пелериной.
    shape(ctx, [P(-1.3, 1.25), P(-1.5, -0.6), P(-0.6, -1.4), P(0.5, -1.25), P(1.05, -0.75), P(0.92, -0.25), P(0.4, -0.6), P(-0.4, -0.3), P(-0.45, 0.6), P(0.2, 1.0), P(0.8, 1.15), P(0.5, 1.45)], hat, 1)
    stroke(ctx, [P(-0.9, -0.9), P(-0.95, 0.2), P(-0.7, 1.1)], c(f.hatColor, -0.3), 0.7)
  } else if (f.hat === 'tall' && woman && noble) {
    // Энен с прозрачной вуалью.
    shape(ctx, [P(-0.6, -0.7), P(-2.2, -3.2), P(-1.75, -3.45), P(0.75, -0.85)], c(f.accent ?? '#8a2a2a'), 0.9)
    stroke(ctx, [P(-0.3, -0.95), P(-1.6, -2.9)], c(f.accent ?? '#8a2a2a', 0.25), 0.7)
    ctx.fillStyle = 'rgba(245,240,230,0.5)'
    ctx.beginPath()
    smooth(ctx, [P(-2.0, -3.3), P(-3.3, -1.0), P(-2.3, 1.6), P(-1.4, -0.5)], true)
    ctx.fill()
  } else if (f.hat === 'band' || (noble && woman && !veil)) {
    stroke(ctx, [P(-1.0, -0.55), P(-0.2, -0.8), P(0.8, -0.58)], c('#d8b040'), 1.8)
  } else if (f.hat === 'helmet') {
    // Шапель - каска с полями.
    shape(ctx, [P(-1.55, -0.42), P(-0.9, -1.55), P(0.2, -1.6), P(1.1, -1.2), P(1.55, -0.42), P(0, -0.62)], c('#9a9ca0'), 1)
    stroke(ctx, [P(-0.6, -1.3), P(-0.2, -1.45)], c('#d0d2d6'), 0.8)
  } else if (f.hat === 'turban' || f.hat === 'tall') {
    shape(ctx, [P(-1.1, -0.5), P(-0.9, -1.2), P(0.3, -1.3), P(1.05, -0.9), P(0.95, -0.5)], hat, 1)
  }
}

/** Предмет в руке (hx, hy - кисть). */
function drawTool(ctx: Ctx, tool: Tool | undefined, hx: number, hy: number, base: number, top: number, H: number, c: (h: string, d?: number) => string, pose: number) {
  const wood = c('#6a4a2a')
  const metal = c('#a8acb0')
  const u = H / 23
  const pole = (x1: number, y1: number, x2: number, y2: number, w: number, color: string) => tube(ctx, [[x1, y1, w], [x2, y2, w]], color, 0.7)
  switch (tool) {
    case 'hoe': {
      const ang = pose === 2 ? -0.9 : pose === 3 ? 0.9 : 0.15
      const len = H * 0.55
      const ex = pose === 0 ? hx + 1 : hx + Math.sin(ang) * len * 0.5
      const ey = pose === 0 ? base - 1 : hy + Math.cos(ang) * len * 0.5
      pole(hx - Math.sin(ang) * len * 0.5, hy - Math.cos(ang) * len * 0.5, ex, ey, u * 0.8, wood)
      shape(ctx, [[ex - u * 0.3, ey - u * 0.8], [ex + u * 2.4, ey - u * 0.5], [ex + u * 2.6, ey + u * 0.5], [ex, ey + u * 0.4]], metal, 0.7)
      return
    }
    case 'hammer': {
      const up = pose === 2
      const hy2 = up ? hy - H * 0.14 : hy + H * 0.14
      pole(hx, hy, hx + (up ? -u : u), hy2, u * 0.8, wood)
      shape(ctx, [[hx + (up ? -u * 2.6 : -u * 0.6), hy2 - u], [hx + (up ? u * 0.4 : u * 2.4), hy2 - u], [hx + (up ? u * 0.4 : u * 2.4), hy2 + u], [hx + (up ? -u * 2.6 : -u * 0.6), hy2 + u]], metal, 0.8)
      return
    }
    case 'spear':
      pole(hx, top - H * 0.15, hx, base, u * 0.65, wood)
      shape(ctx, [[hx - u * 0.9, top - H * 0.15], [hx, top - H * 0.3], [hx + u * 0.9, top - H * 0.15], [hx, top - H * 0.12]], metal, 0.7)
      return
    case 'sword':
      shape(ctx, [[hx - u * 0.4, hy + u], [hx + u * 0.4, hy + u], [hx + u * 0.5, hy + H * 0.3], [hx + u * 0.1, hy + H * 0.33], [hx - u * 0.3, hy + H * 0.3]], metal, 0.7)
      pole(hx - u * 1.4, hy + u * 0.6, hx + u * 1.4, hy + u * 0.6, u * 0.6, c('#c9a24a'))
      return
    case 'staff':
      tube(ctx, [[hx, top + H * 0.08, u * 0.7], [hx + u * 0.3, (top + base) / 2, u * 0.75], [hx + u * 0.4, base, u * 0.7]], wood, 0.7)
      return
    case 'scroll':
      shape(ctx, [[hx - u * 1.6, hy - u * 2], [hx + u, hy - u * 2], [hx + u, hy + u], [hx - u * 1.6, hy + u]], c('#efe3c2'), 0.7)
      pole(hx - u * 1.9, hy - u * 2.1, hx + u * 1.3, hy - u * 2.1, u * 0.8, c('#b8945a'))
      pole(hx - u * 1.9, hy + u * 1.1, hx + u * 1.3, hy + u * 1.1, u * 0.8, c('#b8945a'))
      for (let i = 0; i < 3; i++) stroke(ctx, [[hx - u * 1.2, hy - u * 1.3 + i * u * 0.7], [hx + u * 0.6, hy - u * 1.3 + i * u * 0.7]], c('#8a7a5a'), 0.5)
      return
    case 'scales': {
      const gold = c('#c9a24a')
      stroke(ctx, [[hx, hy], [hx, hy - u * 3]], gold, 1.2)
      stroke(ctx, [[hx - u * 2.6, hy - u * 3.1], [hx, hy - u * 3.3], [hx + u * 2.6, hy - u * 3.1]], gold, 1.2)
      for (const sgn of [-1, 1]) {
        stroke(ctx, [[hx + sgn * u * 2.6, hy - u * 3.1], [hx + sgn * u * 2.6, hy - u * 1.3]], gold, 0.6)
        shape(ctx, [[hx + sgn * u * 2.6 - u * 1.2, hy - u * 1.3], [hx + sgn * u * 2.6 + u * 1.2, hy - u * 1.3], [hx + sgn * u * 2.6, hy - u * 0.6]], gold, 0.6)
      }
      return
    }
    case 'basket':
      shape(ctx, [[hx - u * 1.6, hy + u * 0.6], [hx + u * 2.6, hy + u * 0.6], [hx + u * 2.2, hy + u * 2.8], [hx - u * 1.2, hy + u * 2.8]], c('#b8945a'), 0.8)
      for (let i = 0; i < 3; i++) stroke(ctx, [[hx - u * 1.4, hy + u * 1.2 + i * u * 0.55], [hx + u * 2.4, hy + u * 1.2 + i * u * 0.55]], c('#8a6a3a'), 0.6)
      ctx.strokeStyle = c('#8a6a3a')
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.arc(hx + u * 0.5, hy + u * 0.6, u * 1.7, Math.PI, 0)
      ctx.stroke()
      return
    case 'bow':
      ctx.strokeStyle = wood
      ctx.lineWidth = u * 0.7
      ctx.beginPath()
      ctx.arc(hx - u * 2, hy, u * 4.5, -0.9, 0.9)
      ctx.stroke()
      stroke(ctx, [[hx - u * 2 + Math.cos(-0.9) * u * 4.5, hy + Math.sin(-0.9) * u * 4.5], [hx - u * 2 + Math.cos(0.9) * u * 4.5, hy + Math.sin(0.9) * u * 4.5]], c('#d8d0c0'), 0.6)
      return
    case 'oar':
      pole(hx - u * 2, hy - u * 3, hx + u * 3, hy + u * 6, u * 0.65, wood)
      shape(ctx, [[hx + u * 2.6, hy + u * 5], [hx + u * 4.4, hy + u * 6.2], [hx + u * 4.2, hy + u * 9], [hx + u * 2.6, hy + u * 8]], wood, 0.7)
      return
  }
}
