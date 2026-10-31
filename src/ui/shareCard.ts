// Карточка для публикации рисуется на холсте прямо в браузере, ничего не отправляется на сервер.
// Постер: сцена края, имя, главное дело жизни, самый яркий факт, афоризм известного человека с подписью,
// лента портретов героя по возрастам и призыв «Кем будешь ты?».

import { drawScene, H, W } from '../pixel/scene'
import { AH, AW, drawAvatar } from '../pixel/avatar'
import type { AvatarInput } from '../pixel/avatar'
import type { SceneDef } from '../engine/types'

export type CardFormat = 'square' | 'story' | 'wide'

export const CARD_SIZES: Record<CardFormat, [number, number]> = {
  square: [1080, 1080],
  story: [1080, 1920],
  wide: [1200, 630],
}

export interface CardData {
  /** «ТЫСЯЧИ ЖИЗНЕЙ» – подпись над сценой. */
  brand: string
  name: string
  /** «74 года · 1328–1415 · Лондон, Средневековая Европа». */
  meta: string
  /** Главное дело жизни: профессия, а если её не было – сословие. */
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
  site: string
  region: string
  seed: string
  scene: SceneDef
}

// Тёмный постер – одинаково ярко смотрится в ленте при любой теме игры.
const C = { paper: '#1b1511', paper2: '#2a211a', ink: '#f3e8d4', muted: '#ab9a82', accent: '#e08a5c', gold: '#d9ab5f', line: '#4a3d31' }
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

/** Текст абзацем не длиннее maxLines строк; не влез – шрифт меньше (до min), потом многоточие. */
function block(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, min: number, maxWidth: number, maxLines: number): { lines: string[]; px: number } {
  let px = size
  for (;;) {
    ctx.font = font(px)
    const lines = wrap(ctx, text, maxWidth)
    if (lines.length <= maxLines) return { lines, px }
    if (px - 2 < min) {
      const cut = lines.slice(0, maxLines)
      cut[maxLines - 1] = `${cut[maxLines - 1].replace(/[\s,.;:–-]+$/, '')}…`
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

/** Сцена заполняет полосу (видна нижняя часть – люди и земля), снизу растворяется в фоне. */
function drawSceneBand(ctx: CanvasRenderingContext2D, d: CardData, x: number, y: number, w: number, h: number): void {
  const scene = sceneCanvas(d)
  const k = Math.max(w / W, h / H)
  const sw = Math.round(W * k)
  const sh = Math.round(H * k)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scene, x + Math.round((w - sw) / 2), y + h - sh, sw, sh)
  const g = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h)
  g.addColorStop(0, 'rgba(27,21,17,0)')
  g.addColorStop(1, C.paper)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'center' | 'left' = 'center'): void {
  const chars = [...text]
  const width = chars.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1)
  let cx = align === 'center' ? x - width / 2 : x
  for (const ch of chars) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
}

/** Лента портретов по возрастам: от детства до последнего года, под каждым – возраст. */
function drawPortraits(ctx: CanvasRenderingContext2D, d: CardData, x: number, y: number, w: number, scale: number, labelPx: number): number {
  const list = d.portraits
  if (!list.length) return 0
  const pw = AW * scale
  const ph = AH * scale
  const gap = list.length > 1 ? Math.min(scale * 10, (w - pw * list.length) / (list.length - 1)) : 0
  const total = pw * list.length + gap * (list.length - 1)
  let px = x + (w - total) / 2
  // Нить жизни за портретами.
  ctx.strokeStyle = C.line
  ctx.lineWidth = Math.max(2, scale / 2)
  ctx.beginPath()
  ctx.moveTo(px + pw / 2, y + ph / 2)
  ctx.lineTo(px + total - pw / 2, y + ph / 2)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = `400 ${labelPx}px ${SERIF}`
  list.forEach((p, i) => {
    const last = i === list.length - 1
    ctx.fillStyle = C.paper2
    ctx.fillRect(px - scale, y - scale, pw + scale * 2, ph + scale * 2)
    ctx.strokeStyle = last ? C.gold : C.line
    ctx.lineWidth = Math.max(2, scale / 2)
    ctx.strokeRect(px - scale, y - scale, pw + scale * 2, ph + scale * 2)
    const a = document.createElement('canvas')
    a.width = AW
    a.height = AH
    drawAvatar(a.getContext('2d')!, p.input)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(a, px, y, pw, ph)
    ctx.fillStyle = last ? C.gold : C.muted
    ctx.fillText(p.label, px + pw / 2, y + ph + scale + labelPx * 1.2)
    px += pw + gap
  })
  ctx.textAlign = 'left'
  return ph + scale + labelPx * 1.4
}

