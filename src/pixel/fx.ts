// Движение поверх неподвижных слоёв сцены: облака, звёзды, птицы, вода, огни, огонь, дым, пыль, флаги, погода.
// Всё считается от времени t (секунды) и номера сцены — одинаковые данные и t дают одинаковую картинку.
// Координаты — в точках холста 320×100.

export type Weather = 'rain' | 'snow' | 'fog' | 'wind' | 'heat' | 'storm'

export interface Fx {
  seed: number
  /** Линия горизонта (земля) на холсте. */
  horizon: number
  clouds: { n: number; color: string; shadow: string }
  stars: { x: number; y: number }[]
  starSky: string
  birds: number
  water: { x: number; y: number; w: number; h: number; light: string }[]
  lights: { x: number; y: number; w: number; h: number; c: string }[]
  flames: { x: number; y: number; w: number; h: number }[]
  smoke: { x: number; y: number; size: number; dark?: boolean }[]
  dust: { x: number; y: number; w: number }[]
  flags: { x: number; y: number; c: string }[]
  weather?: Weather
  /** Сила ветра −1…1: куда сносит дым, дождь и флаги. */
  wind: number
}

export function emptyFx(seed: number, horizon: number): Fx {
  return { seed, horizon, clouds: { n: 0, color: '#ffffff', shadow: '#dfe6ee' }, stars: [], starSky: '#10142e', birds: 0, water: [], lights: [], flames: [], smoke: [], dust: [], flags: [], wind: 0.3 }
}

type Ctx = CanvasRenderingContext2D

/** Детерминированный шум 0…1 по целым числам. */
export function noise(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Последний цвет кисти: менять fillStyle дорого, ставим только когда цвет другой (сброс в начале каждого слоя). */
let lastColor = ''
const fill = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  if (c !== lastColor) {
    ctx.fillStyle = c
    lastColor = c
  }
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h)))
}

const W = 320

/** За постройками: облака, мерцание звёзд, птицы. */
export function drawFxBack(ctx: Ctx, fx: Fx, t: number): void {
  lastColor = ''
  // Звёзды: треть мигает.
  for (let i = 0; i < fx.stars.length; i++) {
    if (i % 3) continue
    if (noise(fx.seed, i, Math.floor(t * 1.3 + i)) < 0.45) fill(ctx, fx.stars[i].x, fx.stars[i].y, 1, 1, fx.starSky)
  }
  // Облака плывут по ветру и возвращаются с другого края.
  for (let i = 0; i < fx.clouds.n; i++) {
    const w = 18 + Math.floor(noise(fx.seed, i, 1) * 26)
    const y = 4 + Math.floor(noise(fx.seed, i, 2) * Math.max(6, fx.horizon * 0.42))
    const speed = (0.6 + noise(fx.seed, i, 3) * 1.4) * (fx.wind >= 0 ? 1 : -1)
    const span = W + w + 20
    const x = ((((noise(fx.seed, i, 4) * span + t * speed) % span) + span) % span) - w - 10
    fill(ctx, x + 4, y, w - 8, 2, fx.clouds.color)
    fill(ctx, x, y + 2, w, 3, fx.clouds.color)
    fill(ctx, x + 3, y + 5, w - 6, 1, fx.clouds.shadow)
  }
  // Птицы: машут крыльями, летят через небо.
  for (let i = 0; i < fx.birds; i++) {
    const speed = 7 + noise(fx.seed, i, 5) * 6
    const span = W + 60
    const x = ((noise(fx.seed, i, 6) * span + t * speed) % span) - 30
    const y = 8 + noise(fx.seed, i, 7) * fx.horizon * 0.35 + Math.sin(t * 1.7 + i) * 2
    const up = Math.floor(t * 4 + i) % 2 === 0
    const c = '#2a2a32'
    fill(ctx, x, y, 1, 1, c)
    fill(ctx, x - 1, y - (up ? 1 : 0), 1, 1, c)
    fill(ctx, x + 1, y - (up ? 1 : 0), 1, 1, c)
    fill(ctx, x - 2, y - (up ? 2 : 0), 1, 1, c)
    fill(ctx, x + 2, y - (up ? 2 : 0), 1, 1, c)
  }
}

