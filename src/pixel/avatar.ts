// Портрет героя в шапке экрана жизни: пиксельный, 32×40 точек, по пояс.
// Меняется вместе с героем: младенец в пелёнках → малыш → ребёнок → подросток → взрослый → старик.
// Пол: у мужчин усы и борода (как принято в краю), у женщин длинные волосы, грудь, талия и бёдра.
// Телосложение: от скудной еды, болезней и бедности герой худеет, от пиров полнеет.
// Край и сословие: цвет кожи, причёска, головной убор и одежда эпохи; у знати — богатая ткань и украшения.
// Рисуется детерминированно: один и тот же герой в том же возрасте всегда выглядит одинаково.

import { lookOf, rand, shade } from './scene'
import type { Palette } from './scene'

export const AW = 32
export const AH = 40

export interface AvatarInput {
  region: string
  sex: 'm' | 'f'
  age: number
  seed: string
  cls?: string
  /** Телосложение −3…3: худоба … полнота. */
  body?: number
  /** Счастье 0–100: улыбка или опущенные уголки губ. */
  happiness?: number
  ill?: boolean
  married?: boolean
  dead?: boolean
  enslaved?: boolean
}

type Px = (x: number, y: number, w: number, h: number, c: string) => void
type Stage = 'infant' | 'toddler' | 'child' | 'teen' | 'adult' | 'elder'

const CX = 16
const EYE = '#2a1e18'
const LIP = '#a8504a'
const WHITE = '#efe8d8'

export function avatarStage(age: number): Stage {
  return age < 2 ? 'infant' : age < 5 ? 'toddler' : age < 12 ? 'child' : age < 17 ? 'teen' : age < 58 ? 'adult' : 'elder'
}

/** Смешать два цвета: k = 0 — первый, 1 — второй. */
function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/** Размеры фигуры: голова, плечи, талия, бёдра. Ширины чётные — фигура симметрична относительно середины. */
interface Geo {
  headW: number
  headH: number
  top: number
  shoulderY: number
  shoulderW: number
  waistW: number
  hipW: number
  neckW: number
  armW: number
}

const even = (n: number) => 2 * Math.round(n / 2)

function geometry(st: Stage, sex: 'm' | 'f', age: number, body: number): Geo {
  const f = sex === 'f'
  let g: Geo
  if (st === 'infant') g = { headW: 10, headH: 9, top: 12, shoulderY: 22, shoulderW: 18, waistW: 18, hipW: 18, neckW: 0, armW: 0 }
  else if (st === 'toddler') g = { headW: 12, headH: 11, top: 9, shoulderY: 21, shoulderW: 14, waistW: 10, hipW: 10, neckW: 4, armW: 2 }
  else if (st === 'child') g = { headW: 10, headH: 12, top: 7, shoulderY: 20, shoulderW: age < 8 ? 14 : 16, waistW: 10, hipW: 10, neckW: 4, armW: 3 }
  else if (st === 'teen') g = f ? { headW: 10, headH: 12, top: 5, shoulderY: 19, shoulderW: 16, waistW: 8, hipW: age >= 14 ? 12 : 10, neckW: 4, armW: 3 } : { headW: 10, headH: 12, top: 5, shoulderY: 19, shoulderW: age >= 15 ? 20 : 18, waistW: 12, hipW: 12, neckW: 4, armW: 3 }
  else if (st === 'adult') g = f ? { headW: 10, headH: 12, top: 4, shoulderY: 18, shoulderW: 18, waistW: 8, hipW: 14, neckW: 4, armW: 3 } : { headW: 10, headH: 12, top: 4, shoulderY: 18, shoulderW: 22, waistW: 14, hipW: 14, neckW: 4, armW: 4 }
  else g = f ? { headW: 10, headH: 12, top: 5, shoulderY: 19, shoulderW: 18, waistW: 10, hipW: 14, neckW: 4, armW: 3 } : { headW: 10, headH: 12, top: 5, shoulderY: 19, shoulderW: 20, waistW: 14, hipW: 14, neckW: 4, armW: 3 }
  if (st === 'infant') return g
  // Полнота расширяет талию и бёдра сильнее, чем плечи; худоба сужает всё, руки тоньше.
  const k = st === 'toddler' || st === 'child' ? 0.6 : 1
  g.shoulderW += even(body * 0.7 * k)
  g.waistW = Math.max(6, g.waistW + even(body * 1.6 * k))
  g.hipW = Math.max(g.waistW, g.hipW + even(body * 1.1 * k))
  g.neckW += body >= 2 ? 2 : 0
  g.armW = Math.max(2, g.armW + (body >= 2 ? 1 : body <= -2 ? -1 : 0))
  return g
}

// ---------- Как одеваются и причёсываются в краю ----------

type Hair = 'short' | 'bowl' | 'curly' | 'afro' | 'topknot' | 'chonmage' | 'sidelock' | 'bob' | 'long' | 'bun' | 'braid' | 'braids' | 'tufts' | 'horns' | 'wig' | 'shaved'
type Hat =
  | 'turban' | 'pagri' | 'kufi' | 'veil' | 'hijab' | 'wimple' | 'kerchief' | 'kokoshnik' | 'fur' | 'felt' | 'conical' | 'futou'
  | 'eboshi' | 'nemes' | 'feathers' | 'band' | 'llautu' | 'hood' | 'coif' | 'wrap' | 'netela' | 'circlet' | 'fez' | 'bonnet' | 'laurel'
type Beard = 'none' | 'fuzz' | 'moustache' | 'goatee' | 'short' | 'full' | 'long'
type Neck = 'round' | 'v' | 'cross' | 'drape' | 'square' | 'open' | 'bare' | 'straps' | 'high'

interface Look {
  hair: Hair
  hairColor: string
  hat: Hat | null
  hatColor: string
  beard: Beard
  cloth: string
  trim: string | null
  neck: Neck
  bareArms: boolean
  /** Накидка на плечи (паллий, гиматий, шамма, лликлья). */
  shawl: string | null
  /** Широкое ожерелье-воротник (Египет), нефрит (майя), золото. */
  collar: string | null
  earrings: string | null
  /** Большие золотые серьги-диски инков. */
  earSpools: boolean
  bindi: boolean
  kohl: boolean
  belt: string | null
  /** Вертикальные полосы на тунике (римский клав). */
  stripes: string | null
}

const DARK_HAIR = ['#2a2018', '#1a1410', '#3a2a1a', '#2a2018']
const LIGHT_HAIR = ['#5a3a22', '#7a5a3a', '#a8804a', '#c8a060', '#8a4a2a', '#3a2a1a', '#2a2018']
const BLACK_HAIR = ['#141010', '#1a1410', '#201814']

function pickOf<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)]
}

/** Выбрать с вероятностями: [вариант, вес]. */
function chooseOf<T>(r: () => number, list: [T, number][]): T {
  const total = list.reduce((s, [, w]) => s + w, 0)
  let x = r() * total
  for (const [v, w] of list) if ((x -= w) < 0) return v
  return list[list.length - 1][0]
}

