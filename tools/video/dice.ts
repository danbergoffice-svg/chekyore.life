// Ролик «В игре появились кости» 1920×1080 (?o=v - 1080×1920), 15 секунд, ?lang=en|ru. Кадр рисует renderFrame(t),
// снимает tools/video/dice-render.cjs. Графика - настоящие сцены и портреты игры, цвета и шрифты игры.
//   0–2.5   две кости падают, 6 и 6 - «Кости»          2.5–5.5  у каждой эпохи своя игра: улицы четырёх стран
//   5.5–9   партия: броски, переброс, подмена кости     9–12     лестница ставок и азарт
//   12–15   «Тысячи жизней» - кости уже в игре
import '@fontsource-variable/alegreya'
import letopis from '../../src/fonts/ThousandsLetopis-VF.woff2'
import { AH, AW, drawAvatar } from '../../src/pixel/avatar'
import type { AvatarInput } from '../../src/pixel/avatar'
import { drawScene, H as SH, W as SW } from '../../src/pixel/scene'
import type { SceneDef } from '../../src/engine/types'

const params = new URLSearchParams(location.search)
const V = params.get('o') === 'v'
export const WIDTH = V ? 1080 : 1920
export const HEIGHT = V ? 1920 : 1080
export const DURATION = 15
const canvas = document.getElementById('c') as HTMLCanvasElement
canvas.width = WIDTH
canvas.height = HEIGHT
const ctx = canvas.getContext('2d')!
const lang = params.get('lang') === 'ru' ? 'ru' : 'en'

const TEXT = {
  en: {
    eyebrow: 'NEW IN THOUSANDS OF LIVES',
    title: 'DICE',
    ages: 'EVERY AGE HAD ITS GAME',
    games: [['baghdad', 'Backgammon for money', '905'], ['paris', 'Hazard', '1250'], ['kyoto', 'Chō-han', '1450'], ['novgorod', 'Zern', '1380']],
    duel: 'THROW. REROLL. CHEAT?',
    you: 'You',
    opp: 'Cheat',
    moves: ['Reroll', 'Swap a die', 'Call out the cheat'],
    win: 'WIN  +120 dirhams',
    stakesTitle: 'THE DEEPER IT PULLS,',
    stakesTitle2: 'THE HIGHER THE STAKES',
    stakes: ['Coins', 'Whole purse', 'The house', 'Your son', 'Yourself'],
    lust: 'LUST',
    game: 'Thousands of Lives',
    cta: 'Dice are in the game',
    url: 'thousands.life',
  },
  ru: {
    eyebrow: 'НОВОЕ В «ТЫСЯЧАХ ЖИЗНЕЙ»',
    title: 'КОСТИ',
    ages: 'У КАЖДОЙ ЭПОХИ — СВОЯ ИГРА',
    games: [['baghdad', 'Нарды на деньги', '905'], ['paris', 'Азард', '1250'], ['kyoto', 'Тё-хан', '1450'], ['novgorod', 'Зернь', '1380']],
    duel: 'БРОСАЙ. ПЕРЕБРАСЫВАЙ. ЖУЛЬНИЧАЙ?',
    you: 'Ты',
    opp: 'Жулик',
    moves: ['Перебросить', 'Подменить кость', 'Уличить шулера'],
    win: 'ВЫИГРЫШ  +120 дирхамов',
    stakesTitle: 'ЧЕМ СИЛЬНЕЕ АЗАРТ,',
    stakesTitle2: 'ТЕМ КРУПНЕЕ СТАВКИ',
    stakes: ['Монеты', 'Весь кошелёк', 'Дом', 'Сын', 'Сам себя'],
    lust: 'АЗАРТ',
    game: 'Тысячи жизней',
    cta: 'Кости уже в игре',
    url: 'thousands.life',
  },
}[lang]

