// Карточка для публикации рисуется на холсте прямо в браузере, ничего не отправляется на сервер.
// Плакат (выбор владельца 01.11): родные места героя во весь фон, сам герой крупно на переднем плане, сверху на затенении -
// имя и годы; внизу, как в профиле соцсети, - главное дело, три счётчика, яркий факт, метки-хэштеги и призыв
// «А сколько проживёшь ты?». Форматы: сторис 1080×1920, квадрат 1080×1080, широкая 1200×630.

import { drawScene, H, W } from '../pixel/scene'
import { portraitHd } from '../pixel/portraitHd'
import type { AvatarInput } from '../pixel/avatar'
import type { SceneDef } from '../engine/types'

export type CardFormat = 'square' | 'story' | 'wide'

export const CARD_SIZES: Record<CardFormat, [number, number]> = {
  square: [1080, 1080],
  story: [1080, 1920],
  wide: [1200, 630],
}

export interface CardData {
  /** «ТЫСЯЧИ ЖИЗНЕЙ» - подпись над сценой. */
  brand: string
  name: string
  /** «74 года · 1328–1415 · Лондон, Средневековая Европа». */
  meta: string
  /** Главное дело жизни: профессия, а если её не было - сословие. */
  title: string
  /** «крестьянка → лекарь», если положение изменилось. */
  path?: string
  /** Самый яркий факт и, если есть место, второй. */
  hook: string
  hook2?: string
  /** Афоризмы от самого подходящего (уже в кавычках языка): на карточку идёт первый, что помещается. */
  quotes: { text: string; author: string }[]
  portraits: { input: AvatarInput; label: string }[]
  /** Строка игрока «каково было прожить эту жизнь». */
  playerLine: string
  /** Три крупные цифры: дети и внуки, сколько ровесников прожили меньше, богатство. */
  stats?: { value: string; label: string }[]
  cta: string
  /** Призыв под карточкой: «А сколько проживёшь ты?». */
  ask: string
  /** «74 года», «1328–1415», «Лондон, Средневековая Европа» - по отдельности для плаката. */
  ageLine: string
  years: string
  place: string
  /** Метки-хэштеги: игра, край, страна. */
  tags: string[]
  site: string
  region: string
  seed: string
  scene: SceneDef
}

// Тёмный постер - одинаково ярко смотрится в ленте при любой теме игры.
// Синяя ночь и бумага - как в игре (src/skin.css).
const C = { night: '#16213a', deep: '#0f1729', sheet: '#f3ead7', ink: '#130904', muted: '#bfa987', terra: '#df6c4f', mustard: '#ecd06f', sky: '#9fc1ff', link: '#8a3a1e' }
const SERIF = "'Alegreya Variable', 'Alegreya', Georgia, serif"
const DISPLAY = "'Thousands Letopis', 'Alegreya Variable', serif"

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Шрифт подбирается так, чтобы строка влезла: от size вниз до min. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, min: number, maxWidth: number): number {
  let px = size
  ctx.font = font(px)
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 2
    ctx.font = font(px)
  }
  return px
}

/** Текст абзацем не длиннее maxLines строк; не влез - шрифт меньше (до min), потом многоточие. */
function block(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, min: number, maxWidth: number, maxLines: number): { lines: string[]; px: number } {
  let px = size
  for (;;) {
    ctx.font = font(px)
    const lines = wrap(ctx, text, maxWidth)
    if (lines.length <= maxLines) return { lines, px }
    if (px - 2 < min) {
      const cut = lines.slice(0, maxLines)
      cut[maxLines - 1] = `${cut[maxLines - 1].replace(/[\s,.;:\u2013-]+$/, '')}…`
      return { lines: cut, px }
    }
    px -= 2
  }
}

function sceneCanvas(d: CardData): HTMLCanvasElement {
  const scene = document.createElement('canvas')
  scene.width = W
  scene.height = H
  drawScene(scene.getContext('2d')!, { scene: d.scene, region: d.region, seed: d.seed })
  return scene
}