function lookFor(style: string, input: AvatarInput, st: Stage, p: Palette, r: () => number): Look {
  const { sex, cls = 'peasant', married = false } = input
  const f = sex === 'f'
  const kid = st === 'infant' || st === 'toddler' || st === 'child'
  const grown = st === 'adult' || st === 'elder'
  const woman = f && (grown || (st === 'teen' && (married || input.age >= 15)))
  const slave = input.enslaved || cls === 'slave'
  const rich = !slave && (cls === 'noble' || cls === 'landowner')
  const poor = slave || cls === 'peasant'
  const light = style === 'gothic' || style === 'russian'
  const base = light ? pickOf(r, LIGHT_HAIR) : style === 'sahel' || style === 'ethiopian' || style === 'maya' || style === 'aztec' || style === 'andean' || style === 'japanese' || style === 'chinese' ? pickOf(r, BLACK_HAIR) : pickOf(r, DARK_HAIR)
  // Ткань: у знати — яркая с золотом, у бедняков — тусклая, у рабов — неокрашенная.
  const dye = pickOf(r, p.clothes)
  const cloth = slave ? '#a89878' : poor ? mix(dye, '#8f826c', 0.45) : dye
  const L: Look = {
    hair: f ? 'long' : 'short',
    hairColor: base,
    hat: null,
    hatColor: p.clothes[0],
    beard: 'none',
    cloth,
    trim: rich ? p.accent : null,
    neck: 'round',
    bareArms: false,
    shawl: null,
    collar: null,
    earrings: f && rich && !kid ? '#e0b84a' : null,
    earSpools: false,
    bindi: false,
    kohl: false,
    belt: null,
    stripes: null,
  }
  const beardOf = (list: [Beard, number][]) => (sex === 'm' && grown ? chooseOf(r, list) : sex === 'm' && st === 'teen' && input.age >= 15 ? 'fuzz' : 'none')

  switch (style) {
    case 'roman':
      L.neck = 'round'
      L.hatColor = mix(cloth, WHITE, 0.55)
      L.cloth = slave ? '#a89878' : f ? cloth : mix(WHITE, cloth, 0.15)
      if (!f && rich) L.stripes = '#8a2a4a'
      if (!f && rich && grown) L.shawl = WHITE
      if (f) L.hair = kid ? 'long' : 'bun'
      if (woman && married) L.hat = 'veil'
      L.beard = beardOf([['none', 6], ['short', 3]])
      break
    case 'greek':
      L.neck = f ? 'round' : 'drape'
      L.cloth = slave ? '#a89878' : f ? cloth : mix(WHITE, cloth, 0.1)
      if (!f && grown) L.shawl = rich ? '#4f6f9a' : '#8a7a5a'
      L.hair = f ? (kid ? 'long' : 'bun') : 'curly'
      if (woman && married) L.hat = 'veil'
      L.hatColor = pickOf(r, ['#efe8d8', '#4f6f9a', '#c9b48a', '#9a4a3a'])
      L.beard = beardOf([['full', 7], ['short', 2], ['none', 1]])
      break
    case 'egyptian':
      L.cloth = WHITE
      L.bareArms = true
      L.neck = f ? 'round' : poor ? 'bare' : 'bare'
      if (!poor || f) L.collar = rich ? '#3f8fa8' : !f ? null : '#c0703a'
      L.hair = kid && !(st === 'infant') ? 'sidelock' : 'wig'
      L.hairColor = '#141010'
      if (rich && grown && !f) L.hat = 'nemes'
      L.hatColor = '#3f6fa8'
      L.kohl = !kid
      L.beard = 'none'
      break
    case 'mesopotamian':
      L.neck = 'drape'
      L.shawl = grown ? mix(cloth, '#e8dcc0', 0.4) : null
      L.hair = f ? (kid ? 'long' : 'long') : 'curly'
      if (!f && grown && rich) L.hat = 'fez'
      L.hatColor = p.accent
      if (woman && married) L.hat = 'veil'
      L.beard = beardOf([['long', 8], ['full', 2]])
      break
    case 'chinese':
      L.neck = 'cross'
      L.trim = rich ? p.accent : mix(cloth, '#000000', 0.25)
      if (f) L.hair = kid ? 'tufts' : 'bun'
      else L.hair = kid ? 'tufts' : 'topknot'
      if (!f && grown) L.hat = rich || cls === 'trader' ? 'futou' : chooseOf(r, [['conical', 4], [null, 3]])
      if (!f && st === 'teen' && poor) L.hat = r() < 0.4 ? 'conical' : null
      L.hatColor = L.hat === 'futou' ? '#1a1a20' : '#c9a860'
      L.beard = beardOf([['goatee', 5], ['moustache', 3], ['none', 2]])
      break
    case 'japanese':
      L.neck = 'cross'
      L.trim = mix(cloth, '#000000', 0.3)
      if (f) L.hair = 'long'
      else L.hair = kid ? 'tufts' : 'chonmage'
      if (!f && grown) L.hat = rich ? 'eboshi' : chooseOf(r, [['conical', 3], [null, 4]])
      L.hatColor = L.hat === 'eboshi' ? '#1a1a20' : '#c9a860'
      L.beard = beardOf([['none', 5], ['moustache', 3], ['goatee', 2]])
      break
    case 'indian':
      if (f) {
        L.neck = 'drape'
        L.hair = kid ? 'braid' : 'braid'
        L.bindi = !kid
        if (woman) L.hat = married || r() < 0.4 ? 'veil' : null
        L.hatColor = mix(cloth, '#e8a030', 0.3)
        L.earrings = kid ? null : '#e0b84a'
      } else {
        L.neck = poor ? 'bare' : 'round'
        L.bareArms = poor
        if (poor && grown) L.shawl = WHITE
        if (grown || (st === 'teen' && input.age >= 15)) L.hat = chooseOf(r, [['pagri', 7], [null, 3]])
        L.hatColor = rich ? pickOf(r, ['#c0303a', '#e8a030', '#e0c040']) : pickOf(r, [WHITE, '#e8a030', WHITE])
      }
      L.beard = beardOf([['moustache', 6], ['full', 3], ['none', 1]])
      break
    case 'islamic':
      L.neck = f ? 'high' : 'open'
      L.trim = rich ? p.accent : mix(cloth, '#000000', 0.2)
      if (f && (woman || st === 'teen')) L.hat = 'hijab'
      L.hatColor = pickOf(r, ['#2a5a4a', '#3f4f6a', '#e8dcc0', '#5a3a4a', '#1a1a20'])
      if (!f && grown) L.hat = chooseOf(r, [['turban', 7], ['kufi', 3]])
      if (!f && L.hat) L.hatColor = rich ? WHITE : pickOf(r, [WHITE, '#e8dcc0', '#2a5a4a'])
      L.beard = beardOf([['full', 8], ['short', 2]])
      break
    case 'gothic':
      L.neck = 'round'
      L.belt = '#4a3a2a'
      if (f) {
        L.hair = woman ? 'braids' : chooseOf(r, [['long', 1], ['braids', 1]])
        if (woman && married) L.hat = chooseOf(r, [['wimple', 2], ['veil', 1]])
        else if (rich && !kid) L.hat = 'circlet'
        L.hatColor = L.hat === 'circlet' ? p.accent : WHITE
      } else {
        L.hair = 'bowl'
        if (grown) L.hat = poor ? chooseOf(r, [['hood', 4], ['coif', 2], [null, 3]]) : chooseOf(r, [['hood', 2], [null, 3]])
        L.hatColor = L.hat === 'coif' ? WHITE : pickOf(r, ['#3a5a3a', '#8a2a2a', '#5a4a3a', '#3a4a6a'])
      }
      if (st === 'infant') L.hat = 'bonnet'
      L.beard = beardOf([['none', 4], ['short', 4], ['full', 2]])
      break
    case 'byzantine':
      L.neck = 'round'
      if (rich) L.collar = p.accent
      L.trim = rich ? p.accent : mix(cloth, '#000000', 0.2)
      if (f) {
        L.hair = 'bun'
        if (woman) L.hat = 'veil'
        L.hatColor = pickOf(r, ['#7a2a5a', '#3a4a7a', '#5a3a2a', '#2a2a3a'])
      } else L.hair = 'short'
      if (st === 'infant') L.hat = 'bonnet'
      L.beard = beardOf([['full', 8], ['short', 2]])
      break
    case 'russian':
      L.neck = f ? 'straps' : 'round'
      L.belt = f ? null : '#a83a2f'
      if (f) {
        // Девушка — одна коса и повязка, замужняя — волосы под повойником или кокошником.
        L.hair = 'braid'
        if (married && !kid) L.hat = rich ? 'kokoshnik' : 'kerchief'
        L.hatColor = L.hat === 'kokoshnik' ? '#a83a2f' : pickOf(r, ['#a83a2f', '#3a5a8a', '#c9a34a', '#e8e0d0'])
        L.trim = '#a83a2f'
      } else {
        L.hair = 'bowl'
        L.cloth = slave ? '#a89878' : poor ? mix('#e8e0d0', cloth, 0.2) : cloth
        L.trim = '#a83a2f'
        if (grown) L.hat = rich ? 'fur' : chooseOf(r, [['felt', 3], [null, 4]])
        L.hatColor = rich ? pickOf(r, ['#a83a2f', '#3a5a8a', '#2a5a3a']) : '#6a5a4a'
      }
      if (st === 'infant') L.hat = 'bonnet'
      L.beard = beardOf([['full', 7], ['long', 2], ['short', 1]])
      break
    case 'maya':
    case 'aztec':
      if (f) {
        L.neck = 'square'
        L.cloth = mix(WHITE, cloth, 0.15)
        L.trim = pickOf(r, ['#c0303a', '#3a7a9a', '#e0c040', '#2a6a4a'])
        L.hair = style === 'aztec' && married ? 'horns' : 'braids'
        if (rich) L.collar = '#3a9a7a'
      } else {
        L.neck = 'bare'
        L.bareArms = true
        L.hair = style === 'aztec' ? 'bowl' : 'long'
        if (grown || st === 'teen') L.shawl = style === 'aztec' ? mix(WHITE, cloth, 0.3) : null
        if (grown) L.hat = rich ? 'feathers' : 'band'
        if (st === 'teen') L.hat = 'band'
        L.hatColor = pickOf(r, ['#c0303a', '#3a7a9a', '#e0c040', WHITE])
        if (rich) L.collar = '#3a9a7a'
      }
      L.beard = 'none'
      break
    case 'andean':
      if (f) {
        L.neck = 'round'
        L.shawl = woman ? pickOf(r, ['#b83a3a', '#2a4a8a', '#e0b030']) : null
        L.hair = 'braids'
        L.hat = woman ? 'band' : null
        L.hatColor = '#b83a3a'
      } else {
        L.neck = 'round'
        L.trim = rich ? '#e0b030' : '#4a2a2a'
        L.hair = 'bob'
        if (grown) L.hat = 'llautu'
        L.hatColor = rich ? '#e0b030' : '#b83a3a'
        L.earSpools = rich && grown
      }
      L.beard = 'none'
      break
    case 'sahel':
      L.neck = 'round'
      L.trim = rich ? p.accent : mix(cloth, '#000000', 0.25)
      if (f) {
        L.hair = 'braids'
        if (woman) L.hat = 'wrap'
        L.hatColor = pickOf(r, ['#e0b030', '#3a5a9a', '#c0503a', '#2a6a4a'])
        L.collar = rich ? '#e0b84a' : null
      } else {
        L.hair = 'afro'
        if (grown) L.hat = rich ? 'turban' : chooseOf(r, [['kufi', 3], [null, 4]])
        L.hatColor = rich ? WHITE : pickOf(r, [WHITE, '#3a5a9a'])
        L.cloth = slave ? '#a89878' : rich ? pickOf(r, ['#3a5a9a', WHITE, '#2a2a4a']) : cloth
      }
      L.beard = beardOf([['short', 4], ['none', 4], ['goatee', 2]])
      break
    case 'ethiopian':
      L.neck = 'round'
      L.cloth = slave ? '#a89878' : WHITE
      L.trim = pickOf(r, ['#3a6a4a', '#c0503a', '#3a5a9a', '#c9a34a'])
      if (f) {
        L.hair = 'braids'
        if (woman) L.hat = 'netela'
        L.hatColor = WHITE
      } else {
        L.hair = 'afro'
        if (grown) L.shawl = WHITE
      }
      L.beard = beardOf([['short', 5], ['none', 3], ['full', 2]])
      break
  }
  if (kid && st !== 'infant' && L.hat !== 'bonnet') L.hat = null
  if (st === 'infant') {
    L.beard = 'none'
    if (L.hat !== 'bonnet') L.hat = null
  }
  if (slave && (L.hat === 'futou' || L.hat === 'eboshi' || L.hat === 'nemes' || L.hat === 'feathers' || L.hat === 'fur' || L.hat === 'kokoshnik')) L.hat = null
  if (slave) {
    L.trim = null
    L.collar = null
    L.earrings = null
    L.earSpools = false
  }
  return L
}

