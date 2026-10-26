// Пиксельные сцены. Кадр 192×60 точек (панорама 16:5), плоские цвета без обводки:
// небо полосами, силуэт места, земля с узором, человечки в несколько точек и пара предметов.
// Описание сцены (SceneDef) одно и то же для рисования и для промпта настоящей иллюстрации.

import { ERA_META } from '../content'
import type { FigureLook } from './avatar'
import type { SceneDef, SceneProp, ScenePlace, SceneTime } from '../engine/types'

export const W = 192
export const H = 60
const GROUND = 44

type Px = (x: number, y: number, w: number, h: number, c: string) => void

/** Детерминированный генератор: одна и та же сцена всегда выглядит одинаково. */
export function rand(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const SKY: Record<SceneTime, string[]> = {
  day: ['#6aa6dc', '#78b0e2', '#88bbe7', '#9ac6ec', '#aed2f0', '#c3def4'],
  dawn: ['#6c7fb5', '#8f8fbf', '#b9a0bf', '#dcb2b6', '#f0c7a8', '#f6dbb0'],
  sunset: ['#55467a', '#7a5280', '#a65f7e', '#d0727a', '#ea9070', '#f4b072'],
  night: ['#10142e', '#141a38', '#1a2142', '#1f294c', '#253155', '#2b385d'],
  overcast: ['#7d8287', '#878c90', '#91959a', '#9b9fa3', '#a5a9ac', '#afb2b4'],
}

/** Как тонируются постройки в разное время суток. */
const SHADE: Record<SceneTime, number> = { day: 0, dawn: -0.08, sunset: -0.15, night: -0.55, overcast: -0.12 }

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

export interface Palette {
  stone: string
  stoneDark: string
  wall: string
  roof: string
  ground: string
  groundLine: string
  clothes: string[]
  skin: string[]
  /** Купола, позолота, яркие крыши. */
  accent: string
}

const SKIN_MED = ['#c98d62', '#b07650', '#d9a07a']
const SKIN_EAST = ['#e0b890', '#d4a87c', '#c8986c']
const SKIN_BROWN = ['#a8704a', '#8f5c3a', '#b98058']
const SKIN_DARK = ['#6a4028', '#7a4a30', '#5a3420']
const SKIN_NORTH = ['#e8c0a0', '#dcb090', '#f0cdb0']

/** Палитры стилей. Регионы E03 сохраняют свои прежние цвета. */
const STYLE_PALETTE: Record<string, Palette> = {
  roman: { stone: '#e9e1cc', stoneDark: '#c9bfa6', wall: '#d39a62', roof: '#a8553a', ground: '#8e877f', groundLine: '#7b746c', clothes: ['#efe8d8', '#efe8d8', '#a83a2f', '#7a5a3a', '#c9a34a'], skin: SKIN_MED, accent: '#c9a34a' },
  greek: { stone: '#efe9da', stoneDark: '#cfc6b0', wall: '#e6dccb', roof: '#b56a46', ground: '#a69d8c', groundLine: '#918877', clothes: ['#efe8d8', '#4f6f9a', '#efe8d8', '#9a4a3a', '#6a7a4a'], skin: SKIN_MED, accent: '#c9a34a' },
  egyptian: { stone: '#d9b77a', stoneDark: '#b8935a', wall: '#c9a06a', roof: '#9a6a3a', ground: '#d4ad6e', groundLine: '#c09a5c', clothes: ['#f2eee2', '#f2eee2', '#e6dcc4', '#3f6f8a', '#c0703a'], skin: SKIN_BROWN, accent: '#e0b84a' },
  mesopotamian: { stone: '#d2b07a', stoneDark: '#a9855a', wall: '#c8a070', roof: '#9a7448', ground: '#cdb07c', groundLine: '#b79a66', clothes: ['#e8dcc0', '#7a4a8a', '#3f6f8a', '#c0703a', '#e8dcc0'], skin: SKIN_BROWN, accent: '#3f6fa8' },
  chinese: { stone: '#bfb6a8', stoneDark: '#8f877a', wall: '#e2d8c4', roof: '#4a5664', ground: '#9a9080', groundLine: '#857b6c', clothes: ['#3f5f8a', '#2f3f5f', '#a83a2f', '#e8e0d0', '#5a7a4a'], skin: SKIN_EAST, accent: '#c9302a' },
  japanese: { stone: '#c8c0b0', stoneDark: '#9a9284', wall: '#efe6d2', roof: '#3a3a42', ground: '#8f8a7a', groundLine: '#7a7566', clothes: ['#2f3f5f', '#5a4a7a', '#a83a2f', '#d8d0c0', '#4a6a4a'], skin: SKIN_EAST, accent: '#c9402a' },
  indian: { stone: '#d8a878', stoneDark: '#b07a50', wall: '#e6cfa8', roof: '#a8553a', ground: '#c09a6a', groundLine: '#a8845a', clothes: ['#e8a030', '#c0303a', '#f2ead8', '#3a6a9a', '#e0c040'], skin: SKIN_BROWN, accent: '#f2ead8' },
  islamic: { stone: '#e6d8bc', stoneDark: '#c2b08a', wall: '#e9dcc0', roof: '#c2a878', ground: '#cdb88c', groundLine: '#b9a478', clothes: ['#f2eee2', '#3f6f8a', '#2a5a4a', '#8a3a2a', '#e8dcc0'], skin: ['#c08a60', '#a8704a', '#d4a07a'], accent: '#3f8fa8' },
  gothic: { stone: '#b8b2a6', stoneDark: '#8a8478', wall: '#e2d6bc', roof: '#6a4038', ground: '#7f7a70', groundLine: '#6c675e', clothes: ['#5a4a3a', '#3a5a3a', '#8a2a2a', '#3a4a6a', '#a89878'], skin: SKIN_NORTH, accent: '#5a5a6a' },
  byzantine: { stone: '#dccfb4', stoneDark: '#b4a684', wall: '#d4a07a', roof: '#a8603a', ground: '#9a9080', groundLine: '#857b6c', clothes: ['#7a2a5a', '#c9a34a', '#efe8d8', '#3a4a7a', '#8a3a2a'], skin: SKIN_MED, accent: '#8a9aa8' },
  russian: { stone: '#ece6d8', stoneDark: '#c2bba9', wall: '#8a5a36', roof: '#5a4434', ground: '#7a6a50', groundLine: '#665840', clothes: ['#a83a2f', '#e8e0d0', '#3a5a8a', '#5a4a3a', '#c9a34a'], skin: SKIN_NORTH, accent: '#d8b040' },
  maya: { stone: '#d8d0b8', stoneDark: '#a8a088', wall: '#e0d4b0', roof: '#b89a5a', ground: '#7a6a4a', groundLine: '#685a3c', clothes: ['#f2ead8', '#3a7a9a', '#c0503a', '#e0c040', '#4a8a4a'], skin: SKIN_BROWN, accent: '#b84a3a' },
  aztec: { stone: '#c8bca0', stoneDark: '#9a8e74', wall: '#e6dcc4', roof: '#b89a5a', ground: '#a89a7a', groundLine: '#948664', clothes: ['#f2ead8', '#3a8a8a', '#c0303a', '#e0b030', '#2a6a4a'], skin: SKIN_BROWN, accent: '#2a7aa8' },
  andean: { stone: '#a8a090', stoneDark: '#7f786a', wall: '#9a9284', roof: '#c4a860', ground: '#8a8a6a', groundLine: '#767656', clothes: ['#b83a3a', '#e0b030', '#2a4a8a', '#f2ead8', '#4a2a2a'], skin: SKIN_BROWN, accent: '#e0b030' },
  sahel: { stone: '#b8865a', stoneDark: '#946a44', wall: '#c0905e', roof: '#a8784c', ground: '#d8b07a', groundLine: '#c49c68', clothes: ['#f2eee2', '#3a5a9a', '#e0b030', '#c0503a', '#2a2a4a'], skin: SKIN_DARK, accent: '#7a5a3a' },
  ethiopian: { stone: '#a8664a', stoneDark: '#7f4a34', wall: '#c09a6a', roof: '#b8a060', ground: '#8a7a5a', groundLine: '#766846', clothes: ['#f2eee2', '#f2eee2', '#e8dcc0', '#3a6a4a', '#c0503a'], skin: SKIN_DARK, accent: '#c9a34a' },
}

/** Холмы за городом по типу пейзажа. */
const LAND: Record<string, { hill: string; tree: string }> = {
  green: { hill: '#6f8a4a', tree: '#4f7a3a' },
  dry: { hill: '#a89a6a', tree: '#7f8f5a' },
  desert: { hill: '#d8b880', tree: '#6f8a4a' },
  snow: { hill: '#cfd8de', tree: '#3f5f4a' },
  jungle: { hill: '#2f6a3a', tree: '#2a5a30' },
  mountains: { hill: '#7a8090', tree: '#4a6a4a' },
  steppe: { hill: '#a8a070', tree: '#6f7a4a' },
}

type Hat = 'turban' | 'conical' | 'feather' | 'cap' | 'veil' | null
const HATS: Record<string, Hat[]> = {
  chinese: ['conical', null, null],
  japanese: ['conical', null, null],
  indian: ['turban', null],
  islamic: ['turban', 'turban', 'veil', null],
  sahel: ['turban', 'veil', null],
  maya: ['feather', null, null],
  aztec: ['feather', null, null],
  andean: ['cap', null],
  russian: ['cap', null, null],
  gothic: ['cap', null, null, null],
  ethiopian: ['veil', null, null],
}

export interface Look {
  style: string
  land: string
  p: Palette
}

/** Как выглядит регион: стиль из era.json; неизвестное имя региона, совпадающее со стилем, — этот стиль (для галереи). */
export function lookOf(region: string): Look {
  const def = REGION_DEF.get(region)
  const style = def?.scene?.style ?? (STYLE_PALETTE[region] ? region : 'roman')
  const land = def?.scene?.land ?? (style === 'egyptian' || style === 'mesopotamian' || style === 'sahel' || style === 'islamic' ? 'desert' : 'green')
  const own: Record<string, string> = { rome: 'roman', athens: 'greek', egypt: 'egyptian' }
  return { style, land, p: STYLE_PALETTE[own[region] ?? style] ?? STYLE_PALETTE.roman }
}

const REGION_DEF = new Map(Object.values(ERA_META).flatMap((e) => e.regions.map((r) => [r.id, r] as const)))

// ---------- Слои ----------

function sky(px: Px, time: SceneTime, r: () => number) {
  const bands = SKY[time]
  const h = Math.ceil(GROUND / bands.length)
  bands.forEach((c, i) => px(0, i * h, W, h, c))
  if (time === 'night') for (let i = 0; i < 28; i++) px(Math.floor(r() * W), Math.floor(r() * 30), 1, 1, r() > 0.7 ? '#fff6c8' : '#cfd6ff')
}

function disc(px: Px, cx: number, cy: number, rad: number, c: string) {
  for (let y = -rad; y <= rad; y++) {
    const w = Math.round(Math.sqrt(rad * rad - y * y))
    px(cx - w, cy + y, w * 2 + 1, 1, c)
  }
}

function ground(px: Px, place: ScenePlace, p: Palette, time: SceneTime, r: () => number, style = '') {
  const k = SHADE[time]
  if (place === 'field' && (style === 'chinese' || style === 'japanese')) {
    // Рисовые поля: вода между грядками.
    px(0, GROUND, W, H - GROUND, shade('#6f9a5a', k))
    for (let y = GROUND + 2; y < H; y += 4) px(0, y, W, 2, shade('#8ab8c8', k))
    for (let y = GROUND + 1; y < H; y += 4) for (let x = (y % 3) * 2; x < W; x += 6) px(x, y, 1, 2, shade('#4f8a3a', k))
    return
  }
  const water = place === 'sea' || place === 'harbor'
  const sand = place === 'arena' || place === 'battle' || place === 'camp' || place === 'field' || place === 'road'
  const base = water ? '#3f6f9e' : place === 'field' ? '#b9a14e' : sand ? '#c8a874' : place === 'river' ? p.ground : p.ground
  px(0, GROUND, W, H - GROUND, shade(base, k))
  const line = water ? '#6f9cc8' : place === 'field' ? '#9c8638' : sand ? '#b39260' : p.groundLine
  if (water) {
    for (let y = GROUND + 2; y < H; y += 3) for (let x = Math.floor(r() * 8); x < W; x += 9 + Math.floor(r() * 6)) px(x, y, 4, 1, shade(line, k))
  } else if (place === 'field') {
    for (let y = GROUND + 2; y < H; y += 3) px(0, y, W, 1, shade(line, k))
  } else if (place === 'home' || place === 'workshop' || place === 'school') {
    // Дощатый пол.
    px(0, GROUND, W, H - GROUND, shade('#a8754a', k * 0.6))
    for (let x = 0; x < W; x += 12) px(x, GROUND, 1, H - GROUND, shade('#8a5a36', k * 0.6))
    px(0, GROUND, W, 1, shade('#8a5a36', k * 0.6))
  } else if (place === 'bath') {
    px(0, GROUND, W, H - GROUND, shade('#d8d2c2', k * 0.6))
    px(40, GROUND + 4, 112, 10, '#5f9ec4')
    for (let x = 44; x < 148; x += 9) px(x, GROUND + 7, 4, 1, '#8cc0e0')
  } else if (place === 'road') {
    px(0, GROUND + 6, W, 6, shade('#9b8b70', k))
    for (let x = 4; x < W; x += 14) px(x, GROUND + 8, 6, 1, shade('#b9a98c', k))
  } else {
    // Мостовая или утоптанная земля: короткие штрихи.
    for (let y = GROUND + 2; y < H; y += 3) for (let x = (y % 2) * 4; x < W; x += 8) px(x, y, 4, 1, shade(line, k))
  }
  if (place === 'river') {
    px(0, GROUND + 6, W, 6, shade('#3f78a8', k))
    for (let x = 3; x < W; x += 9) px(x, GROUND + 8, 4, 1, shade('#7aa8d0', k))
  }
}

function colonnade(px: Px, x0: number, w: number, top: number, p: Palette, k: number, n: number) {
  const stone = shade(p.stone, k)
  const dark = shade(p.stoneDark, k)
  // фронтон ступенями
  const steps = 4
  for (let i = 0; i < steps; i++) px(x0 + 8 + i * 6, top - 2 - i * 2, w - 16 - i * 12, 2, stone)
  px(x0 + 2, top, w - 4, 3, stone)
  const colTop = top + 3
  const colH = GROUND - 3 - colTop
  for (let i = 0; i < n; i++) {
    const x = x0 + 5 + Math.round((i * (w - 12)) / (n - 1))
    px(x, colTop, 3, colH, stone)
    px(x + 2, colTop, 1, colH, dark)
  }
  px(x0, GROUND - 3, w, 2, dark)
  px(x0 - 2, GROUND - 1, w + 4, 1, shade(p.stoneDark, k - 0.1))
}

function pyramid(px: Px, cx: number, base: number, levels: number, c: string, step = 3) {
  for (let i = 0; i < levels; i++) px(cx - base / 2 + i * step, GROUND - (i + 1) * 3, base - i * step * 2, 3, c)
}


// ---------- Постройки разных стилей ----------

/** Загнутая кверху крыша Китая и Японии: широкий скат с приподнятыми концами. */
function curvedRoof(px: Px, x: number, w: number, y: number, c: string, heavy = false) {
  const over = heavy ? 5 : 4
  px(x - over, y, w + over * 2, 2, c)
  px(x - over - 1, y - 1, 2, 1, c)
  px(x + w + over - 1, y - 1, 2, 1, c)
  px(x - 1, y - 2, w + 2, 2, c)
  if (heavy) px(x + 2, y - 4, w - 4, 2, c)
  px(x + 3, y - (heavy ? 5 : 3), w - 6, 1, shade(c, -0.2))
}

/** Остроконечная двускатная крыша. */
function gable(px: Px, x: number, w: number, y: number, c: string, steep = 1) {
  const h = Math.ceil((w / 2) * steep)
  for (let i = 0; i < h; i++) {
    const half = Math.max(1, Math.round(((h - i) / h) * (w / 2 + 1)))
    px(x + w / 2 - half, y - i, half * 2, 1, c)
  }
}

/** Купол: полукруг с навершием. */
function dome(px: Px, cx: number, base: number, rad: number, c: string, spire = '#d8b040') {
  for (let y = 0; y <= rad; y++) {
    const w = Math.round(Math.sqrt(rad * rad - y * y))
    px(cx - w, base - y, w * 2 + 1, 1, c)
  }
  px(cx, base - rad - 3, 1, 3, spire)
}

/** Луковица русской церкви. */
function onion(px: Px, cx: number, base: number, rad: number, c: string) {
  const rows = [0.6, 0.9, 1, 1, 0.9, 0.7, 0.45, 0.25, 0.12]
  const h = rows.length
  for (let i = 0; i < h; i++) {
    const w = Math.max(0, Math.round(rad * rows[i]))
    px(cx - w, base - i, w * 2 + 1, 1, c)
  }
  px(cx, base - h - 3, 1, 3, '#d8b040')
  px(cx - 1, base - h - 2, 3, 1, '#d8b040')
}

function minaret(px: Px, x: number, h: number, c: string, cap: string) {
  px(x, GROUND - h, 3, h, c)
  px(x - 1, GROUND - h + 6, 5, 1, shade(c, -0.15))
  for (let i = 0; i < 4; i++) px(x + 1 - Math.floor(i / 2), GROUND - h - 1 - i, 1 + Math.floor(i / 2) * 2, 1, cap)
  px(x + 1, GROUND - h - 6, 1, 2, cap)
}

function crenels(px: Px, x: number, w: number, y: number, c: string) {
  for (let i = x; i < x + w; i += 4) px(i, y - 2, 2, 2, c)
}

function stepped(px: Px, cx: number, base: number, tiers: number, w0: number, stepW: number, stepH: number, c: string, stair?: string) {
  for (let i = 0; i < tiers; i++) px(cx - w0 / 2 + i * stepW, base - (i + 1) * stepH, w0 - i * stepW * 2, stepH, shade(c, -0.03 * (i % 2)))
  if (stair) px(cx - 3, base - tiers * stepH, 6, tiers * stepH, stair)
}

function pagoda(px: Px, cx: number, tiers: number, w0: number, wall: string, roof: string, heavy = false) {
  let y = GROUND
  for (let i = 0; i < tiers; i++) {
    const w = w0 - i * 3
    const h = i === 0 ? 7 : 5
    px(cx - w / 2, y - h, w, h, wall)
    curvedRoof(px, cx - w / 2, w, y - h - 1, roof, heavy)
    y -= h + (heavy ? 4 : 3)
  }
  px(cx, y - 6, 1, 7, shade(roof, 0.2))
}

function torii(px: Px, x: number, c: string) {
  px(x + 3, GROUND - 22, 2, 22, c)
  px(x + 17, GROUND - 22, 2, 22, c)
  px(x, GROUND - 24, 22, 2, c)
  px(x - 1, GROUND - 25, 2, 1, c)
  px(x + 21, GROUND - 25, 2, 1, c)
  px(x + 2, GROUND - 19, 18, 1, c)
}

/** Гора-конус: вершина в (cx, GROUND - h), склоны пологие (slope точек вширь на точку вниз). */
function cone(px: Px, cx: number, h: number, c: string, snow = 0, slope = 2) {
  for (let i = 0; i < h; i++) px(cx - i * slope - 1, GROUND - h + i, i * slope * 2 + 2, 1, i < snow ? '#eef2f4' : c)
}

function farHills(px: Px, look: Look, k: number, r: () => number, tall = false) {
  const c = shade(LAND[look.land]?.hill ?? '#6f8a4a', k - 0.05)
  const snowy = look.land === 'snow' || look.land === 'mountains'
  for (let x = 6 + Math.floor(r() * 20); x < W + 20; x += 40 + Math.floor(r() * 24)) {
    const h = tall || look.land === 'mountains' ? 16 + Math.floor(r() * 18) : 5 + Math.floor(r() * 7)
    cone(px, x, h, c, snowy && h > 22 ? 4 : 0, tall ? 2 : 3)
  }
}

function tree(px: Px, look: Look, x: number, k: number, r: () => number) {
  const leaf = shade(LAND[look.land]?.tree ?? '#4f7a3a', k)
  const s = look.style
  if (s === 'egyptian' || s === 'islamic' || s === 'sahel' || s === 'mesopotamian' || (s === 'indian' && r() > 0.5)) {
    px(x + 3, GROUND - 16, 1, 16, '#6a4a2a')
    px(x - 2, GROUND - 17, 11, 1, leaf)
    px(x - 3, GROUND - 16, 2, 1, leaf)
    px(x + 8, GROUND - 16, 2, 1, leaf)
  } else if (s === 'japanese' || s === 'russian' || s === 'gothic' || look.land === 'snow') {
    // Ель или сосна.
    px(x + 3, GROUND - 4, 2, 4, '#4a3420')
    for (let i = 0; i < 14; i++) px(x + 4 - Math.floor(i / 3), GROUND - 18 + i, Math.floor(i / 3) * 2 + 1, 1, leaf)
  } else if (s === 'roman' || s === 'greek') {
    // Кипарис.
    px(x + 3, GROUND - 3, 2, 3, '#4a3420')
    px(x + 2, GROUND - 20, 4, 17, shade('#3f5a3a', k))
    px(x + 3, GROUND - 22, 2, 2, shade('#3f5a3a', k))
  } else if (s === 'ethiopian' || s === 'sahel') {
    // Акация с плоской кроной.
    px(x + 4, GROUND - 12, 1, 12, '#5a4030')
    px(x - 3, GROUND - 14, 15, 2, leaf)
  } else {
    px(x + 3, GROUND - 10, 2, 10, '#5a4030')
    disc(px, x + 4, GROUND - 14, look.land === 'jungle' ? 7 : 5, leaf)
  }
}

/** Постройки, нарисованные в этом кадре: на них ложатся огонь, разрушения и вода. */
let built: { x: number; w: number; top: number }[] = []

/** Дверь: прямоугольник, по желанию с аркой. */
function door(px: Px, cx: number, h: number, c: string, arch = false) {
  px(cx - 2, GROUND - h, 4, h, c)
  if (arch) px(cx - 1, GROUND - h - 1, 2, 1, c)
}

/**
 * Жилой дом в стиле края: низкий, в один (редко два) этажа, с дверью и одним-двумя окнами —
 * никаких рядов одинаковых окон, как у многоэтажек.
 */
/** Дом героя сгорел: вместо дома во дворе — обугленный остов (ставится на время рисования двора). */
let burnt = false

function styledHouse(px: Px, look: Look, x: number, w: number, k: number, r: () => number, lit: boolean) {
  built.push({ x, w, top: GROUND - 14 })
  if (burnt) {
    // Остов без крыши: неровные чёрные стены, торчащие обгорелые балки.
    for (let i = 0; i < w; i++) {
      const top = GROUND - 6 - Math.floor(r() * 7) - (i % 6 === 0 ? 5 : 0)
      px(x + i, top, 1, GROUND - top, shade(i % 6 === 0 ? '#3a2e26' : '#2b2420', k * 0.5))
    }
    px(x - 2, GROUND - 15, w + 4, 1, shade('#3a2e26', k * 0.5))
    px(x + 3, GROUND - 19, 1, 6, shade('#3a2e26', k * 0.5))
    px(x + w - 4, GROUND - 17, 1, 4, shade('#3a2e26', k * 0.5))
    return
  }
  const p = look.p
  const dark = shade('#3a2a20', k)
  const glow = () => (lit && r() > 0.4 ? '#e8c96a' : dark)
  const wall = shade(p.wall, k)
  const roof = shade(p.roof, k)
  const cx = Math.round(x + w / 2)
  const window = (wx: number, wy: number, ww = 3, wh = 3) => px(wx, wy, ww, wh, glow())
  switch (look.style) {
    case 'roman':
    case 'greek':
    case 'byzantine': {
      // Домус: глухие стены, черепичная крыша, дверь и маленькое окошко.
      const h = 10 + Math.floor(r() * 4)
      const body = look.style === 'greek' ? shade(r() > 0.3 ? '#efe9da' : p.wall, k) : shade(r() > 0.5 ? p.wall : '#e6d6b8', k)
      px(x, GROUND - h, w, h, body)
      if (look.style === 'byzantine') px(x, GROUND - h + 4, w, 1, shade(p.wall, k - 0.15))
      gable(px, x - 2, w + 4, GROUND - h - 1, roof, 0.28)
      door(px, x + 6, 7, dark, look.style === 'byzantine')
      window(x + w - 8, GROUND - h + 3, 3, 3)
      if (r() > 0.6) {
        // Лавка-таберна с навесом.
        px(x + w - 12, GROUND - 6, 8, 6, dark)
        px(x + w - 13, GROUND - 7, 10, 1, shade('#a83a2f', k))
      }
      return
    }
    case 'egyptian':
    case 'mesopotamian': {
      // Дом из сырцового кирпича: плоская крыша, иногда навес на крыше.
      const h = 9 + Math.floor(r() * 4)
      px(x, GROUND - h, w, h, wall)
      px(x - 1, GROUND - h - 1, w + 2, 1, shade(p.stoneDark, k))
      door(px, x + 5, 7, dark)
      window(x + w - 7, GROUND - h + 2, 3, 2)
      if (r() > 0.5) {
        px(x + w - 10, GROUND - h - 6, 1, 5, shade('#6a4a2a', k))
        px(x + w - 3, GROUND - h - 6, 1, 5, shade('#6a4a2a', k))
        px(x + w - 11, GROUND - h - 7, 10, 1, shade('#c9b48a', k))
      }
      return
    }
    case 'islamic':
    case 'indian': {
      if (look.style === 'indian' && r() > 0.65) {
        // Деревенская хижина под соломой.
        const h = 8
        px(x + 2, GROUND - h, w - 4, h, shade('#c8a070', k))
        door(px, cx, 6, dark)
        gable(px, x, w, GROUND - h - 1, shade('#b89a5a', k), 0.45)
        return
      }
      const h = 10 + Math.floor(r() * 5)
      px(x, GROUND - h, w, h, wall)
      px(x - 1, GROUND - h - 1, w + 2, 1, shade(p.stoneDark, k))
      px(x - 1, GROUND - h - 2, 1, 1, shade(p.stoneDark, k))
      px(x + w, GROUND - h - 2, 1, 1, shade(p.stoneDark, k))
      door(px, x + 6, 7, dark, true)
      if (look.style === 'islamic' && r() > 0.4) {
        // Деревянный решётчатый эркер-машрабия.
        px(x + w - 10, GROUND - h + 2, 7, 5, shade('#7a5232', k))
        for (let i = 0; i < 3; i++) px(x + w - 9 + i * 2, GROUND - h + 3, 1, 3, shade('#4a3020', k))
      } else window(x + w - 8, GROUND - h + 3, 3, 3)
      if (r() > 0.85) dome(px, cx, GROUND - h - 1, Math.min(5, Math.floor(w / 4)), shade(look.style === 'islamic' ? p.accent : p.stone, k), shade('#d8b040', k))
      return
    }
    case 'chinese':
    case 'japanese': {
      const h = 10 + Math.floor(r() * 3)
      if (look.style === 'japanese') {
        // Деревянный каркас с белыми панелями и раздвижной дверью.
        px(x, GROUND - h, w, h, shade('#6a4a30', k))
        for (let px0 = x + 2; px0 < x + w - 4; px0 += 6) px(px0, GROUND - h + 2, 4, h - 4, shade('#efe6d2', k))
        px(cx - 2, GROUND - 7, 4, 7, glow())
      } else {
        px(x, GROUND - h, w, h, shade(r() > 0.75 ? '#a8402e' : p.wall, k))
        door(px, cx, 7, shade('#7a2a20', k))
        // Решётчатое окно.
        window(x + 4, GROUND - h + 3, 4, 4)
        px(x + 6, GROUND - h + 3, 1, 4, shade('#5a4030', k))
      }
      curvedRoof(px, x, w, GROUND - h - 1, roof, look.style === 'japanese')
      return
    }
    case 'gothic': {
      // Фахверк: одна-две «клетки» балок, крутая крыша, дверь и пара окон.
      const two = r() > 0.5
      const h = two ? 18 : 11
      px(x, GROUND - h, w, h, wall)
      const beam = shade('#5a3a24', k)
      px(x, GROUND - h, w, 1, beam)
      px(x, GROUND - 1, w, 1, beam)
      if (two) px(x, GROUND - 9, w, 1, beam)
      px(x, GROUND - h, 1, h, beam)
      px(x + w - 1, GROUND - h, 1, h, beam)
      door(px, x + w - 6, 6, dark)
      window(x + 4, GROUND - 7, 3, 3)
      if (two) window(x + w / 2 - 1, GROUND - 15, 3, 3)
      gable(px, x - 1, w + 2, GROUND - h - 1, roof, 1)
      return
    }
    case 'russian': {
      const h = 11 + Math.floor(r() * 3)
      const log = shade(p.wall, k)
      px(x, GROUND - h, w, h, log)
      for (let y = GROUND - h + 1; y < GROUND; y += 2) px(x, y, w, 1, shade(p.wall, k - 0.12))
      px(cx - 3, GROUND - h + 3, 6, 5, shade('#e8dcc0', k))
      px(cx - 2, GROUND - h + 4, 4, 3, glow())
      gable(px, x - 2, w + 4, GROUND - h - 1, roof, 0.9)
      return
    }
    case 'sahel': {
      const h = 9 + Math.floor(r() * 4)
      px(x, GROUND - h, w, h, wall)
      px(x, GROUND - h - 2, 2, 2, wall)
      px(x + w - 2, GROUND - h - 2, 2, 2, wall)
      for (let tx = x + 3; tx < x + w - 2; tx += 5) px(tx, GROUND - h + 2, 1, 1, shade('#5a3a20', k))
      door(px, cx, 7, dark)
      return
    }
    case 'ethiopian': {
      // Круглая хижина-тукуль с конической соломенной крышей.
      const h = 8
      px(cx - 8, GROUND - h, 16, h, wall)
      door(px, cx, 6, dark)
      for (let i = 0; i < 9; i++) px(cx - 10 + i, GROUND - h - 1 - i, 20 - i * 2, 1, shade(p.roof, k - (i % 2) * 0.05))
      px(cx, GROUND - h - 12, 1, 3, shade('#5a4030', k))
      return
    }
    case 'maya':
    case 'aztec':
    case 'andean': {
      const h = 8 + Math.floor(r() * 4)
      const stoneWall = look.style === 'andean' || r() > 0.6
      px(x, GROUND - h, w, h, stoneWall ? shade(p.stone, k) : wall)
      if (look.style === 'andean') for (let y = GROUND - h + 2; y < GROUND; y += 3) for (let sx = x + (y % 2) * 2; sx < x + w; sx += 5) px(sx, y, 1, 1, shade(p.stoneDark, k))
      // Трапециевидный вход.
      px(cx - 2, GROUND - 7, 4, 7, dark)
      px(cx - 1, GROUND - 8, 2, 1, dark)
      gable(px, x - 2, w + 4, GROUND - h - 1, roof, look.style === 'andean' ? 0.7 : 0.55)
      return
    }
  }
}

/** Главный вид края (place: landmark). */
function landmark(px: Px, look: Look, region: string, k: number, r: () => number) {
  const p = look.p
  const c = (x: string, d = 0) => shade(x, k + d)
  switch (look.style) {
    case 'egyptian':
      if (region === 'egypt') {
        pyramid(px, 60, 70, 9, c('#c99a5a'))
        pyramid(px, 112, 44, 6, c('#b8894c'))
      } else {
        // Пилон храма и обелиски.
        px(50, GROUND - 30, 30, 30, c('#c9a46a'))
        px(112, GROUND - 30, 30, 30, c('#c9a46a'))
        px(80, GROUND - 20, 32, 20, c('#a8834e'))
        for (let y = GROUND - 26; y < GROUND - 4; y += 4) px(54, y, 22, 1, c('#a8834e'))
        for (const ox of [36, 150]) {
          px(ox, GROUND - 34, 5, 34, c('#d8b880'))
          px(ox + 1, GROUND - 36, 3, 2, c('#e0b84a'))
        }
        pyramid(px, 176, 30, 4, c('#b8894c', -0.1))
      }
      return
    case 'greek':
      for (let i = 0; i < 5; i++) px(30 + i * 6, GROUND - 6 - i * 2, 132 - i * 12, 2, c('#9a8f78'))
      px(18, GROUND - 6, 156, 6, c('#9a8f78'))
      colonnade(px, 56, 80, GROUND - 32, p, k, 8)
      return
    case 'mesopotamian':
      // Зиккурат и стены с зубцами.
      px(0, GROUND - 10, W, 10, c(p.wall, -0.05))
      crenels(px, 0, W, GROUND - 10, c(p.wall, -0.05))
      stepped(px, 96, GROUND, 4, 104, 12, 7, c(p.stone), c(p.stoneDark))
      px(88, GROUND - 34, 16, 6, c('#3f6fa8'))
      return
    case 'chinese':
      px(0, GROUND - 12, W, 12, c(p.stoneDark))
      crenels(px, 0, W, GROUND - 12, c(p.stoneDark))
      px(70, GROUND - 22, 52, 10, c('#a8402e'))
      curvedRoof(px, 70, 52, GROUND - 23, c(p.roof), true)
      px(78, GROUND - 31, 36, 6, c('#a8402e'))
      curvedRoof(px, 78, 36, GROUND - 32, c(p.roof))
      px(92, GROUND - 8, 8, 8, c('#3a2a20'))
      pagoda(px, 160, 6, 16, c(p.wall), c(p.roof))
      return
    case 'japanese':
      // Гора, пагода, тории.
      cone(px, 80, 32, c('#7a8a9a', 0.1), 6, 2)
      pagoda(px, 140, 5, 18, c('#6a4a30'), c(p.roof), true)
      torii(px, 30, c('#c9402a'))
      return
    case 'indian': {
      // Храм-шикхара и минарет.
      const st = c(p.stone)
      px(70, GROUND - 14, 52, 14, st)
      for (let i = 0; i < 9; i++) px(84 + i, GROUND - 16 - i * 3, 24 - i * 2, 3, shade(p.stone, k - (i % 2) * 0.06))
      px(95, GROUND - 46, 2, 4, c('#d8b040'))
      dome(px, 76, GROUND - 14, 6, st)
      dome(px, 116, GROUND - 14, 6, st)
      for (let i = 0; i < 40; i++) px(30 - Math.floor(i / 10), GROUND - i, 6 + Math.floor(i / 10) * 2, 1, c(p.stoneDark))
      for (let y = GROUND - 36; y < GROUND; y += 10) px(26, y, 14, 1, c(p.stone))
      tree(px, look, 160, k, r)
      return
    }
    case 'islamic': {
      const st = c(p.stone)
      px(56, GROUND - 18, 80, 18, st)
      for (let ax = 60; ax < 132; ax += 9) {
        px(ax, GROUND - 12, 5, 12, c('#5a4a3a'))
        px(ax + 1, GROUND - 13, 3, 1, c('#5a4a3a'))
      }
      dome(px, 96, GROUND - 18, 18, c(p.accent), c('#d8b040'))
      dome(px, 68, GROUND - 18, 7, c(p.accent))
      dome(px, 124, GROUND - 18, 7, c(p.accent))
      minaret(px, 40, 42, st, c(p.accent))
      minaret(px, 150, 42, st, c(p.accent))
      tree(px, look, 10, k, r)
      tree(px, look, 176, k, r)
      return
    }
    case 'gothic': {
      const st = c(p.stone)
      px(40, GROUND - 22, 112, 22, st)
      gable(px, 40, 112, GROUND - 22, c('#5a5a66'), 0.25)
      for (let wx = 52; wx < 140; wx += 10) {
        px(wx, GROUND - 18, 4, 10, c('#3a4a6a'))
        px(wx + 1, GROUND - 19, 2, 1, c('#3a4a6a'))
      }
      for (const tx of [30, 150]) {
        px(tx, GROUND - 36, 14, 36, st)
        for (let i = 0; i < 16; i++) px(tx + 7 - Math.floor(i / 2), GROUND - 36 - 16 + i, Math.floor(i / 2) * 2 + 1, 1, c(p.stoneDark))
        px(tx + 5, GROUND - 28, 4, 8, c('#3a4a6a'))
      }
      disc(px, 96, GROUND - 30, 5, c('#a83a2f'))
      disc(px, 96, GROUND - 30, 3, c('#3a4a6a'))
      return
    }
    case 'byzantine': {
      const st = c(p.wall)
      px(30, GROUND - 16, 132, 16, st)
      for (let y = GROUND - 14; y < GROUND; y += 4) px(30, y, 132, 1, c(p.wall, -0.1))
      dome(px, 60, GROUND - 16, 12, c(p.accent), c('#d8b040'))
      dome(px, 132, GROUND - 16, 12, c(p.accent), c('#d8b040'))
      px(64, GROUND - 26, 64, 10, st)
      // Пологий большой купол.
      for (let y = 0; y < 12; y++) {
        const w = Math.round(Math.sqrt(1 - (y / 12) ** 2) * 30)
        px(96 - w, GROUND - 26 - y, w * 2, 1, c(p.accent))
      }
      for (let wx = 70; wx < 124; wx += 5) px(wx, GROUND - 28, 2, 2, c('#3a3028'))
      px(96, GROUND - 42, 1, 4, c('#d8b040'))
      return
    }
    case 'russian': {
      // Кремлёвская стена с башнями и собор с луковицами.
      const wall = c('#b84a3a')
      px(0, GROUND - 12, W, 12, wall)
      crenels(px, 0, W, GROUND - 12, wall)
      for (const tx of [14, 170]) {
        px(tx, GROUND - 22, 12, 22, wall)
        for (let i = 0; i < 10; i++) px(tx + 6 - Math.floor(i / 2), GROUND - 32 + i, Math.floor(i / 2) * 2 + 1, 1, c('#3f6a4a'))
      }
      const st = c(p.stone)
      px(70, GROUND - 26, 52, 26, st)
      for (let wx = 76; wx < 118; wx += 8) px(wx, GROUND - 20, 3, 6, c('#3a3028'))
      px(90, GROUND - 34, 12, 8, st)
      onion(px, 96, GROUND - 34, 6, c('#d8b040'))
      for (const ox of [76, 116]) {
        px(ox - 3, GROUND - 30, 6, 4, st)
        onion(px, ox, GROUND - 30, 4, c('#3f6f9a'))
      }
      return
    }
    case 'maya':
      for (const x of [8, 30, 160, 178]) tree(px, look, x, k, r)
      stepped(px, 96, GROUND, 7, 60, 3, 4, c(p.stone), c(p.stoneDark))
      px(86, GROUND - 36, 20, 8, c('#b84a3a'))
      px(93, GROUND - 33, 6, 5, c('#3a2a20'))
      px(88, GROUND - 44, 16, 8, c(p.stone))
      for (let x = 89; x < 103; x += 3) px(x, GROUND - 42, 1, 5, c(p.stoneDark))
      stepped(px, 150, GROUND, 4, 34, 3, 4, c(p.stone, -0.05))
      return
    case 'aztec':
      // Вулкан, Великий храм с двумя святилищами, озеро.
      cone(px, 150, 26, c('#8a8f9a', 0.08), 3, 2)
      stepped(px, 80, GROUND, 4, 90, 7, 7, c(p.stone))
      px(74, GROUND - 28, 12, 28, c(p.stoneDark))
      px(56, GROUND - 36, 16, 8, c('#c0303a'))
      px(88, GROUND - 36, 16, 8, c('#2a7aa8'))
      px(59, GROUND - 32, 4, 4, c('#3a2a20'))
      px(93, GROUND - 32, 4, 4, c('#3a2a20'))
      return
    case 'andean':
      farHills(px, { ...look, land: 'mountains' }, k, r, true)
      for (let i = 0; i < 5; i++) px(20 + i * 10, GROUND - 4 - i * 4, 152 - i * 20, 4, c('#6f8a4a', -0.04 * (i % 2)))
      for (const x of [70, 96, 122]) styledHouse(px, look, x - 8, 16, k, r, false)
      return
    case 'sahel': {
      // Мечеть из сырцового кирпича с торчащими балками.
      const mud = c(p.stone)
      px(40, GROUND - 22, 112, 22, mud)
      for (const tx of [44, 76, 96, 116, 144]) {
        const h = tx === 96 ? 38 : 30
        px(tx - 4, GROUND - h, 8, h, mud)
        for (let i = 0; i < 4; i++) px(tx - 2 + Math.floor(i / 2), GROUND - h - 1 - i, 4 - Math.floor(i / 2) * 2, 1, mud)
        for (let y = GROUND - h + 4; y < GROUND - 2; y += 5) px(tx - 6, y, 12, 1, c('#5a3a20'))
      }
      tree(px, look, 10, k, r)
      tree(px, look, 170, k, r)
      return
    }
    case 'ethiopian': {
      // Плосковерхие горы-амбы, высеченная в скале церковь-крест, тукули.
      const rock = c('#8a6a5a', 0.05)
      for (const [x, w, h] of [[0, 60, 26], [120, 72, 30]]) {
        px(x, GROUND - h, w, h, rock)
        px(x + 4, GROUND - h - 2, w - 8, 2, rock)
      }
      px(70, GROUND - 4, 52, 4, c('#5a3a2a'))
      const st = c(p.stone)
      px(88, GROUND - 22, 16, 22, st)
      px(80, GROUND - 16, 32, 10, st)
      px(95, GROUND - 26, 2, 4, c('#d8b040'))
      px(93, GROUND - 25, 6, 1, c('#d8b040'))
      for (let wx = 84; wx < 110; wx += 8) px(wx, GROUND - 12, 2, 3, c('#3a2a20'))
      styledHouse(px, look, 30, 20, k, r, false)
      styledHouse(px, look, 140, 20, k, r, false)
      return
    }
    default: {
      // Колизей: ярусы арок.
      const x0 = 36
      const w = 120
      for (let tier = 0; tier < 3; tier++) {
        const y = GROUND - 10 - tier * 9
        px(x0 + tier * 3, y, w - tier * 6, 9, shade(p.stone, k - tier * 0.04))
        for (let ax = x0 + tier * 3 + 3; ax < x0 + w - tier * 3 - 5; ax += 7) px(ax, y + 3, 3, 5, c('#6b5f4e'))
      }
      px(x0 + 9, GROUND - 31, w - 18, 3, c(p.stoneDark))
    }
  }
}

/** Храм, святилище, церковь, мечеть — по стилю. */
function sanctuary(px: Px, look: Look, k: number, r: () => number) {
  const p = look.p
  const c = (x: string, d = 0) => shade(x, k + d)
  switch (look.style) {
    case 'egyptian': {
      const s = c('#c9a46a')
      px(50, GROUND - 30, 30, 30, s)
      px(112, GROUND - 30, 30, 30, s)
      px(80, GROUND - 20, 32, 20, c('#a8834e'))
      for (let y = GROUND - 26; y < GROUND - 4; y += 4) px(54, y, 22, 1, c('#a8834e'))
      return
    }
    case 'mesopotamian':
      stepped(px, 96, GROUND, 3, 70, 10, 7, c(p.stone), c(p.stoneDark))
      return
    case 'chinese':
    case 'japanese':
      px(50, GROUND - 4, 92, 4, c(p.stoneDark))
      px(58, GROUND - 22, 76, 18, c(look.style === 'chinese' ? '#a8402e' : '#6a4a30'))
      for (let x = 62; x < 132; x += 10) px(x, GROUND - 22, 2, 18, c('#c9402a'))
      curvedRoof(px, 58, 76, GROUND - 23, c(p.roof), true)
      if (look.style === 'japanese') torii(px, 10, c('#c9402a'))
      else pagoda(px, 170, 4, 12, c(p.wall), c(p.roof))
      return
    case 'indian':
      px(66, GROUND - 14, 60, 14, c(p.stone))
      for (let i = 0; i < 8; i++) px(84 + i, GROUND - 16 - i * 3, 24 - i * 2, 3, shade(p.stone, k - (i % 2) * 0.06))
      px(95, GROUND - 43, 2, 4, c('#d8b040'))
      return
    case 'islamic':
    case 'sahel':
      if (look.style === 'sahel') return landmark(px, look, '', k, r)
      px(60, GROUND - 18, 72, 18, c(p.stone))
      dome(px, 96, GROUND - 18, 15, c(p.accent), c('#d8b040'))
      minaret(px, 140, 40, c(p.stone), c(p.accent))
      for (let ax = 66; ax < 128; ax += 10) px(ax, GROUND - 11, 5, 11, c('#5a4a3a'))
      return
    case 'gothic':
      px(56, GROUND - 20, 80, 20, c(p.stone))
      gable(px, 56, 80, GROUND - 20, c('#5a5a66'), 0.3)
      px(130, GROUND - 34, 14, 34, c(p.stone))
      for (let i = 0; i < 20; i++) px(137 - Math.floor(i / 2.5), GROUND - 54 + i, Math.floor(i / 2.5) * 2 + 1, 1, c(p.stoneDark))
      for (let wx = 62; wx < 126; wx += 10) px(wx, GROUND - 16, 4, 9, c('#3a4a6a'))
      return
    case 'byzantine':
      px(62, GROUND - 18, 68, 18, c(p.wall))
      px(80, GROUND - 26, 32, 8, c(p.wall))
      dome(px, 96, GROUND - 26, 10, c(p.accent), c('#d8b040'))
      for (let wx = 68; wx < 126; wx += 8) px(wx, GROUND - 14, 3, 6, c('#3a3028'))
      return
    case 'russian': {
      const wood = c(p.wall)
      px(70, GROUND - 20, 52, 20, wood)
      for (let y = GROUND - 19; y < GROUND; y += 2) px(70, y, 52, 1, c(p.wall, -0.12))
      px(88, GROUND - 34, 16, 14, wood)
      for (let i = 0; i < 12; i++) px(96 - Math.floor(i / 2), GROUND - 46 + i, Math.floor(i / 2) * 2 + 1, 1, c('#5a4434'))
      onion(px, 96, GROUND - 46, 4, c('#3f6f9a'))
      return
    }
    case 'maya':
    case 'aztec':
      stepped(px, 96, GROUND, 5, 60, 5, 5, c(p.stone), c(p.stoneDark))
      px(86, GROUND - 33, 20, 8, c(p.accent))
      px(93, GROUND - 30, 6, 5, c('#3a2a20'))
      return
    case 'andean': {
      const st = c(p.stone)
      px(40, GROUND - 20, 112, 20, st)
      for (let y = GROUND - 18; y < GROUND; y += 3) for (let x = 42 + (y % 2) * 3; x < 150; x += 6) px(x, y, 1, 1, c(p.stoneDark))
      for (let nx = 52; nx < 146; nx += 14) {
        px(nx, GROUND - 14, 6, 10, c('#3a3028'))
        px(nx + 1, GROUND - 15, 4, 1, c('#3a3028'))
      }
      disc(px, 96, GROUND - 28, 6, c('#e0b030'))
      return
    }
    case 'ethiopian': {
      // Круглая церковь под соломенной крышей с крестом.
      const cx = 96
      px(cx - 22, GROUND - 14, 44, 14, c(p.wall))
      for (let wx = cx - 18; wx < cx + 18; wx += 9) px(wx, GROUND - 10, 3, 5, c('#3a2a20'))
      for (let i = 0; i < 14; i++) px(cx - 26 + i * 2, GROUND - 15 - i, 52 - i * 4, 1, c(p.roof, -(i % 2) * 0.05))
      px(cx, GROUND - 34, 1, 6, c('#d8b040'))
      px(cx - 2, GROUND - 32, 5, 1, c('#d8b040'))
      return
    }
    default:
      colonnade(px, 40, 112, GROUND - 30, p, k, 8)
  }
}

/** Дворец, усадьба знати. */
function palace(px: Px, look: Look, region: string, k: number, r: () => number) {
  const p = look.p
  const c = (x: string, d = 0) => shade(x, k + d)
  switch (look.style) {
    case 'chinese':
      px(20, GROUND - 6, 152, 6, c('#e8e0d0'))
      px(36, GROUND - 26, 120, 20, c('#a8402e'))
      for (let x = 40; x < 152; x += 10) px(x, GROUND - 26, 2, 20, c('#c9402a', 0.1))
      curvedRoof(px, 36, 120, GROUND - 27, c('#c9a03a'), true)
      px(60, GROUND - 38, 72, 6, c('#a8402e'))
      curvedRoof(px, 60, 72, GROUND - 39, c('#c9a03a'), true)
      return
    case 'japanese':
      px(30, GROUND - 10, 132, 10, c(p.stoneDark))
      px(46, GROUND - 26, 100, 16, c(p.wall))
      curvedRoof(px, 46, 100, GROUND - 27, c(p.roof), true)
      px(70, GROUND - 40, 52, 10, c(p.wall))
      curvedRoof(px, 70, 52, GROUND - 41, c(p.roof), true)
      return
    case 'gothic':
    case 'russian': {
      const st = c(look.style === 'russian' ? '#e8e2d4' : p.stone)
      px(30, GROUND - 22, 132, 22, st)
      crenels(px, 30, 132, GROUND - 22, st)
      for (const tx of [22, 158]) {
        px(tx, GROUND - 34, 14, 34, st)
        if (look.style === 'gothic') crenels(px, tx, 14, GROUND - 34, st)
        else onion(px, tx + 7, GROUND - 34, 6, c('#3f6a4a'))
      }
      for (let wx = 40; wx < 154; wx += 12) px(wx, GROUND - 16, 3, 5, c('#3a3028'))
      if (look.style === 'russian') for (let i = 0; i < 14; i++) px(96 - Math.floor(i / 2), GROUND - 36 + i, Math.floor(i / 2) * 2 + 1, 1, c('#a83a2f'))
      return
    }
    case 'islamic':
    case 'indian':
    case 'byzantine':
    case 'ethiopian': {
      const st = c(look.style === 'byzantine' ? p.wall : p.stone)
      px(26, GROUND - 22, 140, 22, st)
      for (let ax = 32; ax < 160; ax += 10) {
        px(ax, GROUND - 14, 5, 14, c('#5a4a3a'))
        px(ax + 1, GROUND - 15, 3, 1, c('#5a4a3a'))
      }
      const domeC = look.style === 'indian' ? c(p.stone) : look.style === 'ethiopian' ? c(p.stoneDark) : c(p.accent)
      for (const dx of [40, 96, 152]) dome(px, dx, GROUND - 22, dx === 96 ? 10 : 6, domeC, c('#d8b040'))
      return
    }
    case 'maya':
    case 'aztec':
    case 'andean':
    case 'mesopotamian':
    case 'egyptian':
    case 'sahel': {
      px(20, GROUND - 8, 152, 8, c(p.stoneDark))
      px(34, GROUND - 24, 124, 16, c(p.stone))
      for (let dx = 44; dx < 150; dx += 16) px(dx, GROUND - 18, 6, 10, c('#3a2a20'))
      if (look.style === 'mesopotamian' || look.style === 'sahel') crenels(px, 34, 124, GROUND - 24, c(p.stone))
      else px(30, GROUND - 28, 132, 4, c(look.style === 'maya' ? p.accent : p.stoneDark))
      return
    }
    default:
      void region
      colonnade(px, 24, 144, GROUND - 26, p, k, 12)
  }
}

/** Дом семьи героя по размеру: 0 — лачуга, 1 — хижина, 2 — дом, 3 — большой дом с пристройкой, 4 — усадьба за оградой. */
function familyHome(px: Px, look: Look, tier: number, k: number, r: () => number, lit: boolean) {
  const fence = shade('#7a5a3a', k)
  if (tier <= 0) {
    if (burnt) return styledHouse(px, look, 20, 20, k, r, lit)
    // Лачуга: жерди и низкий навес.
    built.push({ x: 20, w: 20, top: GROUND - 10 })
    px(22, GROUND - 8, 1, 8, fence)
    px(38, GROUND - 6, 1, 6, fence)
    for (let i = 0; i < 20; i++) px(20 + i, GROUND - 9 + Math.floor(i / 7), 1, 2, shade('#9a8050', k))
    px(24, GROUND - 5, 10, 5, shade('#3a2a20', k))
    return
  }
  if (tier === 1) return styledHouse(px, look, 18, 22, k, r, lit)
  if (tier === 2) return styledHouse(px, look, 14, 32, k, r, lit)
  if (tier === 3) {
    styledHouse(px, look, 8, 34, k, r, lit)
    styledHouse(px, look, 44, 22, k, r, lit)
    for (let x = 68; x < 84; x += 3) px(x, GROUND - 5, 1, 5, fence)
    px(68, GROUND - 4, 16, 1, fence)
    return
  }
  // Усадьба: ограда, главный дом, флигель и деревья.
  const wall = shade(look.p.stone, k)
  px(4, GROUND - 8, 92, 8, wall)
  px(4, GROUND - 9, 92, 1, shade(look.p.stoneDark, k))
  tree(px, look, 6, k, r)
  styledHouse(px, look, 18, 42, k, r, lit)
  styledHouse(px, look, 64, 24, k, r, lit)
  px(46, GROUND - 7, 6, 7, shade('#4a3020', k))
}

/** Обстановка жилья по достатку: 0 — лачуга с соломой, 1 — лавка у стены, 2 — сундук и полка с посудой,
 *  3 — ковёр на стене, светильники, 4 — расписной пояс, колонны и ткань на стене. */
function interior(px: Px, look: Look, tier: number, k: number, r: () => number) {
  const c = (hex: string, d = 0) => shade(hex, k * 0.6 + d)
  const wood = '#7a5a3a'
  const p = look.p
  if (tier === 0) {
    // Солома на полу и очаг из камней.
    for (let x = 4; x < W; x += 5 + Math.floor(r() * 4)) px(x, GROUND - 3, 3, 1, c('#c9a860'))
    px(90, GROUND - 4, 12, 2, c('#6a6460'))
    return
  }
  // Лавка вдоль стены.
  px(60, GROUND - 7, 26, 2, c(wood))
  px(61, GROUND - 5, 1, 5, c(wood, -0.1))
  px(84, GROUND - 5, 1, 5, c(wood, -0.1))
  if (tier >= 2) {
    // Полка с горшками и сундук.
    px(100, 12, 28, 1, c(wood))
    for (let i = 0; i < 4; i++) px(102 + i * 7, 8, 4, 4, c(p.clothes[i % p.clothes.length], -0.05))
    px(112, GROUND - 8, 14, 8, c('#6a4428'))
    px(112, GROUND - 8, 14, 1, c('#8a6438'))
    px(118, GROUND - 6, 2, 2, c('#c9a860'))
  }
  if (tier >= 3) {
    // Ковёр на стене и светильники.
    px(58, 6, 30, 20, c(p.accent, -0.05))
    px(60, 8, 26, 16, c(p.clothes[0]))
    for (let y = 10; y < 24; y += 4) px(62, y, 22, 1, c(p.accent))
    for (const lx of [40, 140]) {
      px(lx, 0, 1, 6, c('#4a3a2a'))
      px(lx - 1, 6, 3, 2, c('#e8c96a', 0.1))
    }
  }
  if (tier >= 4) {
    // Расписной пояс под потолком и две колонны.
    for (let x = 0; x < W; x += 6) px(x, 2, 4, 2, c(x % 12 ? p.accent : p.clothes[1 % p.clothes.length]))
    for (const cx of [8, 176]) {
      px(cx, 4, 6, GROUND - 6, c(p.stone, 0.05))
      px(cx - 1, 4, 8, 2, c(p.stoneDark))
    }
  }
}

/** Сгоревший, разрушенный или отстраивающийся дом во дворе — поверх нарисованного дома. */
function homeDamage(ctx: CanvasRenderingContext2D, px: Px, state: NonNullable<Cast['homeState']>, k: number, r: () => number) {
  for (const b of built) {
    if (state === 'burned') {
      // Остов уже нарисован вместо дома (burnt); сверху — тлеющие угли и дымок.
      for (let i = 0; i < 5; i++) px(b.x + 2 + Math.floor(r() * (b.w - 4)), GROUND - 1 - Math.floor(r() * 3), 1, 1, '#e0602a')
      ctx.globalAlpha = 0.45
      for (let i = 0; i < 3; i++) disc(px, b.x + b.w / 2 + i * 3, b.top - 8 - i * 6, 2 + i, '#8a847e')
      ctx.globalAlpha = 1
    } else if (state === 'ruined') {
      const cx = b.x + Math.floor(b.w / 2)
      for (let i = 0; i < 8; i++) px(cx - i, b.top + i, 2 + i * 2, 1, shade('#5a4a3a', k * 0.5))
      for (let i = 0; i < 6; i++) disc(px, b.x + 3 + Math.floor(r() * (b.w - 6)), GROUND - 1, 2 + Math.floor(r() * 2), r() > 0.5 ? '#8a7a68' : '#a8987e')
    } else {
      // Леса: свежие жерди, настил и лестница, светлое дерево на крыше.
      const pole = shade('#c9a26a', k)
      for (const x of [b.x - 2, b.x + b.w + 1, b.x + Math.floor(b.w / 2)]) px(x, b.top - 8, 1, GROUND - b.top + 8, pole)
      px(b.x - 2, b.top - 2, b.w + 4, 1, pole)
      px(b.x - 2, b.top + 6, b.w + 4, 1, pole)
      for (let y = b.top - 6; y < GROUND; y += 3) px(b.x + b.w + 3, y, 3, 1, pole)
      px(b.x + 2, b.top - 4, Math.floor(b.w / 2), 3, shade('#e0c08a', k))
    }
  }
}

/** Что продают на рынке в краю: цвета товара на прилавке. */
const GOODS: Record<string, string[]> = {
  russian: ['#6a4a2a', '#8a6a4a', '#d8b060', '#c8a050'], // меха, хлеб, мёд
  islamic: ['#a83a2f', '#2f4f8a', '#e0a030', '#c0602a'], // ковры, пряности
  chinese: ['#c0303a', '#e0c040', '#f2eee2', '#3f6fa8'], // шёлк, фарфор
  japanese: ['#9ab0c0', '#c0503a', '#e8dcc0', '#5a6a4a'], // рыба, посуда, рис
  indian: ['#e0a030', '#c0302a', '#2a8a6a', '#f2c94c'], // пряности, ткани
  gothic: ['#c8a050', '#f0d890', '#6a4a8a', '#a83a2f'], // хлеб, сыр, сукно
  byzantine: ['#8a3a6a', '#d8b060', '#6a8a3a', '#c8783a'], // шёлк, масло, фрукты
  roman: ['#c8783a', '#6a8a3a', '#e0c070', '#a8502a'], // амфоры, фрукты
  greek: ['#c8783a', '#6a8a3a', '#e0c070', '#a8502a'],
  egyptian: ['#e0c070', '#f2eee2', '#c8783a', '#3a7a6a'], // зерно, лён, горшки
  mesopotamian: ['#e0c070', '#c8783a', '#6a5a4a', '#a8502a'],
  maya: ['#6a3a20', '#2a8a5a', '#c0303a', '#e0b030'], // какао, перья, маис
  aztec: ['#6a3a20', '#2a8a5a', '#c0303a', '#e0b030'],
  andean: ['#8a6a4a', '#b83a3a', '#e0b030', '#efe2c8'], // картофель, ткани
  sahel: ['#f2eee2', '#e0b030', '#c0503a', '#3a5a9a'], // соль, золото, ткани
  ethiopian: ['#d8b060', '#c0503a', '#f2eee2', '#5a6a3a'],
}

/** Крупный прилавок на переднем плане: столбы, полосатый навес, прилавок с товаром. Продавца рисуют до прилавка. */
function stall(px: Px, look: Look, x: number, k: number, r: () => number, front: boolean) {
  const w = 26
  const c = (hex: string) => shade(hex, k * 0.85)
  if (!front) {
    const awning = ['#a83a2f', '#3f6f8a', '#c9a34a', '#4a7a3a'][Math.floor(r() * 4)]
    px(x + 1, GROUND - 22, 1, 22, c('#5a4030'))
    px(x + w - 2, GROUND - 22, 1, 22, c('#5a4030'))
    for (let i = 0; i < w; i += 4) {
      px(x + i, GROUND - 24, 2, 4, c(awning))
      px(x + i + 2, GROUND - 24, 2, 4, c('#efe8d8'))
    }
    return
  }
  px(x, GROUND - 8, w, 8, c('#7a5a3a'))
  px(x, GROUND - 8, w, 1, c('#9a7a52'))
  const goods = GOODS[look.style] ?? GOODS.gothic
  for (let gx = x + 1; gx < x + w - 3; gx += 4) px(gx, GROUND - 11, 3, 3, c(goods[Math.floor(r() * goods.length)]))
}

function backdrop(px: Px, place: ScenePlace, region: string, time: SceneTime, look: Look, r: () => number, home = 2, burned = false) {
  const p = look.p
  const k = SHADE[time]
  const lit = time === 'night' || time === 'sunset'
  const outdoor = !['home', 'workshop', 'school', 'bath'].includes(place)
  if (outdoor && (look.land === 'mountains' || look.land === 'snow') && place !== 'sea') farHills(px, look, k, r, true)
  switch (place) {
    case 'yard':
      if (look.land !== 'mountains' && look.land !== 'snow') farHills(px, look, k, r)
      tree(px, look, 176, k, r)
      burnt = burned
      familyHome(px, look, home, k, r, lit)
      burnt = false
      return
    case 'landmark':
      built.push({ x: 40, w: 112, top: GROUND - 30 })
      return landmark(px, look, region, k, r)
    case 'temple':
      built.push({ x: 50, w: 92, top: GROUND - 24 })
      return sanctuary(px, look, k, r)
    case 'palace':
      built.push({ x: 30, w: 132, top: GROUND - 24 })
      return palace(px, look, region, k, r)
    case 'street':
    case 'market': {
      // Дома стоят по одному, с промежутками; между ними иногда дерево.
      let x = 2 + Math.floor(r() * 6)
      while (x < W - 8) {
        const w = 20 + Math.floor(r() * 10)
        styledHouse(px, look, x, w, k, r, lit)
        x += w + 4 + Math.floor(r() * 6)
        if (r() > 0.6 && x < W - 12) {
          tree(px, look, x, k, r)
          x += 12
        }
      }
      // Лотки рынка рисуются поверх, на переднем плане (stall).
      return
    }
    case 'home':
    case 'workshop':
    case 'school':
    case 'bath': {
      // Интерьер: стена, окно, пол.
      const s = look.style
      const wallByStyle: Record<string, string> = { russian: '#9a6a44', japanese: '#e8dcc0', chinese: '#e2d4b8', sahel: '#c49a6a', ethiopian: '#c49a6a', andean: '#a8a090', maya: '#e0d4b0', aztec: '#e6dcc4', gothic: '#d8ccb0', islamic: '#ece0c6' }
      const wall = place === 'bath' ? '#c9d6d8' : place === 'workshop' ? '#b98d64' : wallByStyle[s] ?? '#e7d3ad'
      // Дом по достатку: лачуга темнее и без окна, палаты светлее.
      const tier = place === 'home' ? home : 2
      const wk = k * 0.6 + (tier === 0 ? -0.18 : tier >= 4 ? 0.06 : 0)
      px(0, 0, W, GROUND, shade(wall, wk))
      if (s === 'russian') for (let y = 2; y < GROUND; y += 3) px(0, y, W, 1, shade(wall, k * 0.6 - 0.12))
      px(0, GROUND - 2, W, 2, shade('#8a6a4a', k * 0.6))
      if (place !== 'bath' && tier > 0) {
        const glass = time === 'night' ? '#1f294c' : time === 'sunset' ? '#e8a070' : '#8ec0e6'
        if (s === 'japanese' || s === 'chinese') {
          // Решётчатое окно с бумагой.
          px(24, 8, 26, 20, shade('#5a4030', k * 0.6))
          px(26, 10, 22, 16, time === 'night' ? '#3a3a50' : '#f2ead8')
          for (let x = 30; x < 48; x += 5) px(x, 10, 1, 16, shade('#5a4030', k * 0.6))
          for (let y = 14; y < 26; y += 5) px(26, y, 22, 1, shade('#5a4030', k * 0.6))
        } else if (s === 'islamic' || s === 'indian' || s === 'byzantine' || s === 'ethiopian') {
          // Арочное окно.
          px(28, 10, 14, 16, shade('#7a5a3a', k * 0.6))
          px(30, 12, 10, 14, glass)
          px(31, 11, 8, 1, glass)
        } else if (s === 'maya' || s === 'aztec' || s === 'andean' || s === 'sahel') {
          // Проём без стекла.
          px(28, 12, 12, 14, shade('#3a2a20', k * 0.6))
          px(30, 14, 8, 10, glass)
        } else {
          px(26, 8, 22, 18, shade('#7a5a3a', k * 0.6))
          px(28, 10, 8, 6, glass)
          px(38, 10, 8, 6, glass)
          px(28, 18, 8, 6, glass)
          px(38, 18, 8, 6, glass)
        }
        if (s === 'russian' && place === 'home') {
          // Печь.
          px(150, 12, 30, GROUND - 14, shade('#e8e0d0', k * 0.6))
          px(158, 26, 12, 8, shade('#3a2a20', k * 0.6))
        }
      } else if (place === 'bath') {
        for (let x = 20; x < W; x += 40) px(x, 6, 4, GROUND - 6, shade('#e9e1cc', k * 0.6))
      }
      if (place === 'school') {
        px(120, 10, 40, 14, shade('#6a5a4a', k * 0.6))
        for (let x = 124; x < 156; x += 6) px(x, 12, 3, 10, shade('#e9dcc0', k * 0.6))
      }
      if (place === 'workshop') for (let x = 110; x < 170; x += 12) px(x, 16, 8, 2, shade('#6a4a30', k * 0.6))
      if (place === 'home') interior(px, look, tier, k, r)
      return
    }
    case 'field': {
      if (look.land !== 'mountains' && look.land !== 'snow') farHills(px, look, k, r)
      const s = look.style
      if (s === 'andean') {
        for (let i = 0; i < 4; i++) px(i * 14, GROUND - 16 + i * 4, W, 4, shade('#7f9a5a', k - (i % 2) * 0.06))
      } else if (s === 'maya' || s === 'aztec') {
        px(0, GROUND - 4, W, 4, shade('#6f8a4a', k))
        for (let x = 4; x < W; x += 7) {
          px(x, GROUND - 14, 1, 14, shade('#5a8a3a', k))
          px(x - 1, GROUND - 10, 1, 2, shade('#5a8a3a', k))
          px(x, GROUND - 16, 1, 2, shade('#d8b44a', k))
        }
      } else {
        px(0, GROUND - 8, W, 8, shade('#7f9a5a', k))
        for (let x = 0; x < W; x += 30) disc(px, x + 15, GROUND - 6, 8, shade('#6f8a4a', k))
      }
      return
    }
    case 'river':
      if (region === 'egypt' || look.style === 'egyptian') pyramid(px, 150, 34, 5, shade('#c99a5a', k - 0.1))
      else if (look.style !== 'roman' && look.style !== 'greek') for (let x = 120; x < 190; x += 26) styledHouse(px, look, x, 18, k - 0.05, r, lit)
      px(0, GROUND - 4, W, 4, shade('#7f9a5a', k))
      return
    case 'sea':
      px(0, GROUND - 3, W, 3, shade('#4f6f8a', k))
      return
    case 'harbor':
      if (region === 'egypt') {
        // Фаросский маяк.
        px(160, GROUND - 34, 8, 34, shade(p.stone, k))
        px(161, GROUND - 40, 6, 6, shade(p.stone, k))
        px(162, GROUND - 43, 4, 3, '#f2c94c')
      }
      styledHouse(px, look, 6, 26, k, r, lit)
      px(44, GROUND - 2, 60, 2, shade('#6a4a30', k))
      return
    case 'camp':
      for (let x = 20; x < W - 20; x += 34) {
        for (let i = 0; i < 9; i++) px(x + 9 - i, GROUND - 9 + i, i * 2 + 1, 1, shade(i % 2 ? '#c9b48a' : '#bba67c', k))
        px(x + 8, GROUND - 4, 3, 4, shade('#6a5a3a', k))
      }
      return
    case 'battle':
      px(0, GROUND - 6, W, 6, shade('#8f8a6a', k))
      for (let x = 0; x < W; x += 40) disc(px, x + 20, GROUND - 4, 10, shade('#7f7a5a', k))
      return
    case 'arena':
      if (look.style === 'maya' || look.style === 'aztec') {
        // Площадка для игры в мяч: два наклонных склона и кольца.
        for (const [x0, dir] of [[10, 1], [182, -1]] as const) {
          for (let i = 0; i < 18; i++) px(dir > 0 ? x0 : x0 - (30 - i), GROUND - 18 + i, 30 - i + (dir > 0 ? 0 : 0), 1, shade(p.stone, k - (i % 3 === 0 ? 0.05 : 0)))
        }
        disc(px, 48, 20, 3, shade(p.stoneDark, k))
        disc(px, 144, 20, 3, shade(p.stoneDark, k))
        disc(px, 48, 20, 1, shade('#6a9ac8', k))
        disc(px, 144, 20, 1, shade('#6a9ac8', k))
        return
      }
      for (let tier = 0; tier < 4; tier++) px(0, 10 + tier * 7, W, 6, shade(tier % 2 ? p.stone : p.stoneDark, k))
      for (let x = 4; x < W; x += 10) px(x, 33, 4, 8, shade('#6b5f4e', k))
      if (look.style === 'byzantine') {
        px(94, 6, 4, 38, shade('#c99a6a', k))
        px(95, 3, 2, 3, shade('#c99a6a', k))
      }
      return
    case 'road':
      if (look.land !== 'mountains' && look.land !== 'snow') farHills(px, look, k, r)
      for (let x = 10; x < W; x += 46) tree(px, look, x, k, r)
      return
    case 'tomb': {
      const s = look.style
      if (s === 'chinese' || s === 'japanese') {
        disc(px, 96, GROUND, 18, shade('#6f8a4a', k))
        px(92, GROUND - 14, 8, 14, shade(p.stone, k))
        curvedRoof(px, 92, 8, GROUND - 15, shade(p.roof, k))
      } else if (s === 'islamic' || s === 'indian') {
        px(80, GROUND - 16, 32, 16, shade(p.stone, k))
        dome(px, 96, GROUND - 16, 10, shade(s === 'islamic' ? p.accent : p.stone, k))
      } else if (s === 'gothic' || s === 'byzantine' || s === 'russian' || s === 'ethiopian') {
        for (let x = 30; x < W - 20; x += 28) {
          px(x + 3, GROUND - 14, 2, 14, shade(p.stoneDark, k))
          px(x, GROUND - 11, 8, 2, shade(p.stoneDark, k))
        }
      } else if (s === 'maya' || s === 'aztec') {
        px(88, GROUND - 26, 16, 26, shade(p.stone, k))
        for (let y = GROUND - 22; y < GROUND - 2; y += 4) px(90, y, 12, 1, shade(p.stoneDark, k))
      } else if (s === 'andean') {
        px(86, GROUND - 24, 20, 24, shade(p.stone, k))
        px(84, GROUND - 26, 24, 2, shade(p.stoneDark, k))
      } else if (s === 'egyptian' || s === 'mesopotamian' || s === 'sahel') {
        pyramid(px, 96, 50, 6, shade(p.stone, k))
      } else {
        px(78, GROUND - 22, 36, 22, shade(p.stone, k))
        px(74, GROUND - 25, 44, 3, shade(p.stoneDark, k))
        px(92, GROUND - 14, 8, 14, shade('#3a3028', k))
        for (let x = 20; x < W; x += 60) px(x, GROUND - 8, 5, 8, shade(p.stoneDark, k))
      }
      return
    }
  }
}

// ---------- Человечки и предметы ----------

/** Кто стоит на картинке: герой, его близкие. Внешность героя одна и та же во всех сценах. */
export interface CastMember {
  role: 'hero' | 'spouse' | 'child' | 'parent' | 'sibling' | 'npc'
  sex: 'm' | 'f'
  age: number
  seed: string
  /** Внешность как на портрете (src/pixel/avatar.ts → figureLook): кожа, седина, одежда, убор, борода. */
  look?: FigureLook
}

export interface Cast {
  members: CastMember[]
  animals: string[]
  /** Дом семьи 0–4 (для сцены 'yard'). */
  home?: number
  /** Сколько близких не поместилось на картинку («+3»). */
  more?: number
  /** Дом сгорел, разрушен или отстраивается: так он и выглядит во дворе. */
  homeState?: 'burned' | 'ruined' | 'rebuilding'
  /** Герой торгует сам: на рынке он за своим прилавком. */
  ownStall?: boolean
}

/** Рост фигурки по возрасту: близкие героя чуть крупнее прохожих (взрослый — 14 точек, прохожий — 12). */
function heightFor(age: number): number {
  return age < 4 ? 6 : age < 10 ? 9 : age < 15 ? 11 : 14
}

/** Близкий человек героя: те же цвета, убор и борода, что на портрете. */
function figure(px: Px, x: number, k: number, base: number, m: CastMember, f: FigureLook) {
  const h = heightFor(m.age)
  const top = base + 1 - h
  const c = (hex: string) => shade(hex, k * 0.5)
  const tiny = h <= 6
  const faceH = tiny ? 2 : 3
  if (m.role === 'hero') {
    // Отметка героя: золотой треугольник над головой.
    px(x, top - 6, 5, 1, '#f2c94c')
    px(x + 1, top - 5, 3, 1, '#f2c94c')
    px(x + 2, top - 4, 1, 1, '#f2c94c')
  }
  // Волосы (у лысых — кожа), длинные волосы у женщин по бокам лица.
  px(x + 1, top, 3, 1, c(f.bald ? f.skin : f.hair))
  const covered = f.hat === 'cover'
  if (f.longHair && !covered) {
    px(x, top, 1, Math.min(5, h - 6), c(f.hair))
    px(x + 4, top, 1, Math.min(5, h - 6), c(f.hair))
  }
  px(x + 1, top + 1, 3, faceH, c(f.skin))
  if (f.beard && !tiny) px(x + 1, top + faceH, 3, 1, c(f.hair))
  if (!tiny) {
    switch (f.hat) {
      case 'cover':
        px(x, top - 1, 5, 2, c(f.hatColor))
        px(x, top + 1, 1, 4, c(f.hatColor))
        px(x + 4, top + 1, 1, 4, c(f.hatColor))
        break
      case 'turban':
        px(x, top - 1, 5, 2, c(f.hatColor))
        break
      case 'tall':
        px(x - 1, top, 7, 1, c(f.hatColor))
        px(x + 1, top - 1, 3, 1, c(f.hatColor))
        px(x + 2, top - 2, 1, 1, c(f.hatColor))
        break
      case 'feather':
        px(x + 1, top - 1, 3, 1, c(f.hatColor))
        px(x + 2, top - 4, 1, 3, c(f.hatColor))
        break
      case 'cap':
        px(x, top - 1, 5, 1, c(f.hatColor))
        px(x + 1, top - 2, 3, 1, c(f.hatColor))
        break
      case 'band':
        px(x, top, 5, 1, c(f.hatColor))
        break
    }
  }
  const bodyTop = top + faceH + 1
  const legs = tiny ? 1 : h <= 9 ? 2 : 3
  const bodyH = h - (bodyTop - top) - legs
  px(x, bodyTop, 5, bodyH, c(f.cloth))
  if (f.trim && bodyH > 3) px(x, bodyTop + bodyH - 2, 5, 1, c(f.trim))
  if (m.sex === 'f' && h >= 11) {
    // Платье до земли: ноги почти не видны.
    px(x - 1, bodyTop + bodyH - 1, 7, legs, c(f.cloth))
    return
  }
  px(x + 1, bodyTop + bodyH, 1, legs, c('#3a2a20'))
  px(x + 3, bodyTop + bodyH, 1, legs, c('#3a2a20'))
}

function person(px: Px, x: number, look: Look, r: () => number, k: number, small = false, base = GROUND, m?: CastMember) {
  if (m?.look) return figure(px, x, k, base, m, m.look)
  const p = look.p
  const own = m ? rand(`person:${m.seed}`) : r
  const h = m ? heightFor(m.age) : small ? 8 : 12
  const tiny = h <= 8
  const top = base + 1 - h
  const skin = p.skin[Math.floor(own() * p.skin.length)]
  const cloth = p.clothes[Math.floor(own() * p.clothes.length)]
  const hats = HATS[look.style] ?? [null]
  const hat = tiny ? null : hats[Math.floor(own() * hats.length)]
  const hair = m && m.age >= 55 ? '#c8c4bc' : '#2a2018'
  px(x + 1, top, 3, 1, shade(hair, k * 0.5)) // волосы
  if (m?.sex === 'f' && !hat) {
    px(x, top, 1, Math.min(4, h - 4), shade(hair, k * 0.5))
    px(x + 4, top, 1, Math.min(4, h - 4), shade(hair, k * 0.5))
  }
  if (m?.role === 'hero') {
    // Отметка героя: золотой треугольник над головой.
    px(x, top - 6, 5, 1, '#f2c94c')
    px(x + 1, top - 5, 3, 1, '#f2c94c')
    px(x + 2, top - 4, 1, 1, '#f2c94c')
  }
  if (hat === 'turban') px(x, top - 1, 5, 2, shade('#f2eee2', k * 0.5))
  if (hat === 'veil') px(x, top - 1, 5, 4, shade(p.clothes[0], k * 0.5))
  if (hat === 'conical') {
    px(x - 1, top, 7, 1, shade('#c9a860', k * 0.5))
    px(x + 1, top - 1, 3, 1, shade('#c9a860', k * 0.5))
    px(x + 2, top - 2, 1, 1, shade('#c9a860', k * 0.5))
  }
  if (hat === 'feather') px(x + 2, top - 3, 1, 3, shade(['#2a8a5a', '#c0303a', '#e0b030'][Math.floor(own() * 3)], k * 0.5))
  if (hat === 'cap') px(x, top - 1, 5, 2, shade(look.style === 'andean' ? '#b83a3a' : '#5a3a2a', k * 0.5))
  px(x + 1, top + 1, 3, tiny ? 1 : 2, shade(skin, k * 0.5)) // лицо
  const bodyTop = top + (tiny ? 2 : 3)
  const bodyH = h <= 6 ? 3 : tiny ? 4 : h <= 10 ? 5 : 6
  px(x, bodyTop, 5, bodyH, shade(cloth, k * 0.5))
  px(x + 1, bodyTop + bodyH, 1, h - (bodyTop - top) - bodyH, shade('#3a2a20', k * 0.5))
  px(x + 3, bodyTop + bodyH, 1, h - (bodyTop - top) - bodyH, shade('#3a2a20', k * 0.5))
}

function prop(px: Px, kind: SceneProp, x: number, time: SceneTime, p: Palette, k: number, r: () => number) {
  const g = GROUND
  switch (kind) {
    case 'sun':
      return disc(px, 150, 18, 6, time === 'sunset' ? '#f8d48a' : '#fff1b0')
    case 'moon':
      disc(px, 160, 10, 4, '#f4ecd0')
      return disc(px, 162, 9, 3, SKY.night[0])
    case 'fire':
      px(x, g - 3, 6, 3, '#e0702a')
      px(x + 1, g - 6, 4, 3, '#f2a03a')
      return px(x + 2, g - 8, 2, 2, '#f8d48a')
    case 'smoke':
      for (let i = 0; i < 4; i++) disc(px, x + 4 + i * 3, g - 14 - i * 6, 3 + i, shade('#9a9a9a', k * 0.4 - 0.1))
      return
    case 'boat':
      px(x, g + 4, 22, 3, '#6a4a2a')
      px(x + 3, g + 7, 16, 1, '#4a3420')
      px(x + 10, g - 12, 1, 16, '#4a3420')
      for (let i = 0; i < 12; i++) px(x + 11, g - 11 + i, Math.min(i, 8), 1, '#f2ead8')
      return
    case 'bed':
      px(x, g - 6, 34, 6, shade('#7a5a3a', k * 0.6))
      px(x, g - 9, 34, 3, '#f2ead8')
      return px(x + 2, g - 11, 8, 2, '#f2ead8')
    case 'cradle':
      px(x, g - 6, 12, 5, shade('#8a6a40', k * 0.6))
      px(x + 1, g - 1, 2, 1, '#5a4030')
      return px(x + 9, g - 1, 2, 1, '#5a4030')
    case 'table':
      px(x, g - 7, 24, 2, shade('#7a5a3a', k * 0.6))
      px(x + 2, g - 5, 2, 5, shade('#5a4030', k * 0.6))
      px(x + 20, g - 5, 2, 5, shade('#5a4030', k * 0.6))
      px(x + 5, g - 9, 4, 2, '#e9dcc0')
      return px(x + 14, g - 10, 3, 3, '#a8553a')
    case 'scroll':
      px(x, g - 4, 8, 3, '#efe3c2')
      px(x, g - 5, 1, 5, '#a88a5a')
      return px(x + 7, g - 5, 1, 5, '#a88a5a')
    case 'coins':
      for (let i = 0; i < 4; i++) px(x + i * 2, g - 1 - (i % 2), 2, 1, '#e8c04a')
      return px(x + 2, g - 3, 2, 1, '#f2d46a')
    case 'amphora':
      px(x + 1, g - 9, 3, 1, '#9a5a32')
      px(x, g - 8, 5, 6, '#b8683a')
      return px(x + 1, g - 2, 3, 2, '#9a5a32')
    case 'tree':
      px(x + 3, g - 10, 2, 10, '#5a4030')
      return disc(px, x + 4, g - 14, 5, shade('#4f7a3a', k))
    case 'olive':
      px(x + 3, g - 8, 2, 8, '#6a5a4a')
      return disc(px, x + 4, g - 11, 4, shade('#7f8f5a', k))
    case 'palm':
      px(x + 3, g - 16, 1, 16, '#6a4a2a')
      px(x - 2, g - 17, 11, 1, shade('#4f8a3a', k))
      px(x - 3, g - 16, 2, 1, shade('#4f8a3a', k))
      return px(x + 8, g - 16, 2, 1, shade('#4f8a3a', k))
    case 'grain':
      for (let i = 0; i < 6; i++) px(x + i * 2, g - 6 - (i % 2), 1, 6, '#d8b44a')
      return
    case 'goat':
      px(x, g - 5, 7, 3, '#e9e0d0')
      px(x + 6, g - 7, 2, 2, '#e9e0d0')
      px(x + 1, g - 2, 1, 2, '#5a4a3a')
      return px(x + 5, g - 2, 1, 2, '#5a4a3a')
    case 'horse':
      px(x, g - 9, 12, 5, '#7a4a2a')
      px(x + 11, g - 12, 3, 5, '#7a4a2a')
      for (const lx of [1, 3, 8, 10]) px(x + lx, g - 4, 1, 4, '#4a2a1a')
      return
    case 'cart':
      px(x, g - 6, 16, 3, '#7a5a3a')
      disc(px, x + 3, g - 2, 2, '#4a3420')
      return disc(px, x + 12, g - 2, 2, '#4a3420')
    case 'lamp':
      px(x + 2, g - 18, 1, 18, '#3a3028')
      return px(x, g - 20, 5, 2, '#f2d46a')
    case 'altar':
      px(x, g - 6, 10, 6, shade(p.stone, k))
      px(x + 3, g - 9, 4, 3, '#e0702a')
      return
    case 'statue':
      px(x, g - 4, 8, 4, shade(p.stoneDark, k))
      px(x + 2, g - 14, 4, 10, shade(p.stone, k))
      return px(x + 3, g - 16, 2, 2, shade(p.stone, k))
    case 'rain':
      for (let i = 0; i < 70; i++) px(Math.floor(r() * W), Math.floor(r() * GROUND), 1, 2, '#9fb6cc')
      return
    case 'banner':
      px(x, g - 22, 1, 22, '#4a3420')
      return px(x + 1, g - 22, 6, 7, '#a83a2f')
    case 'shield':
      return px(x, g - 8, 5, 7, '#a83a2f')
    case 'loom':
      px(x, g - 14, 1, 14, '#6a4a2a')
      px(x + 10, g - 14, 1, 14, '#6a4a2a')
      px(x, g - 14, 11, 1, '#6a4a2a')
      for (let i = 1; i < 10; i += 2) px(x + i, g - 13, 1, 9, '#c9a34a')
      return
    case 'anvil':
      px(x, g - 5, 8, 2, '#4a4a4a')
      return px(x + 2, g - 3, 4, 3, '#3a3a3a')
  }
}

/** Куда ставить предметы, чтобы они не наезжали на людей. */
const PROP_X = [16, 168, 120, 60]

export interface SceneInput {
  scene: SceneDef
  region: string
  /** Ключ разнообразия: id события, чтобы разные события с одной сценой отличались. */
  seed: string
  /** Герой, его близкие и животные: они стоят на картинке вместо случайных прохожих. */
  cast?: Cast
}

/** Животное хозяйства: маленький силуэт, стоит на земле в точке x. */
function animal(px: Px, kind: string, x: number, k: number) {
  const g = GROUND
  const c = (h: string) => shade(h, k * 0.6)
  const legs = (xs: number[], col: string, h = 2) => xs.forEach((lx) => px(x + lx, g - h, 1, h, c(col)))
  switch (kind) {
    case 'chickens':
    case 'turkey':
      for (const [dx, col] of [[0, kind === 'turkey' ? '#4a3a2a' : '#f2ead8'], [5, kind === 'turkey' ? '#5a4030' : '#c9a060']] as const) {
        px(x + dx, g - 3, 3, 2, c(col))
        px(x + dx + 2, g - 4, 1, 1, c(col))
        px(x + dx + 3, g - 4, 1, 1, c('#c0303a'))
        px(x + dx + 1, g - 1, 1, 1, c('#d8a040'))
      }
      return
    case 'goat':
    case 'sheep': {
      const col = kind === 'sheep' ? '#efe9dc' : '#d8ccb4'
      px(x, g - 5, 7, 3, c(col))
      px(x + 6, g - 7, 2, 3, c(kind === 'sheep' ? '#3a3028' : col))
      if (kind === 'goat') px(x + 7, g - 8, 1, 1, c('#6a5a4a'))
      legs([1, 5], '#4a3a2a')
      return
    }
    case 'pig':
      px(x, g - 5, 7, 3, c('#e0a8a0'))
      px(x + 7, g - 4, 1, 2, c('#d09088'))
      legs([1, 5], '#a87870')
      return
    case 'cow':
    case 'ox': {
      const col = kind === 'cow' ? '#f2ead8' : '#8a5a3a'
      px(x, g - 8, 11, 5, c(col))
      if (kind === 'cow') {
        px(x + 2, g - 7, 3, 2, c('#3a2a20'))
        px(x + 7, g - 6, 2, 2, c('#3a2a20'))
      }
      px(x + 10, g - 9, 3, 3, c(col))
      px(x + 10, g - 10, 1, 1, c('#e8dcc0'))
      px(x + 12, g - 10, 1, 1, c('#e8dcc0'))
      legs([1, 3, 7, 9], '#3a2a20', 3)
      return
    }
    case 'donkey':
      px(x, g - 7, 9, 4, c('#8a8680'))
      px(x + 8, g - 10, 3, 4, c('#8a8680'))
      px(x + 9, g - 12, 1, 2, c('#6a6660'))
      legs([1, 3, 6, 8], '#4a4640', 3)
      return
    case 'horse':
      px(x, g - 9, 12, 5, c('#7a4a2a'))
      px(x + 11, g - 12, 3, 5, c('#7a4a2a'))
      px(x - 1, g - 9, 1, 4, c('#3a2418'))
      legs([1, 3, 8, 10], '#4a2a1a', 4)
      return
    case 'camel':
      px(x, g - 9, 12, 4, c('#c8a068'))
      px(x + 3, g - 12, 5, 3, c('#c8a068'))
      px(x + 11, g - 13, 2, 6, c('#c8a068'))
      px(x + 12, g - 14, 3, 2, c('#c8a068'))
      legs([1, 3, 8, 10], '#8a6a40', 5)
      return
    case 'llama':
      px(x, g - 7, 8, 4, c('#efe2c8'))
      px(x + 7, g - 13, 2, 7, c('#efe2c8'))
      px(x + 8, g - 14, 2, 2, c('#efe2c8'))
      legs([1, 3, 5, 7], '#8a7a60', 3)
      return
    case 'dog':
      px(x, g - 4, 6, 2, c('#9a6a3a'))
      px(x + 5, g - 6, 3, 3, c('#9a6a3a'))
      px(x - 1, g - 5, 1, 2, c('#9a6a3a'))
      legs([0, 4], '#6a4a2a')
      return
    case 'cat':
      px(x, g - 3, 5, 2, c('#5a5a5a'))
      px(x + 4, g - 5, 3, 2, c('#5a5a5a'))
      px(x + 4, g - 6, 1, 1, c('#5a5a5a'))
      px(x + 6, g - 6, 1, 1, c('#5a5a5a'))
      px(x - 1, g - 6, 1, 4, c('#5a5a5a'))
      legs([0, 3], '#4a4a4a', 1)
      return
  }
}

/** Бедствие поверх построек: пожар, разрушение, наводнение. */
function disasterOverlay(ctx: CanvasRenderingContext2D, px: Px, kind: 'fire' | 'ruin' | 'flood', sky: string, r: () => number) {
  const targets = built.length ? built : [{ x: 40, w: 112, top: GROUND - 24 }]
  if (kind === 'fire') {
    ctx.globalAlpha = 0.18
    px(0, 0, W, GROUND, '#ff7a2a')
    ctx.globalAlpha = 1
    for (const b of targets) {
      if (r() < 0.25 && targets.length > 2) continue
      for (let fx = b.x + 2; fx < b.x + b.w - 3; fx += 5 + Math.floor(r() * 3)) {
        const fh = 5 + Math.floor(r() * 7)
        px(fx, b.top - fh + 6, 4, fh, '#e0602a')
        px(fx + 1, b.top - fh + 3, 2, fh - 2, '#f2a03a')
        px(fx + 1, b.top - fh + 2, 1, 2, '#f8d48a')
      }
      for (let i = 0; i < 3; i++) disc(px, b.x + b.w / 2 + i * 4, b.top - 12 - i * 7, 3 + i, i % 2 ? '#6a6460' : '#857e78')
      // Отблеск огня на земле перед домом.
      ctx.globalAlpha = 0.35
      px(b.x - 2, GROUND, b.w + 4, 3, '#ff8c3c')
      ctx.globalAlpha = 1
    }
  } else if (kind === 'ruin') {
    for (const b of targets) {
      // Пролом в стене и крыше: «вырезаем» цветом неба, внизу — груда камней и балок.
      const cx = b.x + Math.floor(b.w * (0.3 + r() * 0.4))
      for (let i = 0; i < 9; i++) px(cx - i, b.top - 6 + i, 2 + i * 2, 1, sky)
      for (let i = 0; i < 6; i++) disc(px, b.x + 3 + Math.floor(r() * (b.w - 6)), GROUND - 1, 2 + Math.floor(r() * 2), r() > 0.5 ? '#8a7a68' : '#a8987e')
      px(b.x + 2, GROUND - 4, b.w / 2, 1, '#5a3a24')
    }
    ctx.globalAlpha = 0.22
    px(0, GROUND - 16, W, 16, '#c8b89a')
    ctx.globalAlpha = 1
  } else {
    px(0, GROUND - 6, W, H - GROUND + 6, '#4f7fa8')
    for (let y = GROUND - 5; y < H; y += 3) for (let x = Math.floor(r() * 8); x < W; x += 10 + Math.floor(r() * 6)) px(x, y, 4, 1, '#8ab4d8')
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { scene, region, seed, cast } = input
  // Пожар дома видно снаружи: горит сам дом героя, семья перед ним. Пожар мастерской — с улицы.
  let place = scene.place ?? 'landmark'
  if (scene.disaster === 'fire' && place === 'home') place = 'yard'
  if (scene.disaster === 'fire' && (place === 'workshop' || place === 'school' || place === 'bath')) place = 'street'
  built = []
  const time = scene.time ?? 'day'
  const look = lookOf(region)
  const p = look.p
  const r = rand(`${seed}:${place}:${region}`)
  const px: Px = (x, y, w, h, c) => {
    ctx.fillStyle = c
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h)))
  }
  ctx.clearRect(0, 0, W, H)
  sky(px, time, r)
  const props = scene.props ?? []
  if (props.includes('sun') && place !== 'home' && place !== 'workshop' && place !== 'school' && place !== 'bath') prop(px, 'sun', 0, time, p, 0, r)
  if (props.includes('moon')) prop(px, 'moon', 0, time, p, 0, r)
  backdrop(px, place, region, time, look, r, cast?.home ?? 2, !scene.disaster && cast?.homeState === 'burned')
  ground(px, place, p, time, r, look.style)
  const k = SHADE[time]
  if (scene.disaster) disasterOverlay(ctx, px, scene.disaster, SKY[time][3], r)
  else if (place === 'yard' && cast?.homeState) homeDamage(ctx, px, cast.homeState, k, r)
  // При пожаре огонь и дым — на домах (disasterOverlay), а не отдельным костром рядом.
  const placed = props.filter((x) => x !== 'sun' && x !== 'moon' && x !== 'rain' && !(scene.disaster === 'fire' && (x === 'fire' || x === 'smoke')))
  // На воде люди стоят в лодке, в гавани — на причале.
  const water = place === 'sea'
  const boatX = water ? 84 : 0
  const xs = placed.map((_, i) => (water && placed[i] === 'boat' ? boatX : PROP_X[i % PROP_X.length] + Math.floor(r() * 6)))
  if (water && !placed.includes('boat') && (scene.people ?? 0) > 0) {
    placed.push('boat')
    xs.push(boatX)
  }
  placed.forEach((kind, i) => prop(px, kind, xs[i], time, p, k, r))
  // Близкие героя стоят первыми; остальные места — прохожие. Во дворе и дома чужих нет.
  let members = cast?.members.slice(0, 8) ?? []
  const private_ = place === 'yard' || place === 'home'
  let extras = private_ && cast ? (place === 'home' && cast.home === 4 ? 1 : 0) : Math.max(0, (scene.people ?? 2) - members.length)
  if (place === 'market') {
    // Рынок: крупные лотки по краям, за ними продавцы, прохожие — в глубине, мельче; семья героя — в середине.
    const own = !!cast?.ownStall && members.length > 0
    const stalls = own ? [4, 32, 83] : [4, 32, 136, 164]
    for (let i = 0; i < Math.min(extras, 4); i++) person(px, 14 + Math.floor(r() * 164), look, r, k * 0.85, true, GROUND - 4)
    for (const sx of stalls) {
      stall(px, look, sx, k, r, false)
      if (own && sx === 83) person(px, sx + 10, look, r, k, false, GROUND, members[0])
      else person(px, sx + 10, look, r, k, false, GROUND)
      stall(px, look, sx, k, r, true)
      if (scene.disaster === 'fire') {
        // Пожар на рынке: горят навесы и товар.
        for (let fx = sx + 1; fx < sx + 24; fx += 5) {
          const fh = 5 + Math.floor(r() * 6)
          px(fx, GROUND - 24 - fh + 4, 4, fh, '#e0602a')
          px(fx + 1, GROUND - 24 - fh + 2, 2, fh - 2, '#f2a03a')
        }
        disc(px, sx + 13, GROUND - 34, 4, '#6a6460')
      }
    }
    extras = 0
    if (own) {
      // Семья — рядом с прилавком героя, справа.
      members = members.slice(1)
      const m = members.length
      for (let i = 0; i < m; i++) person(px, 116 + i * 10, look, r, k, false, GROUND, members[i])
      members = []
    }
  }
  let n = Math.min(water ? 2 : 8, members.length + extras)
  let span = n > 1 ? Math.min(place === 'yard' || place === 'market' ? 70 : 110, n * 13) : 0
  let start = (place === 'yard' ? 108 : 96) - span / 2
  if (place === 'yard' && cast) {
    // Животные во дворе — справа от семьи.
    let ax = start + span + 12
    for (const kind of cast.animals.slice(0, 6)) {
      if (ax > W - 14) break
      animal(px, kind, ax, k)
      ax += kind === 'chickens' || kind === 'turkey' || kind === 'dog' || kind === 'cat' ? 10 : 15
    }
  } else if (cast?.animals.length && !water && place !== 'home' && place !== 'school' && place !== 'bath' && place !== 'workshop') {
    // На улице и в поле за героем идёт пёс, если он есть.
    const pet = cast.animals.find((a) => a === 'dog')
    if (pet) animal(px, pet, 96 - span / 2 - 12, k)
  }
  let base = GROUND
  if (water) {
    n = Math.min(n, 2)
    span = n > 1 ? 7 : 0
    start = boatX + 3
    base = GROUND + 3
  } else if (place === 'harbor') {
    span = n > 1 ? Math.min(50, n * 12) : 0
    start = 74 - span / 2
    base = GROUND - 2
  }
  for (let i = 0; i < n; i++) {
    const x = start + (n > 1 ? (i * span) / (n - 1) : 0) + (water ? 0 : Math.floor(r() * 4) - 2)
    const m = members[i]
    person(px, x, look, r, k, !m && place === 'home' && i === n - 1 && n > 2, base, m)
  }
  // Не поместившиеся близкие — подписью «+N» справа от семьи.
  if (cast?.more) {
    // Над правым краем семьи, выше голов: не заслоняет ни людей, ни животных.
    const x = Math.min(W - 14, start + span)
    px(x - 1, base - 25, 12, 8, 'rgba(20,16,12,0.7)')
    ctx.fillStyle = '#f2ead8'
    ctx.font = 'bold 7px sans-serif'
    ctx.fillText(`+${cast.more}`, x, base - 19)
  }
  if (props.includes('rain')) prop(px, 'rain', 0, time, p, k, r)
}