/** Сцена заполняет полосу (видна нижняя часть - люди и земля), снизу растворяется в фоне. */
/** Сцена края на прямоугольник (обрезка по центру, пиксели чёткие). */
function drawSceneCover(ctx: CanvasRenderingContext2D, d: CardData, x: number, y: number, w: number, h: number): void {
  const scene = sceneCanvas(d)
  const k = Math.max(w / W, h / H)
  const sw = w / k
  const sh = h / k
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scene, (W - sw) / 2, H - sh, sw, sh, x, y, w, h)
  ctx.restore()
}

/** Герой крупно: портрет последнего года жизни, снизу по центру области. */
function drawHero(ctx: CanvasRenderingContext2D, d: CardData, cx: number, bottom: number, h: number): void {
  const last = d.portraits[d.portraits.length - 1]
  if (!last) return
  const img = portraitHd(last.input)
  const w = (img.width / img.height) * h
  ctx.save()
  ctx.imageSmoothingEnabled = false
  // Мягкая тень под фигурой.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(cx, bottom - h * 0.01, w * 0.42, h * 0.035, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.drawImage(img, cx - w / 2, bottom - h, w, h)
  ctx.restore()
}

/** Затенение сверху: под именем и годами текст читается на любом небе. */
function topShade(ctx: CanvasRenderingContext2D, x: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(8,12,26,0.88)')
  g.addColorStop(0.6, 'rgba(8,12,26,0.55)')
  g.addColorStop(1, 'rgba(8,12,26,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, 0, w, h)
}

/** Рваный край бумаги между сценой и низом карточки. */
function tornEdge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, step: number): void {
  ctx.fillStyle = C.sheet
  ctx.beginPath()
  ctx.moveTo(x, y + step * 0.6)
  for (let i = 0, xx = x; xx <= x + w + step; i++, xx += step) ctx.lineTo(Math.min(xx, x + w), y + (i % 2 ? 0 : step * 0.6))
  ctx.lineTo(x + w, y + step * 1.2)
  ctx.lineTo(x, y + step * 1.2)
  ctx.fill()
  ctx.fillStyle = C.night
  ctx.fillRect(x, y + step * 1.2 - 1, w, step)
}

/** Бумажная полоса с неровным краем (кнопка-призыв). */
function strip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + w * 0.006, y + h * 0.07)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w * 0.988, y + h * 0.93)
  ctx.lineTo(x, y + h)
  ctx.closePath()
  ctx.fill()
}

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: (px: number) => string, size: number, color: string, maxW: number, align: CanvasTextAlign = 'center'): void {
  fit(ctx, text, font, size, Math.round(size * 0.55), maxW)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(text, x, y)
}

/** Имя и «возраст · годы · край» поверх затенения. */
function header(ctx: CanvasRenderingContext2D, d: CardData, cx: number, y: number, maxW: number, namePx: number, metaPx: number, align: CanvasTextAlign = 'center'): void {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.7)'
  ctx.shadowBlur = namePx * 0.15
  ctx.shadowOffsetY = 3
  line(ctx, d.name, cx, y, (px) => `600 ${px}px ${DISPLAY}`, namePx, C.sheet, maxW, align)
  line(ctx, `${d.ageLine} · ${d.years}`, cx, y + metaPx * 1.6, (px) => `600 ${px}px ${SERIF}`, metaPx, C.mustard, maxW, align)
  line(ctx, d.place, cx, y + metaPx * 2.9, (px) => `500 ${px}px ${SERIF}`, Math.round(metaPx * 0.9), C.sheet, maxW, align)
  ctx.restore()
}