const C = { night: '#16213a', deep: '#0f1729', card: '#1f2c4a', sheet: '#f3ead7', ink: '#130904', mustard: '#ecd06f', terra: '#df6c4f', clay: '#a3341c', muted: '#bfa987', line: '#33456b' }
const DISPLAY = "'Thousands Letopis', 'Alegreya Variable', serif"
const BODY = "'Alegreya Variable', Georgia, serif"

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const outCubic = (k: number) => 1 - (1 - k) ** 3
const outBack = (k: number, s = 1.7) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2
const outBounce = (k: number) => {
  const n = 7.5625
  const d = 2.75
  if (k < 1 / d) return n * k * k
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375
  return n * (k -= 2.625 / d) * k + 0.984375
}
function rng(seed: number) {
  let h = seed >>> 0
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let x = Math.imul(h ^ (h >>> 15), h | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Графика игры ----------

const cache = new Map<string, HTMLCanvasElement>()
function scene(region: string, def: SceneDef, seed: string): HTMLCanvasElement {
  const key = `s:${region}:${seed}`
  let c = cache.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = SW
    c.height = SH
    drawScene(c.getContext('2d')!, { scene: def, region, seed })
    cache.set(key, c)
  }
  return c
}
function avatar(input: AvatarInput): HTMLCanvasElement {
  const key = `a:${JSON.stringify(input)}`
  let c = cache.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = AW
    c.height = AH
    drawAvatar(c.getContext('2d')!, input)
    cache.set(key, c)
  }
  return c
}
function blit(img: CanvasImageSource, x: number, y: number, w: number, h: number, alpha = 1) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()
}

/** Пиксельная кость 14×14: грань value, светлая или «кровавая» (у жулика). */
const PIPS: Record<number, [number, number][]> = {
  1: [[7, 7]], 2: [[4, 4], [10, 10]], 3: [[4, 4], [7, 7], [10, 10]], 4: [[4, 4], [10, 4], [4, 10], [10, 10]],
  5: [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]], 6: [[4, 4], [10, 4], [4, 7], [10, 7], [4, 10], [10, 10]],
}
function dieSprite(v: number, glow = false): HTMLCanvasElement {
  const key = `d:${v}:${glow}`
  let c = cache.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = 15
    c.height = 15
    const x = c.getContext('2d')!
    x.fillStyle = C.ink
    x.fillRect(1, 0, 13, 15)
    x.fillRect(0, 1, 15, 13)
    x.fillStyle = glow ? '#fff2c4' : '#fffaf0'
    x.fillRect(1, 1, 13, 12)
    x.fillStyle = glow ? '#f0d68a' : '#d9cdb2'
    x.fillRect(1, 12, 13, 2)
    x.fillStyle = C.ink
    for (const [px, py] of PIPS[v]) x.fillRect(px - 1, py - 1, 2, 2)
    cache.set(key, c)
  }
  return c
}
function die(v: number, cx: number, cy: number, size: number, rot = 0, glow = false) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(-size / 2 + size * 0.08, -size / 2 + size * 0.12, size, size)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(dieSprite(v, glow), -size / 2, -size / 2, size, size)
  ctx.restore()
}

// ---------- Текст ----------