/** Поверх построек, под людьми: рябь воды, огни в окнах, пламя, пыль, флаги. */
export function drawFxMid(ctx: Ctx, fx: Fx, t: number): void {
  lastColor = ''
  for (const [wi, w] of fx.water.entries()) {
    for (let y = w.y + 1, row = 0; y < w.y + w.h; y += 3, row++) {
      const dir = row % 2 ? 1 : -1
      const shift = (t * 5 * dir + noise(fx.seed, wi, row) * 40) % 12
      for (let x = w.x + ((shift + 12) % 12); x < w.x + w.w - 3; x += 12) {
        if (noise(fx.seed, Math.floor(x), row + Math.floor(t * 2)) < 0.55) fill(ctx, x, y, 3, 1, w.light)
      }
    }
  }
  for (const [i, l] of fx.lights.entries()) {
    const n = noise(fx.seed, i, Math.floor(t * 6))
    ctx.globalAlpha = 0.25 + n * 0.45
    fill(ctx, l.x, l.y, l.w, l.h, '#fff3b8')
    ctx.globalAlpha = 1
  }
  for (const [i, f] of fx.flames.entries()) {
    // Языки пламени разной высоты: колонки через одну, высота пляшет.
    for (let x = f.x, col = 0; x < f.x + f.w - 1; x += 4, col++) {
      const n = noise(fx.seed, i * 31 + col, Math.floor(t * 9))
      if (n < 0.15) continue
      const fh = Math.max(2, Math.round(f.h * (0.3 + n * 0.7)))
      fill(ctx, x, f.y + f.h - fh, 3, fh, '#e0602a')
      fill(ctx, x + 1, f.y + f.h - fh + 1, 1, Math.max(1, fh - 2), '#f6b03a')
      if (n > 0.75) fill(ctx, x + 1, f.y + f.h - fh - 1, 1, 1, '#ffe08a')
    }
    // Искры.
    for (let k = 0; k < 4; k++) {
      const age = (t * 0.9 + noise(fx.seed, i, k + 40)) % 1
      const sx = f.x + noise(fx.seed, i, k + 50) * f.w + Math.sin(t * 3 + k) * 2
      fill(ctx, sx, f.y - age * 16, 1, 1, age < 0.6 ? '#ffd27a' : '#e0602a')
    }
  }
  for (const [i, d] of fx.dust.entries()) {
    ctx.globalAlpha = 0.35
    for (let k = 0; k < 6; k++) {
      const age = (t * 0.25 + k / 6) % 1
      fill(ctx, d.x + noise(fx.seed, i, k) * d.w + age * 8 * fx.wind, d.y - age * 10, 2, 1, '#c8b89a')
    }
    ctx.globalAlpha = 1
  }
  for (const [i, f] of fx.flags.entries()) {
    // Полотнище 10×8 волной: каждая колонка сдвигается по синусу.
    for (let col = 0; col < 10; col++) {
      const dy = Math.round(Math.sin(t * 5 + col * 0.8 + i) * (col / 6))
      fill(ctx, f.x + 1 + col, f.y + dy, 1, 8, col % 4 === 3 ? shadeColor(f.c, -0.15) : f.c)
    }
  }
}