/** Седина: с 40 лет пробивается, к 55 волосы серые, к 65 — белые. */
function hairWithAge(base: string, age: number, r: () => number): string[] {
  const grey = '#9a968e'
  const white = '#d8d4cc'
  if (age < 38) return [base]
  if (age < 50) return [base, base, mix(base, grey, 0.7)]
  if (age < 60) return [mix(base, grey, 0.55), mix(base, grey, 0.8), grey]
  if (age < 68) return [grey, mix(grey, white, 0.5), grey]
  void r
  return [white, mix(grey, white, 0.6)]
}

// ---------- Рисование ----------

export function drawAvatar(ctx: CanvasRenderingContext2D, input: AvatarInput, x = 0, y = 0, s = 1): void {
  const px: Px = (gx, gy, w, h, c) => {
    if (w <= 0 || h <= 0) return
    ctx.fillStyle = c
    ctx.fillRect(x + gx * s, y + gy * s, w * s, h * s)
  }
  const look = lookOf(input.region)
  const p = look.p
  const st = avatarStage(input.age)
  const r = rand(`avatar:${input.seed}`)
  // Цвет кожи и черты лица постоянны для героя, остальное — по возрасту.
  let skin = p.skin[Math.floor(r() * p.skin.length)]
  if (input.ill) skin = mix(skin, '#b4b896', 0.3)
  const body = Math.max(-3, Math.min(3, input.body ?? 0))
  const L = lookFor(look.style, input, st, p, r)
  const g = geometry(st, input.sex, input.age, body)
  const hairCols = hairWithAge(L.hairColor, input.age, r)
  const hairAt = (i: number) => hairCols[i % hairCols.length]
  const bald = input.sex === 'm' && input.age >= 45 && r() < 0.35 && L.hair !== 'chonmage'

  // Фон: стена дома в цветах края.
  // Фон: приглушённый тон стен края, темнее светлых тканей и покрывал, чтобы они читались.
  const bg = mix(p.stoneDark, '#4a5260', 0.45)
  px(0, 0, AW, AH, bg)
  px(0, 31, AW, AH - 31, shade(bg, -0.12))

  const x0 = CX - g.headW / 2
  const T = g.top
  const hairCol = hairAt(0)

  if (st === 'infant') {
    drawInfant(px, g, L, skin, hairCol, input)
    return finish(ctx, input, x, y, s)
  }

  // 1. Волосы и покрывала за спиной.
  backLayer(px, g, L, hairAt, input)
  // 2. Тело и одежда.
  drawBody(px, g, L, skin, input, st, body)
  // 3. Шея.
  const neckTop = T + g.headH - 1
  px(CX - g.neckW / 2, neckTop, g.neckW, g.shoulderY - neckTop + 1, shade(skin, -0.14))
  if (body <= -2 && st !== 'toddler' && st !== 'child') px(CX - 1, neckTop + 1, 1, g.shoulderY - neckTop - 1, shade(skin, -0.24))
  // 4. Голова.
  drawHead(px, g, skin, input, st, body)
  // 5. Лицо.
  drawFace(px, g, L, skin, input, st, body, hairCol)
  // 6. Борода и усы.
  drawBeard(px, g, L.beard, hairAt, input.age)
  // 7. Волосы спереди.
  frontHair(px, g, L, hairAt, bald, st)
  // 8. Головной убор.
  drawHat(px, g, L, st, r)
  // 9. Украшения.
  if (L.earrings && L.hat !== 'hijab' && L.hat !== 'wimple' && L.hat !== 'netela' && L.hat !== 'kerchief') {
    px(x0 - 1, T + 7, 1, 2, L.earrings)
    px(x0 + g.headW, T + 7, 1, 2, L.earrings)
  }
  if (L.earSpools) {
    px(x0 - 2, T + 5, 2, 3, '#e0b030')
    px(x0 + g.headW, T + 5, 2, 3, '#e0b030')
  }
  if (L.bindi) px(CX - 1, T + 4, 2, 1, '#c0303a')
  return finish(ctx, input, x, y, s)
}