// ---------- Промпт для настоящей иллюстрации ----------

const PLACE_EN: Record<ScenePlace, string> = {
  landmark: 'a famous city view',
  home: 'inside a modest home',
  street: 'a city street with houses',
  market: 'a busy market with stalls',
  temple: 'in front of a temple',
  field: 'farm fields',
  river: 'a river bank',
  sea: 'the open sea',
  harbor: 'a harbor with ships',
  workshop: 'inside a craftsman workshop',
  school: 'a schoolroom',
  camp: 'a military camp with tents',
  battle: 'a battlefield seen from afar',
  arena: 'an arena with stands',
  road: 'a country road with cypress trees',
  tomb: 'a quiet tomb by the road',
  palace: 'a grand villa with columns',
  bath: 'public baths',
  yard: 'a family home with its yard',
}

const REGION_EN: Record<string, string> = {
  rome: 'ancient Rome',
  athens: 'ancient Athens',
  egypt: 'Ptolemaic or Roman Egypt',
}

function regionPrompt(region: string): string {
  return REGION_DEF.get(region)?.scene?.prompt ?? REGION_EN[region] ?? region
}

const TIME_EN: Record<SceneTime, string> = { day: 'daylight', dawn: 'dawn light', sunset: 'warm sunset', night: 'night, moonlight', overcast: 'overcast grey sky' }

