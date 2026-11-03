// Детальный фон сцены (пилот, ТЗ «графика кодом» 03.11): улица средневекового европейского города в сетке 960×300 -
// плавные формы, свет слева, дымка, фахверк, черепица, мостовая из отдельных камней. Человечки, животные и движение
// (дым, погода, огни) остаются прежними и кладутся поверх, увеличенными втрое (scene.ts, composeScene).
// Включается ?hd=1 (сохраняется в localStorage), выключается ?hd=0.
import type { SceneTime } from '../engine/types'

export const HD_W = 960
export const HD_H = 300
/** Линия земли: там же, где у прежней сцены (44 из 60 строк сетки 192×60). */
export const HD_GROUND = 220

type Ctx = CanvasRenderingContext2D

export interface HdLayers {
  sky: HTMLCanvasElement
  /** Облака: полоса шире кадра, плывёт по ветру. */
  clouds: HTMLCanvasElement
  far: HTMLCanvasElement
  main: HTMLCanvasElement
  /** Верх труб (в точках HD) - для дыма. */
  chimneys: { x: number; y: number }[]
  /** Дома (в сетке 192) - для факелов у дверей ночью. */
  built: { x: number; w: number; top: number }[]
}

let enabled: boolean | null = null

/** Детальные фоны включены (пилот: по ?hd=1, запоминается). */
export function hdEnabled(): boolean {
  if (enabled !== null) return enabled
  enabled = false
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hd') : null
    if (q === '1' || q === '0') localStorage.setItem('thousands.hd', q)
    enabled = (q ?? localStorage.getItem('thousands.hd')) === '1'
  } catch {
    enabled = false
  }
  return enabled
}

/** Для стенда «до и после». */
export function setHd(on: boolean): void {
  enabled = on
}

/** Есть ли детальный фон для этого места и стиля. */
export function hasHd(place: string, style: string): boolean {
  return place === 'street' && style === 'gothic'
}

function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w = HD_W, h = HD_H): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Смесь двух цветов: k = 0 - первый, 1 - второй. */
function mix(a: string, b: string, k: number): string {
  const x = hex(a)
  const y = hex(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`
}

function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c)
  return `rgba(${r},${g},${b},${a})`
}

/** Тон времени суток: чем умножить готовый слой (null - не трогать). */
const TINT: Record<SceneTime, { c: string; a: number } | null> = {
  day: null,
  dawn: { c: '#e6b8c0', a: 0.45 },
  sunset: { c: '#f0a070', a: 0.5 },
  night: { c: '#28305c', a: 0.82 },
  overcast: { c: '#b4b8bc', a: 0.4 },
}

const lit = (time: SceneTime) => time === 'night' || time === 'sunset'

// ---------- Небо ----------

function drawSky(ctx: Ctx, bands: string[], time: SceneTime, r: () => number) {
  const g = ctx.createLinearGradient(0, 0, 0, HD_GROUND)
  bands.forEach((c, i) => g.addColorStop(i / (bands.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, HD_W, HD_H)
  // Свет: днём - солнце слева вверху, на рассвете и закате - низко у горизонта, ночью - луна.
  const glow = time === 'night' ? { x: 760, y: 50, c: '#dfe6ff', a: 0.35, rad: 120 } : time === 'dawn' ? { x: 120, y: 190, c: '#ffe0b0', a: 0.7, rad: 320 } : time === 'sunset' ? { x: 150, y: 200, c: '#ffc070', a: 0.75, rad: 340 } : time === 'overcast' ? null : { x: 110, y: 40, c: '#fff8e0', a: 0.55, rad: 300 }
  if (glow) {
    const rg = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.rad)
    rg.addColorStop(0, rgba(glow.c, glow.a))
    rg.addColorStop(1, rgba(glow.c, 0))
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, HD_W, HD_H)
  }
  if (time === 'night') {
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,250,230,${0.3 + r() * 0.6})`
      const s = r() > 0.92 ? 2 : 1
      ctx.fillRect(Math.floor(r() * HD_W), Math.floor(r() * 150), s, s)
    }
    ctx.fillStyle = '#f2f0e0'
    ctx.beginPath()
    ctx.arc(760, 50, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rgba(bands[1], 1)
    ctx.beginPath()
    ctx.arc(767, 46, 12, 0, Math.PI * 2)
    ctx.fill()
  }
}