interface T { size: number; color?: string; weight?: number; display?: boolean; align?: CanvasTextAlign; alpha?: number; spacing?: number; italic?: boolean }
function font(o: T) {
  return `${o.italic ? 'italic ' : ''}${o.weight ?? 600} ${o.size}px ${o.display ? DISPLAY : BODY}`
}
function text(s: string, x: number, y: number, o: T) {
  ctx.save()
  ctx.globalAlpha *= o.alpha ?? 1
  ctx.font = font(o)
  ctx.fillStyle = o.color ?? C.sheet
  ctx.textAlign = o.align ?? 'left'
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`
  ctx.fillText(s, x, y)
  ctx.restore()
}
function measure(s: string, o: T) {
  ctx.save()
  ctx.font = font(o)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`
  const w = ctx.measureText(s).width
  ctx.restore()
  return w
}
/** Буквы по одной подпрыгивают снизу. */
function letters(s: string, cx: number, y: number, t: number, t0: number, o: T, step = 0.05) {
  let x = cx - measure(s, o) / 2
  for (let i = 0; i < s.length; i++) {
    const k = seg(t, t0 + i * step, t0 + i * step + 0.4)
    if (k > 0) text(s[i], x, y + (1 - outBack(k, 2.2)) * o.size * 0.5, { ...o, align: 'left', alpha: (o.alpha ?? 1) * clamp(k * 2.5) })
    x += measure(s[i], o)
  }
}
/** Слова по одному выезжают снизу. */
function words(s: string, x: number, y: number, t: number, t0: number, o: T, step = 0.07) {
  const parts = s.split(' ')
  const space = measure(' ', o)
  const total = parts.reduce((n, p) => n + measure(p, o), 0) + space * (parts.length - 1)
  let cx = o.align === 'center' ? x - total / 2 : x
  parts.forEach((p, i) => {
    const k = outCubic(seg(t, t0 + i * step, t0 + i * step + 0.4))
    if (k > 0) text(p, cx, y + (1 - k) * 28, { ...o, align: 'left', alpha: (o.alpha ?? 1) * k })
    cx += measure(p, o) + space
  })
}

// ---------- Фон, пыль, переходы ----------

function bgNight(t: number, warm = false) {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.55, 80, WIDTH / 2, HEIGHT * 0.55, Math.max(WIDTH, HEIGHT) * 0.75)
  g.addColorStop(0, warm ? '#3a2a20' : '#22325a')
  g.addColorStop(1, C.deep)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  dust(t, C.mustard, 0.45)
}
function bgSheet() {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, Math.max(WIDTH, HEIGHT) * 0.7)
  g.addColorStop(0, '#fbf6ec')
  g.addColorStop(1, '#e8dcc2')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}
function dust(t: number, color: string, strength: number) {
  const r = rng(11)
  ctx.save()
  ctx.fillStyle = color
  for (let i = 0; i < 60; i++) {
    const x0 = r() * WIDTH
    const y0 = r() * HEIGHT
    const sp = 12 + r() * 40
    const s = 3 + Math.floor(r() * 3) * 2
    const ph = r() * 6.28
    ctx.globalAlpha = strength * (0.3 + 0.7 * Math.abs(Math.sin(t * 2 + ph)))
    ctx.fillRect(x0 + Math.sin(t + ph) * 18, (((y0 - t * sp) % HEIGHT) + HEIGHT) % HEIGHT, s, s)
  }
  ctx.restore()
}
function burst(x: number, y: number, t: number, t0: number, color: string, n = 46) {
  const k = seg(t, t0, t0 + 0.9)
  if (k <= 0 || k >= 1) return
  const r = rng(Math.round(x + y * 3))
  ctx.save()
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = outCubic(k) * (180 + r() * 380)
    const s = 6 + Math.floor(r() * 3) * 4
    ctx.globalAlpha = 1 - k
    ctx.fillStyle = i % 3 ? color : C.sheet
    ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d + k * k * 120, s, s)
  }
  ctx.restore()
}
/** Пиксельный переход квадратами. */
function wipe(t: number, at: number, color: string) {
  const k = (t - (at - 0.22)) / 0.44
  if (k <= 0 || k >= 1) return
  const size = 120
  ctx.save()
  ctx.fillStyle = color
  const cols = Math.ceil(WIDTH / size)
  const rows = Math.ceil(HEIGHT / size)
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const d = (i + j) / (cols + rows)
      const l = k < 0.5 ? clamp((k * 2 - d * 0.6) / 0.4) : 1 - clamp(((k - 0.5) * 2 - d * 0.6) / 0.4)
      const s = size * l
      if (s > 0.5) ctx.fillRect(i * size + (size - s) / 2, j * size + (size - s) / 2, s + 1, s + 1)
    }
  ctx.restore()
}

// ---------- 1. Кости (0–2.5) ----------