/** Умерший — в серых тонах. */
function finish(ctx: CanvasRenderingContext2D, input: AvatarInput, x: number, y: number, s: number): void {
  if (!input.dead) return
  const img = ctx.getImageData(x, y, AW * s, AH * s)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11)
    d[i] = d[i + 1] = d[i + 2] = Math.round(v * 0.85 + 20)
  }
  ctx.putImageData(img, x, y)
}

function drawInfant(px: Px, g: Geo, L: Look, skin: string, hair: string, input: AvatarInput): void {
  const T = g.top
  const x0 = CX - g.headW / 2
  // Пелёнки: свёрток с перевязью; у бедняков — простая ткань.
  const wrap = L.hat === 'bonnet' ? WHITE : mix(WHITE, L.cloth, 0.35)
  const band = L.trim ?? shade(L.cloth, -0.1)
  for (let yy = 20; yy < AH; yy++) {
    const t = (yy - 20) / 20
    const w = even(16 + 6 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5))
    px(CX - w / 2, yy, w, 1, wrap)
  }
  px(CX - 9, 27, 18, 1, band)
  px(CX - 10, 34, 20, 1, band)
  px(CX - 1, 20, 2, 20, shade(wrap, -0.08))
  // Капюшон пелёнки вокруг лица.
  px(x0 - 2, T - 1, g.headW + 4, g.headH + 3, shade(wrap, -0.04))
  px(x0 - 1, T - 2, g.headW + 2, 1, shade(wrap, -0.04))
  // Лицо.
  px(x0 + 1, T, g.headW - 2, 1, skin)
  px(x0, T + 1, g.headW, g.headH - 3, skin)
  px(x0 + 1, T + g.headH - 2, g.headW - 2, 1, skin)
  px(x0 + 2, T + g.headH - 1, g.headW - 4, 1, skin)
  if (L.hat === 'bonnet') {
    px(x0 - 1, T - 1, g.headW + 2, 3, WHITE)
    px(x0 - 2, T + 1, 1, 6, WHITE)
    px(x0 + g.headW + 1, T + 1, 1, 6, WHITE)
  } else {
    px(CX - 2, T, 4, 1, hair)
    px(CX - 1, T - 1, 1, 1, hair)
  }
  // Глаза: пока здоров — открытые и блестящие; мёртвый — закрытые.
  if (input.dead) {
    px(x0 + 2, T + 4, 2, 1, shade(skin, -0.4))
    px(x0 + g.headW - 4, T + 4, 2, 1, shade(skin, -0.4))
  } else {
    px(x0 + 2, T + 3, 2, 2, EYE)
    px(x0 + 2, T + 3, 1, 1, '#ffffff')
    px(x0 + g.headW - 4, T + 3, 2, 2, EYE)
    px(x0 + g.headW - 4, T + 3, 1, 1, '#ffffff')
  }
  px(x0 + 1, T + 5, 1, 1, mix(skin, '#e06060', 0.35))
  px(x0 + g.headW - 2, T + 5, 1, 1, mix(skin, '#e06060', 0.35))
  px(CX - 1, T + 6, 2, 1, mix(skin, LIP, 0.6))
}

/** Длинные волосы, косы и покрывала, которые видны за плечами. */
function backLayer(px: Px, g: Geo, L: Look, hairAt: (i: number) => string, input: AvatarInput): void {
  const x0 = CX - g.headW / 2
  const T = g.top
  const covered = L.hat === 'hijab' || L.hat === 'wimple' || L.hat === 'kerchief' || L.hat === 'netela' || L.hat === 'wrap' || L.hat === 'hood' || L.hat === 'veil'
  if (L.hat === 'veil' || L.hat === 'netela' || L.hat === 'hijab' || L.hat === 'wimple') {
    // Покрывало спадает на плечи.
    const c = L.hat === 'wimple' ? WHITE : L.hatColor
    px(x0 - 2, T + 2, g.headW + 4, g.shoulderY - T + 2, shade(c, -0.12))
    px(x0 - 3, T + 8, g.headW + 6, g.shoulderY - T - 2, shade(c, -0.12))
    return
  }
  if (L.hat === 'hood') {
    px(x0 - 2, T + 2, g.headW + 4, g.shoulderY - T, shade(L.hatColor, -0.15))
    return
  }
  if (covered) return
  const long = L.hair === 'long' || L.hair === 'wig' || (L.hair === 'curly' && input.sex === 'm' && input.age >= 17 && L.beard === 'long')
  if (long) {
    const len = L.hair === 'wig' ? g.shoulderY + 1 : L.hair === 'curly' ? g.shoulderY + 1 : Math.min(AH, g.shoulderY + (input.age >= 12 ? 9 : 5))
    for (let yy = T + 3; yy < len; yy++) px(x0 - 1, yy, g.headW + 2, 1, hairAt(yy))
  }
}

