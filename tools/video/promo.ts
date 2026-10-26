// Промо-ролик «Тысячи жизней» 1920×1080, 20 секунд. Каждый кадр рисуется функцией renderFrame(t) —
// так tools/video/render.cjs снимает ролик покадрово без рывков. Графика — настоящие сцены и портреты игры.
// Сцены (на долях по 0,5 с при 120 ударах в минуту, под музыку tools/video/soundtrack.mjs):
//   0–2    «Одна жизнь»            2–5.5   лотерея рождения: рычаг и три барабана
//   5.5–9.5  жизнь год за годом    9.5–12.5 выбор в событии и его итог
//   12.5–15.5 13 миров             15.5–18  род продолжается      18–20 финальная заставка
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/700.css'
import '@fontsource/pt-serif/400-italic.css'
import { AH, AW, drawAvatar } from '../../src/pixel/avatar'
import type { AvatarInput } from '../../src/pixel/avatar'
import { drawScene, H as SH, W as SW } from '../../src/pixel/scene'
import type { Cast } from '../../src/pixel/scene'
import type { SceneDef } from '../../src/engine/types'
import keyartH from './keyart-horizontal.webp'
import keyartV from './keyart-vertical.webp'

const params = new URLSearchParams(location.search)
/** Вертикальный формат 1080×1920 (?o=v) — для Shorts, Reels и TikTok; у каждой сцены своя раскладка. */
const V = params.get('o') === 'v'
export const WIDTH = V ? 1080 : 1920
export const HEIGHT = V ? 1920 : 1080
export const DURATION = 20

const canvas = document.getElementById('c') as HTMLCanvasElement
canvas.width = WIDTH
canvas.height = HEIGHT
const ctx = canvas.getContext('2d')!

const lang = params.get('lang') === 'ru' ? 'ru' : 'en'
/** Финал английской версии — ключевой арт игры (горизонтальный или вертикальный). */
const KEYART = lang === 'en'

const TEXT = {
  en: {
    one: 'ONE LIFE.',
    anywhere: 'Born anywhere in history.',
    whereBorn: 'Where will you be born?',
    c1: 'BIRTH IS A LOTTERY',
    reelWhere: 'WHERE & WHEN',
    reelFamily: 'FAMILY',
    reelSex: 'BORN A',
    born: 'A girl in a samurai family',
    bornWhere: 'Kyoto, 1185',
    c2: 'LIVE IT YEAR BY YEAR',
    age: 'AGE',
    name: 'Chiyo',
    feed: [
      [3, 'Fever came. Your mother never left your side.'],
      [9, 'Betrothed. Nobody asked you.'],
      [14, 'Married into a house you had never seen.'],
      [22, 'A son is born. You name him Tarō.'],
      [41, 'Famine. Rice for the children first.'],
      [63, 'Grandchildren at your feet.'],
    ] as [number, string][],
    c3: 'EVERY CHOICE SHAPES YOUR FATE',
    evTitle: 'Fire in the capital',
    evText: 'Flames leap from roof to roof. The wind carries sparks toward your house.',
    choiceA: 'Carry out the family scrolls',
    choiceB: 'Grab the children and run',
    chance: (n: number) => `Chance ${n}%`,
    success: 'SUCCESS',
    outcome: 'Everyone got out. The house is ash, but the family is whole.',
    chips: ['Health −5', 'Wealth −300', 'Family +10'],
    c4: '13 WORLDS',
    c4b: 'before the Age of Discovery',
    c5: 'YOUR HEIRS CARRY ON',
    heirs: [
      ['Chiyo', '1185–1257'],
      ['Tarō', '1207–1266'],
      ['Ume', '1236–1301'],
      ['Jirō', '1262–'],
    ],
    family: 'Thousands of lives. One family story.',
    title1: 'THOUSANDS',
    title2: 'OF LIVES',
    tagline: 'Be born. Live. Choose. Leave a legacy.',
    play: 'Play free in your browser',
    regions: {
      rome: 'Rome', babylon: 'Babylon', constantinople: 'Constantinople', kaifeng: 'Kaifeng', kyoto: 'Kyoto', delhi: 'Delhi', baghdad: 'Baghdad',
      paris: 'Paris', novgorod: 'Novgorod', lalibela: 'Lalibela', timbuktu: 'Timbuktu', tikal: 'Tikal', tenochtitlan: 'Tenochtitlan', cusco: 'Cusco', athens: 'Athens',
    } as Record<string, string>,
    classes: ['Slave', 'Peasants', 'Craftsmen', 'Merchants', 'Samurai family', 'Nobility'],
    sexes: ['Boy', 'Girl'],
  },
  ru: {
    one: 'ОДНА ЖИЗНЬ.',
    anywhere: 'Где угодно в истории.',
    whereBorn: 'Где ты родишься?',
    c1: 'РОЖДЕНИЕ — ЛОТЕРЕЯ',
    reelWhere: 'ГДЕ И КОГДА',
    reelFamily: 'СЕМЬЯ',
    reelSex: 'КТО',
    born: 'Девочка из самурайского рода',
    bornWhere: 'Киото, 1185 год',
    c2: 'ЖИВИ ГОД ЗА ГОДОМ',
    age: 'ВОЗРАСТ',
    name: 'Тиё',
    feed: [
      [3, 'Лихорадка. Мать не отходила от тебя ни на шаг.'],
      [9, 'Тебя обручили. Никто не спросил.'],
      [14, 'Свадьба. Дом мужа ты видишь впервые.'],
      [22, 'Родился сын. Ты назвала его Таро.'],
      [41, 'Голод. Рис — сначала детям.'],
      [63, 'Внуки у твоих ног.'],
    ] as [number, string][],
    c3: 'КАЖДЫЙ ВЫБОР МЕНЯЕТ СУДЬБУ',
    evTitle: 'Пожар в столице',
    evText: 'Огонь перескакивает с крыши на крышу. Ветер несёт искры к твоему дому.',
    choiceA: 'Вынести родовые свитки',
    choiceB: 'Схватить детей и бежать',
    chance: (n: number) => `Шанс ${n}%`,
    success: 'УДАЧА',
    outcome: 'Все спаслись. Дом сгорел, но семья цела.',
    chips: ['Здоровье −5', 'Достаток −300', 'Семья +10'],
    c4: '13 МИРОВ',
    c4b: 'до эпохи Великих открытий',
    c5: 'РОД ПРОДОЛЖАЕТСЯ',
    heirs: [
      ['Тиё', '1185–1257'],
      ['Таро', '1207–1266'],
      ['Умэ', '1236–1301'],
      ['Дзиро', '1262–'],
    ],
    family: 'Тысячи жизней. Одна история рода.',
    title1: 'ТЫСЯЧИ',
    title2: 'ЖИЗНЕЙ',
    tagline: 'Родись. Живи. Выбирай. Оставь след.',
    play: 'Играй бесплатно в браузере',
    regions: {
      rome: 'Рим', babylon: 'Вавилон', constantinople: 'Константинополь', kaifeng: 'Кайфын', kyoto: 'Киото', delhi: 'Дели', baghdad: 'Багдад',
      paris: 'Париж', novgorod: 'Новгород', lalibela: 'Лалибела', timbuktu: 'Тимбукту', tikal: 'Тикаль', tenochtitlan: 'Теночтитлан', cusco: 'Куско', athens: 'Афины',
    } as Record<string, string>,
    classes: ['Рабы', 'Крестьяне', 'Ремесленники', 'Купцы', 'Самурайский род', 'Знать'],
    sexes: ['Мальчик', 'Девочка'],
  },
}[lang]

