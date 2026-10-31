// Человечки сцен в полном разрешении (320×100): голова с глазами и убором, одежда по сословию, руки,
// возраст (седина, сутулость, посох) и предмет по занятию. Рисуются в «родных» точках холста, без масштаба.
// Кадр позы (pose): 0 - стоит, 1 - переступил, 2–3 - замах при работе.

export type Px = (x: number, y: number, w: number, h: number, c: string) => void

export type FigureHat = 'cover' | 'turban' | 'tall' | 'feather' | 'cap' | 'band' | 'helmet' | null
export type Tool = 'hoe' | 'spear' | 'sword' | 'scroll' | 'scales' | 'hammer' | 'staff' | 'oar' | 'basket' | 'bow'

export interface FigureSpec {
  sex: 'm' | 'f'
  age: number
  /** Высота в точках холста. */
  h: number
  skin: string
  hair: string
  cloth: string
  trim: string | null
  hat: FigureHat
  hatColor: string
  beard: boolean
  longHair: boolean
  bald: boolean
  /** Сословие: раб - простая туника, знать - плащ и украшения, духовные - длинная ряса. */
  cls?: string
  tool?: Tool
  hero?: boolean
  /** Цвет отделки знати и золота края. */
  accent?: string
}

const EYE = '#2a1e18'
const LEG = '#3a2a20'

