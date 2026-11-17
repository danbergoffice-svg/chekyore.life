// Живописная сцена из готовых слоёв (графика 17.11.2026, ~/Downloads/thousands-art-kit): у каждого края своя
// традиция - Япония в гравюре укиё-э, Европа маслом и т. д. Слои - небо, даль, ориентир края, земля, дома 0–4,
// люди (сословие × пол × возраст), животные, предметы, погода - лежат в public/art/<стиль>/<слой>.bin
// (склеенные WebP) с оглавлением index.json. Кадр 960×300, линия ног y=220, как у детальной сцены (hd.ts).
// Пока слои грузятся или если для места нет слоёв (мастерская, школа, баня) - показывается прежняя пиксельная сцена.
// Включается флагом painted_share (src/goal.ts paintedOn) или ?painted=1|0.
import type { SceneInput, Cast, CastMember } from './scene'
import { lookOf, rand } from './scene'
import type { Weather } from './fx'
// Стиль → файл оглавления (с хешем содержимого). Пишет tools/pack.py набора графики; так новая упаковка
// всегда получает новые адреса и офлайн-кэш сайта (sw.js) не смешивает старые файлы с новыми.
import ART_VERSIONS from './art-versions.json'

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
}

export interface PaintedPlan {
  style: string
  layers: Placed[]
  /** Тон поверх всего кадра: ночь, закат, рассвет, пасмурно. */
  tint?: { color: string; alpha: number }
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

function personKey(index: ArtIndex, cls: string | undefined, sex: 'm' | 'f', age: number): string | null {
  const stage = ageStage(age)
  if (stage === 'baby') return index['person.baby_swaddled'] ? 'person.baby_swaddled' : null
  const c = cls && CLASSES.includes(cls) ? cls : cls === 'royal' ? 'noble' : 'peasant'
  for (const k of [`person.${c}_${sex}_${stage}_stand`, `person.peasant_${sex}_${stage}_stand`, `person.peasant_${sex}_adult_stand`]) if (index[k]) return k
  return null
}

/** Первый подходящий ключ из списка, иначе любой этого слоя. */
function pick(index: ArtIndex, layer: string, ...ids: (string | undefined)[]): string | null {
  for (const id of ids) if (id && index[`${layer}.${id}`]) return `${layer}.${id}`
  return Object.keys(index).find((k) => k.startsWith(layer + '.')) ?? null
}

/** Где стоять людям семьи: герой в центре, рядом супруг, дети, родители, остальные. */
function castOrder(c: Cast): CastMember[] {
  const rank: Record<string, number> = { hero: 0, spouse: 1, child: 2, parent: 3, sibling: 4, npc: 5 }
  return [...c.members].sort((a, b) => rank[a.role] - rank[b.role])
}

/** Что и где лежит в кадре. index - оглавление стиля края. Null - для этого места живописи нет. */
export function planPainted(input: SceneInput, index: ArtIndex): PaintedPlan | null {
  const { scene, region, seed, cast, mood } = input
  const place = scene.place ?? 'street'
  const look = lookOf(region)
  const r = rand(`${seed}:painted`)
  const time = scene.time ?? 'day'
  const L: Placed[] = []
  const burned = !!cast?.homeState && cast.homeState !== 'rebuilding'
  // Помещение: дом изнутри по достатку (сгоревший дом - снаружи, на пепелище), мастерская, школа, баня.
  const lvl = Math.max(0, Math.min(4, cast?.home ?? 1))
  const room = INDOOR.has(place) ? place : place === 'home' && !burned && scene.disaster !== 'fire' ? (lvl <= 1 ? 'home_poor' : lvl === 2 ? 'home_mid' : 'home_rich') : null
  const inside = room && index[`interior.${room}`] ? `interior.${room}` : null
  if (room && !inside && INDOOR.has(place)) return null
  if (inside) {
    L.push({ key: inside, x: 0, y: 0 })
  } else {
    const sky = pick(index, 'sky', time, 'day')
    if (!sky) return null
    L.push({ key: sky, x: 0, y: 0 })
    const land = look.land
    const far = pick(index, 'far', land, 'green', 'dry')
    if (far) L.push({ key: far, x: 0, y: PGROUND + 25 - PH })
    const landmark = WITH_LANDMARK.has(place) ? pick(index, 'landmark', region) : null
    if (landmark && landmark.endsWith('.' + region)) L.push({ key: landmark, x: 0, y: PGROUND + 35 - PH })
    const ground = pick(index, 'ground', land, 'green', 'dry')
    if (ground) L.push({ key: ground, x: 0, y: PGROUND })
  }

  // Дома: свой двор - дом семьи; улица и рынок - соседние дома по краям; поле - хижина вдали.
  const objects: Placed[] = []
  if (!inside && (place === 'home' || place === 'yard')) {
    const k = pick(index, 'house', burned || scene.disaster === 'fire' ? `home${lvl}_burned` : `home${lvl}`, `home${lvl}`)
    if (k) objects.push({ key: k, x: 170, y: PGROUND + 4 })
  } else if (place === 'street' || place === 'market' || place === 'road') {
    const a = pick(index, 'house', `home${1 + Math.floor(r() * 3)}`)
    const b = pick(index, 'house', `home${1 + Math.floor(r() * 3)}`)
    if (a) objects.push({ key: a, x: 120, y: PGROUND + 4 })
    if (b) objects.push({ key: b, x: 850, y: PGROUND + 4, flip: true })
  } else if (place === 'field') {
    const k = pick(index, 'house', 'home1')
    if (k) objects.push({ key: k, x: 860, y: PGROUND - 6, h: 70 })
  }

  // Предметы сцены (козы и кони из props - к животным).
  const props = (scene.props ?? []).filter((p) => PROP_KEYS.has(p) && index[`prop.${p}`])
  props.forEach((p, i) => objects.push({ key: `prop.${p}`, x: p === 'fire' ? 560 : 640 + i * 70, y: PGROUND + 6 }))
  const animals = [...(cast?.animals ?? []), ...(scene.props ?? []).filter((p) => p === 'goat' || p === 'horse')]
  ;[...new Set(inside ? [] : animals)].filter((a) => index[`animal.${a}`]).slice(0, 3).forEach((a, i) => objects.push({ key: `animal.${a}`, x: 730 + i * 75, y: PGROUND + 10, flip: i % 2 === 1 }))

  // Люди: семья героя, иначе прохожие по месту.
  const people: Placed[] = []
  const members = cast ? castOrder(cast) : []
  if (members.length) {
    const step = members.length > 6 ? 42 : 56
    const start = 470 - ((members.length - 1) * step) / 2
    members.forEach((m, i) => {
      const k = personKey(index, m.cls, m.sex, m.age)
      if (k) people.push({ key: k, x: start + i * step, y: PGROUND + 8, flip: m.role !== 'hero' && start + i * step > 520 })
    })
  } else {
    const n = Math.max(0, Math.min(6, scene.people ?? 2))
    const byPlace: Record<string, string[]> = { market: ['trader', 'trader', 'peasant', 'craftsman'], palace: ['noble', 'landowner', 'slave'], temple: ['peasant', 'noble', 'craftsman'], field: ['peasant', 'peasant', 'slave'], harbor: ['trader', 'craftsman', 'peasant'] }
    const pool = byPlace[place] ?? ['peasant', 'craftsman', 'trader', 'peasant']
    for (let i = 0; i < n; i++) {
      const sex = r() < 0.5 ? 'm' : 'f'
      const age = r() < 0.15 ? 9 : r() < 0.15 ? 66 : 32
      const k = personKey(index, pool[Math.floor(r() * pool.length)], sex, age)
      const x = 300 + (i + 0.5) * (380 / Math.max(1, n)) + (r() - 0.5) * 20
      if (k) people.push({ key: k, x, y: PGROUND + 8, flip: x > 480 })
    }
  }
  L.push(...objects, ...people)

  // Погода и состояние мира - поверх.
  const fx = new Set<string>()
  const w: Weather | null | undefined = input.weather
  if (w === 'rain' || w === 'storm' || scene.props?.includes('rain')) fx.add('rain')
  if (w === 'snow') fx.add('snow')
  if (w === 'fog') fx.add('fog')
  if (scene.props?.includes('smoke')) fx.add('smoke')
  if (scene.disaster === 'fire') fx.add('fire')
  if (mood === 'war' || mood === 'epidemic' || mood === 'feast') fx.add(mood)
  for (const f of fx) {
    if (!index[`fx.${f}`] || (inside && f !== 'fire' && f !== 'smoke' && f !== 'epidemic' && f !== 'feast')) continue
    L.push({ key: `fx.${f}`, x: 0, y: 0, alpha: f === 'rain' || f === 'snow' ? 0.5 : f === 'fog' ? 0.45 : 0.6, drift: f === 'rain' || f === 'snow' ? 'down' : f === 'fog' ? 'side' : undefined })
  }
  const tint = inside ? (time === 'night' ? { color: '#c98a4a', alpha: 0.22 } : undefined) : time === 'night' ? { color: '#1c2550', alpha: 0.38 } : time === 'sunset' ? { color: '#ff9a5a', alpha: 0.12 } : time === 'dawn' ? { color: '#ffc3b0', alpha: 0.1 } : time === 'overcast' ? { color: '#6a7080', alpha: 0.18 } : undefined
  return { style: look.style, layers: L, tint }
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
  return (await loadPackIndex(style))?.items ?? null
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
  const got = await Promise.all(plan.layers.map((l) => loadImage(style, index, l.key).then((im) => [l.key, im] as const)))
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
    const im = s.img.get(l.key)
    const e = s.index[l.key]
    if (!im || !e) continue
    const [layer, , , w, h, sceneH] = e
    ctx.save()
    if (l.alpha !== undefined) ctx.globalAlpha = l.alpha
    if (BACKDROPS.has(layer)) {
      ctx.drawImage(im, l.x, l.y, PW, (h * PW) / w)
    } else if (layer === 'fx') {
      if (l.drift === 'down') {
        const dy = (t * 60) % PH
        ctx.drawImage(im, 0, dy - PH, PW, PH)
        ctx.drawImage(im, 0, dy, PW, PH)
      } else if (l.drift === 'side') {
        const dx = (t * 8) % PW
        ctx.drawImage(im, dx - PW, 0, PW, PH)
        ctx.drawImage(im, dx, 0, PW, PH)
      } else ctx.drawImage(im, 0, 0, PW, PH)
    } else {
      // Объект: холст стоит низом на линии ног; масштаб - из оглавления (sceneH точек кадра на всю высоту холста).
      const k = (l.h ?? sceneH ?? h) / h
      const dw = w * k
      const dh = h * k
      ctx.translate(l.x, l.y)
      if (l.flip) ctx.scale(-1, 1)
      ctx.drawImage(im, -dw / 2, -dh, dw, dh)
    }
    ctx.restore()
  }
  if (s.plan.tint) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = s.plan.tint.alpha * 2
    ctx.fillStyle = s.plan.tint.color
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