function drawBody(px: Px, g: Geo, L: Look, skin: string, input: AvatarInput, st: Stage, body: number): void {
  const sy = g.shoulderY
  const chest = g.shoulderW - 2 * g.armW
  const waistY = st === 'toddler' || st === 'child' ? 34 : 32
  const cloth = L.cloth
  const dark = shade(cloth, -0.22)
  const torsoW = (yy: number): number => {
    const t = yy - sy
    if (t < 2) return g.shoulderW - (t === 0 ? 4 : 2)
    if (yy <= waistY) return even(chest + ((g.waistW - chest) * (yy - sy - 2)) / Math.max(1, waistY - sy - 2))
    return even(g.waistW + ((g.hipW - g.waistW) * (yy - waistY)) / Math.max(1, AH - 1 - waistY))
  }
  // Руки по бокам рисуются первыми: бёдра и грудь ложатся поверх, а у талии между рукой и телом виден просвет.
  const armTop = sy + 1
  const armC = L.bareArms ? skin : shade(cloth, -0.06)
  for (const side of [-1, 1]) {
    const ax = side < 0 ? CX - g.shoulderW / 2 : CX + g.shoulderW / 2 - g.armW
    px(ax, armTop, g.armW, AH - armTop, armC)
    px(side < 0 ? ax + g.armW - 1 : ax, armTop + 2, 1, AH - armTop - 2, L.bareArms ? shade(skin, -0.15) : shade(cloth, -0.18))
    if (L.bareArms && L.neck !== 'bare') px(ax, armTop, g.armW, 3, shade(cloth, -0.06))
  }
  // Корпус.
  for (let yy = sy; yy < AH; yy++) {
    const w = yy - sy < 2 ? torsoW(yy) : Math.max(4, torsoW(yy))
    px(CX - w / 2, yy, w, 1, cloth)
    // Боковой изгиб бёдер темнее — видна линия фигуры.
    if (yy > waistY + 1 && g.hipW > g.waistW && input.sex === 'f') {
      px(CX - w / 2, yy, 1, 1, shade(cloth, -0.2))
      px(CX + w / 2 - 1, yy, 1, 1, shade(cloth, -0.2))
    }
  }
  // Полный живот.
  if (body >= 2 && st !== 'toddler' && st !== 'child') {
    const extra = body >= 3 ? 4 : 2
    for (let yy = 30; yy < AH; yy++) {
      const w = torsoW(yy) + extra - (yy === 30 ? 2 : 0)
      px(CX - w / 2, yy, w, 1, cloth)
    }
    px(CX - 3, 36, 6, 1, shade(cloth, -0.12))
  }
  // Грудь у девушек и женщин.
  const bust = input.sex === 'f' ? (st === 'teen' ? (input.age >= 14 ? 2 : 1) : st === 'adult' || st === 'elder' ? 3 : 0) : 0
  const size = bust ? Math.max(1, Math.min(4, bust + (body >= 2 ? 1 : body <= -2 ? -1 : 0))) : 0
  const bodyC = L.neck === 'bare' ? skin : cloth
  // Вырез и ворот.
  neckline(px, g, L, skin, st)
  if (size) {
    // Две округлости: светлый верх, тень по внешнему краю и изгиб снизу.
    const by = sy + 3
    const bw = Math.min(chest / 2 + 1, 2 + size)
    const fill = shade(bodyC, 0.1)
    const hi = shade(bodyC, 0.24)
    const side = shade(bodyC, -0.14)
    const lo = shade(bodyC, -0.38)
    for (const dir of [-1, 1]) {
      // Столбец c: 0 — у середины груди, bw−1 — снаружи.
      const at = (c: number) => (dir > 0 ? CX + c : CX - 1 - c)
      for (let row = 1; row <= size; row++) for (let c = 0; c < bw; c++) px(at(c), by + row, 1, 1, fill)
      px(at(1), by + 1, 1, 1, hi)
      if (bw > 3) px(at(2), by + 1, 1, 1, hi)
      for (let row = 1; row < size; row++) px(at(bw - 1), by + row, 1, 1, side)
      for (let row = 2; row <= size; row++) px(at(0), by + row, 1, 1, side)
      px(at(0), by + size, 1, 1, lo)
      px(at(bw - 1), by + size, 1, 1, lo)
      for (let c = 1; c < bw - 1; c++) px(at(c), by + size + 1, 1, 1, lo)
      for (let c = 2; c < bw - 2; c++) px(at(c), by + size + 2, 1, 1, shade(bodyC, -0.12))
    }
    // У полных и взрослых — бока шире на уровне груди.
    if (size >= 3) {
      px(CX - chest / 2 - 1, by + 1, 1, size, bodyC)
      px(CX + chest / 2, by + 1, 1, size, bodyC)
    }
  }
  // Худоба: выступают ключицы и рёбра.
  if (body <= -2 && st !== 'toddler' && st !== 'child' && (L.neck === 'bare' || L.neck === 'v' || L.neck === 'drape' || L.neck === 'square' || L.neck === 'straps')) {
    px(CX - 5, sy + 1, 3, 1, shade(skin, -0.22))
    px(CX + 2, sy + 1, 3, 1, shade(skin, -0.22))
    if (L.neck === 'bare' && !size) {
      for (let i = 0; i < 3; i++) {
        px(CX - 5, sy + 5 + i * 2, 3, 1, shade(skin, -0.2))
        px(CX + 2, sy + 5 + i * 2, 3, 1, shade(skin, -0.2))
      }
    }
  }
  // Пояс, полосы, накидка, ожерелье.
  const sash = L.belt ?? (input.sex === 'f' && size >= 2 && L.neck !== 'straps' ? shade(cloth, -0.28) : null)
  if (sash && st !== 'toddler') px(CX - torsoW(waistY) / 2, waistY, torsoW(waistY), 2, sash)
  if (L.stripes) {
    px(CX - 4, sy + 1, 1, AH - sy - 1, L.stripes)
    px(CX + 3, sy + 1, 1, AH - sy - 1, L.stripes)
  }
  if (L.shawl) {
    // Перекинута через левое плечо наискосок.
    for (let yy = sy; yy < AH; yy++) {
      const t = yy - sy
      const x = CX - g.shoulderW / 2 + Math.floor(t * 0.7)
      px(x, yy, Math.min(7, 4 + Math.floor(t / 4)), 1, yy === sy ? shade(L.shawl, 0.05) : L.shawl)
    }
    px(CX - g.shoulderW / 2, sy, 5, AH - sy, L.shawl)
    if (L.trim) for (let yy = sy + 1; yy < AH; yy++) px(CX - g.shoulderW / 2 + Math.floor((yy - sy) * 0.7) + Math.min(7, 4 + Math.floor((yy - sy) / 4)) - 1, yy, 1, 1, L.trim)
  }
  if (L.collar) {
    const w = Math.min(g.shoulderW - 4, 12)
    px(CX - w / 2, sy, w, 2, L.collar)
    px(CX - w / 2 + 1, sy + 2, w - 2, 1, shade(L.collar, -0.2))
    for (let i = 0; i < w; i += 2) px(CX - w / 2 + i, sy + 1, 1, 1, shade(L.collar, 0.3))
  }
  void dark
}

function neckline(px: Px, g: Geo, L: Look, skin: string, st: Stage): void {
  const sy = g.shoulderY
  const trim = L.trim
  switch (L.neck) {
    case 'bare': {
      // Голый торс (жаркий край, бедняки): кожа до пояса.
      for (let yy = sy; yy < 33; yy++) {
        const w = yy - sy < 2 ? g.shoulderW - (yy === sy ? 4 : 2) - 2 * g.armW + 2 * g.armW : g.shoulderW - 2 * g.armW
        px(CX - w / 2, yy, w, 1, skin)
      }
      px(CX - (g.shoulderW - 2 * g.armW) / 2, 33, g.shoulderW - 2 * g.armW, 1, shade(L.cloth, -0.1))
      px(CX - 1, sy + 7, 2, 1, shade(skin, -0.15))
      break
    }
    case 'round':
      px(CX - 3, sy, 6, 1, skin)
      px(CX - 2, sy + 1, 4, 1, skin)
      if (trim) {
        px(CX - 4, sy, 1, 2, trim)
        px(CX + 3, sy, 1, 2, trim)
        px(CX - 3, sy + 2, 6, 1, trim)
      }
      break
    case 'high':
      px(CX - 2, sy, 4, 1, skin)
      if (trim) px(CX - 3, sy + 1, 6, 1, trim)
      break
    case 'v':
    case 'open':
      for (let i = 0; i < 5; i++) px(CX - 3 + Math.floor(i / 2), sy + i, 6 - 2 * Math.floor(i / 2), 1, skin)
      if (L.neck === 'open' && trim) {
        for (let i = 0; i < AH - sy; i++) {
          const off = Math.min(3, Math.floor(i / 2))
          px(CX - 4 + off, sy + i, 1, 1, trim)
          px(CX + 3 - off, sy + i, 1, 1, trim)
        }
      }
      break
    case 'cross': {
      // Запах: левая пола поверх правой, тёмная кайма.
      px(CX - 3, sy, 6, 1, skin)
      px(CX - 2, sy + 1, 4, 1, skin)
      px(CX - 1, sy + 2, 2, 1, skin)
      const band = trim ?? shade(L.cloth, -0.3)
      for (let i = 0; i < 9; i++) {
        px(CX - 4 + i, sy + i, 2, 1, band)
        if (i < 4) px(CX + 2 - i, sy + i, 1, 1, shade(band, -0.1))
      }
      break
    }
    case 'drape': {
      // Одно плечо открыто: ткань идёт с правого плеча к левому боку.
      const half = g.shoulderW / 2
      for (let i = 0; i < 6; i++) px(CX - half + 1, sy + i, Math.max(0, half - 1 - i), 1, skin)
      px(CX - 2, sy, 4, 1, skin)
      if (trim) for (let i = 0; i < 8; i++) px(CX - 1 - i, sy + i, 1, 1, trim)
      break
    }
    case 'square':
      px(CX - 3, sy, 6, 3, skin)
      if (trim) {
        px(CX - 4, sy, 1, 4, trim)
        px(CX + 3, sy, 1, 4, trim)
        px(CX - 4, sy + 3, 8, 1, trim)
        px(CX - 5, sy + 5, 10, 1, shade(trim, 0.2))
      }
      break
    case 'straps': {
      // Сарафан на лямках поверх белой рубахи с вышивкой.
      const w = g.shoulderW - 2 * g.armW
      px(CX - w / 2, sy, w, 5, WHITE)
      px(CX - 2, sy, 4, 1, skin)
      px(CX - 3, sy + 1, 6, 1, trim ?? '#a83a2f')
      px(CX - w / 2 + 1, sy, 2, 6, L.cloth)
      px(CX + w / 2 - 3, sy, 2, 6, L.cloth)
      for (let i = 0; i < AH - sy - 6; i += 3) px(CX - 1, sy + 6 + i, 2, 1, trim ?? '#c9a34a')
      break
    }
  }
  void st
}