/** Над людьми: дым и погода. */
export function drawFxTop(ctx: Ctx, fx: Fx, t: number): void {
  lastColor = ''
  for (const [i, s] of fx.smoke.entries()) {
    for (let k = 0; k < 5; k++) {
      const age = (t * (0.18 + s.size * 0.02) + k / 5 + noise(fx.seed, i, 9)) % 1
      const r = Math.round(1 + age * (2 + s.size))
      const x = s.x + age * 18 * fx.wind + Math.sin(t * 1.3 + k + i) * 1.5
      const y = s.y - age * (14 + s.size * 4)
      ctx.globalAlpha = 0.55 * (1 - age)
      // Клуб дыма — «круг» из двух прямоугольников.
      const col = s.dark ? '#5a5450' : '#a8a4a0'
      fill(ctx, x - r, y - r + 1, r * 2, r * 2 - 2, col)
      fill(ctx, x - r + 1, y - r, r * 2 - 2, r * 2, col)
    }
    ctx.globalAlpha = 1
  }
  const w = fx.weather
  if (!w) return
  if (w === 'rain' || w === 'storm') {
    const n = w === 'storm' ? 150 : 110
    const slant = Math.round(fx.wind * 2)
    for (let i = 0; i < n; i++) {
      const speed = 120 + noise(fx.seed, i, 11) * 60
      const y = (noise(fx.seed, i, 12) * 110 + t * speed) % 110 - 6
      const x = (noise(fx.seed, i, 13) * (W + 20) + y * fx.wind * 0.6) % (W + 20) - 10
      fill(ctx, x, y, 1, 3, '#a8c0d8')
      if (slant) fill(ctx, x + slant, y + 3, 1, 1, '#a8c0d8')
    }
    if (w === 'storm' && t % 7 < 0.12) {
      ctx.globalAlpha = 0.5
      fill(ctx, 0, 0, W, 100, '#f4f6ff')
      ctx.globalAlpha = 1
    }
  } else if (w === 'snow') {
    for (let i = 0; i < 120; i++) {
      const speed = 8 + noise(fx.seed, i, 14) * 10
      const y = (noise(fx.seed, i, 15) * 106 + t * speed) % 106 - 4
      const x = (noise(fx.seed, i, 16) * W + Math.sin(t * 0.9 + i) * 3 + t * fx.wind * 6 + W) % W
      fill(ctx, x, y, noise(fx.seed, i, 17) > 0.8 ? 2 : 1, 1, '#f4f8fc')
    }
  } else if (w === 'fog') {
    // Туман: рваные полупрозрачные пряди у земли, медленно ползут.
    ctx.globalAlpha = 0.16
    for (let row = 0; row < 9; row++) {
      const y = fx.horizon - 30 + row * 4
      const speed = 2 + (row % 3)
      for (let k = 0; k < 6; k++) {
        const len = 30 + noise(fx.seed, row, k) * 60
        const x = ((noise(fx.seed, row, k + 9) * (W + 120) + t * speed) % (W + 120)) - 60
        fill(ctx, x, y, len, 2, '#eef1f3')
        fill(ctx, x + 6, y - 1, len - 12, 1, '#eef1f3')
      }
    }
    ctx.globalAlpha = 1
  } else if (w === 'wind') {
    for (let i = 0; i < 14; i++) {
      const speed = 70 + noise(fx.seed, i, 18) * 50
      const x = (noise(fx.seed, i, 19) * (W + 40) + t * speed * Math.sign(fx.wind || 1)) % (W + 40) - 20
      const y = 10 + noise(fx.seed, i, 20) * (fx.horizon + 14)
      ctx.globalAlpha = 0.45
      fill(ctx, x, y, 6 + Math.floor(noise(fx.seed, i, 21) * 6), 1, '#f2efe6')
      ctx.globalAlpha = 1
      if (i % 3 === 0) fill(ctx, x + 3, y + Math.sin(t * 6 + i) * 2 + 2, 1, 1, '#b8863a')
    }
  } else if (w === 'heat') {
    // Марево над землёй.
    ctx.globalAlpha = 0.18
    for (let i = 0; i < 3; i++) {
      const y = fx.horizon - 4 - i * 3
      for (let x = 0; x < W; x += 8) fill(ctx, x + Math.sin(t * 2 + x * 0.1 + i) * 2, y, 5, 1, '#fff6e0')
    }
    ctx.globalAlpha = 1
  }
}

function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}