/** Промпт по шаблону ТЗ: [сцена] + [эпоха и регион] + [единый стиль] + [освещение] + [формат кадра]. */
export function scenePrompt(scene: SceneDef, region: string, eraName: string): string {
  const place = PLACE_EN[scene.place ?? 'landmark']
  const people = scene.people ? `${scene.people} small figures in period clothing` : 'no people'
  const props = scene.props?.length ? `, with ${scene.props.join(', ')}` : ''
  return [
    `${place}${props}, ${people}`,
    `${regionPrompt(region)}, ${eraName}`,
    'flat pixel art, limited palette, no outlines, simple shapes, no text',
    TIME_EN[scene.time ?? 'day'],
    'wide panorama 16:5',
  ].join('; ')
}

// ---------- Портрет героя ----------

/** Портрет 16×20 точек: волосы, лицо, одежда эпохи. Рисуется в точке (x, y) с размером точки s. */
export function drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, region: string, sex: 'm' | 'f', seed: string): void {
  const p = lookOf(region).p
  const r = rand(`person:${seed}`)
  const skin = p.skin[Math.floor(r() * p.skin.length)]
  const cloth = p.clothes[Math.floor(r() * p.clothes.length)]
  const hair = ['#2a2018', '#3a2a1a', '#5a3a22', '#1a1410'][Math.floor(r() * 4)]
  const px = (gx: number, gy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c
    ctx.fillRect(x + gx * s, y + gy * s, w * s, h * s)
  }
  px(4, 2, 8, 2, hair)
  px(3, 3, 10, 2, hair)
  if (sex === 'f') {
    px(3, 5, 2, 8, hair)
    px(11, 5, 2, 8, hair)
  }
  px(5, 4, 6, 7, skin)
  px(6, 6, 1, 1, '#2a2018')
  px(9, 6, 1, 1, '#2a2018')
  px(7, 9, 2, 1, shade(skin, -0.25))
  px(7, 11, 2, 1, skin)
  px(3, 12, 10, 8, cloth)
  px(2, 14, 1, 6, cloth)
  px(13, 14, 1, 6, cloth)
  px(6, 12, 4, 1, shade(cloth, -0.15))
}