function intro(t: number) {
  bgNight(t, true)
  const cy = HEIGHT * (V ? 0.4 : 0.42)
  const size = V ? 220 : 240
  // Две кости падают и подпрыгивают; пока летят - грани мелькают, на земле - 6 и 6.
  for (const [i, dx, t0] of [[0, -0.6, 0.15], [1, 0.6, 0.3]] as const) {
    const k = seg(t, t0, t0 + 1.0)
    const y = lerp(-size, cy, outBounce(k))
    const spin = (1 - outCubic(k)) * (i ? -7 : 8)
    const face = k < 0.85 ? 1 + (Math.floor(t * 18 + i * 3) % 6) : 6
    die(face, WIDTH / 2 + dx * size * 1.05, y, size, spin, k >= 0.85)
  }
  burst(WIDTH / 2, cy, t, 1.25, C.mustard)
  text(TEXT.eyebrow, WIDTH / 2, cy - size * 0.95, { size: V ? 34 : 36, weight: 700, color: C.mustard, align: 'center', spacing: 6, alpha: outCubic(seg(t, 1.0, 1.4)) })
  letters(TEXT.title, WIDTH / 2, cy + size * 1.15 + (V ? 60 : 40), t, 1.3, { size: V ? 200 : 210, display: true, weight: 700, color: C.sheet, spacing: 14 }, 0.07)
}

// ---------- 2. У каждой эпохи своя игра (2.5–5.5) ----------