function drawHead(px: Px, g: Geo, skin: string, input: AvatarInput, st: Stage, body: number): void {
  const x0 = CX - g.headW / 2
  const T = g.top
  const w = g.headW
  const H = g.headH
  const f = input.sex === 'f'
  for (let i = 0; i < H; i++) {
    let cut = 0
    if (i === 0) cut = 4
    else if (i === 1) cut = 2
    else if (i === H - 1) cut = f || st === 'toddler' || st === 'child' ? 6 : 4
    else if (i === H - 2) cut = 2
    else if (i === H - 3 && body <= -2) cut = 2
    let ww = w - cut
    // Полные щёки.
    if (body >= 2 && i >= 6 && i <= H - 2) ww += 2
    px(CX - ww / 2, T + i, ww, 1, skin)
  }
  if (body >= 2 && st !== 'toddler' && st !== 'child') px(CX - 3, T + H, 6, 1, shade(skin, -0.1))
  // Уши.
  px(x0 - 1, T + 5, 1, 2, shade(skin, -0.1))
  px(x0 + w, T + 5, 1, 2, shade(skin, -0.1))
}

function drawFace(px: Px, g: Geo, L: Look, skin: string, input: AvatarInput, st: Stage, body: number, hair: string): void {
  const x0 = CX - g.headW / 2
  const T = g.top
  const small = st === 'toddler' || st === 'child'
  const f = input.sex === 'f'
  const age = input.age
  // Ряды черт лица; у детей глаза ниже и крупнее.
  const browY = T + (small ? 5 : 4)
  const eyeY = browY + 1
  const noseY = eyeY + (small ? 2 : 2)
  const mouthY = noseY + (small ? 1 : 2)
  const lx = x0 + 2
  const rx = x0 + g.headW - 4
  const browC = age >= 60 ? hair : shade(hair, 0.05)
  // Брови.
  if (!small) {
    px(lx, browY, 2, 1, browC)
    px(rx, browY, 2, 1, browC)
    if (input.happiness !== undefined && input.happiness < 25) {
      px(lx + 1, browY - 1, 1, 1, browC)
      px(rx, browY - 1, 1, 1, browC)
    }
  }
  // Глаза.
  if (input.dead) {
    px(lx, eyeY, 2, 1, shade(skin, -0.35))
    px(rx, eyeY, 2, 1, shade(skin, -0.35))
  } else if (small) {
    px(lx, eyeY, 2, 2, EYE)
    px(rx, eyeY, 2, 2, EYE)
    px(lx, eyeY, 1, 1, '#ffffff')
    px(rx, eyeY, 1, 1, '#ffffff')
  } else {
    px(lx, eyeY, 2, 1, EYE)
    px(rx, eyeY, 2, 1, EYE)
    if (f) {
      px(lx - 1, eyeY - 1, 1, 1, EYE)
      px(rx + 2, eyeY - 1, 1, 1, EYE)
    }
    if (L.kohl) {
      px(lx - 1, eyeY, 1, 1, '#141010')
      px(rx + 2, eyeY, 1, 1, '#141010')
    }
  }
  // Возраст: мешки под глазами, морщины на лбу, гусиные лапки, носогубные складки.
  const wr = shade(skin, -0.16)
  if (age >= 45) px(x0 + 3, T + 3, 4, 1, wr)
  if (age >= 50 || input.ill || body <= -2) {
    px(lx, eyeY + 1, 2, 1, wr)
    px(rx, eyeY + 1, 2, 1, wr)
  }
  if (age >= 58) {
    px(x0 + 2, T + 2, 2, 1, wr)
    px(x0 + 6, T + 2, 2, 1, wr)
    px(lx - 1, eyeY + 1, 1, 1, wr)
    px(rx + 2, eyeY + 1, 1, 1, wr)
    px(CX - 3, noseY + 1, 1, 2, wr)
    px(CX + 2, noseY + 1, 1, 2, wr)
  }
  // Впалые щёки у худых.
  if (body <= -2 && !small) {
    px(x0 + 1, noseY, 1, 2, shade(skin, -0.14))
    px(x0 + g.headW - 2, noseY, 1, 2, shade(skin, -0.14))
  }
  // Румянец у детей и девушек.
  if ((small || (f && age < 30)) && !input.ill && !input.dead && body > -2) {
    px(x0 + 1, noseY, 1, 1, mix(skin, '#e06060', 0.3))
    px(x0 + g.headW - 2, noseY, 1, 1, mix(skin, '#e06060', 0.3))
  }
  // Нос.
  if (!small) px(CX - 1, noseY, 2, 1, shade(skin, -0.18))
  else if (st === 'child') px(CX, noseY, 1, 1, shade(skin, -0.12))
  // Рот: улыбка, ровно или уголки вниз.
  const lip = f && !small ? mix(skin, LIP, 0.65) : mix(skin, LIP, 0.4)
  const h = input.happiness ?? 50
  if (input.dead || h < 30) {
    px(CX - 1, mouthY, 2, 1, lip)
    px(CX - 2, mouthY + 1, 1, 1, lip)
    px(CX + 1, mouthY + 1, 1, 1, lip)
  } else if (h >= 65) {
    px(CX - 1, mouthY, 2, 1, lip)
    px(CX - 2, mouthY - 1, 1, 1, lip)
    px(CX + 1, mouthY - 1, 1, 1, lip)
  } else px(CX - 1, mouthY, 2, 1, lip)
}

function drawBeard(px: Px, g: Geo, beard: Beard, hairAt: (i: number) => string, age: number): void {
  if (beard === 'none') return
  const x0 = CX - g.headW / 2
  const T = g.top
  const H = g.headH
  const mouthY = T + 9
  const c = hairAt(1)
  if (beard === 'fuzz') {
    px(CX - 2, mouthY - 1, 4, 1, `${c}66`)
    return
  }
  // Усы над губой.
  px(CX - 2, mouthY - 1, 4, 1, c)
  if (beard === 'moustache') {
    px(CX - 3, mouthY, 1, 1, c)
    px(CX + 2, mouthY, 1, 1, c)
    return
  }
  if (beard === 'goatee') {
    px(CX - 1, mouthY + 1, 2, H - 9 + (age >= 40 ? 3 : 1), c)
    px(CX - 3, mouthY, 1, 1, c)
    px(CX + 2, mouthY, 1, 1, c)
    return
  }
  // Короткая, полная и длинная борода закрывают подбородок и скулы, рот остаётся виден.
  const len = beard === 'short' ? 1 : beard === 'full' ? 3 : 7
  for (let yy = T + 6; yy < T + H + len; yy++) {
    const i = yy - T
    let w: number
    if (i <= H - 3) w = g.headW + (i >= 6 ? 0 : 0)
    else w = Math.max(4, g.headW - 2 * (i - (H - 3)) + (beard === 'long' ? 4 : 0))
    if (i >= H && beard === 'long') w = Math.max(4, 8 - Math.floor((i - H) / 2))
    // Бакенбарды и щёки — узкие полосы по краям, ниже рта — сплошь.
    if (yy < mouthY) {
      px(x0, yy, 2, 1, hairAt(yy))
      px(x0 + g.headW - 2, yy, 2, 1, hairAt(yy))
    } else {
      px(CX - w / 2, yy, w, 1, hairAt(yy))
    }
  }
  // Рот виден в бороде.
  px(CX - 1, mouthY, 2, 1, '#6a3a30')
  void x0
}