const CLOUD: Record<SceneTime, [string, string]> = {
  day: ['#ffffff', '#cfd9e6'],
  dawn: ['#f6dcd4', '#c9a8b4'],
  sunset: ['#f6c49a', '#b87a78'],
  night: ['#3a4268', '#262c4c'],
  overcast: ['#c8ccd0', '#9a9fa4'],
}

function drawClouds(ctx: Ctx, w: number, time: SceneTime, r: () => number) {
  const [light, dark] = CLOUD[time]
  const n = time === 'overcast' ? 14 : 6
  for (let i = 0; i < n; i++) {
    const cx = (i + r() * 0.8) * (w / n)
    const cy = 30 + r() * 90
    const cw = 70 + r() * 110
    // Облако - кучка эллипсов: снизу темнее, сверху светлее.
    for (let j = 0; j < 9; j++) {
      const ex = cx + (r() - 0.5) * cw
      const ey = cy + (r() - 0.6) * 18
      const rx = 18 + r() * 28
      const ry = 9 + r() * 12
      const g = ctx.createLinearGradient(0, ey - ry, 0, ey + ry)
      g.addColorStop(0, rgba(light, 0.85))
      g.addColorStop(1, rgba(dark, 0.7))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ---------- Дальний план ----------

function ridge(ctx: Ctx, base: number, amp: number, step: number, color: string, r: () => number) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, HD_H)
  let y = base
  for (let x = 0; x <= HD_W + step; x += step) {
    y = Math.max(base - amp, Math.min(base + amp * 0.3, y + (r() - 0.5) * amp * 0.6))
    ctx.lineTo(x, y)
  }
  ctx.lineTo(HD_W, HD_H)
  ctx.closePath()
  ctx.fill()
}

function drawFar(ctx: Ctx, sky: string, r: () => number) {
  // Холмы в дымке: чем дальше, тем ближе к цвету неба.
  ridge(ctx, 150, 40, 40, mix('#5f7a62', sky, 0.72), r)
  // Город на холме: стена, башни, собор - силуэтом.
  const tone = mix('#6c7086', sky, 0.6)
  ctx.fillStyle = tone
  ctx.fillRect(470, 150, 300, 30)
  for (let x = 470; x < 770; x += 14) ctx.fillRect(x, 145, 8, 6)
  for (const tx of [470, 560, 650, 760]) {
    ctx.fillRect(tx - 6, 128, 16, 52)
    ctx.beginPath()
    ctx.moveTo(tx - 8, 128)
    ctx.lineTo(tx + 2, 110)
    ctx.lineTo(tx + 12, 128)
    ctx.fill()
  }
  // Собор: две башни и шпиль над средокрестием.
  ctx.fillRect(590, 110, 70, 40)
  ctx.fillRect(590, 88, 14, 62)
  ctx.fillRect(646, 88, 14, 62)
  ctx.beginPath()
  ctx.moveTo(620, 110)
  ctx.lineTo(625, 70)
  ctx.lineTo(630, 110)
  ctx.fill()
  ridge(ctx, 190, 22, 30, mix('#56704e', sky, 0.5), r)
}

// ---------- Дома ----------

const PLASTER = ['#efe4cc', '#e8d6b0', '#f0e8d8', '#e6cfa6', '#dcc8b8', '#e9dcc0']
const SHUTTER = ['#3f6a4a', '#8a2e26', '#2f4f7a', '#5a3a28']
const TIMBER = '#4a3020'
const ROOF = ['#8a3e2c', '#7a4632', '#6a4038', '#94523a']

interface House {
  x: number
  w: number
  floors: number
  gable: 'pointed' | 'stepped'
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** Окно: рама, переплёт ромбами, ставни; ночью и на закате - тёплый свет (рисуется отдельно, после тона). */
function windowAt(ctx: Ctx, x: number, y: number, w: number, h: number, shutter: string, glows: { x: number; y: number; w: number; h: number }[], glow: boolean) {
  ctx.fillStyle = '#2a2a30'
  ctx.fillRect(x, y, w, h)
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, '#9fb4c4')
  g.addColorStop(1, '#4a5a6a')
  ctx.fillStyle = g
  ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3)
  ctx.strokeStyle = 'rgba(40,36,34,0.7)'
  ctx.lineWidth = 0.6
  for (let d = -h; d < w; d += 4) {
    line(ctx, x + d, y + h, x + d + h, y)
    line(ctx, x + d, y, x + d + h, y + h)
  }
  ctx.fillStyle = '#5a3a24'
  ctx.fillRect(x - 2, y + h, w + 4, 3)
  // Ставни, раскрытые наружу.
  ctx.fillStyle = shutter
  ctx.fillRect(x - w * 0.45 - 1, y, w * 0.45, h)
  ctx.fillRect(x + w + 1, y, w * 0.45, h)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 0.8
  for (let k = 1; k < 3; k++) {
    line(ctx, x - w * 0.45 - 1, y + (h * k) / 3, x - 1, y + (h * k) / 3)
    line(ctx, x + w + 1, y + (h * k) / 3, x + w * 1.45 + 1, y + (h * k) / 3)
  }
  if (glow) glows.push({ x: x + 1.5, y: y + 1.5, w: w - 3, h: h - 3 })
}

