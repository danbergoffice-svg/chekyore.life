// Живописная сцена из готовых слоёв (графика 17.11.2026, ~/Downloads/thousands-art-kit): у каждого края своя
// традиция - Япония в гравюре укиё-э, Европа маслом и т. д. Слои - небо, даль, ориентир края, земля, дома 0–4,
// люди (сословие × пол × возраст), животные, предметы, погода - лежат в public/art/<стиль>/<слой>.bin
// (склеенные WebP) с оглавлением index.json. Кадр 960×300, линия ног y=220, как у детальной сцены (hd.ts).
// Пока слои грузятся или если для места нет слоёв (мастерская, школа, баня) - показывается прежняя пиксельная сцена.
// Включено у всех, где есть слои (флаг painted_share, src/goal.ts paintedOn); пиксельные - в настройках (prefs.art).
import type { SceneInput, Cast, CastMember } from './scene'
import { lookOf, rand } from './scene'
import type { Weather } from './fx'
// Стиль → файл оглавления (с хешем содержимого). Пишет tools/pack.py набора графики; так новая упаковка
// всегда получает новые адреса и офлайн-кэш сайта (sw.js) не смешивает старые файлы с новыми.
import ART_VERSIONS from './art-versions.json'
// Раскладка кадра (где дома, люди, сколько прозрачности у погоды, тонировка, спрятанные картинки) - правится
// в галерее ?gallery=painted и сохраняется сюда.
import DEFAULT_LAYOUT from './painted-layout.json'

export type PaintedLayout = Omit<typeof DEFAULT_LAYOUT, 'hide'> & { hide: string[] }
const LAYOUT_KEY = 'thousands.painted_layout'
/** Раскладка: правки из галереи в этом браузере (localStorage) поверх файла. */
let layout: PaintedLayout = (() => {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LAYOUT_KEY) : null
    if (saved) return { ...(DEFAULT_LAYOUT as PaintedLayout), ...JSON.parse(saved) } as PaintedLayout
  } catch {
    // нет хранилища или испорчено - файл
  }
  return DEFAULT_LAYOUT as PaintedLayout
})()
/** Галерея меняет раскладку на лету. */
export function setLayout(l: PaintedLayout): void {
  layout = l
}
/** Запомнить правки галереи в этом браузере (они действуют и в игре). */
export function saveLayout(l: PaintedLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l))
  } catch {
    // нет хранилища
  }
}
export function getLayout(): PaintedLayout {
  return layout
}

export const PW = 960
export const PH = 300
export const PGROUND = 220

type Entry = [layer: string, offset: number, length: number, w: number, h: number, sceneH: number | null]
export type ArtIndex = Record<string, Entry>
interface ArtPack {
  /** Слой → имя файла пака (с хешем). */
  files: Record<string, string>
  items: ArtIndex
}

let on = false
/** Включить живописные сцены (App по флагу). */
export function setPainted(v: boolean): void {
  on = v
}
export function paintedEnabled(): boolean {
  return on
}

// ---------------------------------------------------------------- План кадра (чистая функция, без загрузки)

export interface Placed {
  /** Ключ в index.json: '<слой>.<id>'. */
  key: string
  /** Центр по горизонтали и низ (линия ног) в точках кадра 960×300; для фонов - левый верх. */
  x: number
  y: number
  /** Высота в точках кадра; для фонов - своя. */
  h?: number
  flip?: boolean
  alpha?: number
  /** Погода, которая движется: дождь и снег сверху вниз, туман вбок. */
  drift?: 'down' | 'side'
  /** Только верхняя полоса картинки (доля высоты): гирлянды праздника. */
  band?: number
  /** Земля под ногами: насколько поднимается над линией ног (до 25), откуда брать текстуру и её сила.
   *  Идёт до низа кадра; основа - цвет земли самого кадра над линией ног, текстура - слабо сверху. */
  strip?: { h: number; src: number; texture: number }
  /** Дождь, снег, туман - рисуются кодом (картинки погоды из генерации тащили в кадр лица и орнамент). */
  weather?: 'rain' | 'snow' | 'fog'
  /** Масштаб фона или погоды (move.<слой>.scale; у объектов масштаб уже в h). */
  k?: number
  /** Человек: сдвиг оттенка одежды в градусах (кожа не трогается) и ширина относительно роста. */
  hue?: number
  wide?: number
  /** Группа раскладки (галерея: перетаскивание меняет её x/y в painted-layout.json). */
  group?: 'home' | 'street' | 'people' | 'animals' | 'props'
}