/** Три счётчика, как в профиле соцсети: крупное число и подпись под ним. */
function counters(ctx: CanvasRenderingContext2D, d: CardData, x: number, y: number, w: number, numPx: number, labelPx: number): void {
  const stats = (d.stats ?? []).slice(0, 3)
  if (!stats.length) return
  const col = w / stats.length
  stats.forEach((s, i) => {
    const cx = x + col * (i + 0.5)
    line(ctx, s.value, cx, y, (px) => `600 ${px}px ${DISPLAY}`, numPx, C.sheet, col - 16)
    ctx.font = `500 ${labelPx}px ${SERIF}`
    const ls = wrap(ctx, s.label, col - 24).slice(0, 2)
    ctx.fillStyle = C.muted
    ctx.textAlign = 'center'
    ls.forEach((l, j) => ctx.fillText(l, cx, y + labelPx * 1.5 + j * labelPx * 1.15))
    if (i) {
      ctx.fillStyle = 'rgba(243,234,215,0.18)'
      ctx.fillRect(x + col * i, y - numPx * 0.8, 2, numPx * 0.8 + labelPx * 2.6)
    }
  })
}

/** Яркий факт абзацем (и второй, если влезает), курсивом. */
function facts(ctx: CanvasRenderingContext2D, d: CardData, cx: number, y: number, maxW: number, px: number, maxLines: number, align: CanvasTextAlign = 'center'): number {
  const text = d.hook2 && maxLines > 2 ? `${d.hook}. ${d.hook2}` : d.hook
  const b = block(ctx, text, (p) => `italic 400 ${p}px ${SERIF}`, px, Math.round(px * 0.75), maxW, maxLines)
  ctx.font = `italic 400 ${b.px}px ${SERIF}`
  ctx.fillStyle = C.sheet
  ctx.textAlign = align
  b.lines.forEach((l, i) => ctx.fillText(l, cx, y + i * b.px * 1.3))
  return y + b.lines.length * b.px * 1.3
}

function hashtags(ctx: CanvasRenderingContext2D, d: CardData, cx: number, y: number, maxW: number, px: number, align: CanvasTextAlign = 'center'): void {
  line(ctx, d.tags.join('  '), cx, y, (p) => `600 ${p}px ${SERIF}`, px, C.sky, maxW, align)
}

/** Призыв: бумажная полоса «А сколько проживёшь ты?» и под ним игра и сайт. */
function ask(ctx: CanvasRenderingContext2D, d: CardData, x: number, y: number, w: number, h: number): void {
  strip(ctx, x, y, w, h, C.sheet)
  line(ctx, d.ask, x + w / 2, y + h * 0.52, (px) => `600 ${px}px ${DISPLAY}`, Math.round(h * 0.4), C.ink, w - 40)
  line(ctx, `${d.brand} · ${d.site}`, x + w / 2, y + h * 0.83, (px) => `600 ${px}px ${SERIF}`, Math.round(h * 0.2), C.link, w - 40)
}