function tiles(ctx: Ctx, path: () => void, top: number, bottom: number, left: number, right: number, color: string) {
  ctx.save()
  path()
  ctx.clip()
  const g = ctx.createLinearGradient(left, 0, right, 0)
  g.addColorStop(0, mix(color, '#ffffff', 0.12))
  g.addColorStop(1, mix(color, '#000000', 0.25))
  ctx.fillStyle = g
  ctx.fillRect(left, top, right - left, bottom - top)
  // Ряды черепицы: тёмная нижняя кромка у каждой.
  ctx.strokeStyle = mix(color, '#000000', 0.4)
  ctx.lineWidth = 1
  for (let y = top + 5, row = 0; y < bottom; y += 5, row++) {
    for (let x = left + (row % 2) * 4; x < right; x += 8) {
      ctx.beginPath()
      ctx.arc(x + 4, y, 4, 0, Math.PI)
      ctx.stroke()
    }
  }
  ctx.restore()
}

const SIGNS = ['boot', 'pretzel', 'key', 'jug', 'scissors'] as const

function sign(ctx: Ctx, x: number, y: number, kind: (typeof SIGNS)[number]) {
  // Кованый кронштейн и вывеска-щит.
  ctx.strokeStyle = '#2a2420'
  ctx.lineWidth = 1.6
  line(ctx, x, y, x + 22, y)
  line(ctx, x, y + 8, x + 10, y)
  ctx.beginPath()
  ctx.arc(x + 6, y - 2, 4, 0, Math.PI * 1.5)
  ctx.stroke()
  ctx.lineWidth = 0.8
  line(ctx, x + 12, y, x + 12, y + 4)
  line(ctx, x + 20, y, x + 20, y + 4)
  ctx.fillStyle = '#c9a24a'
  ctx.beginPath()
  ctx.moveTo(x + 9, y + 4)
  ctx.lineTo(x + 23, y + 4)
  ctx.lineTo(x + 23, y + 16)
  ctx.quadraticCurveTo(x + 16, y + 24, x + 9, y + 16)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#6a4a1a'
  ctx.stroke()
  ctx.fillStyle = '#3a2a20'
  const cx = x + 16
  const cy = y + 12
  if (kind === 'boot') {
    ctx.fillRect(cx - 2, cy - 5, 4, 8)
    ctx.fillRect(cx - 2, cy + 1, 7, 3)
  } else if (kind === 'pretzel') {
    ctx.strokeStyle = '#7a4a1a'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(cx - 2, cy, 3, 0, Math.PI * 2)
    ctx.arc(cx + 2, cy, 3, 0, Math.PI * 2)
    ctx.stroke()
  } else if (kind === 'key') {
    ctx.beginPath()
    ctx.arc(cx - 3, cy, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(cx - 1, cy - 0.7, 6, 1.6)
    ctx.fillRect(cx + 3, cy, 1.5, 3)
  } else if (kind === 'jug') {
    ctx.beginPath()
    ctx.ellipse(cx, cy + 1, 4, 4.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(cx - 1.5, cy - 6, 3, 3)
  } else {
    ctx.strokeStyle = '#3a2a20'
    ctx.lineWidth = 1.2
    line(ctx, cx - 4, cy - 4, cx + 4, cy + 4)
    line(ctx, cx + 4, cy - 4, cx - 4, cy + 4)
  }
}

function drawHouse(ctx: Ctx, h: House, r: () => number, glows: { x: number; y: number; w: number; h: number }[], chimneys: { x: number; y: number }[], time: SceneTime) {
  const G = HD_GROUND
  const plaster = PLASTER[Math.floor(r() * PLASTER.length)]
  const shutter = SHUTTER[Math.floor(r() * SHUTTER.length)]
  const roof = ROOF[Math.floor(r() * ROOF.length)]
  const groundH = 44
  const floorH = 38
  const jet = 6
  // Первый этаж - камень.
  const stone = ctx.createLinearGradient(h.x, 0, h.x + h.w, 0)
  stone.addColorStop(0, '#c8bfae')
  stone.addColorStop(1, '#9a9080')
  ctx.fillStyle = stone
  ctx.fillRect(h.x, G - groundH, h.w, groundH)
  ctx.strokeStyle = 'rgba(70,60,50,0.35)'
  ctx.lineWidth = 0.7
  for (let y = G - groundH + 7, row = 0; y < G; y += 7, row++) {
    line(ctx, h.x, y, h.x + h.w, y)
    for (let x = h.x + (row % 2) * 9; x < h.x + h.w; x += 18) line(ctx, x, y - 7, x, y)
  }
  // Этажи-выступы: штукатурка и фахверк.
  let top = G - groundH
  for (let f = 0; f < h.floors; f++) {
    const x0 = h.x - jet * (f + 1)
    const w0 = h.w + jet * 2 * (f + 1)
    // Тень под выступом.
    ctx.fillStyle = 'rgba(20,14,10,0.35)'
    ctx.fillRect(x0 + jet, top, w0 - jet * 2, 5)
    const y0 = top - floorH
    ctx.fillStyle = plaster
    ctx.fillRect(x0, y0, w0, floorH)
    ctx.strokeStyle = TIMBER
    ctx.lineWidth = 3.2
    ctx.strokeRect(x0 + 1.5, y0 + 1.5, w0 - 3, floorH - 3)
    const bays = Math.max(2, Math.round(w0 / 34))
    const bw = w0 / bays
    for (let b = 0; b < bays; b++) {
      const bx = x0 + b * bw
      line(ctx, bx, y0, bx, top)
      ctx.lineWidth = 2.4
      // Чередуются: окно в пролёте или «андреевский крест».
      if ((b + f) % 2 === 0) {
        windowAt(ctx, bx + bw * 0.3, y0 + 9, bw * 0.4, floorH - 18, shutter, glows, lit(time) && r() > 0.25)
      } else {
        line(ctx, bx, y0, bx + bw, top)
        line(ctx, bx + bw, y0, bx, top)
      }
      ctx.lineWidth = 3.2
    }
    // Брус-подоконник через весь этаж.
    ctx.fillStyle = TIMBER
    ctx.fillRect(x0, top - 3, w0, 3)
    top = y0
  }
  // Фронтон: острый (Франция, Англия) или ступенчатый (Фландрия, Германия).
  const gx0 = h.x - jet * h.floors
  const gw = h.w + jet * 2 * h.floors
  const peak = top - gw * 0.5
  if (h.gable === 'pointed') {
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(gx0 - 6, top)
      ctx.lineTo(gx0 + gw / 2, peak)
      ctx.lineTo(gx0 + gw + 6, top)
      ctx.closePath()
    }
    ctx.fillStyle = plaster
    path()
    ctx.fill()
    ctx.strokeStyle = TIMBER
    ctx.lineWidth = 2.4
    line(ctx, gx0 + gw / 2, peak + 6, gx0 + gw / 2, top)
    line(ctx, gx0 + gw * 0.25, top - (top - peak) * 0.45, gx0 + gw * 0.75, top - (top - peak) * 0.45)
    windowAt(ctx, gx0 + gw / 2 - 6, top - (top - peak) * 0.4, 12, 14, shutter, glows, lit(time) && r() > 0.5)
    // Края крыши - черепица полосой (вид с торца).
    ctx.strokeStyle = roof
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    line(ctx, gx0 - 8, top + 2, gx0 + gw / 2, peak - 2)
    line(ctx, gx0 + gw / 2, peak - 2, gx0 + gw + 8, top + 2)
    ctx.lineCap = 'butt'
  } else {
    // Ступенчатый кирпичный фронтон.
    const steps = 5
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(gx0, top)
      for (let s = 0; s < steps; s++) {
        const y = top - ((s + 1) * (top - peak)) / steps
        const xl = gx0 + (s * gw) / (2 * steps)
        ctx.lineTo(xl, y)
        ctx.lineTo(xl + gw / (2 * steps), y)
      }
      for (let s = steps - 1; s >= 0; s--) {
        const y = top - ((s + 1) * (top - peak)) / steps
        const xr = gx0 + gw - (s * gw) / (2 * steps)
        ctx.lineTo(xr - gw / (2 * steps), y)
        ctx.lineTo(xr, y)
      }
      ctx.lineTo(gx0 + gw, top)
      ctx.closePath()
    }
    tiles(ctx, path, peak, top, gx0, gx0 + gw, '#a8583e')
    ctx.strokeStyle = '#d8cfc0'
    ctx.lineWidth = 1.4
    path()
    ctx.stroke()
    windowAt(ctx, gx0 + gw / 2 - 7, top - (top - peak) * 0.5, 14, 18, shutter, glows, lit(time) && r() > 0.5)
  }
  // Скат крыши за фронтоном (виден сбоку) и труба.
  const chx = gx0 + gw * (0.2 + r() * 0.6)
  const chTop = peak + (top - peak) * 0.25 - 16
  ctx.fillStyle = '#8a5a44'
  ctx.fillRect(chx - 5, chTop, 10, 20)
  ctx.fillStyle = '#5a3a2c'
  ctx.fillRect(chx - 7, chTop - 3, 14, 4)
  chimneys.push({ x: chx, y: chTop - 4 })
  // Дверь: арка из досок, железные петли.
  const dw = 22
  const dx = h.x + (r() > 0.5 ? 12 : h.w - 12 - dw)
  ctx.fillStyle = '#4a2e1c'
  ctx.beginPath()
  ctx.moveTo(dx, G)
  ctx.lineTo(dx, G - 28)
  ctx.quadraticCurveTo(dx + dw / 2, G - 40, dx + dw, G - 28)
  ctx.lineTo(dx + dw, G)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 0.8
  for (let x = dx + 5; x < dx + dw; x += 5) line(ctx, x, G - 34, x, G)
  ctx.strokeStyle = '#1e1a18'
  ctx.lineWidth = 1.6
  line(ctx, dx + 2, G - 22, dx + 12, G - 22)
  line(ctx, dx + 2, G - 10, dx + 12, G - 10)
  ctx.strokeStyle = '#8a8070'
  ctx.lineWidth = 2
  ctx.strokeRect(dx - 1, G - 2, dw + 2, 2)
  // Лавка: окно-прилавок с откидной доской.
  const sx = dx < h.x + h.w / 2 ? dx + dw + 12 : h.x + 10
  const sw = Math.min(34, h.w - dw - 30)
  if (sw > 16) {
    ctx.fillStyle = '#2a2420'
    ctx.fillRect(sx, G - 30, sw, 18)
    ctx.fillStyle = '#7a5434'
    ctx.fillRect(sx - 2, G - 12, sw + 4, 3)
    if (glows && lit(time)) glows.push({ x: sx + 1, y: G - 29, w: sw - 2, h: 16 })
    sign(ctx, h.x + h.w - 2, G - groundH - 2, SIGNS[Math.floor(r() * SIGNS.length)])
  }
  // Свет слева: правая часть дома в тени.
  const shadeG = ctx.createLinearGradient(gx0, 0, gx0 + gw, 0)
  shadeG.addColorStop(0, 'rgba(255,240,210,0.10)')
  shadeG.addColorStop(0.55, 'rgba(0,0,0,0)')
  shadeG.addColorStop(1, 'rgba(30,20,30,0.22)')
  // Только по уже нарисованному (source-atop): небо в другом слое, прямоугольник тени не виден.
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = shadeG
  ctx.fillRect(gx0 - 8, peak - 4, gw + 16, G - peak + 4)
  ctx.restore()
}