export interface PaintedPlan {
  style: string
  layers: Placed[]
  /** Тона поверх всего кадра: ночь, закат, рассвет, пасмурно; война, мор, голод. */
  tints: { color: string; alpha: number }[]
}

const INDOOR = new Set(['workshop', 'school', 'bath'])
/** Слои-фоны: рисуются во всю ширину кадра от своей точки (x, y), а не «ногами на линию земли». */
export const BACKDROPS = new Set(['sky', 'interior', 'far', 'landmark', 'ground'])
const WITH_LANDMARK = new Set(['landmark', 'street', 'market', 'temple', 'palace', 'harbor', 'arena', 'tomb', 'river', 'road', 'sea'])
const PROP_KEYS = new Set(['fire', 'boat', 'bed', 'cradle', 'table', 'scroll', 'coins', 'amphora', 'tree', 'palm', 'olive', 'grain', 'cart', 'lamp', 'altar', 'statue', 'banner', 'shield', 'loom', 'anvil'])
const CLASSES = ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']

/** Возраст → ступень картинки человека. */
export function ageStage(age: number): 'baby' | 'child' | 'teen' | 'adult' | 'elder' {
  if (age < 2) return 'baby'
  if (age < 13) return 'child'
  if (age < 18) return 'teen'
  return age < 60 ? 'adult' : 'elder'
}

function personKey(index: ArtIndex, cls: string | undefined, sex: 'm' | 'f', age: number, pose = 'stand'): string | null {
  const stage = ageStage(age)
  if (stage === 'baby') return index['person.baby_swaddled'] ? 'person.baby_swaddled' : null
  const c = cls && CLASSES.includes(cls) ? cls : cls === 'royal' ? 'noble' : 'peasant'
  for (const k of [`person.${c}_${sex}_${stage}_${pose}`, `person.${c}_${sex}_${stage}_stand`, `person.peasant_${sex}_${stage}_stand`, `person.peasant_${sex}_adult_stand`]) if (has(index, k)) return k
  return null
}

/** Свой облик каждого человека по его зерну: поза (у взрослых), отражение, рост ±6%, ширина ±5%, цвет одежды.
 *  Так семья одного сословия не выглядит одной и той же картинкой. Герой стоит и смотрит в кадр. */
export function personVariant(seed: string, hero = false): { pose: string; flip: boolean; size: number; wide: number; hue: number } {
  const r = rand(`${seed}:figure`)
  const pose = hero ? 'stand' : (['stand', 'stand', 'walk', 'work'] as const)[Math.floor(r() * 4)]
  const flip = r() < 0.5
  const size = 0.94 + r() * 0.12
  const wide = 0.95 + r() * 0.1
  // Без сдвига у четверти людей - исходные цвета стиля тоже встречаются.
  const hue = r() < 0.25 ? 0 : Math.round(30 + r() * 300)
  return { pose, flip: hero ? false : flip, size, wide, hue }
}

/** Первый подходящий ключ из списка, иначе любой этого слоя. */
function pick(index: ArtIndex, layer: string, ...ids: (string | undefined)[]): string | null {
  for (const id of ids) if (id && has(index, `${layer}.${id}`)) return `${layer}.${id}`
  return Object.keys(index).find((k) => k.startsWith(layer + '.') && has(index, k)) ?? null
}

/** Картинка есть и не спрятана в галерее (hide: '<стиль>/<ключ>'). */
function has(index: ArtIndex, key: string): boolean {
  return !!index[key] && !hidden.has(`${styleOf(index)}/${key}`)
}
let hidden = new Set<string>()
const STYLE_OF = new WeakMap<ArtIndex, string>()
function styleOf(index: ArtIndex): string {
  return STYLE_OF.get(index) ?? ''
}
/** Запомнить, какому стилю принадлежит оглавление (для списка спрятанных картинок). */
export function tagIndex(index: ArtIndex, style: string): ArtIndex {
  STYLE_OF.set(index, style)
  return index
}

/** Где стоять людям семьи: герой в центре, рядом супруг, дети, родители, остальные. */
function castOrder(c: Cast): CastMember[] {
  const rank: Record<string, number> = { hero: 0, spouse: 1, child: 2, parent: 3, sibling: 4, npc: 5 }
  return [...c.members].sort((a, b) => rank[a.role] - rank[b.role])
}