// ---------- Цвета игры ----------

const C = {
  dark: '#1f1914',
  dark2: '#2b2119',
  paper: '#f3ead8',
  paper2: '#ebdfc8',
  card: '#fbf6ec',
  ink: '#2b2119',
  ink2: '#5a4a3b',
  muted: '#7d6b58',
  line: '#d6c6aa',
  accent: '#8e3b22',
  gold: '#d6a649',
  brass: '#a87a2e',
  cream: '#f1d9a6',
  wood: '#5a3420',
  wood2: '#3e2214',
  up: '#3f6b3a',
  down: '#9b3a2a',
}
const SERIF = "'PT Serif', Georgia, serif"

// ---------- Время и сглаживание ----------

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** Доля пройденного отрезка [a, b] в момент t. */
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const outCubic = (k: number) => 1 - (1 - k) ** 3
const inOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const outBack = (k: number, s = 1.7) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2
const outElastic = (k: number) => (k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)

function rng(seed: number) {
  let h = seed >>> 0
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let x = Math.imul(h ^ (h >>> 15), h | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Пиксельная графика игры ----------

const sceneCache = new Map<string, HTMLCanvasElement>()
function scene(region: string, def: SceneDef, seed = 'promo', cast?: Cast): HTMLCanvasElement {
  const key = JSON.stringify([region, def, seed, cast])
  let c = sceneCache.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = SW
    c.height = SH
    drawScene(c.getContext('2d')!, { scene: def, region, seed, cast })
    sceneCache.set(key, c)
  }
  return c
}

const avatarCache = new Map<string, HTMLCanvasElement>()
function avatar(input: AvatarInput): HTMLCanvasElement {
  const key = JSON.stringify(input)
  let c = avatarCache.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = AW
    c.height = AH
    drawAvatar(c.getContext('2d')!, input)
    avatarCache.set(key, c)
  }
  return c
}

/** Пиксельная картинка в увеличении, без сглаживания. */
function blit(img: CanvasImageSource, x: number, y: number, w: number, h: number, alpha = 1) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ---------- Текст ----------

interface TextOpts {
  size: number
  color?: string
  weight?: 400 | 700
  italic?: boolean
  align?: CanvasTextAlign
  alpha?: number
  spacing?: number
  shadow?: string
}

function text(s: string, x: number, y: number, o: TextOpts) {
  ctx.save()
  ctx.globalAlpha *= o.alpha ?? 1
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${o.size}px ${SERIF}`
  ctx.fillStyle = o.color ?? C.ink
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`
  if (o.shadow) {
    ctx.shadowColor = o.shadow
    ctx.shadowBlur = 24
  }
  ctx.fillText(s, x, y)
  ctx.restore()
}

function measure(s: string, o: TextOpts): number {
  ctx.save()
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${o.size}px ${SERIF}`
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`
  const w = ctx.measureText(s).width
  ctx.restore()
  return w
}

/** Буквы по одной: подпрыгивают снизу и проявляются. */
function letters(s: string, cx: number, y: number, t: number, t0: number, o: TextOpts, step = 0.045) {
  const total = measure(s, o)
  let x = cx - total / 2
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    const w = measure(ch, o)
    const k = seg(t, t0 + i * step, t0 + i * step + 0.45)
    if (k > 0) {
      const dy = (1 - outBack(k, 2.2)) * o.size * 0.6
      text(ch, x, y + dy, { ...o, alpha: (o.alpha ?? 1) * clamp(k * 2.5), align: 'left' })
    }
    x += w
  }
}

/** Слова по одному: выезжают снизу. */
function words(s: string, x: number, y: number, t: number, t0: number, o: TextOpts, step = 0.07) {
  const parts = s.split(' ')
  const space = measure(' ', o)
  const total = parts.reduce((sum, p) => sum + measure(p, o), 0) + space * (parts.length - 1)
  let cx = o.align === 'center' ? x - total / 2 : x
  parts.forEach((p, i) => {
    const k = outCubic(seg(t, t0 + i * step, t0 + i * step + 0.4))
    if (k > 0) text(p, cx, y + (1 - k) * 30, { ...o, align: 'left', alpha: (o.alpha ?? 1) * k })
    cx += measure(p, o) + space
  })
}

/** Подпись сцены: номер и заглавные буквы золотом, с полосой. */
function caption(n: string, s: string, t: number, t0: number, dark = false) {
  const k = outCubic(seg(t, t0, t0 + 0.45))
  const x = V ? 60 : 120
  const y = V ? 150 : 112
  ctx.save()
  ctx.globalAlpha = k
  ctx.fillStyle = C.accent
  ctx.fillRect(x, y - 34, 6, 44)
  text(n, x + 26, y, { size: 30, weight: 700, color: dark ? C.gold : C.accent, spacing: 2 })
  ctx.restore()
  words(s, x + 86, y, t, t0 + 0.05, { size: 30, weight: 700, color: dark ? C.cream : C.ink, spacing: 5 }, 0.05)
}

// ---------- Фон и частицы ----------

function bgDark(t: number) {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.55, 100, WIDTH / 2, HEIGHT * 0.55, 1200)
  g.addColorStop(0, '#3a2b1f')
  g.addColorStop(1, C.dark)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  dust(t, C.gold, 0.5)
}

function bgPaper(t: number) {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 200, WIDTH / 2, HEIGHT / 2, 1250)
  g.addColorStop(0, C.card)
  g.addColorStop(0.7, C.paper)
  g.addColorStop(1, '#e3d3b6')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  // Тонкий узор: ряды точек, медленно плывут.
  ctx.fillStyle = 'rgba(168, 122, 46, 0.08)'
  const off = (t * 12) % 48
  for (let y = -48; y < HEIGHT; y += 48) for (let x = -48; x < WIDTH; x += 48) ctx.fillRect(x + off + ((y / 48) % 2) * 24, y + off, 3, 3)
  dust(t, C.brass, 0.25)
}

/** Золотая пыль: детерминирована по времени. */
function dust(t: number, color: string, strength: number) {
  const r = rng(7)
  ctx.save()
  ctx.fillStyle = color
  for (let i = 0; i < 70; i++) {
    const x0 = r() * WIDTH
    const y0 = r() * HEIGHT
    const sp = 10 + r() * 40
    const size = 2 + Math.floor(r() * 3) * 2
    const ph = r() * 6.28
    const y = (((y0 - t * sp) % HEIGHT) + HEIGHT) % HEIGHT
    const x = x0 + Math.sin(t * 0.8 + ph) * 20
    ctx.globalAlpha = strength * (0.35 + 0.65 * Math.abs(Math.sin(t * 2 + ph)))
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()
}

/** Вспышка-частицы из точки (например, при удаче). */
function burst(x: number, y: number, t: number, t0: number, color: string, n = 40) {
  const k = seg(t, t0, t0 + 0.9)
  if (k <= 0 || k >= 1) return
  const r = rng(Math.round(x * 7 + y))
  ctx.save()
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const v = 200 + r() * 420
    const d = outCubic(k) * v
    const s = 4 + Math.floor(r() * 3) * 4
    ctx.globalAlpha = 1 - k
    ctx.fillStyle = i % 3 ? color : C.gold
    ctx.fillRect(x + Math.cos(a) * d - s / 2, y + Math.sin(a) * d - s / 2 + k * k * 120, s, s)
  }
  ctx.restore()
}