function frontHair(px: Px, g: Geo, L: Look, hairAt: (i: number) => string, bald: boolean, st: Stage): void {
  const x0 = CX - g.headW / 2
  const T = g.top
  const w = g.headW
  const hiddenTop = L.hat !== null && L.hat !== 'band' && L.hat !== 'llautu' && L.hat !== 'circlet' && L.hat !== 'laurel' && L.hat !== 'feathers'
  const covers = L.hat === 'hijab' || L.hat === 'wimple' || L.hat === 'netela' || L.hat === 'kerchief' || L.hat === 'hood' || L.hat === 'veil' || L.hat === 'wrap' || L.hat === 'turban' || L.hat === 'pagri' || L.hat === 'nemes' || L.hat === 'coif' || L.hat === 'bonnet'
  const cap = (rows: number) => {
    px(x0 + 2, T - 1, w - 4, 1, hairAt(0))
    px(x0 + 1, T, w - 2, 1, hairAt(1))
    for (let i = 1; i < rows; i++) px(x0, T + i, w, 1, hairAt(i + 1))
  }
  const sides = (from: number, to: number, width = 1) => {
    px(x0 - 1, T + from, width, to - from, hairAt(2))
    px(x0 + w + 1 - width, T + from, width, to - from, hairAt(3))
  }
  if (covers) return
  switch (L.hair) {
    case 'shaved':
      return
    case 'sidelock':
      // Египетский «локон юности»: голова обрита, одна прядь сбоку.
      px(x0 - 1, T + 2, 2, 8, hairAt(0))
      px(x0 - 2, T + 8, 2, 3, hairAt(0))
      return
    case 'chonmage':
      // Выбритая макушка, узел волос сверху, виски тёмные.
      px(x0, T + 2, w, 1, hairAt(0))
      px(x0 - 1, T + 3, 2, 4, hairAt(1))
      px(x0 + w - 1, T + 3, 2, 4, hairAt(1))
      px(CX - 1, T - 3, 2, 4, hairAt(0))
      px(CX - 2, T - 1, 4, 1, '#efe8d8')
      return
    case 'topknot':
      if (!hiddenTop) {
        cap(3)
        px(CX - 2, T - 4, 4, 3, hairAt(0))
        px(CX - 1, T - 1, 2, 1, '#c9a34a')
      } else sides(2, 6)
      return
    case 'tufts':
      cap(2)
      px(x0, T - 2, 3, 3, hairAt(0))
      px(x0 + w - 3, T - 2, 3, 3, hairAt(0))
      return
    case 'wig':
      // Тяжёлый чёрный парик с прямой чёлкой до плеч.
      if (L.hat === 'nemes') return
      px(x0 - 1, T - 1, w + 2, 4, hairAt(0))
      px(x0 - 2, T + 3, 3, g.shoulderY - T - 2, hairAt(0))
      px(x0 + w - 1, T + 3, 3, g.shoulderY - T - 2, hairAt(0))
      return
    case 'afro':
      if (hiddenTop) return sides(2, 6)
      px(x0 - 1, T - 2, w + 2, 3, hairAt(0))
      px(x0 - 2, T, 2, 5, hairAt(1))
      px(x0 + w, T, 2, 5, hairAt(1))
      px(x0, T + 1, w, 2, hairAt(0))
      for (let i = 0; i < w; i += 3) px(x0 + i, T - 2, 1, 1, shade(hairAt(0), 0.15))
      return
    case 'curly':
      if (hiddenTop) return sides(2, 7)
      cap(3)
      for (let i = 0; i < w + 2; i += 2) px(x0 - 1 + i, T - 1, 1, 1, shade(hairAt(0), 0.12))
      px(x0 - 1, T + 1, 1, 6, hairAt(1))
      px(x0 + w, T + 1, 1, 6, hairAt(1))
      return
    case 'bowl':
      // Стрижка «под горшок»: ровная чёлка и виски.
      if (hiddenTop) return sides(2, 6)
      cap(3)
      px(x0 - 1, T + 1, 1, 5, hairAt(1))
      px(x0 + w, T + 1, 1, 5, hairAt(1))
      return
    case 'bob':
      if (hiddenTop) return sides(2, 7)
      cap(3)
      px(x0 - 1, T + 1, 2, 7, hairAt(1))
      px(x0 + w - 1, T + 1, 2, 7, hairAt(1))
      return
    case 'short':
      if (bald && !hiddenTop) {
        sides(3, 6)
        return
      }
      if (hiddenTop) return sides(3, 6)
      cap(2)
      sides(1, 5)
      return
    case 'long':
      if (hiddenTop) return sides(2, 10, 2)
      cap(2)
      px(CX, T, 1, 1, shade(hairAt(0), -0.2))
      sides(1, 12, 2)
      return
    case 'bun':
      if (hiddenTop) return
      cap(2)
      sides(1, 6)
      px(CX - 2, T - 4, 4, 3, hairAt(0))
      px(CX - 3, T - 3, 6, 1, hairAt(1))
      if (st !== 'child') px(CX + 2, T - 4, 1, 1, '#c9a34a')
      return
    case 'braid':
      // Одна коса через плечо (Русь, Индия).
      if (!hiddenTop) cap(2)
      sides(1, 7)
      for (let yy = T + 7; yy < Math.min(AH, g.shoulderY + 12); yy++) px(x0 + w - 1, yy, 2, 1, yy & 1 ? hairAt(yy) : shade(hairAt(yy), 0.18))
      px(x0 + w - 1, Math.min(AH - 1, g.shoulderY + 12), 3, 1, '#a83a2f')
      return
    case 'braids':
      // Две косы на грудь.
      if (!hiddenTop) cap(2)
      sides(1, 7)
      for (let yy = T + 7; yy < Math.min(AH, g.shoulderY + 10); yy++) {
        const c = yy & 1 ? hairAt(yy) : shade(hairAt(yy), 0.18)
        px(x0 - 1, yy, 2, 1, c)
        px(x0 + w - 1, yy, 2, 1, c)
      }
      return
    case 'horns':
      // Причёска замужних ацтечек: две пряди-«рожка» надо лбом.
      cap(2)
      sides(1, 7)
      px(x0 + 1, T - 3, 2, 3, hairAt(0))
      px(x0 + w - 3, T - 3, 2, 3, hairAt(0))
      return
  }
}