/** Что и где лежит в кадре. index - оглавление стиля края. Null - для этого места живописи нет. */
export function planPainted(input: SceneInput, index: ArtIndex): PaintedPlan | null {
  const { scene, region, seed, cast, mood } = input
  const Y = layout
  hidden = new Set(Y.hide)
  const G = Y.ground
  const place = scene.place ?? 'street'
  const look = lookOf(region)
  const r = rand(`${seed}:painted`)
  const time = scene.time ?? 'day'
  const L: Placed[] = []
  const burned = !!cast?.homeState && cast.homeState !== 'rebuilding'
  // Помещение: дом изнутри по достатку (сгоревший дом - снаружи, на пепелище), мастерская, школа, баня.
  const lvl = Math.max(0, Math.min(4, cast?.home ?? 1))
  const room = INDOOR.has(place) ? place : place === 'home' && !burned && scene.disaster !== 'fire' ? (lvl <= 1 ? 'home_poor' : lvl === 2 ? 'home_mid' : 'home_rich') : null
  const inside = room && has(index, `interior.${room}`) ? `interior.${room}` : null
  if (room && !inside && INDOOR.has(place)) return null
  if (inside) {
    L.push({ key: inside, x: 0, y: 0 })
  } else {
    const sky = pick(index, 'sky', time, 'day')
    if (!sky) return null
    L.push({ key: sky, x: 0, y: 0 })
    const land = look.land
    // Даль и ориентир - во весь кадр со своей землёй до низа; отдельная полоса земли - по настройке.
    const far = pick(index, 'far', land, 'green', 'dry')
    if (far) L.push({ key: far, x: 0, y: Y.far.y })
    const landmark = WITH_LANDMARK.has(place) && has(index, `landmark.${region}`) ? `landmark.${region}` : null
    if (landmark) L.push({ key: landmark, x: 0, y: Y.landmark.y })
    // Полоса земли переднего плана под линией ног (не выше 25 точек): люди, звери и дома стоят на одной земле.
    if (Y.groundStrip) {
      const ground = pick(index, 'ground', land, 'green', 'dry')
      if (ground) L.push({ key: ground, x: 0, y: G + Y.groundStripY, strip: { h: Y.groundStripH, src: Y.groundStripSrc, texture: Y.groundStripTexture } })
    }
  }

  // Дома: свой двор - дом семьи; улица и рынок - соседний дом с одной стороны (сторона по зерну); поле - хижина вдали.
  const objects: Placed[] = []
  if (!inside && (place === 'home' || place === 'yard')) {
    const k = pick(index, 'house', burned || scene.disaster === 'fire' ? `home${lvl}_burned` : `home${lvl}`, `home${lvl}`)
    if (k) objects.push({ key: k, x: Y.home.x, y: G + 4 + Y.home.y, h: scaled(index, k, Y.home.scale), group: 'home' })
  } else if (place === 'street' || place === 'market' || place === 'road') {
    const levels = [1, 2, 3].sort(() => r() - 0.5)
    const left = r() < 0.5
    for (let i = 0; i < Math.min(2, Y.street.houses); i++) {
      const k = pick(index, 'house', `home${levels[i]}`)
      const onLeft = i === 0 ? left : !left
      if (k) objects.push({ key: k, x: onLeft ? PW - Y.street.x : Y.street.x, y: G + 4 + Y.street.y, flip: !onLeft, h: scaled(index, k, Y.street.scale), group: 'street' })
    }
  } else if (place === 'field') {
    const k = pick(index, 'house', 'home1')
    if (k) objects.push({ key: k, x: Y.field.x, y: G - 6, h: Y.field.h })
  }

  // Предметы сцены (козы и кони из props - к животным).
  const props = (scene.props ?? []).filter((p) => PROP_KEYS.has(p) && has(index, `prop.${p}`))
  props.forEach((p, i) => objects.push({ key: `prop.${p}`, x: p === 'fire' ? Y.props.fireX : Y.props.x + i * Y.props.step, y: G + 6 + Y.props.y, h: scaled(index, `prop.${p}`, Y.props.scale), group: 'props' }))
  const animals = [...(cast?.animals ?? []), ...(scene.props ?? []).filter((p) => p === 'goat' || p === 'horse')]
  ;[...new Set(inside ? [] : animals)].filter((a) => has(index, `animal.${a}`)).slice(0, 3).forEach((a, i) => objects.push({ key: `animal.${a}`, x: Y.animals.x + i * Y.animals.step, y: G + 10 + Y.animals.y, group: 'animals', flip: i % 2 === 1, h: scaled(index, `animal.${a}`, Y.animals.scale) }))

  // Люди: семья героя, иначе прохожие по месту.
  const people: Placed[] = []
  const members = cast ? castOrder(cast) : []
  if (members.length) {
    const step = members.length > 6 ? Y.people.stepCrowded : Y.people.step
    const start = Y.people.center - ((members.length - 1) * step) / 2
    members.forEach((m, i) => {
      const v = personVariant(m.seed || `${seed}:${i}`, m.role === 'hero')
      const k = personKey(index, m.cls, m.sex, m.age, v.pose)
      if (k) people.push({ key: k, x: start + i * step, y: G + 8 + Y.people.y, group: 'people', flip: m.role === 'hero' ? false : v.flip, h: (scaled(index, k, Y.people.scale) ?? index[k]?.[5] ?? 0) * v.size || undefined, wide: v.wide, hue: v.hue })
    })
  } else {
    const n = Math.max(0, Math.min(6, scene.people ?? 2))
    const byPlace: Record<string, string[]> = { market: ['trader', 'trader', 'peasant', 'craftsman'], palace: ['noble', 'landowner', 'slave'], temple: ['peasant', 'noble', 'craftsman'], field: ['peasant', 'peasant', 'slave'], harbor: ['trader', 'craftsman', 'peasant'] }
    const pool = byPlace[place] ?? ['peasant', 'craftsman', 'trader', 'peasant']
    for (let i = 0; i < n; i++) {
      const sex = r() < 0.5 ? 'm' : 'f'
      const age = r() < 0.15 ? 9 : r() < 0.15 ? 66 : 32
      const v = personVariant(`${seed}:passer${i}`)
      const k = personKey(index, pool[Math.floor(r() * pool.length)], sex, age, v.pose)
      const x = Y.people.center - 170 + (i + 0.5) * (380 / Math.max(1, n)) + (r() - 0.5) * 20
      if (k) people.push({ key: k, x, y: G + 8 + Y.people.y, group: 'people', flip: v.flip, h: (scaled(index, k, Y.people.scale) ?? index[k]?.[5] ?? 0) * v.size || undefined, wide: v.wide, hue: v.hue })
    }
  }
  L.push(...objects, ...people)

  // Погода - прозрачной картинкой поверх; праздник - полосой гирлянд сверху; война, мор и голод - тоном кадра.
  const fx = new Set<string>()
  const w: Weather | null | undefined = input.weather
  if (w === 'rain' || w === 'storm' || scene.props?.includes('rain')) fx.add('rain')
  if (w === 'snow') fx.add('snow')
  if (w === 'fog') fx.add('fog')
  if (scene.props?.includes('smoke')) fx.add('smoke')
  if (scene.disaster === 'fire') fx.add('fire')
  if (mood === 'feast') fx.add('feast')
  const FX = Y.fx as Record<string, { alpha: number; band?: number }>
  for (const f of fx) {
    if (!FX[f] || (inside && f !== 'fire' && f !== 'smoke' && f !== 'feast')) continue
    if (f === 'rain' || f === 'snow' || f === 'fog') {
      L.push({ key: `fx.${f}`, x: 0, y: 0, alpha: FX[f].alpha, weather: f })
      continue
    }
    if (!has(index, `fx.${f}`)) continue
    L.push({ key: `fx.${f}`, x: 0, y: 0, alpha: FX[f].alpha, band: FX[f].band, drift: f === 'rain' || f === 'snow' ? 'down' : f === 'fog' ? 'side' : undefined })
  }
  const T = Y.tint as Record<string, { color: string; alpha: number }>
  const tints: { color: string; alpha: number }[] = []
  if (inside) {
    if (time === 'night') tints.push(T.indoorNight)
  } else if (T[time]) tints.push(T[time])
  if (mood && mood !== 'feast' && T[mood]) tints.push(T[mood])
  // Свободный сдвиг и масштаб любого слоя целиком (галерея: «тянуть слой»).
  const MOVE = (Y as { move?: Record<string, { x?: number; y?: number; scale?: number }> }).move ?? {}
  for (const l of L) {
    const m = MOVE[slotOf(l)]
    if (!m) continue
    l.x += m.x ?? 0
    l.y += m.y ?? 0
    const k = m.scale ?? 1
    if (k === 1) continue
    if (BACKDROPS.has(l.key.split('.')[0]) || l.key.startsWith('fx.')) l.k = k
    else {
      const sh = l.h ?? index[l.key]?.[5] ?? undefined
      if (sh) l.h = sh * k
    }
  }
  // Порядок слоёв снизу вверх - из раскладки (галерея: стрелки ↑↓). Внутри группы порядок прежний.
  const order = Y.order ?? DEFAULT_ORDER
  const rank = (l: Placed) => {
    const i = order.indexOf(slotOf(l))
    return i < 0 ? order.length : i
  }
  L.sort((a, b) => rank(a) - rank(b))
  return { style: look.style, layers: L, tints }
}