// ---------- Переходы ----------

/** Пиксельный переход: квадраты закрывают кадр по диагонали и открывают уже новую сцену. */
function blockWipe(t: number, at: number, color: string) {
  const half = 0.22
  const k = (t - (at - half)) / (half * 2)
  if (k <= 0 || k >= 1) return
  const size = 120
  const cols = WIDTH / size
  const rows = Math.ceil(HEIGHT / size)
  ctx.save()
  ctx.fillStyle = color
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const d = (i + j) / (cols + rows)
      const local = k < 0.5 ? clamp((k * 2 - d * 0.6) / 0.4) : 1 - clamp(((k - 0.5) * 2 - d * 0.6) / 0.4)
      const s = size * local
      if (s > 0.5) ctx.fillRect(i * size + (size - s) / 2, j * size + (size - s) / 2, s + 1, s + 1)
    }
  ctx.restore()
}

// ---------- 1. Одна жизнь (0–2) ----------

function intro(t: number) {
  bgDark(t)
  const push = 1 + seg(t, 1.5, 2.1) ** 2 * 0.25
  ctx.save()
  ctx.translate(WIDTH / 2, HEIGHT / 2)
  ctx.scale(push, push)
  ctx.translate(-WIDTH / 2, -HEIGHT / 2)
  // Пиксельное солнце восходит за надписью.
  const sunK = outCubic(seg(t, 0, 1.2))
  const cy = V ? HEIGHT / 2 - 40 : 440
  const sy = lerp(cy + 320, cy, sunK)
  ctx.fillStyle = 'rgba(214, 166, 73, 0.18)'
  for (let r = 260; r > 120; r -= 28) {
    ctx.globalAlpha = 0.35 * sunK
    pixelDisc(WIDTH / 2, sy, r, 'rgba(214, 166, 73, 0.25)')
  }
  ctx.globalAlpha = sunK
  pixelDisc(WIDTH / 2, sy, 120, '#e8b85a')
  ctx.globalAlpha = 1
  // Горизонт из сцены игры: силуэт города.
  const city = scene('kyoto', { place: 'landmark', time: 'night' }, 'intro')
  const ground = V ? HEIGHT - 520 : 720
  blit(city, (WIDTH - 1920) / 2, ground + (1 - sunK) * 80, 1920, 600, 0.55 * sunK)
  const fade = ctx.createLinearGradient(0, ground - 120, 0, HEIGHT)
  fade.addColorStop(0, 'rgba(31,25,20,0)')
  fade.addColorStop(1, 'rgba(31,25,20,0.95)')
  ctx.fillStyle = fade
  ctx.fillRect(0, ground - 120, WIDTH, HEIGHT - ground + 120)
  letters(TEXT.one, WIDTH / 2, cy + 80, t, 0.25, { size: V ? 150 : 190, weight: 700, color: C.card, spacing: V ? 10 : 14, shadow: 'rgba(0,0,0,0.5)' }, 0.05)
  words(TEXT.anywhere, WIDTH / 2, cy + 200, t, 0.95, { size: V ? 58 : 64, italic: true, color: C.cream, align: 'center' })
  ctx.restore()
}

function pixelDisc(cx: number, cy: number, r: number, color: string) {
  const step = 12
  ctx.fillStyle = color
  for (let y = -r; y < r; y += step) {
    const w = Math.sqrt(Math.max(0, r * r - (y + step / 2) ** 2))
    const ww = Math.round(w / step) * step
    ctx.fillRect(cx - ww, cy + y, ww * 2, step)
  }
}

// ---------- 2. Лотерея рождения (2–5.5) ----------

interface ReelItem {
  top: string
  bottom?: string
  icon?: HTMLCanvasElement
}

const WHERE: [string, string][] = [
  ['rome', '44 BC'], ['baghdad', '905'], ['tenochtitlan', '1480'], ['paris', '1250'], ['timbuktu', '1330'], ['constantinople', '1050'],
  ['novgorod', '1200'], ['cusco', '1500'], ['delhi', '1300'], ['babylon', '1750 BC'], ['tikal', '700'], ['kaifeng', '1100'], ['lalibela', '1200'], ['kyoto', '1185'],
]

function reelItems(): ReelItem[][] {
  const where: ReelItem[] = []
  for (let i = 0; i < 30; i++) {
    const [r, y] = WHERE[i % WHERE.length]
    where.push({ top: TEXT.regions[r], bottom: lang === 'ru' ? y.replace('BC', 'до н.э.') : y })
  }
  where.push({ top: TEXT.regions.kyoto, bottom: '1185' })
  const cls = ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']
  const family: ReelItem[] = []
  for (let i = 0; i < 34; i++) {
    const k = i % cls.length
    family.push({ top: TEXT.classes[k], icon: avatar({ region: 'kyoto', sex: i % 2 ? 'f' : 'm', age: 30, seed: `cls${i}`, cls: cls[k] }) })
  }
  family.push({ top: TEXT.classes[4], icon: avatar({ region: 'kyoto', sex: 'f', age: 30, seed: 'clsfinal', cls: 'landowner' }) })
  const sex: ReelItem[] = []
  for (let i = 0; i < 40; i++) sex.push({ top: TEXT.sexes[i % 2], icon: avatar({ region: 'kyoto', sex: i % 2 ? 'f' : 'm', age: 6, seed: `sx${i}`, cls: 'landowner' }) })
  sex.push({ top: TEXT.sexes[1], icon: avatar({ region: 'kyoto', sex: 'f', age: 6, seed: 'chiyo', cls: 'landowner' }) })
  return [where, family, sex]
}
let REELS: ReelItem[][] | null = null

const SPIN_START = 2.42
const STOPS = [3.55, 4.05, 4.55]