export function drawCard(canvas: HTMLCanvasElement, format: CardFormat, d: CardData): void {
  const [cw, ch] = CARD_SIZES[format]
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = C.night
  ctx.fillRect(0, 0, cw, ch)
  ctx.textBaseline = 'alphabetic'
  if (format === 'wide') {
    // Слева - сцена и герой, справа - сведения и призыв.
    const sw = 560
    drawSceneCover(ctx, d, 0, 0, sw, ch)
    drawHero(ctx, d, sw / 2, ch - 10, ch * 0.78)
    const g = ctx.createLinearGradient(sw - 120, 0, sw, 0)
    g.addColorStop(0, 'rgba(22,33,58,0)')
    g.addColorStop(1, C.night)
    ctx.fillStyle = g
    ctx.fillRect(sw - 120, 0, 120, ch)
    const x = sw + 30
    const w = cw - x - 40
    header(ctx, d, x, 84, w, 64, 26, 'left')
    line(ctx, d.title, x, 214, (px) => `600 ${px}px ${DISPLAY}`, 40, C.mustard, w, 'left')
    counters(ctx, d, x - 10, 290, w + 20, 40, 18)
    facts(ctx, d, x, 392, w, 24, 2, 'left')
    hashtags(ctx, d, x, 468, w, 20, 'left')
    ask(ctx, d, x - 10, 498, w + 20, 104)
    return
  }
  const story = format === 'story'
  const sceneH = story ? 1180 : 620
  drawSceneCover(ctx, d, 0, 0, cw, sceneH)
  const fade = ctx.createLinearGradient(0, sceneH * 0.55, 0, sceneH)
  fade.addColorStop(0, 'rgba(22,33,58,0)')
  fade.addColorStop(1, 'rgba(22,33,58,0.85)')
  ctx.fillStyle = fade
  ctx.fillRect(0, sceneH * 0.55, cw, sceneH * 0.45)
  topShade(ctx, 0, cw, story ? 420 : 250)
  drawHero(ctx, d, cw / 2, sceneH + (story ? 10 : 6), story ? 860 : 430)
  header(ctx, d, cw / 2, story ? 150 : 92, cw - 120, story ? 112 : 70, story ? 38 : 26)
  tornEdge(ctx, 0, sceneH - (story ? 18 : 12), cw, story ? 30 : 22)
  // Низ - как профиль в соцсети: дело жизни, счётчики, факт, метки, призыв.
  const pad = story ? 70 : 60
  const w = cw - pad * 2
  if (story) {
    line(ctx, d.title, cw / 2, 1300, (px) => `600 ${px}px ${DISPLAY}`, 70, C.mustard, w)
    counters(ctx, d, pad, 1410, w, 66, 26)
    const y = facts(ctx, d, cw / 2, 1545, w, 38, 3)
    // Свободное место до меток - афоризм под эту жизнь (первый, что влезает).
    const room = 1680 - y
    for (const q of d.quotes) {
      ctx.font = `italic 400 30px ${SERIF}`
      const ls = wrap(ctx, q.text, w - 40)
      if ((ls.length + 1) * 40 > room) continue
      ctx.fillStyle = C.muted
      ctx.textAlign = 'center'
      ls.forEach((l, i) => ctx.fillText(l, cw / 2, y + 30 + i * 40))
      ctx.font = `600 26px ${SERIF}`
      ctx.fillStyle = C.mustard
      ctx.fillText(`- ${q.author}`, cw / 2, y + 30 + ls.length * 40)
      break
    }
    hashtags(ctx, d, cw / 2, 1712, w, 30)
    ask(ctx, d, pad - 10, 1740, w + 20, 140)
  } else {
    line(ctx, d.title, cw / 2, 700, (px) => `600 ${px}px ${DISPLAY}`, 48, C.mustard, w)
    counters(ctx, d, pad, 780, w, 46, 19)
    facts(ctx, d, cw / 2, 880, w, 28, 1)
    hashtags(ctx, d, cw / 2, 925, w, 22)
    ask(ctx, d, pad - 10, 952, w + 20, 108)
  }
}

// Простой фильтр недопустимых слов для строки игрока: заменяет их звёздочками.
const BAD = [/(?<![а-яё])х[уy][йеёяи]\S*/giu, /(?<![а-яё])п[иi]зд\S*/giu, /(?<![а-яё])[её]б[аы]?[нт]\S*/giu, /(?<![а-яё])бля\S*/giu, /(?<![а-яё])муда[кч]\S*/giu, /(?<![а-яё])пид[оа]р\S*/giu, /\bfuck\S*/gi, /\bshit\S*/gi, /\bcunt\S*/gi, /\bbitch\S*/gi, /\bfag+ot\S*/gi, /\bnigg\S*/gi]

export function cleanLine(s: string): { text: string; filtered: boolean } {
  let out = s.slice(0, 140)
  let filtered = false
  for (const re of BAD) {
    out = out.replace(re, (m) => {
      filtered = true
      return '*'.repeat(m.length)
    })
  }
  return { text: out, filtered }
}