function shadeHex(hex: string, k: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

/** Рост на холсте 320×100 по возрасту: близкие героя - 23 точки, прохожие - 20, дальние - 13. */
export function figureHeight(age: number, kind: 'family' | 'passer' | 'far' = 'family'): number {
  if (kind === 'far') return 13
  const adult = kind === 'family' ? 23 : 20
  return age < 4 ? 11 : age < 10 ? 15 : age < 15 ? 19 : adult
}

/** Занятие → предмет в руках. */
const TOOLS: Record<string, Tool> = {}
const group = (tool: Tool, ids: string) => ids.split(' ').forEach((id) => (TOOLS[id] = tool))
group('hoe', 'farmer field_slave chinampa_farmer tea_grower laborer')
group('spear', 'soldier legionary centurion druzhinnik janissary mamluk akrites eagle_warrior strelets maryannu charioteer')
group('sword', 'knight samurai gladiator officer')
group('scroll', 'scribe exam_scholar astronomer translator debtera kavi rhetor magistrate official qazi physician healer storyteller griot icon_painter dream_astronomer dream_healer')
group('scales', 'merchant spice_trader salt_merchant wool_merchant coffee_merchant banker salt_trader dream_banker shipowner')
group('hammer', 'blacksmith swordsmith beta_israel_smith bell_caster stone_carver cathedral_mason church_carver jade_carver tomb_builder mita_builder workshop_owner artisan gold_miner dream_engineer')
group('staff', 'priest monk hegumen shrine_priest marabout faqir muezzin chasqui caravaneer salt_carrier mahout overseer pochteca')
group('oar', 'sailor ama_diver siphonarios')
group('basket', 'midwife weaver silk_weaver muslin_weaver potter brewer alewife sake_brewer perfumer porcelain_maker bortnik matron aclla household_slave coffee_keeper dream_alchemist')
group('bow', 'hunter fur_trapper')

export function toolFor(profession: string | undefined): Tool | undefined {
  return profession ? TOOLS[profession] : undefined
}

const CLERGY = ['priest', 'monk', 'hegumen', 'shrine_priest', 'marabout', 'faqir', 'muezzin', 'debtera']

/**
 * Человечек: x - левый край туловища, base - нижняя строка (ступни), k - затемнение по времени суток.
 * Смотрит вправо: сутулый старик наклоняет голову вперёд, предмет - в правой руке.
 */
export function drawFigure(px: Px, x: number, base: number, f: FigureSpec, k: number, pose = 0, profession?: string): void {
  const c = (hex: string, d = 0) => shadeHex(hex, k * 0.5 + d)
  const h = f.h
  const far = h < 14
  const top = base - h + 1
  const bw = h >= 18 ? 7 : h >= 13 ? 5 : 4
  const hw = h >= 18 ? 5 : h >= 13 ? 4 : 3
  const hh = h >= 18 ? 6 : h >= 13 ? 4 : 3
  const elder = f.age >= 62
  const stoop = elder && !far ? 1 : 0
  const hx = x + Math.floor((bw - hw) / 2) + stoop
  const slave = f.cls === 'slave'
  const noble = f.cls === 'noble'
  const clergy = !!profession && CLERGY.includes(profession)
  const cloth = slave ? '#c8b89a' : f.cloth
  const legs = Math.max(2, Math.round(h * 0.28))
  const torso = h - hh - legs
  const yT = top + hh

  // Отметка героя: золотой треугольник над головой (выше убора).
  if (f.hero) {
    const y = top - (f.hat === 'feather' || f.hat === 'tall' ? 9 : 7)
    const cx = hx + Math.floor(hw / 2)
    px(cx - 2, y, 5, 1, '#f2c94c')
    px(cx - 1, y + 1, 3, 1, '#f2c94c')
    px(cx, y + 2, 1, 1, '#f2c94c')
  }

  // Ноги или подол.
  const long = f.sex === 'f' || clergy || (noble && f.age >= 15 && !far)
  const yL = yT + torso
  if (long && h >= 13) {
    const sway = pose === 1 ? 1 : 0
    px(x - 1 + sway, yL, bw + 2, legs, c(cloth))
    px(x - 1 + sway, base, bw + 2, 1, c(cloth, -0.18))
    if (f.trim && !slave) px(x - 1 + sway, base - 1, bw + 2, 1, c(f.trim))
  } else {
    const legC = slave || (f.age < 10 && !far) ? f.skin : LEG
    const lw = bw >= 7 ? 2 : 1
    const lx1 = x + 1
    const lx2 = x + bw - 1 - lw
    const lift = pose === 1 ? 1 : 0
    px(lx1, yL, lw, legs - lift, c(legC))
    px(lx2, yL, lw, legs, c(legC))
    if (!far) {
      px(lx1, base - lift, lw + 1, 1, c('#2a1e16'))
      px(lx2, base, lw + 1, 1, c('#2a1e16'))
    }
  }

  // Туловище: одежда, тень справа, пояс или кайма.
  px(x, yT, bw, torso, c(cloth))
  if (!far) {
    px(x + bw - 1, yT, 1, torso, c(cloth, -0.14))
    if (slave) px(x, yT + torso - 1, bw, 1, c('#a8987a'))
    else if (f.trim) px(x, yT + torso - 2, bw, 1, c(f.trim))
    else if (!long) px(x, yT + Math.floor(torso / 2) + 1, bw, 1, c(cloth, -0.25))
    if (f.age >= 10) px(x + Math.floor(bw / 2), yT, 1, 1, c(f.skin))
    if (noble) {
      // Плащ за спиной и золотая застёжка.
      px(x - 2, yT, 2, torso + Math.min(legs, 4), c(f.accent ?? '#a83a2f', -0.05))
      px(x + 1, yT + 1, 1, 1, '#f2c94c')
    }
    if (f.cls === 'craftsman' && !long) px(x + 1, yT + 2, bw - 2, torso - 1, c('#a8875a'))
    // Руки: левая вдоль тела, правая - с предметом.
    const arm = torso - 1
    px(x - 1, yT + 1, 1, arm, c(cloth, -0.1))
    px(x - 1, yT + arm, 1, 1, c(f.skin))
    const raise = (pose === 2 || pose === 3) && f.tool ? (pose === 2 ? 3 : 0) : 0
    px(x + bw, yT + 1 - raise, 1, arm, c(cloth, -0.1))
    px(x + bw, yT + arm - raise, 1, 1, c(f.skin))
    drawTool(px, f.tool ?? (elder && h >= 18 ? 'staff' : undefined), x + bw + 1, yT + arm - raise, base, top, c, pose)
  }

  // Голова: лицо, волосы, глаза, борода.
  px(hx, top, hw, hh, c(f.skin))
  const hairC = c(f.bald ? f.skin : f.hair)
  px(hx, top, hw, 1, hairC)
  if (hh >= 5) {
    px(hx, top + 1, 1, 2, hairC)
    if (!f.bald) px(hx + hw - 1, top + 1, 1, 1, hairC)
    px(hx + 1, top + 3, 1, 1, EYE)
    px(hx + hw - 2, top + 3, 1, 1, EYE)
  } else if (hh >= 4) px(hx + hw - 2, top + 2, 1, 1, EYE)
  if (f.longHair && f.hat !== 'cover') {
    px(hx - 1, top, 1, hh + (far ? 1 : 3), hairC)
    px(hx + hw, top + 1, 1, hh + (far ? 0 : 2), hairC)
  }
  if (f.beard && !far && f.age >= 18) {
    px(hx, top + hh - 1, hw, 1, hairC)
    px(hx + 1, top + hh - 2, hw - 2, 1, hairC)
    px(hx + 1, top + hh, hw - 2, 1, hairC)
  }

  // Убор.
  if (!slave) drawHat(px, f, hx, hw, hh, top, c)
}

function drawHat(px: Px, f: FigureSpec, hx: number, hw: number, hh: number, top: number, c: (h: string, d?: number) => string) {
  const col = c(f.hatColor)
  switch (f.hat) {
    case 'cover':
      px(hx - 1, top - 1, hw + 2, 2, col)
      px(hx - 1, top + 1, 1, hh + 1, col)
      px(hx + hw, top + 1, 1, hh + 1, col)
      return
    case 'turban':
      px(hx - 1, top - 2, hw + 2, 3, col)
      px(hx, top - 2, hw, 1, c(f.hatColor, 0.15))
      return
    case 'tall':
      px(hx - 2, top, hw + 4, 1, col)
      px(hx, top - 1, hw, 1, col)
      px(hx + 1, top - 2, hw - 2, 1, col)
      px(hx + Math.floor(hw / 2), top - 3, 1, 1, col)
      return
    case 'feather':
      px(hx, top, hw, 1, col)
      px(hx + Math.floor(hw / 2), top - 4, 1, 4, col)
      px(hx + Math.floor(hw / 2) + 1, top - 5, 1, 2, c('#2a8a5a'))
      return
    case 'cap':
      px(hx - 1, top - 1, hw + 2, 1, col)
      px(hx, top - 2, hw, 1, col)
      return
    case 'band':
      px(hx, top + 1, hw, 1, col)
      return
    case 'helmet':
      px(hx - 1, top - 1, hw + 2, 2, c('#8a8a8a'))
      px(hx, top - 2, hw, 1, c('#a8a8a8'))
      px(hx + Math.floor(hw / 2), top + 1, 1, 2, c('#7a7a7a'))
      return
  }
}

/** Предмет в правой руке (hx, hy - кисть). */
function drawTool(px: Px, tool: Tool | undefined, hx: number, hy: number, base: number, top: number, c: (h: string, d?: number) => string, pose: number) {
  const wood = c('#6a4a2a')
  const metal = c('#9a9a9a')
  switch (tool) {
    case 'hoe':
      if (pose === 2) {
        // Замах: черенок над плечом.
        for (let i = 0; i < 7; i++) px(hx - 1 + i, hy - 4 - Math.floor(i / 2), 1, 1, wood)
        px(hx + 6, hy - 8, 2, 2, metal)
      } else {
        px(hx, hy - 6, 1, base - hy + 6, wood)
        px(hx + 1, base - 1, 2, 1, metal)
      }
      return
    case 'spear':
      px(hx, top - 4, 1, base - top + 4, wood)
      px(hx, top - 6, 1, 2, metal)
      return
    case 'sword':
      px(hx, hy, 1, 1, c('#5a4030'))
      px(hx, hy + 1, 1, 5, metal)
      return
    case 'scroll':
      px(hx - 2, hy - 2, 3, 2, c('#efe3c2'))
      px(hx - 2, hy - 2, 1, 2, c('#a88a5a'))
      return
    case 'scales':
      px(hx, hy - 3, 1, 3, wood)
      px(hx - 2, hy - 3, 5, 1, c('#c9a34a'))
      px(hx - 2, hy - 2, 1, 1, c('#c9a34a'))
      px(hx + 2, hy - 2, 1, 1, c('#c9a34a'))
      return
    case 'hammer':
      if (pose === 2) {
        px(hx, hy - 4, 1, 4, wood)
        px(hx - 1, hy - 6, 3, 2, metal)
      } else {
        px(hx, hy, 1, 4, wood)
        px(hx - 1, hy + 4, 3, 2, metal)
      }
      return
    case 'staff':
      px(hx, top + 1, 1, base - top - 1, wood)
      return
    case 'oar':
      for (let i = 0; i < 8; i++) px(hx + Math.floor(i / 2), hy - 3 + i, 1, 1, wood)
      px(hx + 4, hy + 5, 2, 2, wood)
      return
    case 'basket':
      px(hx - 1, hy, 3, 3, c('#b8945a'))
      px(hx - 1, hy + 1, 3, 1, c('#8a6a3a'))
      return
    case 'bow':
      px(hx + 1, hy - 5, 1, 1, wood)
      px(hx + 2, hy - 4, 1, 8, wood)
      px(hx + 1, hy + 4, 1, 1, wood)
      return
  }
}