function lottery(t: number) {
  bgPaper(t)
  REELS ??= reelItems()
  caption('01', TEXT.c1, t, 2.1)
  // Автомат въезжает снизу, после выигрыша приподнимается, освобождая место итогу.
  const enter = outBack(seg(t, 2.0, 2.45), 1.2)
  const lift = inOutCubic(seg(t, 4.75, 5.1))
  // В вертикальном кадре — над автоматом крупный вопрос.
  if (V) words(TEXT.whereBorn, WIDTH / 2, 520, t, 2.15, { size: 76, weight: 700, color: C.ink, align: 'center' })
  const mx = 230
  const mw = 1460
  const target = V ? 940 - 320 : 200
  const my = lerp(HEIGHT + 200, target, enter) - lift * 40
  const mh = 640
  const scale = (1 - lift * 0.08) * (V ? 0.7 : 1)
  ctx.save()
  ctx.translate(WIDTH / 2, my + mh / 2)
  ctx.scale(scale, scale)
  ctx.translate(-960, -(my + mh / 2))
  // Корпус: дерево и латунь, как в игре.
  ctx.save()
  ctx.shadowColor = 'rgba(43,33,25,0.45)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 20
  const wood = ctx.createLinearGradient(0, my, 0, my + mh)
  wood.addColorStop(0, C.wood)
  wood.addColorStop(1, C.wood2)
  ctx.fillStyle = wood
  roundRect(mx, my, mw, mh, 48)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = C.brass
  ctx.lineWidth = 8
  roundRect(mx + 12, my + 12, mw - 24, mh - 24, 40)
  ctx.stroke()
  // Огоньки: бегут, пока крутятся барабаны, после — горят все.
  const spinning = t > SPIN_START && t < STOPS[2]
  const won = t >= STOPS[2]
  for (let i = 0; i < 16; i++) {
    const lx = mx + 70 + i * ((mw - 260) / 15)
    const on = won ? 1 : spinning ? (Math.floor(t * 12) + i) % 4 === 0 : 0
    ctx.fillStyle = on ? '#ffd56a' : '#7a5a2a'
    ctx.save()
    if (on) {
      ctx.shadowColor = '#ffcf4d'
      ctx.shadowBlur = 20
    }
    ctx.beginPath()
    ctx.arc(lx, my + 52, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // Барабаны.
  const labels = [TEXT.reelWhere, TEXT.reelFamily, TEXT.reelSex]
  const weights = [1.1, 1.2, 1.0]
  const area = mw - 260
  const gap = 22
  const unit = (area - gap * 2) / weights.reduce((a, b) => a + b, 0)
  let rx = mx + 50
  const wy = my + 150
  const wh = 420
  const row = 180
  for (let i = 0; i < 3; i++) {
    const rw = unit * weights[i]
    text(labels[i], rx + rw / 2, wy - 22, { size: 26, weight: 700, color: C.cream, align: 'center', spacing: 4 })
    drawReel(REELS[i], rx, wy, rw, wh, row, t, i)
    rx += rw + gap
  }
  drawLever(mx + mw - 150, my + 120, t)
  ctx.restore()
  // Итог лотереи.
  const res = outBack(seg(t, 4.85, 5.25), 1.4)
  if (res > 0) {
    const bw = V ? 960 : 1100
    const by = lerp(HEIGHT + 20, V ? 1300 : 870, res)
    ctx.save()
    ctx.shadowColor = 'rgba(43,33,25,0.3)'
    ctx.shadowBlur = 30
    ctx.fillStyle = C.accent
    roundRect(WIDTH / 2 - bw / 2, by, bw, 130, 65)
    ctx.fill()
    ctx.restore()
    text(TEXT.born, WIDTH / 2, by + 64, { size: 48, weight: 700, color: C.card, align: 'center' })
    text(TEXT.bornWhere, WIDTH / 2, by + 108, { size: 32, italic: true, color: C.cream, align: 'center' })
  }
}

function drawReel(items: ReelItem[], x: number, y: number, w: number, h: number, row: number, t: number, idx: number) {
  const final = items.length - 1
  const stop = STOPS[idx]
  // Положение в строках: разгон, бег, торможение с отскоком.
  let pos = 0
  let speed = 0
  if (t > SPIN_START) {
    const k = seg(t, SPIN_START, stop)
    const e = k < 1 ? outBack(k, 0.9) : 1
    pos = final * e
    const k2 = seg(t + 1 / 60, SPIN_START, stop)
    speed = Math.abs(final * (k2 < 1 ? outBack(k2, 0.9) : 1) - pos) * 60
  }
  const stopped = t >= stop
  ctx.save()
  roundRect(x, y, w, h, 22)
  ctx.clip()
  const bg = ctx.createLinearGradient(0, y, 0, y + h)
  bg.addColorStop(0, '#e2d2b2')
  bg.addColorStop(0.3, C.card)
  bg.addColorStop(0.7, C.card)
  bg.addColorStop(1, '#e2d2b2')
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  const center = y + h / 2
  const base = Math.floor(pos)
  const frac = pos - base
  const blur = clamp(speed / 30)
  for (let k = -2; k <= 2; k++) {
    const i = base + k
    if (i < 0 || i > final) continue
    const cy = center + (k - frac) * row
    const it = items[i]
    const win = stopped && i === final
    const ghosts = blur > 0.15 ? 4 : 1
    for (let gI = 0; gI < ghosts; gI++) {
      const off = ghosts > 1 ? (gI - (ghosts - 1) / 2) * blur * 26 : 0
      const a = ghosts > 1 ? 0.32 : 1
      drawReelItem(it, x, cy + off, w, row, a, win, t - stop)
    }
  }
  // Затенение краёв окна и рамка выигрышной строки.
  const sh = ctx.createLinearGradient(0, y, 0, y + h)
  sh.addColorStop(0, 'rgba(43,33,25,0.55)')
  sh.addColorStop(0.25, 'rgba(43,33,25,0)')
  sh.addColorStop(0.75, 'rgba(43,33,25,0)')
  sh.addColorStop(1, 'rgba(43,33,25,0.55)')
  ctx.fillStyle = sh
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = stopped ? C.accent : 'rgba(142,59,34,0.35)'
  ctx.lineWidth = stopped ? 6 : 3
  if (stopped) {
    ctx.shadowColor = 'rgba(214,166,73,0.9)'
    ctx.shadowBlur = 24 * (1 - seg(t, stop + 0.3, stop + 1.2) * 0.6)
  }
  ctx.strokeRect(x + 6, center - row / 2, w - 12, row)
  ctx.restore()
  ctx.strokeStyle = C.brass
  ctx.lineWidth = 6
  roundRect(x, y, w, h, 22)
  ctx.stroke()
  if (stopped) burst(x + w / 2, center, t, stop, C.accent, 26)
}

function drawReelItem(it: ReelItem, x: number, cy: number, w: number, row: number, alpha: number, win: boolean, since: number) {
  const pop = win ? 1 + 0.1 * outElastic(clamp(since / 0.7)) : 1
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.translate(x + w / 2, cy)
  ctx.scale(pop, pop)
  const color = win ? C.accent : C.ink
  if (it.icon) {
    blit(it.icon, -w / 2 + 26, -60, 96, 120)
    // Надпись целиком в окне барабана: сначала чуть мельче, потом — в две строки.
    const avail = w - 162
    let size = 40
    while (size > 32 && measure(it.top, { size, weight: 700 }) > avail) size -= 2
    const space = it.top.lastIndexOf(' ')
    if (measure(it.top, { size, weight: 700 }) > avail && space > 0) {
      text(it.top.slice(0, space), -w / 2 + 138, -6, { size: 34, weight: 700, color })
      text(it.top.slice(space + 1), -w / 2 + 138, 34, { size: 34, weight: 700, color })
    } else text(it.top, -w / 2 + 138, 14, { size, weight: 700, color })
  } else {
    text(it.top, 0, it.bottom ? -2 : 14, { size: 50, weight: 700, color, align: 'center' })
    if (it.bottom) text(it.bottom, 0, 44, { size: 32, color: C.muted, align: 'center' })
  }
  ctx.restore()
}

function drawLever(x: number, y: number, t: number) {
  // Рычаг: рывок вниз и пружинный возврат.
  const down = seg(t, 2.18, 2.42)
  const back = seg(t, 2.42, 3.0)
  const angle = t < 2.42 ? outCubic(down) * 1.15 : 1.15 * (1 - outElastic(back))
  ctx.fillStyle = C.brass
  roundRect(x + 10, y + 330, 76, 120, 18)
  ctx.fill()
  ctx.save()
  ctx.translate(x + 48, y + 350)
  ctx.scale(1, Math.cos(angle))
  const rod = ctx.createLinearGradient(-9, 0, 9, 0)
  rod.addColorStop(0, '#9aa0a6')
  rod.addColorStop(0.5, '#e6e9ec')
  rod.addColorStop(1, '#9aa0a6')
  ctx.fillStyle = rod
  ctx.fillRect(-9, -280, 18, 280)
  const knob = ctx.createRadialGradient(-12, -300, 6, 0, -290, 46)
  knob.addColorStop(0, '#ff8a6a')
  knob.addColorStop(0.6, '#c0331c')
  knob.addColorStop(1, '#7a1d0e')
  ctx.fillStyle = knob
  ctx.beginPath()
  ctx.arc(0, -290, 40, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------- 3. Жизнь год за годом (5.5–9.5) ----------

const LIFE_T0 = 5.75
const LIFE_T1 = 9.1
const LIFE_AGE = 72

function lifeAge(t: number) {
  return Math.round(LIFE_AGE * inOutCubic(seg(t, LIFE_T0, LIFE_T1)) * 0.98 + seg(t, LIFE_T0, LIFE_T1) * LIFE_AGE * 0.02)
}

function heroLook(age: number): AvatarInput {
  const famine = age >= 40 && age <= 46
  return { region: 'kyoto', sex: 'f', age, seed: 'chiyo', cls: 'landowner', body: famine ? -3 : age > 50 ? 1 : age > 14 ? 0.5 : 0, married: age >= 14, happiness: famine ? 20 : 70 }
}

function life(t: number) {
  bgPaper(t)
  caption('02', TEXT.c2, t, 5.6)
  const age = lifeAge(t)
  const year = 1185 + age
  const zoom = 1 + seg(t, 5.5, 9.5) * 0.03
  ctx.save()
  ctx.translate(WIDTH / 2, HEIGHT / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-WIDTH / 2, -HEIGHT / 2)
  // Портрет героини.
  const enter = outBack(seg(t, 5.55, 6.0), 1.3)
  const px = lerp(-500, V ? 60 : 140, enter)
  const py = V ? 560 : 190
  ctx.save()
  ctx.shadowColor = 'rgba(43,33,25,0.3)'
  ctx.shadowBlur = 40
  ctx.fillStyle = C.card
  roundRect(px, py, 420, 720, 28)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 3
  roundRect(px, py, 420, 720, 28)
  ctx.stroke()
  // Смена стадии — короткий «вдох» портрета.
  const stages = [0, 2, 5, 12, 17, 58]
  const lastStage = Math.max(...stages.filter((s) => s <= age))
  const tStage = stageTime(lastStage)
  const pop = 1 + 0.06 * (1 - outCubic(seg(t, tStage, tStage + 0.25)))
  ctx.save()
  ctx.translate(px + 210, py + 255)
  ctx.scale(pop, pop)
  blit(avatar(heroLook(age)), -176, -220, 352, 440)
  ctx.restore()
  text(TEXT.name, px + 210, py + 535, { size: 52, weight: 700, color: C.ink, align: 'center' })
  // Здоровье: шкала под именем.
  const health = clamp((age < 40 ? 85 : age <= 46 ? 52 : 70 - (age - 46) * 0.9) / 100)
  ctx.fillStyle = C.paper2
  roundRect(px + 60, py + 566, 300, 10, 5)
  ctx.fill()
  ctx.fillStyle = C.brass
  roundRect(px + 60, py + 566, 300 * health, 10, 5)
  ctx.fill()
  text(TEXT.age, px + 60, py + 625, { size: 24, weight: 700, color: C.muted, spacing: 4 })
  text(String(age), px + 60, py + 692, { size: 76, weight: 700, color: C.accent })
  text(String(year), px + 360, py + 692, { size: 44, color: C.ink2, align: 'right' })
  // Сцена: дом героини, время суток меняется вместе с годами.
  const times = ['dawn', 'day', 'sunset', 'night', 'day'] as const
  const ti = Math.floor(age / 15) % times.length
  const cast: Cast = {
    members: [{ role: 'hero', sex: 'f', age, seed: 'chiyo' }, ...(age >= 14 ? [{ role: 'spouse' as const, sex: 'm' as const, age: age + 6, seed: 'husband' }] : []), ...(age >= 22 ? [{ role: 'child' as const, sex: 'm' as const, age: age - 22, seed: 'taro' }] : [])],
    animals: ['chickens', 'dog'],
    home: 3,
  }
  const sEnter = outCubic(seg(t, 5.65, 6.15))
  const sx = lerp(WIDTH + 80, V ? 60 : 640, sEnter)
  const [sy, swd, sht] = V ? [210, 960, 300] : [190, 1152, 360]
  ctx.save()
  roundRect(sx, sy, swd, sht, 28)
  ctx.clip()
  blit(scene('kyoto', { place: 'yard', time: times[ti], props: [times[ti] === 'night' ? 'moon' : 'sun'] }, 'home', cast), sx, sy, swd, sht)
  ctx.restore()
  if (V) lifeline(t, age)
  // Лента жизни: записи появляются по возрасту, новые сверху.
  const shown = TEXT.feed.filter(([a]) => a <= age)
  const visible = shown.slice(-3).reverse()
  visible.forEach(([a, s], i) => {
    const tA = ageTime(a)
    const k = outBack(seg(t, tA, tA + 0.35), 1.4)
    if (V) return feedCardV(a, s, i, k)
    const cy = 590 + i * 112
    const cx = lerp(1900, 640, k)
    ctx.save()
    ctx.globalAlpha = i === 0 ? 1 : 0.85 - i * 0.2
    ctx.fillStyle = i === 0 ? C.card : C.paper
    ctx.shadowColor = 'rgba(43,33,25,0.18)'
    ctx.shadowBlur = i === 0 ? 24 : 0
    roundRect(cx, cy, 1152, 92, 18)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = i === 0 ? C.accent : C.line
    ctx.fillRect(cx, cy + 14, 8, 64)
    text(ageLabel(a), cx + 40, cy + 58, { size: 30, weight: 700, color: C.brass })
    text(s, cx + 200, cy + 58, { size: 36, color: C.ink })
    ctx.restore()
  })
  ctx.restore()
}

const ageLabel = (a: number) => (lang === 'ru' ? `${a} ${a % 10 === 1 && a !== 11 ? 'год' : a % 10 >= 2 && a % 10 <= 4 && (a < 12 || a > 14) ? 'года' : 'лет'}` : `Age ${a}`)

/** Вертикальный кадр: запись ленты — карточка справа от портрета, текст в несколько строк. */
function feedCardV(a: number, s: string, i: number, k: number) {
  const cx = lerp(WIDTH + 40, 520, k)
  const cy = 560 + i * 245
  ctx.save()
  ctx.globalAlpha = i === 0 ? 1 : 0.85 - i * 0.2
  ctx.fillStyle = i === 0 ? C.card : C.paper
  ctx.shadowColor = 'rgba(43,33,25,0.18)'
  ctx.shadowBlur = i === 0 ? 24 : 0
  roundRect(cx, cy, 500, 220, 18)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = i === 0 ? C.accent : C.line
  ctx.fillRect(cx, cy + 18, 8, 184)
  text(ageLabel(a), cx + 36, cy + 54, { size: 30, weight: 700, color: C.brass })
  wrapText(s, cx + 36, cy + 102, 430, 34, C.ink, 44)
  ctx.restore()
}

/** Вертикальный кадр: шкала жизни 1185 → 1257 с отметками событий и бегущим годом. */
function lifeline(t: number, age: number) {
  const k = outCubic(seg(t, 5.8, 6.3))
  if (k <= 0) return
  const x0 = 100
  const x1 = WIDTH - 100
  const y = 1560
  ctx.save()
  ctx.globalAlpha = k
  ctx.strokeStyle = C.line
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x1, y)
  ctx.stroke()
  const at = (a: number) => lerp(x0, x1, a / LIFE_AGE)
  ctx.strokeStyle = C.gold
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(at(age), y)
  ctx.stroke()
  for (const [a] of TEXT.feed) {
    const on = a <= age
    ctx.fillStyle = on ? C.accent : C.line
    ctx.beginPath()
    ctx.arc(at(a), y, on ? 16 : 11, 0, Math.PI * 2)
    ctx.fill()
  }
  // Бегунок с текущим годом.
  const mx = at(age)
  ctx.fillStyle = C.card
  ctx.strokeStyle = C.accent
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(mx, y, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  text(String(1185 + age), mx, y - 60, { size: 64, weight: 700, color: C.accent, align: 'center' })
  text('1185', x0, y + 80, { size: 40, color: C.muted, align: 'left' })
  text('1257', x1, y + 80, { size: 40, color: C.muted, align: 'right' })
  ctx.restore()
}

/** Когда героине исполняется age лет (обратная функция lifeAge). */
function ageTime(age: number): number {
  let lo = LIFE_T0
  let hi = LIFE_T1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (lifeAge(mid) < age) lo = mid
    else hi = mid
  }
  return hi
}
const stageTime = (age: number) => (age === 0 ? LIFE_T0 : ageTime(age))

// ---------- 4. Выбор (9.5–12.5) ----------

function choice(t: number) {
  // Фон: жизнь остаётся за затемнением.
  bgPaper(t)
  ctx.fillStyle = 'rgba(43,33,25,0.55)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  caption('03', TEXT.c3, t, 9.6, true)
  const enter = outBack(seg(t, 9.55, 10.0), 1.2)
  const cw = 1000
  const ch = 780
  const cx = WIDTH / 2 - cw / 2
  const cy = lerp(HEIGHT + 120, V ? 560 : 190, enter)
  // Переворот карточки на итог.
  const flip = seg(t, 11.15, 11.45)
  const sy = flip < 0.5 ? 1 - flip * 2 : (flip - 0.5) * 2
  const result = flip >= 0.5
  ctx.save()
  ctx.translate(WIDTH / 2, cy + ch / 2)
  ctx.scale(1, Math.max(0.02, sy))
  ctx.translate(-WIDTH / 2, -(cy + ch / 2))
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 60
  ctx.fillStyle = C.card
  roundRect(cx, cy, cw, ch, 32)
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(cx, cy, cw, ch, 32)
  ctx.clip()
  // Картинка события: пожар, отсветы огня мерцают.
  blit(scene('kyoto', { place: 'street', time: 'night', disaster: 'fire', props: ['fire', 'smoke'] }, 'fire'), cx, cy, cw, 312)
  ctx.fillStyle = `rgba(255, 120, 40, ${0.08 + 0.08 * Math.abs(Math.sin(t * 13)) + 0.05 * Math.abs(Math.sin(t * 29))})`
  ctx.fillRect(cx, cy, cw, 312)
  ctx.restore()
  if (!result) {
    text(TEXT.evTitle, cx + 60, cy + 400, { size: 58, weight: 700, color: C.ink })
    wrapText(TEXT.evText, cx + 60, cy + 456, cw - 120, 34, C.ink2, 44)
    const pressed = t > 10.85 && t < 11.05
    button(cx + 60, cy + 540, cw - 120, TEXT.choiceA, TEXT.chance(45), false, false)
    button(cx + 60, cy + 650, cw - 120, TEXT.choiceB, TEXT.chance(80), t > 10.85, pressed)
  } else {
    text(TEXT.success, cx + 60, cy + 400, { size: 40, weight: 700, color: C.up, spacing: 6 })
    wrapText(TEXT.outcome, cx + 60, cy + 462, cw - 120, 40, C.ink, 52)
    let chipX = cx + 60
    TEXT.chips.forEach((c, i) => {
      const w = measure(c, { size: 32, weight: 700 }) + 56
      const x = chipX
      chipX += w + 24
      const k = outBack(seg(t, 11.5 + i * 0.12, 11.85 + i * 0.12), 2)
      if (k <= 0) return
      ctx.save()
      ctx.translate(x + w / 2, cy + 640)
      ctx.scale(k, k)
      ctx.strokeStyle = i === 2 ? C.up : C.down
      ctx.lineWidth = 3
      roundRect(-w / 2, -36, w, 72, 36)
      ctx.stroke()
      text(c, 0, 12, { size: 32, weight: 700, color: i === 2 ? C.up : C.down, align: 'center' })
      ctx.restore()
    })
  }
  ctx.restore()
  burst(WIDTH / 2, cy + 400, t, 11.45, C.up, 60)
  // Курсор игрока.
  const mv = inOutCubic(seg(t, 10.15, 10.8))
  const tx = cx + cw - 220
  const ty = cy + 700
  const curX = lerp(WIDTH - 220, tx, mv)
  const curY = lerp(HEIGHT - 80, ty, mv)
  const click = t > 10.85 && t < 11.05 ? 0.85 : 1
  if (t > 10.0 && t < 11.3) cursor(curX, curY, click)
  if (t > 10.85) ripple(tx, ty, t, 10.85)
}

function button(x: number, y: number, w: number, label: string, chip: string, hot: boolean, pressed: boolean) {
  ctx.save()
  const s = pressed ? 0.97 : 1
  ctx.translate(x + w / 2, y + 45)
  ctx.scale(s, s)
  ctx.fillStyle = hot ? '#f6e6d2' : C.card
  ctx.strokeStyle = hot ? C.accent : C.line
  ctx.lineWidth = hot ? 5 : 3
  roundRect(-w / 2, -45, w, 90, 18)
  ctx.fill()
  ctx.stroke()
  text(label, -w / 2 + 36, 13, { size: 36, weight: 700, color: C.ink })
  const cw = measure(chip, { size: 26 }) + 36
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  roundRect(w / 2 - cw - 26, -22, cw, 44, 22)
  ctx.stroke()
  text(chip, w / 2 - cw / 2 - 26, 10, { size: 26, color: C.muted, align: 'center' })
  ctx.restore()
}

function wrapText(s: string, x: number, y: number, maxW: number, size: number, color: string, lh: number) {
  const parts = s.split(' ')
  let line = ''
  let yy = y
  for (const p of parts) {
    const test = line ? `${line} ${p}` : p
    if (measure(test, { size }) > maxW && line) {
      text(line, x, yy, { size, color })
      line = p
      yy += lh
    } else line = test
  }
  if (line) text(line, x, yy, { size, color })
}

function cursor(x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s * 1.6, s * 1.6)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 34)
  ctx.lineTo(9, 26)
  ctx.lineTo(16, 41)
  ctx.lineTo(22, 38)
  ctx.lineTo(15, 23)
  ctx.lineTo(27, 23)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 2.5
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 10
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function ripple(x: number, y: number, t: number, t0: number) {
  const k = seg(t, t0, t0 + 0.5)
  if (k >= 1) return
  ctx.save()
  ctx.strokeStyle = C.accent
  ctx.globalAlpha = 1 - k
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(x, y, 20 + k * 90, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// ---------- 5. 13 миров (12.5–15.5) ----------

const WORLDS: [string, string, 'm' | 'f'][] = [
  ['rome', 'E03', 'm'], ['babylon', 'ANE', 'f'], ['constantinople', 'BYZ', 'm'], ['kaifeng', 'CHN', 'f'], ['kyoto', 'JPN', 'm'], ['delhi', 'IND', 'f'], ['baghdad', 'ISL', 'm'],
  ['paris', 'EUR', 'f'], ['novgorod', 'RUS', 'm'], ['lalibela', 'ETH', 'f'], ['timbuktu', 'WAF', 'm'], ['tikal', 'MAY', 'f'], ['tenochtitlan', 'AMR', 'm'],
]

function worlds(t: number) {
  bgDark(t)
  // Заголовок.
  const k = outBack(seg(t, 12.55, 12.95), 1.6)
  ctx.save()
  ctx.translate(WIDTH / 2, V ? 300 : 190)
  ctx.scale(k, k)
  text(TEXT.c4, 0, 30, { size: 130, weight: 700, color: C.card, align: 'center', spacing: 8, shadow: 'rgba(214,166,73,0.45)' })
  ctx.restore()
  words(TEXT.c4b, WIDTH / 2, V ? 410 : 290, t, 12.8, { size: 46, italic: true, color: C.cream, align: 'center' })
  // Две ленты сцен навстречу друг другу.
  const local = t - 12.5
  const tileW = 576
  const tileH = 180
  const gap = 36
  const rowA = WORLDS.slice(0, 7)
  const rowB = WORLDS.slice(6)
  const drawRow = (list: typeof WORLDS, y: number, dir: number, delay: number) => {
    const total = list.length * (tileW + gap)
    const speed = 520
    const start = dir < 0 ? (V ? 60 : 200) : WIDTH - total - (V ? 60 : 200)
    const x0 = start + dir * speed * local
    list.forEach(([region], i) => {
      const x = x0 + i * (tileW + gap)
      const appear = outCubic(seg(t, 12.6 + delay + i * 0.06, 13.0 + delay + i * 0.06))
      if (appear <= 0) return
      ctx.save()
      ctx.globalAlpha = appear
      ctx.translate(x + tileW / 2, y + tileH / 2 + (1 - appear) * 60)
      ctx.scale(0.85 + 0.15 * appear, 0.85 + 0.15 * appear)
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 30
      ctx.fillStyle = C.dark2
      roundRect(-tileW / 2 - 8, -tileH / 2 - 8, tileW + 16, tileH + 70, 20)
      ctx.fill()
      ctx.shadowBlur = 0
      blit(scene(region, { place: 'landmark', time: i % 3 === 1 ? 'sunset' : i % 3 === 2 ? 'dawn' : 'day' }, `w${region}`), -tileW / 2, -tileH / 2, tileW, tileH)
      text(TEXT.regions[region], -tileW / 2 + 18, tileH / 2 + 46, { size: 34, weight: 700, color: C.cream })
      ctx.restore()
    })
  }
  if (V) {
    // Вертикальный кадр: три ленты по 5, 4 и 4 города.
    drawRow(WORLDS.slice(0, 5), 520, -1, 0)
    drawRow(WORLDS.slice(5, 9), 800, 1, 0.1)
    drawRow(WORLDS.slice(9), 1080, -1, 0.2)
  } else {
    drawRow(rowA, 380, -1, 0)
    drawRow(rowB, 650, 1, 0.15)
  }
  // Люди тринадцати миров: портреты в местной одежде (в вертикальном кадре — два ряда).
  const aw = 96
  const ag = V ? 44 : 34
  const perRow = V ? 7 : WORLDS.length
  WORLDS.forEach(([region, , sex], i) => {
    const kk = outBack(seg(t, 13.5 + i * 0.07, 13.85 + i * 0.07), 2)
    if (kk <= 0) return
    const r = Math.floor(i / perRow)
    const inRow = Math.min(perRow, WORLDS.length - r * perRow)
    const ax0 = WIDTH / 2 - (inRow * aw + (inRow - 1) * ag) / 2
    const x = ax0 + (i % perRow) * (aw + ag)
    ctx.save()
    ctx.translate(x + aw / 2, V ? 1530 + r * 190 : 1030)
    ctx.scale(kk, kk)
    blit(avatar({ region, sex, age: 32, seed: `world${region}`, cls: i % 3 ? 'craftsman' : 'noble', married: true, happiness: 70 }), -aw / 2, -120, aw, 120)
    ctx.restore()
  })
}

// ---------- 6. Род (15.5–18) ----------

function lineage(t: number) {
  bgPaper(t)
  caption('04', TEXT.c5, t, 15.6)
  const lineK = inOutCubic(seg(t, 15.7, 17.1))
  const ly = 700
  const x0 = 260
  const x1 = 1660
  ctx.strokeStyle = C.gold
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  // Вертикальный кадр: линия рода идёт сверху вниз, поколения — по очереди слева и справа.
  if (V) {
    ctx.moveTo(WIDTH / 2, 330)
    ctx.lineTo(WIDTH / 2, lerp(330, 1640, lineK))
  } else {
    ctx.moveTo(x0, ly)
    ctx.lineTo(lerp(x0, x1, lineK), ly)
  }
  ctx.stroke()
  const xs = [330, 750, 1170, 1590]
  const appear = [15.75, 16.15, 16.55, 16.95]
  const people: AvatarInput[] = [
    { region: 'kyoto', sex: 'f', age: 70, seed: 'chiyo', cls: 'landowner', married: true, body: 1 },
    { region: 'kyoto', sex: 'm', age: 55, seed: 'taro', cls: 'landowner', married: true },
    { region: 'kyoto', sex: 'f', age: 60, seed: 'ume', cls: 'landowner', married: true },
    { region: 'kyoto', sex: 'm', age: 26, seed: 'jiro', cls: 'landowner', married: true, happiness: 80 },
  ]
  xs.forEach((x, i) => {
    const k = outBack(seg(t, appear[i], appear[i] + 0.4), 1.8)
    if (k <= 0) return
    // Ушедшие поколения седеют, когда появляется следующее.
    const dead = i < 3 && t > appear[i + 1] + 0.1
    if (V) return heirV(i, k, dead, people[i])
    ctx.save()
    ctx.translate(x, ly)
    ctx.scale(k, k)
    ctx.fillStyle = dead ? C.paper2 : C.card
    ctx.strokeStyle = dead ? C.line : C.accent
    ctx.lineWidth = 5
    ctx.save()
    if (!dead) {
      ctx.shadowColor = 'rgba(214,166,73,0.7)'
      ctx.shadowBlur = 30
    }
    roundRect(-120, -360, 240, 300, 24)
    ctx.fill()
    ctx.restore()
    roundRect(-120, -360, 240, 300, 24)
    ctx.stroke()
    blit(avatar({ ...people[i], dead }), -96, -340, 192, 240)
    ctx.fillStyle = dead ? C.muted : C.accent
    ctx.beginPath()
    ctx.arc(0, 0, 18, 0, Math.PI * 2)
    ctx.fill()
    text(TEXT.heirs[i][0], 0, 80, { size: 44, weight: 700, color: dead ? C.muted : C.ink, align: 'center' })
    text(TEXT.heirs[i][1], 0, 128, { size: 32, color: C.muted, align: 'center' })
    ctx.restore()
  })
  words(TEXT.family, WIDTH / 2, V ? 1800 : 1000, t, 17.15, { size: V ? 50 : 54, italic: true, color: C.ink, align: 'center' })
}

/** Вертикальный кадр: поколение i — карточка с портретом сбоку от линии рода, имя и годы — с другой стороны. */
function heirV(i: number, k: number, dead: boolean, look: AvatarInput) {
  const y = 470 + i * 330
  const left = i % 2 === 0
  const cardX = left ? 290 : WIDTH - 290
  ctx.save()
  ctx.globalAlpha = clamp(k * 1.5)
  ctx.strokeStyle = dead ? C.line : C.gold
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2, y)
  ctx.lineTo(left ? cardX + 120 : cardX - 120, y)
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.translate(cardX, y)
  ctx.scale(k, k)
  ctx.save()
  if (!dead) {
    ctx.shadowColor = 'rgba(214,166,73,0.7)'
    ctx.shadowBlur = 30
  }
  ctx.fillStyle = dead ? C.paper2 : C.card
  roundRect(-120, -150, 240, 300, 24)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = dead ? C.line : C.accent
  ctx.lineWidth = 5
  roundRect(-120, -150, 240, 300, 24)
  ctx.stroke()
  blit(avatar({ ...look, dead }), -96, -130, 192, 240)
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = clamp(k)
  ctx.fillStyle = dead ? C.muted : C.accent
  ctx.beginPath()
  ctx.arc(WIDTH / 2, y, 20, 0, Math.PI * 2)
  ctx.fill()
  const tx = left ? WIDTH / 2 + 50 : WIDTH / 2 - 50
  const align = left ? 'left' : 'right'
  text(TEXT.heirs[i][0], tx, y - 6, { size: 52, weight: 700, color: dead ? C.muted : C.ink, align })
  text(TEXT.heirs[i][1], tx, y + 46, { size: 36, color: C.muted, align })
  ctx.restore()
}

// ---------- 7. Финал (18–20) ----------

function finale(t: number) {
  bgDark(t)
  // Панорама города медленно плывёт за заголовком.
  const pan = (t - 18) * 40
  const city = scene('kyoto', { place: 'landmark', time: 'sunset', props: ['sun'] }, 'finale')
  blit(city, -760 - pan, 0, 3456, 1080, 0.35)
  const fade = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  fade.addColorStop(0, 'rgba(31,25,20,0.95)')
  fade.addColorStop(0.45, 'rgba(31,25,20,0.55)')
  fade.addColorStop(1, 'rgba(31,25,20,0.95)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  letters(TEXT.title1, WIDTH / 2, 430, t, 18.05, { size: 170, weight: 700, color: C.card, spacing: 12, shadow: 'rgba(214,166,73,0.5)' }, 0.04)
  letters(TEXT.title2, WIDTH / 2, 600, t, 18.3, { size: 170, weight: 700, color: C.gold, spacing: 12, shadow: 'rgba(214,166,73,0.5)' }, 0.04)
  const u = inOutCubic(seg(t, 18.6, 19.1))
  ctx.fillStyle = C.accent
  ctx.fillRect(WIDTH / 2 - 400 * u, 650, 800 * u, 8)
  words(TEXT.tagline, WIDTH / 2, 740, t, 18.85, { size: 50, italic: true, color: C.cream, align: 'center' })
  const b = outBack(seg(t, 19.15, 19.5), 1.8)
  if (b > 0) {
    const pulse = 1 + 0.03 * Math.sin((t - 19.5) * 9) * seg(t, 19.5, 19.6)
    const w = measure(TEXT.play, { size: 42, weight: 700 }) + 120
    ctx.save()
    ctx.translate(WIDTH / 2, 870)
    ctx.scale(b * pulse, b * pulse)
    ctx.shadowColor = 'rgba(214,166,73,0.6)'
    ctx.shadowBlur = 30
    ctx.fillStyle = C.accent
    roundRect(-w / 2, -50, w, 100, 50)
    ctx.fill()
    ctx.shadowBlur = 0
    text(TEXT.play, 0, 15, { size: 42, weight: 700, color: C.card, align: 'center' })
    ctx.restore()
  }
}

const keyart = new Image()
keyart.src = V ? keyartV : keyartH

/** Финал английской версии: ключевой арт — вспышка света, медленный наезд, блик по логотипу. */
function keyartFinale(t: number) {
  ctx.fillStyle = C.dark
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const zoom = 1.1 - 0.1 * outCubic(seg(t, 18, 20))
  // Заполнить кадр целиком: вертикальный арт 2:3 чуть обрезается по бокам.
  const s = Math.max(WIDTH / keyart.width, HEIGHT / keyart.height) * zoom
  const w = keyart.width * s
  const h = keyart.height * s
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(keyart, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
  const sk = seg(t, 18.7, 19.5)
  if (sk > 0 && sk < 1) {
    ctx.globalCompositeOperation = 'lighter'
    const bx = lerp(-WIDTH * 0.6, WIDTH * 1.4, inOutCubic(sk))
    const g = ctx.createLinearGradient(bx - 300, 0, bx + 300, HEIGHT * 0.35)
    g.addColorStop(0, 'rgba(255,226,150,0)')
    g.addColorStop(0.5, 'rgba(255,226,150,0.32)')
    g.addColorStop(1, 'rgba(255,226,150,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
  ctx.restore()
}

// ---------- Кадр ----------

const CUTS: [number, (t: number) => void][] = [
  [0, intro],
  [2, lottery],
  [5.5, life],
  [9.5, choice],
  [12.5, worlds],
  [15.5, lineage],
  [18, KEYART ? keyartFinale : finale],
]
const WIPES: [number, string][] = [
  [2, C.accent],
  [5.5, C.dark],
  [9.5, C.accent],
  [12.5, C.dark],
  [15.5, C.gold],
  ...(KEYART ? [] : ([[18, C.accent]] as [number, string][])),
]

export function renderFrame(t: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  let draw = CUTS[0][1]
  for (const [at, fn] of CUTS) if (t >= at) draw = fn
  draw(t)
  for (const [at, color] of WIPES) blockWipe(t, at, color)
  // К ключевому арту — вспышка света: нарастает в конце сцены рода и гаснет на арте.
  if (KEYART) {
    const flash = t < 18 ? seg(t, 17.8, 18) ** 2 : 1 - outCubic(seg(t, 18, 18.5))
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 238, 200, ${flash})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
  }
  // Короткое затемнение в начале; в конце — только у русской версии (английская заканчивается артом).
  const fadeIn = 1 - seg(t, 0, 0.25)
  const fadeOut = KEYART ? 0 : seg(t, 19.75, 20)
  const a = Math.max(fadeIn, fadeOut)
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
// Готово, когда загружены шрифты: иначе первые кадры нарисуются запасным шрифтом.
window.promoReady = Promise.all([document.fonts.load(`700 40px ${SERIF}`), document.fonts.load(`400 40px ${SERIF}`), document.fonts.load(`italic 400 40px ${SERIF}`), keyart.decode()]).then(() => {
  REELS = reelItems()
  renderFrame(Number(params.get('t') ?? 0))
})