function drawHat(px: Px, g: Geo, L: Look, st: Stage, r: () => number): void {
  if (!L.hat) return
  const x0 = CX - g.headW / 2
  const T = g.top
  const w = g.headW
  const c = L.hatColor
  const d = shade(c, -0.18)
  switch (L.hat) {
    case 'turban':
    case 'pagri': {
      px(x0 - 1, T - 3, w + 2, 6, c)
      px(x0, T - 4, w, 1, c)
      for (let i = 0; i < 3; i++) px(x0 - 1 + i * 2, T - 2 + i, w + 2 - i * 2, 1, d)
      if (L.hat === 'pagri') px(CX + 2, T - 4, 2, 2, shade(c, 0.15))
      else px(CX - 1, T - 1, 2, 2, shade(c, -0.08))
      break
    }
    case 'kufi':
      px(x0, T - 2, w, 3, c)
      px(x0 + 1, T - 3, w - 2, 1, c)
      for (let i = 1; i < w; i += 2) px(x0 + i, T - 1, 1, 1, d)
      break
    case 'fez':
      px(x0 + 1, T - 4, w - 2, 5, c)
      px(x0 + 1, T, w - 2, 1, d)
      break
    case 'veil':
    case 'netela': {
      // Покрывало поверх волос, лицо открыто.
      px(x0 - 2, T - 2, w + 4, 4, c)
      px(x0 - 1, T - 3, w + 2, 1, c)
      px(x0 - 2, T + 2, 2, g.shoulderY - T + 1, c)
      px(x0 + w, T + 2, 2, g.shoulderY - T + 1, c)
      if (L.hat === 'netela' || L.trim) px(x0 - 2, T + 1, w + 4, 1, L.trim ?? '#3a6a4a')
      px(x0, T + 1, w, 1, shade(c, -0.1))
      break
    }
    case 'hijab':
    case 'wimple':
    case 'kerchief': {
      // Закрывает волосы, шею и подбородок (у платка — узел под подбородком).
      const cc = L.hat === 'wimple' ? WHITE : c
      px(x0 - 2, T - 2, w + 4, 4, cc)
      px(x0 - 1, T - 3, w + 2, 1, cc)
      px(x0 - 2, T + 2, 2, g.headH, cc)
      px(x0 + w, T + 2, 2, g.headH, cc)
      if (L.hat !== 'kerchief') {
        px(x0, T + g.headH - 1, w, g.shoulderY - T - g.headH + 2, cc)
        px(x0 + 1, T + g.headH - 2, 1, 1, cc)
        px(x0 + w - 2, T + g.headH - 2, 1, 1, cc)
      } else {
        px(CX - 2, T + g.headH, 4, 2, d)
        for (let i = 0; i < w + 4; i += 3) px(x0 - 2 + i, T - 1, 1, 1, shade(c, 0.3))
      }
      if (L.hat === 'wimple') px(x0 - 2, T - 2, w + 4, 1, L.hatColor === WHITE ? '#d8d0c0' : L.hatColor)
      break
    }
    case 'kokoshnik': {
      // Высокий полумесяц с жемчугом и золотом.
      for (let i = 0; i < 6; i++) px(x0 - 1 + Math.max(0, 2 - i), T - 6 + i, w + 2 - 2 * Math.max(0, 2 - i), 1, c)
      px(x0 - 1, T - 1, w + 2, 1, '#c9a34a')
      for (let i = 0; i < w; i += 2) px(x0 + i, T - 4, 1, 1, '#f2eee2')
      px(x0 - 2, T, 2, 8, shade(c, -0.1))
      px(x0 + w, T, 2, 8, shade(c, -0.1))
      break
    }
    case 'fur':
      px(x0 + 1, T - 5, w - 2, 3, c)
      px(x0 + 2, T - 6, w - 4, 1, c)
      px(x0 - 1, T - 2, w + 2, 3, '#6a4a2a')
      for (let i = 0; i < w + 2; i += 2) px(x0 - 1 + i, T - 2, 1, 1, '#8a6a4a')
      break
    case 'felt':
      px(x0, T - 3, w, 4, c)
      px(x0 + 1, T - 4, w - 2, 1, c)
      px(x0 - 1, T, w + 2, 1, d)
      break
    case 'conical': {
      // Широкая соломенная шляпа.
      for (let i = 0; i < 4; i++) px(CX - 1 - i * 2, T - 3 + i, 2 + i * 4, 1, i === 3 ? d : c)
      px(CX - 8, T + 1, 16, 1, d)
      px(x0, T + 9, 1, 1, '#6a5a3a')
      break
    }
    case 'futou':
      // Чёрная шапка чиновника с крыльями.
      px(x0, T - 3, w, 4, c)
      px(x0 + 2, T - 5, w - 4, 2, c)
      px(x0 - 5, T - 2, 5, 1, c)
      px(x0 + w, T - 2, 5, 1, c)
      break
    case 'eboshi':
      // Высокая чёрная шапка, чуть назад.
      px(x0 + 2, T - 2, w - 4, 3, c)
      px(x0 + 3, T - 7, 5, 5, c)
      px(x0 + 4, T - 8, 4, 1, c)
      break
    case 'nemes': {
      // Полосатый платок, концы спадают на грудь.
      px(x0 - 1, T - 2, w + 2, 4, c)
      px(x0 - 3, T + 2, 3, g.shoulderY - T + 3, c)
      px(x0 + w, T + 2, 3, g.shoulderY - T + 3, c)
      for (let i = -2; i < g.shoulderY - T + 5; i += 2) {
        px(x0 - 3, T + i + 2, 3, 1, '#e0b84a')
        px(x0 + w, T + i + 2, 3, 1, '#e0b84a')
      }
      px(x0 - 1, T - 2, w + 2, 1, '#e0b84a')
      break
    }
    case 'feathers': {
      px(x0 - 1, T, w + 2, 2, c)
      const cols = ['#2a8a5a', '#2a8a5a', '#c0303a', '#e0b030', '#2a8a5a']
      for (let i = 0; i < 5; i++) {
        const fx = x0 - 1 + i * 3
        const h = 5 + (i === 2 ? 3 : i === 1 || i === 3 ? 1 : 0)
        px(fx, T - h, 2, h, cols[(i + Math.floor(r() * 2)) % cols.length])
      }
      px(CX - 1, T, 2, 2, '#3a9a7a')
      break
    }
    case 'band':
      px(x0 - 1, T + 1, w + 2, 2, c)
      px(x0 + w, T + 3, 1, 3, c)
      break
    case 'llautu':
      // Плетёная цветная повязка инков.
      px(x0 - 1, T + 1, w + 2, 2, c)
      for (let i = 0; i < w + 2; i += 2) px(x0 - 1 + i, T + 1, 1, 1, '#2a4a8a')
      if (L.earSpools) px(CX - 1, T - 2, 2, 3, '#e0b030')
      break
    case 'hood':
      // Капюшон-шаперон, лицо в овале.
      px(x0 - 2, T - 3, w + 4, 5, c)
      px(x0 - 1, T - 4, w + 2, 1, c)
      px(x0 - 2, T + 2, 2, g.shoulderY - T, c)
      px(x0 + w, T + 2, 2, g.shoulderY - T, c)
      px(x0 - 3, g.shoulderY - 1, w + 6, 4, c)
      px(x0, T + 1, w, 1, d)
      break
    case 'coif':
      px(x0 - 1, T - 2, w + 2, 4, WHITE)
      px(x0 - 1, T + 2, 1, 6, WHITE)
      px(x0 + w, T + 2, 1, 6, WHITE)
      px(x0, T + g.headH - 1, 1, 2, WHITE)
      break
    case 'wrap':
      // Высокий яркий головной платок.
      px(x0 - 1, T - 4, w + 2, 6, c)
      px(x0 - 2, T - 3, w + 4, 2, c)
      for (let i = 0; i < 3; i++) px(x0 - 1 + i, T - 3 + i * 2, w + 2 - i * 2, 1, d)
      px(x0 + w, T - 5, 3, 3, shade(c, 0.12))
      break
    case 'circlet':
      px(x0, T + 1, w, 1, c)
      px(CX - 1, T, 2, 1, '#c0303a')
      break
    case 'laurel':
      for (let i = 0; i < w + 2; i += 2) px(x0 - 1 + i, T + 1 - (i % 4 === 0 ? 1 : 0), 2, 1, '#4f7a3a')
      break
    case 'bonnet':
      px(x0 - 1, T - 2, w + 2, 5, WHITE)
      px(x0 - 1, T + 3, 1, 5, WHITE)
      px(x0 + w, T + 3, 1, 5, WHITE)
      break
  }
  void st
}
