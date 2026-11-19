// Герб рода (конструктор 19.11): форма щита, поле одной или двух тинктур с делением, знак и его цвет, имя рода.
// До 19.11 род выбирал один из 20 готовых гербов (house = id из houses.json) - такие выборы переводятся сюда
// (legacyArms) при загрузке сохранения; family.house остаётся меткой «род назван» и знаком для имени «Дом …».
import HOUSES from '../content/houses.json'

/** Тинктуры: пять цветов и два металла. */
export const TINCTURES = ['gules', 'azure', 'vert', 'purpure', 'sable', 'or', 'argent'] as const
export type Tincture = (typeof TINCTURES)[number]
export const TINCTURE_HEX: Record<Tincture, string> = {
  gules: '#a3272d',
  azure: '#2d5591',
  vert: '#3b6b3a',
  purpure: '#6a3a78',
  sable: '#24201c',
  or: '#d8aa3a',
  argent: '#ece6d4',
}
export const METALS: Tincture[] = ['or', 'argent']

export const SHAPES = ['heater', 'round', 'french', 'kite'] as const
export type ShieldShape = (typeof SHAPES)[number]
/** Деление поля: сплошное, рассечённое (по вертикали), пересечённое (по горизонтали), скошенное (по диагонали). */
export const DIVISIONS = ['plain', 'pale', 'fess', 'bend'] as const
export type Division = (typeof DIVISIONS)[number]

/** 20 знаков прежних гербов (id - как у дома: имя «Дом …» = house.<id>) и 10 новых. */
export const LEGACY_CHARGES = HOUSES.houses.map((h) => h.id)
export const NEW_CHARGES = ['eagle', 'lily', 'anchor', 'bell', 'axe', 'arrow', 'horn', 'antlers', 'grapes', 'bee'] as const
export const CHARGES: string[] = [...LEGACY_CHARGES, ...NEW_CHARGES]

export interface ArmsSpec {
  shape: ShieldShape
  field: Tincture
  division: Division
  /** Второй цвет поля (при делении). */
  field2: Tincture
  charge: string
  ink: Tincture
  /** Своё имя рода; нет - «Дом …» по знаку. */
  name?: string
}

/** Самое длинное своё имя рода. */
export const ARMS_NAME_MAX = 28

const LEGACY = new Map(HOUSES.houses.map((h) => [h.id, h]))

/** Прежний готовый герб в новом виде: тот же знак, поле и цвет знака - ближайшие тинктуры. */
export function legacyArms(id: string): ArmsSpec | undefined {
  const h = LEGACY.get(id)
  if (!h) return undefined
  return { shape: 'heater', field: h.t[0] as Tincture, division: 'plain', field2: h.t[1] as Tincture, charge: h.id, ink: h.t[1] as Tincture }
}

/** Привести к допустимому виду (сохранение могли править руками): неизвестное - по умолчанию, имя - обрезать. */
export function cleanArms(a: Partial<ArmsSpec> | undefined): ArmsSpec | undefined {
  if (!a || typeof a !== 'object' || !CHARGES.includes(a.charge as string)) return undefined
  const tin = (x: unknown, d: Tincture) => (TINCTURES.includes(x as Tincture) ? (x as Tincture) : d)
  const name = typeof a.name === 'string' ? a.name.replace(/\s+/g, ' ').trim().slice(0, ARMS_NAME_MAX) : ''
  return {
    shape: SHAPES.includes(a.shape as ShieldShape) ? (a.shape as ShieldShape) : 'heater',
    field: tin(a.field, 'azure'),
    division: DIVISIONS.includes(a.division as Division) ? (a.division as Division) : 'plain',
    field2: tin(a.field2, 'argent'),
    charge: a.charge as string,
    ink: tin(a.ink, 'or'),
    ...(name ? { name } : {}),
  }
}

/** Герб рода или итога жизни: новый формат, иначе прежний готовый по house. */
export function armsOf(x: { house?: string; arms?: ArmsSpec } | undefined): ArmsSpec | undefined {
  if (!x) return undefined
  return cleanArms(x.arms) ?? (x.house ? legacyArms(x.house) : undefined)
}

/** Перевести прежний выбор в новый формат (сохранение и мемориал при загрузке). Повторно - ничего не меняет. */
export function migrateArms(x: { house?: string; arms?: ArmsSpec } | undefined): void {
  if (!x || !x.house || x.arms) return
  const a = legacyArms(x.house)
  if (a) x.arms = a
}

/** Металл на цвете или цвет на металле - знак читается (правило тинктур). */
export function readable(a: Pick<ArmsSpec, 'field' | 'ink' | 'division' | 'field2'>): boolean {
  const metal = (t: Tincture) => METALS.includes(t)
  if (a.ink === a.field || (a.division !== 'plain' && a.ink === a.field2)) return false
  if (a.division === 'plain') return metal(a.ink) !== metal(a.field)
  return true
}