/** Готическая церковь справа: неф с контрфорсами, окна-стрелки, розетка, башня со шпилем. */
function drawChurch(ctx: Ctx, x: number, glows: { x: number; y: number; w: number; h: number }[], time: SceneTime) {
  const G = HD_GROUND
  const stone = ctx.createLinearGradient(x, 0, x + 200, 0)
  stone.addColorStop(0, '#d2c9b4')
  stone.addColorStop(1, '#9e9584')
  ctx.fillStyle = stone
  // Неф.
  ctx.fillRect(x, G - 110, 150, 110)
  ctx.fillStyle = '#5a5a66'
  ctx.beginPath()
  ctx.moveTo(x - 4, G - 110)
  ctx.lineTo(x + 75, G - 160)
  ctx.lineTo(x + 154, G - 110)
  ctx.closePath()
  ctx.fill()
  // Контрфорсы и окна-стрелки.
  for (let i = 0; i < 4; i++) {
    const bx = x + 8 + i * 38
    ctx.fillStyle = '#b8af9c'
    ctx.fillRect(bx, G - 100, 9, 100)
    ctx.beginPath()
    ctx.moveTo(bx, G - 100)
    ctx.lineTo(bx + 4.5, G - 114)
    ctx.lineTo(bx + 9, G - 100)
    ctx.fill()
    if (i < 3) {
      const wx = bx + 15
      ctx.fillStyle = '#28304a'
      ctx.beginPath()
      ctx.moveTo(wx, G - 30)
      ctx.lineTo(wx, G - 75)
      ctx.quadraticCurveTo(wx + 8, G - 92, wx + 16, G - 75)
      ctx.lineTo(wx + 16, G - 30)
      ctx.closePath()
      ctx.fill()
      // Витраж: цветные стёкла.
      const glass = ['#a83a3a', '#2f5a9a', '#d8b040', '#3a7a4a']
      for (let gy = G - 74; gy < G - 32; gy += 6) for (let gx = wx + 2; gx < wx + 14; gx += 4) {
        ctx.fillStyle = glass[(gx + gy) % 4]
        ctx.globalAlpha = 0.55
        ctx.fillRect(gx, gy, 3, 5)
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#3a3630'
      ctx.lineWidth = 1
      line(ctx, wx + 8, G - 86, wx + 8, G - 30)
      if (lit(time)) glows.push({ x: wx + 2, y: G - 74, w: 12, h: 42 })
    }
  }
  // Башня.
  const tx = x + 150
  ctx.fillStyle = stone
  ctx.fillRect(tx, G - 150, 46, 150)
  ctx.strokeStyle = 'rgba(70,60,50,0.3)'
  ctx.lineWidth = 0.7
  for (let y = G - 150; y < G; y += 8) line(ctx, tx, y, tx + 46, y)
  // Розетка.
  ctx.fillStyle = '#28304a'
  ctx.beginPath()
  ctx.arc(tx + 23, G - 112, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#c8bfae'
  ctx.lineWidth = 1.4
  for (let a = 0; a < 8; a++) line(ctx, tx + 23, G - 112, tx + 23 + Math.cos((a * Math.PI) / 4) * 13, G - 112 + Math.sin((a * Math.PI) / 4) * 13)
  ctx.beginPath()
  ctx.arc(tx + 23, G - 112, 13, 0, Math.PI * 2)
  ctx.stroke()
  // Портал.
  ctx.fillStyle = '#3a2a20'
  ctx.beginPath()
  ctx.moveTo(tx + 10, G)
  ctx.lineTo(tx + 10, G - 34)
  ctx.quadraticCurveTo(tx + 23, G - 56, tx + 36, G - 34)
  ctx.lineTo(tx + 36, G)
  ctx.fill()
  // Шпиль с крестоцветами.
  ctx.fillStyle = '#5a5a66'
  ctx.beginPath()
  ctx.moveTo(tx - 2, G - 150)
  ctx.lineTo(tx + 23, G - 255)
  ctx.lineTo(tx + 48, G - 150)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#7a7a86'
  ctx.beginPath()
  ctx.moveTo(tx + 6, G - 150)
  ctx.lineTo(tx + 23, G - 245)
  ctx.lineTo(tx + 23, G - 150)
  ctx.fill()
  ctx.strokeStyle = '#3a3a44'
  ctx.lineWidth = 0.8
  for (let k = 1; k < 8; k++) {
    const y = G - 150 - k * 12
    const half = 25 * (1 - (k * 12) / 105)
    line(ctx, tx + 23 - half, y, tx + 23 + half, y)
  }
  for (const px of [tx - 2, tx + 48]) {
    ctx.fillStyle = '#b8af9c'
    ctx.beginPath()
    ctx.moveTo(px - 4, G - 150)
    ctx.lineTo(px, G - 170)
    ctx.lineTo(px + 4, G - 150)
    ctx.fill()
  }
  ctx.strokeStyle = '#c9a24a'
  ctx.lineWidth = 1.6
  line(ctx, tx + 23, G - 255, tx + 23, G - 268)
  line(ctx, tx + 18, G - 263, tx + 28, G - 263)
  const sh = ctx.createLinearGradient(x, 0, tx + 48, 0)
  sh.addColorStop(0, 'rgba(255,240,210,0.08)')
  sh.addColorStop(1, 'rgba(30,20,30,0.2)')
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = sh
  ctx.fillRect(x - 4, G - 270, tx + 52 - x, 270)
  ctx.restore()
}

// ---------- Мостовая ----------

function drawStreet(ctx: Ctx, r: () => number, time: SceneTime, houses: { x: number; w: number; top: number }[]) {
  const G = HD_GROUND
  const base = ctx.createLinearGradient(0, G, 0, HD_H)
  base.addColorStop(0, '#8a8274')
  base.addColorStop(1, '#6e665a')
  ctx.fillStyle = base
  ctx.fillRect(0, G, HD_W, HD_H - G)
  // Тени домов на мостовой (днём - вправо, свет слева).
  if (time !== 'night' && time !== 'overcast') {
    ctx.fillStyle = 'rgba(30,24,30,0.22)'
    for (const h of houses) {
      ctx.beginPath()
      ctx.moveTo(h.x + h.w, G)
      ctx.lineTo(h.x + h.w + 26, G + 20)
      ctx.lineTo(h.x + 30, G + 20)
      ctx.lineTo(h.x, G)
      ctx.fill()
    }
  }
  // Булыжник: ряды камней, к зрителю крупнее.
  for (let y = G + 3, row = 0; y < HD_H + 8; row++) {
    const s = 4 + (y - G) * 0.08
    for (let x = (row % 2) * s * 0.9 - s; x < HD_W + s; x += s * 1.8 + r() * 2) {
      const rx = s * (0.8 + r() * 0.25)
      const ry = s * 0.55
      const c = 108 + Math.floor(r() * 40)
      ctx.fillStyle = `rgb(${c},${c - 6},${c - 16})`
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,248,230,0.22)'
      ctx.beginPath()
      ctx.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    y += s * 1.15
  }
  // Сточная канавка посередине улицы.
  ctx.fillStyle = 'rgba(40,36,34,0.35)'
  ctx.fillRect(0, G + 44, HD_W, 4)
  ctx.fillStyle = 'rgba(160,180,200,0.25)'
  ctx.fillRect(0, G + 45, HD_W, 1)
  // Бордюр у стен.
  ctx.fillStyle = '#9a9284'
  ctx.fillRect(0, G - 1, HD_W, 4)
}

// ---------- Свет, тон и фактура ----------

function multiply(ctx: Ctx, time: SceneTime) {
  const t = TINT[time]
  if (!t) return
  // Слой с тоном, наложенный умножением только на непрозрачные точки.
  const [c, x] = canvas()
  x.drawImage(ctx.canvas, 0, 0)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = t.c
  x.fillRect(0, 0, HD_W, HD_H)
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = t.a
  ctx.drawImage(c, 0, 0)
  ctx.restore()
}

function glowWindows(ctx: Ctx, glows: { x: number; y: number; w: number; h: number }[], time: SceneTime) {
  if (!lit(time)) return
  const strong = time === 'night' ? 1 : 0.6
  for (const g of glows) {
    ctx.fillStyle = `rgba(255,196,110,${0.85 * strong})`
    ctx.fillRect(g.x, g.y, g.w, g.h)
    const cx = g.x + g.w / 2
    const cy = g.y + g.h / 2
    const rad = Math.max(g.w, g.h) * 1.6
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
    rg.addColorStop(0, `rgba(255,190,100,${0.35 * strong})`)
    rg.addColorStop(1, 'rgba(255,190,100,0)')
    ctx.fillStyle = rg
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
  }
}

/** Лёгкая фактура «краски»: шум яркости по закрашенным точкам. */
function grain(ctx: Ctx, seed: () => number) {
  const img = ctx.getImageData(0, 0, HD_W, HD_H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const n = (seed() - 0.5) * 14
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

// ---------- Сборка ----------

/** Улица средневекового европейского города. bands - полосы неба времени суток (как у прежней сцены). */
export function buildHdStreet(seed: string, time: SceneTime, bands: string[]): HdLayers {
  const r = rng(`${seed}:hd:street`)
  const [sky, skyX] = canvas()
  drawSky(skyX, bands, time, r)
  const [clouds, cloudX] = canvas(HD_W * 2, 160)
  drawClouds(cloudX, HD_W * 2, time, r)
  const [far, farX] = canvas()
  drawFar(farX, bands[Math.floor(bands.length * 0.7)], r)
  multiply(farX, time)
  const [main, ctx] = canvas()
  const glows: { x: number; y: number; w: number; h: number }[] = []
  const chimneys: { x: number; y: number }[] = []
  // Церковь в глубине справа, дома - рядом слева направо.
  const churchX = 690 + Math.floor(r() * 40)
  drawChurch(ctx, churchX, glows, time)
  const houses: { x: number; w: number; top: number }[] = []
  let x = 18 + Math.floor(r() * 14)
  while (x < churchX - 70) {
    const w = 86 + Math.floor(r() * 36)
    const floors = r() > 0.4 ? 2 : 1
    houses.push({ x, w, top: HD_GROUND - 44 - floors * 38 })
    drawHouse(ctx, { x, w, floors, gable: r() > 0.55 ? 'stepped' : 'pointed' }, r, glows, chimneys, time)
    x += w + 22 + Math.floor(r() * 16)
  }
  drawStreet(ctx, r, time, houses)
  grain(ctx, r)
  multiply(ctx, time)
  glowWindows(ctx, glows, time)
  // Для факелов у дверей (прежняя логика сцены) - дома в сетке 192.
  const k = 192 / HD_W
  const built = [...houses.map((h) => ({ x: Math.round(h.x * k), w: Math.round(h.w * k), top: Math.round(h.top * k) })), { x: Math.round(churchX * k), w: 40, top: 20 }]
  return { sky, clouds, far, main, chimneys, built }
}