/** Мини-барабан «? ? ?» для призыва. */
function drawReels(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): number {
  const w = h * 0.62
  for (let i = 0; i < 3; i++) {
    const rx = x + i * (w + h * 0.12)
    ctx.fillStyle = '#f6efe2'
    ctx.fillRect(rx, y, w, h)
    ctx.strokeStyle = C.gold
    ctx.lineWidth = Math.max(2, h / 24)
    ctx.strokeRect(rx, y, w, h)
    ctx.fillStyle = '#3a2a1e'
    ctx.font = `700 ${Math.round(h * 0.55)}px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.fillText('?', rx + w / 2, y + h * 0.7)
  }
  ctx.textAlign = 'left'
  return 3 * w + 2 * h * 0.12
}

interface Layout {
  pad: number
  sceneH: number
  name: number
  meta: number
  title: number
  hook: number
  hookLines: number
  hook2: number
  quote: number
  quoteLines: number
  author: number
  player: number
  scale: number
  label: number
  cta: number
  site: number
}

const LAYOUT: Record<'square' | 'story', Layout> = {
  story: { pad: 76, sceneH: 420, name: 124, meta: 36, title: 66, hook: 60, hookLines: 3, hook2: 38, quote: 56, quoteLines: 5, author: 36, player: 32, scale: 4.5, label: 28, cta: 52, site: 32 },
  square: { pad: 56, sceneH: 230, name: 86, meta: 28, title: 44, hook: 42, hookLines: 2, hook2: 0, quote: 36, quoteLines: 3, author: 26, player: 0, scale: 2.5, label: 22, cta: 38, site: 26 },
}

export function drawCard(canvas: HTMLCanvasElement, format: CardFormat, d: CardData): void {
  const [cw, ch] = CARD_SIZES[format]
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, cw, ch)
  ctx.textBaseline = 'alphabetic'
  if (format === 'wide') return drawWide(ctx, cw, ch, d)

  const L = LAYOUT[format]
  const textW = cw - L.pad * 2
  drawSceneBand(ctx, d, 0, 0, cw, L.sceneH)
  // Подпись игры над сценой.
  ctx.font = `600 ${Math.round(L.meta * 0.8)}px ${DISPLAY}`
  ctx.fillStyle = 'rgba(243,232,212,0.92)'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 8
  spaced(ctx, d.brand.toLocaleUpperCase(document.documentElement.lang || undefined), cw / 2, Math.round(L.pad * 0.75), Math.round(L.meta * 0.25))
  ctx.shadowBlur = 0

  // Низ: призыв, над ним – лента портретов.
  const footerH = Math.round(L.cta * 1.9)
  const footerY = ch - L.pad - footerH
  const reelsW = drawReels(ctx, L.pad, footerY + footerH * 0.08, Math.round(footerH * 0.84))
  ctx.font = `600 ${L.cta}px ${DISPLAY}`
  ctx.fillStyle = C.ink
  ctx.fillText(d.cta, L.pad + reelsW + L.pad * 0.4, footerY + L.cta * 0.95)
  ctx.font = `600 ${L.site}px ${SERIF}`
  ctx.fillStyle = C.gold
  ctx.fillText(d.site, L.pad + reelsW + L.pad * 0.4, footerY + L.cta * 0.95 + L.site * 1.35)
  const stripH = AH * L.scale + L.scale + L.label * 1.4
  const stripY = footerY - L.pad * 0.7 - stripH
  drawPortraits(ctx, d, L.pad, stripY, textW, L.scale, L.label)

  // Секции между сценой и лентой портретов: сначала меряем, потом делим свободное место поровну.
  const top = L.sceneH - Math.round(L.name * 0.25)
  const limit = stripY - Math.round(L.pad * 0.4)
  type Section = { h: number; draw: (y: number) => void; optional?: boolean }
  const sections: Section[] = []
  const at = (text: string, font: string, color: string, y: number) => {
    ctx.font = font
    ctx.fillStyle = color
    ctx.fillText(text, L.pad, y)
  }
  // Имя и строка «возраст · годы · край».
  const namePx = fit(ctx, d.name, (px) => `600 ${px}px ${DISPLAY}`, L.name, Math.round(L.name * 0.55), textW)
  const metaPx = fit(ctx, d.meta, (px) => `400 ${px}px ${SERIF}`, L.meta, Math.round(L.meta * 0.7), textW)
  sections.push({
    h: namePx * 0.95 + metaPx * 1.5,
    draw: (y) => {
      at(d.name, `600 ${namePx}px ${DISPLAY}`, C.ink, y + namePx * 0.85)
      at(d.meta, `400 ${metaPx}px ${SERIF}`, C.muted, y + namePx * 0.95 + metaPx * 1.25)
    },
  })
  // Главное дело жизни и путь по сословию.
  const titlePx = fit(ctx, d.title, (px) => `600 ${px}px ${DISPLAY}`, L.title, Math.round(L.title * 0.6), textW)
  sections.push({
    h: titlePx * 1.05 + (d.path ? L.meta * 1.4 : 0),
    draw: (y) => {
      at(d.title, `600 ${titlePx}px ${DISPLAY}`, C.accent, y + titlePx * 0.9)
      if (d.path) at(d.path, `400 ${L.meta}px ${SERIF}`, C.muted, y + titlePx * 1.05 + L.meta * 1.15)
    },
  })
  // Самый яркий факт – крупно, с золотой чертой слева; второй – помельче.
  const hook = block(ctx, d.hook, (px) => `700 ${px}px ${SERIF}`, L.hook, Math.round(L.hook * 0.75), textW - L.pad * 0.2, L.hookLines)
  const h2 = d.hook2 && L.hook2 ? block(ctx, d.hook2, (px) => `400 ${px}px ${SERIF}`, L.hook2, L.hook2, textW, 1) : null
  const hookH = hook.lines.length * hook.px * 1.18
  sections.push({
    h: hookH + (h2 ? L.hook2 * 1.5 : 0),
    draw: (y) => {
      hook.lines.forEach((l, i) => at(l, `700 ${hook.px}px ${SERIF}`, C.ink, y + hook.px * (0.92 + i * 1.18)))
      ctx.fillStyle = C.gold
      ctx.fillRect(L.pad - Math.round(L.pad * 0.35), y + hook.px * 0.08, Math.max(4, L.scale * 1.5), hookH - hook.px * 0.12)
      if (h2) at(h2.lines[0], `400 ${h2.px}px ${SERIF}`, C.muted, y + hookH + L.hook2 * 1.15)
    },
  })
  // Три крупные цифры (только в «Истории»).
  if (format === 'story' && d.stats?.length) {
    const n = d.stats.length
    const colW = textW / n
    const valPx = Math.round(L.title * 1.05)
    sections.push({
      optional: true,
      h: valPx + L.meta * 2.4,
      draw: (y) => {
        ctx.strokeStyle = C.line
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(L.pad, y)
        ctx.lineTo(L.pad + textW, y)
        ctx.moveTo(L.pad, y + valPx + L.meta * 2.4)
        ctx.lineTo(L.pad + textW, y + valPx + L.meta * 2.4)
        ctx.stroke()
        ctx.textAlign = 'center'
        d.stats!.forEach((st, i) => {
          const cx = L.pad + colW * (i + 0.5)
          ctx.font = `600 ${fit(ctx, st.value, (px) => `600 ${px}px ${DISPLAY}`, valPx, Math.round(valPx * 0.6), colW - 20)}px ${DISPLAY}`
          ctx.fillStyle = i === 1 ? C.accent : C.ink
          ctx.fillText(st.value, cx, y + valPx * 1.05)
          ctx.font = `400 ${fit(ctx, st.label, (px) => `400 ${px}px ${SERIF}`, Math.round(L.meta * 0.8), 18, colW - 16)}px ${SERIF}`
          ctx.fillStyle = C.muted
          ctx.fillText(st.label, cx, y + valPx + L.meta * 1.6)
          if (i) {
            ctx.strokeStyle = C.line
            ctx.beginPath()
            ctx.moveTo(L.pad + colW * i, y + 14)
            ctx.lineTo(L.pad + colW * i, y + valPx + L.meta * 2.4 - 14)
            ctx.stroke()
          }
        })
        ctx.textAlign = 'left'
      },
    })
  }
  // Афоризм: первый, что помещается; подпись автора золотом; строка игрока – помельче.
  const quoteSection = (maxLines: number): Section | null => {
    const quote = d.quotes.find((q) => {
      ctx.font = `italic 400 ${L.quote}px ${SERIF}`
      return wrap(ctx, q.text, textW).length <= maxLines
    }) ?? d.quotes[0]
    if (!quote) return null
    const q = block(ctx, quote.text, (px) => `italic 400 ${px}px ${SERIF}`, L.quote, Math.round(L.quote * 0.8), textW, maxLines)
    const player = d.playerLine && L.player ? block(ctx, d.playerLine, (px) => `italic 400 ${px}px ${SERIF}`, L.player, L.player, textW, 1) : null
    const qH = q.lines.length * q.px * 1.25
    return {
      h: qH + L.author * 1.6 + (player ? L.player * 1.9 : 0),
      draw: (y) => {
        q.lines.forEach((l, i) => at(l, `italic 400 ${q.px}px ${SERIF}`, C.ink, y + q.px * (0.95 + i * 1.25)))
        at(`– ${quote.author}`, `600 ${L.author}px ${SERIF}`, C.gold, y + qH + L.author * 1.15)
        if (player) at(player.lines[0], `italic 400 ${player.px}px ${SERIF}`, C.muted, y + qH + L.author * 1.6 + L.player * 1.4)
      },
    }
  }
  let lines = L.quoteLines
  let quote = quoteSection(lines)
  const used = () => sections.reduce((sum, x) => sum + x.h, 0) + (quote?.h ?? 0)
  const minGap = Math.round(L.pad * 0.35)
  // Не влезает – убираем необязательное, потом укорачиваем афоризм.
  while (used() + minGap * (sections.length + 2) > limit - top) {
    const opt = sections.findIndex((x) => x.optional)
    if (opt >= 0) sections.splice(opt, 1)
    else if (lines > 1) quote = quoteSection(--lines)
    else break
  }
  if (quote) sections.push(quote)
  const free = limit - top - sections.reduce((sum, x) => sum + x.h, 0)
  const gap = Math.max(minGap, Math.min(Math.round(L.pad * 1.3), free / (sections.length + 1)))
  // Остаток после равных промежутков – сверху, чтобы блок стоял по центру.
  let y = top + Math.max(0, (free - gap * (sections.length - 1)) / 2 - gap * 0.6)
  for (const sec of sections) {
    sec.draw(Math.round(y))
    y += sec.h + gap
  }
}

/** «Ссылка» 1200×630: слева сцена и портреты, справа текст. */
function drawWide(ctx: CanvasRenderingContext2D, cw: number, ch: number, d: CardData): void {
  const pad = 44
  const leftW = 520
  drawSceneBand(ctx, d, 0, 0, leftW, Math.round((leftW * H) / W))
  ctx.font = `600 22px ${DISPLAY}`
  ctx.fillStyle = 'rgba(243,232,212,0.92)'
  spaced(ctx, d.brand.toLocaleUpperCase(document.documentElement.lang || undefined), leftW / 2, 34, 5)
  const portraits = { ...d, portraits: d.portraits.slice(-5) }
  drawPortraits(ctx, portraits, pad, 240, leftW - pad * 2, 2, 18)
  ctx.font = `600 34px ${DISPLAY}`
  ctx.fillStyle = C.ink
  ctx.fillText(d.cta, pad, ch - pad - 30)
  ctx.font = `600 22px ${SERIF}`
  ctx.fillStyle = C.gold
  ctx.fillText(d.site, pad, ch - pad)

  const x = leftW + pad
  const w = cw - x - pad
  let y = pad + 20
  const namePx = fit(ctx, d.name, (px) => `600 ${px}px ${DISPLAY}`, 70, 40, w)
  ctx.font = `600 ${namePx}px ${DISPLAY}`
  ctx.fillStyle = C.ink
  y += namePx * 0.6
  ctx.fillText(d.name, x, y)
  y += 36
  ctx.font = `400 ${fit(ctx, d.meta, (px) => `400 ${px}px ${SERIF}`, 24, 18, w)}px ${SERIF}`
  ctx.fillStyle = C.muted
  ctx.fillText(d.meta, x, y)
  y += 50
  ctx.font = `600 ${fit(ctx, d.title, (px) => `600 ${px}px ${DISPLAY}`, 38, 26, w)}px ${DISPLAY}`
  ctx.fillStyle = C.accent
  ctx.fillText(d.title, x, y)
  const hook = block(ctx, d.hook, (px) => `700 ${px}px ${SERIF}`, 32, 26, w, 2)
  y += 14
  for (const l of hook.lines) {
    y += hook.px * 1.2
    ctx.font = `700 ${hook.px}px ${SERIF}`
    ctx.fillStyle = C.ink
    ctx.fillText(l, x, y)
  }
  const quote = d.quotes.find((q) => {
    ctx.font = `italic 400 28px ${SERIF}`
    return wrap(ctx, q.text, w).length <= 3
  }) ?? d.quotes[0]
  if (quote) {
    y += 30
    const q = block(ctx, quote.text, (px) => `italic 400 ${px}px ${SERIF}`, 28, 22, w, 3)
    for (const l of q.lines) {
      y += q.px * 1.25
      ctx.font = `italic 400 ${q.px}px ${SERIF}`
      ctx.fillStyle = C.ink
      ctx.fillText(l, x, y)
    }
    y += 34
    ctx.font = `600 22px ${SERIF}`
    ctx.fillStyle = C.gold
    ctx.fillText(`– ${quote.author}`, x, y)
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
