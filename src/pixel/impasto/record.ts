// Эскиз для масла мастихином: холст, который вместе с картинкой ведёт карту фигур. Каждая непрозрачная заливка
// или линия - своя фигура (свой цвет на карте), и мазки движка не переходят из фигуры в фигуру - силуэты чёткие.
// Полупрозрачное (тени, отсветы, тон времени суток) рисуется только на картинке: это цвет, а не форма.
// Код, который рисует сцену (hd.ts), ничего об этом не знает - он получает обычный 2D-контекст.
import { DAB, Impasto, KNIFE } from './engine'
import { paintRef } from './plate'

type Ctx = CanvasRenderingContext2D

export interface ShapeProps {
  /** Направление мазков в градусах, 'edge' - вдоль краёв. */
  dir?: number | 'edge'
  /** Наибольший радиус мазка (точки эскиза). */
  maxR?: number
  type?: number
  /** Точнее (меньше 1) или грубее. */
  detail?: number
  group?: number
  /** Высота краски (рельеф), разброс угла (радианы), длина и ширина мазка - множители. */
  hgt?: number
  aj?: number
  len?: number
  wid?: number
}

export interface Recorder {
  ctx: Ctx
  canvas: HTMLCanvasElement
  /** Свойства следующих фигур (до следующего вызова). */
  hint: (p: ShapeProps) => void
  ref: { pw: number; ph: number; scale: number; ctx: Ctx; idc: Ctx; props: (Record<string, unknown> | null)[] }
}

const PATH = ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath', 'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform', 'clip']
const DRAW = ['fill', 'stroke', 'fillRect', 'strokeRect']
const NOT_MIRRORED = ['fillStyle', 'strokeStyle', 'filter', 'globalCompositeOperation', 'globalAlpha', 'shadowColor', 'shadowBlur']

/** Почти непрозрачный цвет (rgba с альфой меньше 0,9 - это свет и тень, не форма). */
function solid(style: unknown): boolean {
  if (typeof style !== 'string') return true
  const m = /^rgba\(([^)]+)\)$/.exec(style.replace(/\s/g, ''))
  return !m || Number(m[1].split(',')[3]) >= 0.9
}

export function recorder(w: number, h: number): Recorder {
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return [c, c.getContext('2d', { willReadFrequently: true })!] as const
  }
  const [canvas, real] = mk()
  const [, idc] = mk()
  idc.imageSmoothingEnabled = false
  const props: (Record<string, unknown> | null)[] = [null]
  let next: ShapeProps = {}
  const newId = () => {
    props.push({ dir: 'edge', maxR: 1e9, type: KNIFE, hgt: 1, jit: 0.06, len: 1, wid: 1, ...next })
    const k = props.length - 1
    return `rgb(${k & 255},${(k >> 8) & 255},${(k >> 16) & 255})`
  }
  const ctx = new Proxy(real, {
    get(target, prop) {
      const v = (target as unknown as Record<string | symbol, unknown>)[prop]
      if (typeof v !== 'function') return v
      const name = String(prop)
      if (PATH.includes(name)) {
        return (...a: unknown[]) => {
          ;(idc as unknown as Record<string, (...x: unknown[]) => unknown>)[name](...a)
          return (v as (...x: unknown[]) => unknown).apply(target, a)
        }
      }
      if (DRAW.includes(name)) {
        return (...a: unknown[]) => {
          const r = (v as (...x: unknown[]) => unknown).apply(target, a)
          const isStroke = name.startsWith('stroke')
          if (target.globalCompositeOperation === 'source-over' && target.globalAlpha >= 0.9 && solid(isStroke ? target.strokeStyle : target.fillStyle)) {
            const id = newId()
            if (isStroke) idc.strokeStyle = id
            else idc.fillStyle = id
            ;(idc as unknown as Record<string, (...x: unknown[]) => unknown>)[name](...a)
          }
          return r
        }
      }
      return (v as (...x: unknown[]) => unknown).bind(target)
    },
    set(target, prop, value) {
      ;(target as unknown as Record<string | symbol, unknown>)[prop] = value
      if (!NOT_MIRRORED.includes(String(prop))) (idc as unknown as Record<string | symbol, unknown>)[prop] = value
      return true
    },
  })
  return { ctx, canvas, hint: (p) => (next = p), ref: { pw: w, ph: h, scale: 1, ctx: real, idc, props } }
}

/** Что нужно от движка (engine.ts без типов). */
interface Engine {
  W: number
  H: number
  gl: WebGL2RenderingContext
  texture: (c: HTMLCanvasElement, blur?: number) => WebGLTexture
  begin: (ground?: number[]) => void
  under: (t: WebGLTexture, w: number, h: number, o?: object) => void
  drawNow: (data: Float32Array, o?: object) => void
  finish: (p?: object) => void
}

let engine: Engine | null | undefined
let glCanvas: HTMLCanvasElement | null = null

/** Движок один на всю игру (WebGL-контекстов у браузера мало); null - WebGL2 нет, рисуем без масла. */
function getEngine(w: number, h: number): Engine | null {
  if (engine !== undefined) return engine && engine.W === w && engine.H === h ? engine : null
  try {
    glCanvas = document.createElement('canvas')
    engine = new Impasto(glCanvas, { W: w, H: h, ss: 2 }) as unknown as Engine
  } catch {
    engine = null
  }
  return engine
}

/** Переписать картинку рекордера маслом мастихином (в тот же холст). false - не получилось, осталась векторная. */
export function paintImpasto(rec: Recorder, o: { seed?: number; radii?: number[]; light?: number[]; norm?: number; blur?: number } = {}): boolean {
  const { pw, ph } = rec.ref
  const E = getEngine(pw, ph)
  if (!E || !glCanvas) return false
  const strokes = paintRef(rec.ref, { R: o.radii ?? [18, 9, 4.5, 2.4, 1.4], T: 14, seed: o.seed ?? 1 })
  const under = E.texture(rec.canvas, o.blur ?? 1.2)
  E.begin([0, 0, 0])
  E.under(under, pw, ph, { grey: 0 })
  E.drawNow(strokes.data(), { grey: 0, run: 0.6 })
  E.finish({ vig: 0, weave: 0.06, ...(o.light ? { light: o.light } : {}), ...(o.norm !== undefined ? { norm: o.norm } : {}) })
  E.gl.deleteTexture(under)
  const x = rec.ref.ctx
  x.save()
  x.setTransform(1, 0, 0, 1, 0, 0)
  x.globalCompositeOperation = 'source-over'
  x.globalAlpha = 1
  x.clearRect(0, 0, pw, ph)
  x.drawImage(glCanvas, 0, 0)
  x.restore()
  return true
}

export { DAB, KNIFE }