export const DEFAULT_ORDER = ['sky', 'interior', 'far', 'landmark', 'ground', 'houses', 'props', 'animals', 'people', 'fx']
const SLOT: Record<string, string> = { sky: 'sky', interior: 'interior', far: 'far', landmark: 'landmark', ground: 'ground', house: 'houses', prop: 'props', animal: 'animals', person: 'people', fx: 'fx' }
/** Группа порядка слоя по ключу: house.home2 → houses. */
export function slotOf(l: Placed): string {
  return SLOT[l.key.split('.')[0]] ?? 'fx'
}

/** Высота объекта в кадре с поправкой масштаба из раскладки (undefined - как в оглавлении). */
function scaled(index: ArtIndex, key: string, k: number): number | undefined {
  const sh = index[key]?.[5]
  return sh && k !== 1 ? sh * k : undefined
}

// ---------------------------------------------------------------- Загрузка

const indexes = new Map<string, Promise<ArtPack | null>>()
const packs = new Map<string, Promise<ArrayBuffer | null>>()
const images = new Map<string, Promise<CanvasImageSource | null>>()

function loadPackIndex(style: string): Promise<ArtPack | null> {
  let p = indexes.get(style)
  if (!p) {
    const file = (ART_VERSIONS as Record<string, string>)[style]
    p = file
      ? fetch(`./art/${style}/${file}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null)
    indexes.set(style, p)
  }
  return p
}

export async function loadIndex(style: string): Promise<ArtIndex | null> {
  const items = (await loadPackIndex(style))?.items
  return items ? tagIndex(items, style) : null
}

function loadPack(style: string, layer: string): Promise<ArrayBuffer | null> {
  const id = `${style}/${layer}`
  let p = packs.get(id)
  if (!p) {
    p = loadPackIndex(style).then((ix) =>
      ix?.files[layer]
        ? fetch(`./art/${style}/${ix.files[layer]}`)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .catch(() => null)
        : null,
    )
    packs.set(id, p)
  }
  return p
}

/** Заранее подтянуть оглавление и основные слои края (меню, начало жизни) - кадр появится сразу. */
export function prefetchPainted(region: string): void {
  if (!on) return
  const style = lookOf(region).style
  for (const layer of ['sky', 'far', 'landmark', 'ground', 'house', 'person', 'interior', 'portrait']) loadPack(style, layer)
}

async function decode(blob: Blob): Promise<CanvasImageSource | null> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob).catch(() => null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = URL.createObjectURL(blob)
  })
}

function loadImage(style: string, index: ArtIndex, key: string): Promise<CanvasImageSource | null> {
  const id = `${style}/${key}`
  let p = images.get(id)
  if (!p) {
    const e = index[key]
    p = e
      ? loadPack(style, e[0]).then((buf) => (buf ? decode(new Blob([buf.slice(e[1], e[1] + e[2])], { type: 'image/webp' })) : null))
      : Promise.resolve(null)
    images.set(id, p)
  }
  return p
}

export interface PaintedScene {
  plan: PaintedPlan
  index: ArtIndex
  img: Map<string, CanvasImageSource>
}

/** Загрузить всё для кадра; null - живописи для этой сцены нет (или не загрузилась). */
export async function buildPainted(input: SceneInput): Promise<PaintedScene | null> {
  const style = lookOf(input.region).style
  const index = await loadIndex(style)
  if (!index) return null
  const plan = planPainted(input, index)
  if (!plan) return null
  const img = new Map<string, CanvasImageSource>()
  const got = await Promise.all(plan.layers.filter((l) => !l.weather).map((l) => loadImage(style, index, l.key).then((im) => [l.key, im] as const)))
  for (const [k, im] of got) if (im) img.set(k, im)
  if (!img.has(plan.layers[0].key)) return null
  return { plan, index, img }
}

// ---------------------------------------------------------------- Кадр

/** Нарисовать кадр в холст 960×300 (t - секунды: движется только погода). */
export function composePainted(ctx: CanvasRenderingContext2D, s: PaintedScene, t: number): void {
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, PW, PH)
  for (const l of s.plan.layers) {
    if (l.weather) {
      drawWeather(ctx, l, t)
      continue
    }
    const im = s.img.get(l.key)
    const e = s.index[l.key]
    if (!im || !e) continue
    const [layer, , , w, h, sceneH] = e
    ctx.save()
    if (l.alpha !== undefined) ctx.globalAlpha = l.alpha
    if (l.strip) {
      drawStrip(ctx, s, im, w, h, l.y, l.strip)
    } else if (BACKDROPS.has(layer)) {
      const r = backdropRect(l, w, h)
      ctx.drawImage(im, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
    } else if (layer === 'fx') {
      // Сдвиг и масштаб погоды - от центра кадра.
      const k = l.k ?? 1
      ctx.translate(l.x + (PW * (1 - k)) / 2, l.y + (PH * (1 - k)) / 2)
      ctx.scale(k, k)
      if (l.drift === 'down') {
        const dy = (t * 60) % PH
        ctx.drawImage(im, 0, dy - PH, PW, PH)
        ctx.drawImage(im, 0, dy, PW, PH)
      } else if (l.drift === 'side') {
        const dx = (t * 8) % PW
        ctx.drawImage(im, dx - PW, 0, PW, PH)
        ctx.drawImage(im, dx, 0, PW, PH)
      } else if (l.band) {
        // Только верх картинки (гирлянды): нижняя часть праздничного слоя - чужой пейзаж.
        const bh = Math.round(h * l.band)
        ctx.drawImage(im, 0, 0, w, bh, 0, 0, PW, PH * l.band)
      } else ctx.drawImage(im, 0, 0, PW, PH)
    } else {
      // Объект: холст стоит низом на линии ног; масштаб - из оглавления (sceneH точек кадра на всю высоту холста).
      const k = (l.h ?? sceneH ?? h) / h
      const dw = w * k * (l.wide ?? 1)
      const dh = h * k
      ctx.translate(l.x, l.y)
      if (l.flip) ctx.scale(-1, 1)
      ctx.drawImage(l.hue ? recolored(im, l.hue) : im, -dw / 2, -dh, dw, dh)
    }
    ctx.restore()
  }
  for (const tint of s.plan.tints) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = Math.min(1, tint.alpha * 2)
    ctx.fillStyle = tint.color
    ctx.fillRect(0, 0, PW, PH)
    ctx.restore()
  }
}

// ---------------------------------------------------------------- Портрет героя

export interface PortraitInput {
  region: string
  sex: 'm' | 'f'
  age: number
  cls?: string
  enslaved?: boolean
  /** Иноземец, ещё не вжившийся: портрет в стиле родного края. */
  homeRegion?: string
  integrated?: boolean
}

/** Ключ портрета в оглавлении: сословие × пол × возраст; до 2 лет - младенец на руках (мальчик или девочка). */
export function portraitKey(index: ArtIndex, p: PortraitInput): string | null {
  const stage = ageStage(p.age)
  if (stage === 'baby') return index[`portrait.baby_${p.sex}`] ? `portrait.baby_${p.sex}` : null
  const c = p.enslaved ? 'slave' : p.cls && CLASSES.includes(p.cls) ? p.cls : p.cls === 'royal' ? 'noble' : 'peasant'
  for (const k of [`portrait.${c}_${p.sex}_${stage}`, `portrait.peasant_${p.sex}_${stage}`]) if (index[k]) return k
  return null
}

/** Живописный портрет (256×320, как пиксельный 32×40) или null - тогда остаётся пиксельный. */
export async function loadPortrait(p: PortraitInput): Promise<CanvasImageSource | null> {
  const style = lookOf(p.homeRegion && !p.integrated ? p.homeRegion : p.region).style
  const index = await loadIndex(style)
  const key = index && portraitKey(index, p)
  return key ? loadImage(style, index!, key) : null
}

// ---------------------------------------------------------------- Перекраска одежды

const recolorCache = new WeakMap<object, Map<number, CanvasImageSource>>()
/** Сдвиг оттенка насыщенных цветов одежды; тона кожи (оттенок 335–50° при насыщенности ниже 0.8) и серые - как были.
 *  Кеш по самой картинке (у каждого стиля своя) и сдвигу: считается один раз. */
function recolored(im: CanvasImageSource, hue: number): CanvasImageSource {
  let byHue = recolorCache.get(im)
  if (!byHue) recolorCache.set(im, (byHue = new Map()))
  const hit = byHue.get(hue)
  if (hit) return hit
  let out: CanvasImageSource = im
  try {
    const w = (im as HTMLImageElement).width
    const h = (im as HTMLImageElement).height
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')!
    x.drawImage(im, 0, 0)
    const data = x.getImageData(0, 0, w, h)
    recolorPixels(data.data, hue)
    x.putImageData(data, 0, 0)
    out = c
  } catch {
    // нет холста (тесты) - как есть
  }
  byHue.set(hue, out)
  return out
}

/** Сам сдвиг (чистая функция над RGBA, для тестов). */
export function recolorPixels(d: Uint8ClampedArray, hue: number): void {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue
    const r = d[i] / 255
    const g = d[i + 1] / 255
    const b = d[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const dd = max - min
    if (dd < 0.08) continue
    const s = dd / (1 - Math.abs(2 * l - 1))
    if (s < 0.22 || l < 0.08 || l > 0.92) continue
    let hh = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4
    hh *= 60
    if (hh < 0) hh += 360
    // Кожа (от бледно-розовой до тёмной) и губы: тёплые тона не самой яркой насыщенности.
    if ((hh >= 335 || hh <= 50) && s < 0.8 && l > 0.15) continue
    hh = (hh + hue) % 360
    const C = dd
    const X = C * (1 - Math.abs(((hh / 60) % 2) - 1))
    const m = l - C / 2
    const [r1, g1, b1] = hh < 60 ? [C, X, 0] : hh < 120 ? [X, C, 0] : hh < 180 ? [0, C, X] : hh < 240 ? [0, X, C] : hh < 300 ? [X, 0, C] : [C, 0, X]
    d[i] = Math.round((r1 + m) * 255)
    d[i + 1] = Math.round((g1 + m) * 255)
    d[i + 2] = Math.round((b1 + m) * 255)
  }
}

let stripCanvas: HTMLCanvasElement | null = null
const groundColor = new WeakMap<PaintedScene, string>()

/** Средний цвет земли кадра чуть выше линии ног (что уже нарисовано: даль и ориентир). */
function sampleGround(ctx: CanvasRenderingContext2D, y: number): string {
  try {
    const d = ctx.getImageData(0, Math.max(0, y - 16), PW, 12).data
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i < d.length; i += 4 * 5) {
      if (d[i + 3] < 200) continue
      r += d[i]
      g += d[i + 1]
      b += d[i + 2]
      n++
    }
    if (!n) return '#8a7556'
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
  } catch {
    return '#8a7556'
  }
}

/**
 * Земля переднего плана: от (линия ног - strip.h) до низа кадра. Основа - цвет земли кадра (с затемнением книзу),
 * сверху слабо текстура земли стиля; верхний край мягкий - не «наклейка».
 */
function drawStrip(ctx: CanvasRenderingContext2D, s: PaintedScene, im: CanvasImageSource, w: number, h: number, y: number, strip: { h: number; src: number; texture: number }): void {
  const top = Math.round(y - Math.max(4, strip.h) + 6)
  const sh = PH - top
  let base = groundColor.get(s)
  if (!base) {
    base = sampleGround(ctx, top)
    groundColor.set(s, base)
  }
  stripCanvas ??= document.createElement('canvas')
  const c = stripCanvas
  c.width = PW
  c.height = sh
  const g = c.getContext('2d')!
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.clearRect(0, 0, PW, sh)
  g.fillStyle = base
  g.fillRect(0, 0, PW, sh)
  // Книзу чуть темнее - земля «уходит» к зрителю.
  const shade = g.createLinearGradient(0, 0, 0, sh)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.28)')
  g.fillStyle = shade
  g.fillRect(0, 0, PW, sh)
  if (strip.texture > 0) {
    const srcH = Math.max(1, Math.min(h, (sh * w) / PW))
    const srcY = Math.min(h - srcH, Math.max(0, strip.src * h))
    g.globalAlpha = strip.texture
    g.globalCompositeOperation = 'overlay'
    g.drawImage(im, 0, srcY, w, srcH, 0, 0, PW, sh)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
  }
  const soft = Math.min(sh, Math.max(6, strip.h * 0.7))
  const fade = g.createLinearGradient(0, 0, 0, soft)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(0, 0, PW, soft)
  ctx.drawImage(c, 0, top)
}

/** Где лежит фон: во всю ширину от (x, y), масштаб - от центра кадра по горизонтали. */
function backdropRect(l: Placed, w: number, h: number): { x0: number; x1: number; y0: number; y1: number } {
  const k = l.k ?? 1
  const dh0 = (h * PW) / w
  const dw = PW * k
  const dh = dh0 * k
  const x0 = l.x + (PW - dw) / 2
  const y0 = l.y + (dh0 - dh) / 2
  return { x0, x1: x0 + dw, y0, y1: y0 + dh }
}

/** Прямоугольник слоя в кадре (для перетаскивания в галерее): объект, фон или земля; null - погода. */
export function boxOf(s: PaintedScene, l: Placed): { x0: number; x1: number; y0: number; y1: number } | null {
  const e = s.index[l.key]
  if (!e) return null
  const [layer, , , w, h, sceneH] = e
  if (l.strip) return { x0: 0, x1: PW, y0: Math.round(l.y - Math.max(4, l.strip.h) + 6), y1: PH }
  if (BACKDROPS.has(layer)) return backdropRect(l, w, h)
  if (layer === 'fx') return null
  const k = (l.h ?? sceneH ?? h) / h
  return { x0: l.x - (w * k) / 2, x1: l.x + (w * k) / 2, y0: l.y - h * k, y1: l.y }
}

// ---------------------------------------------------------------- Погода кодом

/** Частицы погоды: одни и те же для всех кадров (псевдослучайно по номеру), чтобы не мигали. */
const PARTICLES = Array.from({ length: 220 }, (_, i) => {
  const h = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  return { x: h(1), y: h(2), a: h(3), b: h(4) }
})

/** Дождь - косые светлые штрихи, снег - хлопья с покачиванием, туман - мягкие белёсые полосы с дрейфом.
 *  alpha из раскладки (fx.<погода>.alpha) - сила; move.fx сдвигает и масштабирует. */
function drawWeather(ctx: CanvasRenderingContext2D, l: Placed, t: number): void {
  const A = l.alpha ?? 0.5
  const k = l.k ?? 1
  ctx.save()
  ctx.translate(l.x + (PW * (1 - k)) / 2, l.y + (PH * (1 - k)) / 2)
  ctx.scale(k, k)
  if (l.weather === 'rain') {
    // Лёгкая серость дождливого дня, потом штрихи.
    ctx.fillStyle = `rgba(80,92,110,${0.3 * A})`
    ctx.fillRect(0, 0, PW, PH)
    ctx.lineCap = 'round'
    for (const p of PARTICLES) {
      const len = 12 + p.a * 14
      const speed = 380 + p.b * 220
      const y = ((p.y * (PH + 40) + t * speed) % (PH + 40)) - 20
      const x = ((p.x * (PW + 60) - (y + 20) * 0.22) % (PW + 60) + PW + 60) % (PW + 60) - 30
      ctx.strokeStyle = `rgba(225,232,245,${(0.5 + p.a * 0.4) * Math.min(1, A * 1.8)})`
      ctx.lineWidth = 1 + p.b * 1.1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - len * 0.22, y + len)
      ctx.stroke()
    }
  } else if (l.weather === 'snow') {
    ctx.fillStyle = `rgba(225,232,245,${0.16 * A})`
    ctx.fillRect(0, 0, PW, PH)
    for (const p of PARTICLES) {
      const r = 0.8 + p.a * 2.2
      const speed = 18 + p.b * 30 + r * 6
      const y = ((p.y * (PH + 20) + t * speed) % (PH + 20)) - 10
      const x = (p.x * PW + Math.sin(t * (0.6 + p.b) + p.a * 6.28) * 8 + PW) % PW
      ctx.fillStyle = `rgba(255,255,255,${(0.55 + p.b * 0.4) * Math.min(1, A * 1.6)})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // Туман: гуще к земле, три полосы плывут вбок с разной скоростью.
    const g = ctx.createLinearGradient(0, 0, 0, PH)
    g.addColorStop(0, `rgba(230,232,235,${0.18 * A})`)
    g.addColorStop(0.55, `rgba(230,232,235,${0.55 * A})`)
    g.addColorStop(1, `rgba(230,232,235,${0.85 * A})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, PW, PH)
    for (let i = 0; i < 3; i++) {
      const cy = PH * (0.45 + i * 0.17)
      const off = (t * (6 + i * 4)) % PW
      for (const dx of [-PW, 0]) {
        for (let j = 0; j < 4; j++) {
          const cx = ((j + 0.5) * PW) / 4 + off + dx + i * 70
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 170)
          rg.addColorStop(0, `rgba(240,242,245,${0.35 * A})`)
          rg.addColorStop(1, 'rgba(240,242,245,0)')
          ctx.fillStyle = rg
          ctx.save()
          ctx.translate(cx, cy)
          ctx.scale(1.8, 0.35)
          ctx.translate(-cx, -cy)
          ctx.fillRect(cx - 170, cy - 170, 340, 340)
          ctx.restore()
        }
      }
    }
  }
  ctx.restore()
}