function ages(t: number) {
  ctx.fillStyle = C.deep
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const each = 0.75
  const i = Math.min(3, Math.floor((t - 2.5) / each))
  const local = t - 2.5 - i * each
  const [region, name, year] = TEXT.games[i]
  const sc = scene(region, { place: 'street', time: 'night', people: 5, props: ['coins', 'lamp'] }, `dice-${region}`)
  // Сцена во всю ширину, медленный наезд; смена страны - быстрой вспышкой.
  const zoom = 1.08 + local * 0.06
  const w = Math.max(WIDTH, HEIGHT * (SW / SH)) * zoom
  const h = w * (SH / SW)
  blit(sc, (WIDTH - w) / 2, (V ? HEIGHT * 0.36 : HEIGHT * 0.5) - h / 2, w, h)
  const shade = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  shade.addColorStop(0, 'rgba(15,23,41,0.75)')
  shade.addColorStop(0.45, 'rgba(15,23,41,0.05)')
  shade.addColorStop(1, 'rgba(15,23,41,0.9)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const flash = 1 - seg(local, 0, 0.12)
  if (flash > 0 && i > 0) {
    ctx.fillStyle = `rgba(255,240,200,${flash * 0.5})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
  words(TEXT.ages, WIDTH / 2, V ? 200 : 130, t, 2.6, { size: V ? 48 : 50, weight: 700, color: C.mustard, align: 'center', spacing: 4 }, 0.08)
  // Название игры и место - внизу, каждое со своим «прыжком».
  const k = outBack(seg(local, 0.02, 0.32), 2)
  const by = V ? HEIGHT * 0.76 : HEIGHT - 120
  const nameO = { size: V ? 110 : 120, display: true, weight: 700, color: C.sheet, align: 'center' as const }
  text(name, WIDTH / 2, by - (V ? 0 : 50) + (1 - k) * 40, { ...nameO, alpha: clamp(k) })
  text(`${regionName(region)} · ${year}`, WIDTH / 2, by + (V ? 80 : 20), { size: 42, italic: true, color: C.muted, align: 'center', alpha: clamp(k) })
  // Две кости подпрыгивают по бокам названия.
  const half = Math.min(measure(name, nameO) / 2 + 90, WIDTH / 2 - 60)
  const dy = by - (V ? 40 : 90)
  die(1 + (Math.floor(t * 10) % 6), WIDTH / 2 - half, dy - Math.abs(Math.sin(t * 9)) * 22, 70, t * 6)
  die(1 + (Math.floor(t * 12 + 2) % 6), WIDTH / 2 + half, dy - Math.abs(Math.sin(t * 9 + 1)) * 22, 70, -t * 5)
}
const REGION = {
  en: { baghdad: 'Baghdad', paris: 'Paris', kyoto: 'Kyoto', novgorod: 'Novgorod' },
  ru: { baghdad: 'Багдад', paris: 'Париж', kyoto: 'Киото', novgorod: 'Новгород' },
}
const regionName = (id: string) => (REGION[lang] as Record<string, string>)[id] ?? id
// Годы рядом с местом - в духе игры: «905», «1250»; у русской версии «г.».
if (lang === 'ru') for (const g of TEXT.games) g[2] = `${g[2]} г.`

// ---------- 3. Партия (5.5–9) ----------

const ROUNDS: [[number, number], [number, number], number][] = [
  // мои, соперника, время броска
  [[3, 4], [5, 4], 6.0],
  [[6, 5], [2, 3], 6.9],
  [[3, 6], [6, 5], 7.7], // подмена кости: 3 → 6 на 8.1
]
function duel(t: number) {
  bgSheet()
  words(TEXT.duel, WIDTH / 2, V ? 210 : 120, t, 5.6, { size: V ? 46 : 50, weight: 700, color: C.clay, align: 'center', spacing: 3 }, 0.08)
  const cx = WIDTH / 2
  const top = V ? HEIGHT * 0.3 : HEIGHT * 0.3
  const gap = V ? 270 : 420
  const people: [AvatarInput, string, number][] = [
    [{ region: 'baghdad', sex: 'm', age: 34, seed: 'hero-dice', cls: 'trader', happiness: 70 }, TEXT.you, -1],
    [{ region: 'baghdad', sex: 'm', age: 46, seed: 'cheat-dice', cls: 'craftsman', happiness: 40 }, TEXT.opp, 1],
  ]
  for (const [look, label, side] of people) {
    const k = outBack(seg(t, 5.6, 6.0))
    const x = cx + side * gap
    const ah = V ? 300 : 320
    const aw = ah * (AW / AH)
    blit(avatar(look), x - aw / 2, top - (1 - k) * 80, aw, ah, clamp(k))
    text(label, x, top + ah + 50, { size: 42, weight: 700, color: C.ink, align: 'center', alpha: clamp(k) })
  }
  // Броски: на столе - текущий, кости вертятся 0,35 с и ложатся; счёт - по уже лёгшим броскам.
  const cur = ROUNDS.reduce((n, r, i) => (t >= r[2] ? i : n), -1)
  let mine = 0
  let theirs = 0
  ROUNDS.forEach(([me, them, at], i) => {
    if (i > cur) return
    const roll = seg(t, at, at + 0.35)
    const swapped = i === 2 && t >= 8.1
    const my: [number, number] = swapped ? [6, 6] : me
    if (i < cur || roll >= 1) {
      if (sum(my) > sum(them)) mine++
      else theirs++
    }
    if (i !== cur) return
    const y = top + (V ? 520 : 470)
    const spin = (1 - outCubic(roll)) * 9
    const lift = Math.sin(roll * Math.PI) * 60
    my.forEach((v, j) => die(roll < 1 ? 1 + (Math.floor(t * 20 + j) % 6) : v, cx - gap + (j - 0.5) * 110, y - lift, 96, spin * (j ? -1 : 1), swapped && j === 0))
    them.forEach((v, j) => die(roll < 1 ? 1 + (Math.floor(t * 20 + j + 3) % 6) : v, cx + gap + (j - 0.5) * 110, y - lift, 96, -spin * (j ? -1 : 1)))
    if (roll >= 1) {
      text(String(sum(my)), cx - gap, y + 130, { size: 64, display: true, weight: 700, color: C.ink, align: 'center' })
      text(String(sum(them)), cx + gap, y + 130, { size: 64, display: true, weight: 700, color: C.ink, align: 'center' })
    }
    if (swapped) burst(cx - gap - 55, y, t, 8.1, C.mustard, 30)
  })
  // Счёт по центру.
  text(`${mine} : ${theirs}`, cx, top + (V ? 460 : 200), { size: V ? 90 : 110, display: true, weight: 700, color: C.ink, align: 'center', alpha: outCubic(seg(t, 6.3, 6.6)) })
  // Приёмы мастерства - плашками по очереди.
  TEXT.moves.forEach((m, i) => {
    const at = 6.55 + i * 0.5
    const k = outBack(seg(t, at, at + 0.3), 2)
    if (k <= 0) return
    const w = measure(m, { size: 38, weight: 700 }) + 60
    const x = V ? cx - w / 2 : cx - w / 2
    const y = (V ? HEIGHT * 0.73 : top + 300) + i * 78
    ctx.save()
    ctx.globalAlpha = clamp(k)
    ctx.translate(x + w / 2, y)
    ctx.scale(k, k)
    ctx.fillStyle = i === 1 ? C.clay : C.ink
    ctx.fillRect(-w / 2, -48, w, 66)
    ctx.restore()
    text(m, cx, y - 2, { size: 38, weight: 700, color: C.sheet, align: 'center', alpha: clamp(k) })
  })
  // Выигрыш.
  const wk = outBack(seg(t, 8.35, 8.7), 2.4)
  if (wk > 0) {
    const y = V ? HEIGHT * 0.93 : HEIGHT - 70
    text(TEXT.win, cx, y + (1 - wk) * 30, { size: V ? 58 : 64, display: true, weight: 700, color: '#3c6b1f', align: 'center', alpha: clamp(wk) })
  }
}
const sum = (p: [number, number]) => p[0] + p[1]

// ---------- 4. Ставки (9–12) ----------

function stakes(t: number) {
  bgNight(t)
  words(TEXT.stakesTitle, WIDTH / 2, V ? 200 : 120, t, 9.05, { size: V ? 50 : 54, weight: 700, color: C.sheet, align: 'center', spacing: 4 }, 0.08)
  words(TEXT.stakesTitle2, WIDTH / 2, V ? 270 : 190, t, 9.3, { size: V ? 50 : 54, weight: 700, color: C.mustard, align: 'center', spacing: 4 }, 0.08)
  // Лестница: карточки встают снизу вверх, каждая следующая краснее.
  const n = TEXT.stakes.length
  const cw = V ? 760 : 620
  const ch = V ? 120 : 110
  const baseY = V ? HEIGHT * 0.82 : HEIGHT - 110
  const x = V ? WIDTH / 2 - cw / 2 : WIDTH / 2 - cw / 2 - 160
  const colors = ['#e8dcc2', '#ecd06f', '#e0a85a', '#df6c4f', '#a3341c']
  TEXT.stakes.forEach((s, i) => {
    const at = 9.45 + i * 0.42
    const k = outBack(seg(t, at, at + 0.35), 1.8)
    if (k <= 0) return
    const y = baseY - (i + 1) * (ch + 14) + (1 - k) * 60
    const shake = i === n - 1 && t > at + 0.35 ? Math.sin(t * 60) * 4 * (1 - seg(t, at + 0.35, at + 1.1)) : 0
    ctx.save()
    ctx.globalAlpha = clamp(k)
    ctx.fillStyle = colors[i]
    ctx.fillRect(x + shake + i * (V ? 0 : 26), y, cw, ch)
    ctx.restore()
    text(`${i + 1}`, x + shake + i * (V ? 0 : 26) + 40, y + ch * 0.66, { size: 52, display: true, weight: 700, color: i >= 3 ? C.sheet : C.ink, alpha: clamp(k) })
    text(s, x + shake + i * (V ? 0 : 26) + 110, y + ch * 0.66, { size: V ? 54 : 52, weight: 700, color: i >= 3 ? C.sheet : C.ink, alpha: clamp(k) })
  })
  // Шкала азарта: растёт вместе с лестницей.
  const lk = seg(t, 9.4, 11.6)
  const mx = V ? WIDTH / 2 - 380 : WIDTH / 2 + 420
  const my = V ? HEIGHT * 0.86 : baseY - 5 * (ch + 14)
  const mh = V ? 40 : 5 * (ch + 14) - 14
  const mw = V ? 760 : 60
  ctx.fillStyle = C.card
  ctx.fillRect(mx, my, mw, mh)
  ctx.fillStyle = lk > 0.8 ? C.terra : C.mustard
  if (V) ctx.fillRect(mx, my, mw * outCubic(lk), mh)
  else ctx.fillRect(mx, my + mh * (1 - outCubic(lk)), mw, mh * outCubic(lk))
  text(`${TEXT.lust} ${Math.round(outCubic(lk) * 90)}`, V ? WIDTH / 2 : mx + mw / 2, V ? my + mh + 60 : my - 24, { size: 36, weight: 700, color: C.sheet, align: 'center', spacing: 3 })
}

// ---------- 5. Финал (12–15) ----------

function finale(t: number) {
  bgNight(t, true)
  const cy = HEIGHT * (V ? 0.42 : 0.42)
  const k = outBack(seg(t, 12.05, 12.6), 1.6)
  text(TEXT.game, WIDTH / 2, cy + (1 - k) * 40, { size: V ? 120 : 150, display: true, weight: 700, color: C.sheet, align: 'center', alpha: clamp(k) })
  words(TEXT.cta, WIDTH / 2, cy + (V ? 120 : 120), t, 12.6, { size: V ? 64 : 70, italic: true, color: C.mustard, align: 'center' }, 0.09)
  const uk = outCubic(seg(t, 13.2, 13.6))
  const uw = measure(TEXT.url, { size: 50, weight: 700 }) + 80
  ctx.save()
  ctx.globalAlpha = uk
  ctx.fillStyle = C.mustard
  ctx.fillRect(WIDTH / 2 - uw / 2, cy + (V ? 200 : 190), uw, 84)
  ctx.restore()
  text(TEXT.url, WIDTH / 2, cy + (V ? 258 : 248), { size: 50, weight: 700, color: C.ink, align: 'center', alpha: uk })
  // Кости покачиваются по бокам: 6 и 6.
  const s = V ? 140 : 140
  const bob = Math.sin(t * 3) * 10
  die(6, WIDTH / 2 - s * 0.62, cy - (V ? 260 : 250) + bob, s, -0.2, true)
  die(6, WIDTH / 2 + s * 0.62, cy - (V ? 260 : 250) - bob, s, 0.18, true)
  burst(WIDTH / 2, cy, t, 12.15, C.mustard, 60)
}

// ---------- Кадр ----------

const CUTS: [number, (t: number) => void][] = [[0, intro], [2.5, ages], [5.5, duel], [9, stakes], [12, finale]]
const WIPES: [number, string][] = [[2.5, C.terra], [5.5, C.night], [9, C.clay], [12, C.mustard]]

export function renderFrame(t: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  let draw = CUTS[0][1]
  for (const [at, fn] of CUTS) if (t >= at) draw = fn
  draw(t)
  for (const [at, color] of WIPES) wipe(t, at, color)
  const a = Math.max(1 - seg(t, 0, 0.2), seg(t, 14.7, 15))
  if (a > 0) {
    ctx.fillStyle = `rgba(0,0,0,${a})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
}

declare global {
  interface Window {
    renderFrame: (t: number) => void
    promoReady: Promise<void>
  }
}
window.renderFrame = renderFrame
// Шрифт заголовков игры - «Летопись».
document.fonts.add(new FontFace('Thousands Letopis', `url(${letopis})`, { weight: '300 700' }))
window.promoReady = Promise.all([document.fonts.load(`700 40px ${DISPLAY}`), document.fonts.load(`600 40px ${BODY}`), document.fonts.load(`italic 400 40px ${BODY}`)]).then(() => {
  renderFrame(Number(params.get('t') ?? 0))
})
