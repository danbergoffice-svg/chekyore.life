// Карточка для публикации рисуется на холсте прямо в браузере, ничего не отправляется на сервер.

import { drawPortrait, drawScene, H, W } from '../pixel/scene'
import type { SceneDef, Sex } from '../engine/types'

export type CardFormat = 'square' | 'story' | 'wide'

export const CARD_SIZES: Record<CardFormat, [number, number]> = {
  square: [1080, 1080],
  story: [1080, 1920],
  wide: [1200, 630],
}

export interface CardData {
  name: string
  years: string
  place: string
  archetype: string
  patternLine: string
  facts: string[]
  playerLine: string
  cta: string
  region: string
  sex: Sex
  seed: string
  scene: SceneDef
  dark: boolean
}

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

export function drawCard(canvas: HTMLCanvasElement, format: CardFormat, d: CardData): void {
  const [cw, ch] = CARD_SIZES[format]
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  const paper = d.dark ? '#1f1914' : '#f3ead8'
  const ink = d.dark ? '#efe4d0' : '#2b2119'
  const muted = d.dark ? '#a8977f' : '#7d6b58'
  const accent = d.dark ? '#d07a52' : '#8e3b22'
  const gold = d.dark ? '#d1a35a' : '#a87a2e'
  const serif = "'PT Serif', Georgia, serif"
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, cw, ch)

  // Сцена эпохи во всю ширину.
  const scene = document.createElement('canvas')
  scene.width = W
  scene.height = H
  drawScene(scene.getContext('2d')!, { scene: d.scene, region: d.region, seed: d.seed })
  ctx.imageSmoothingEnabled = false
  const wide = format === 'wide'
  const sceneW = wide ? Math.round(cw * 0.42) : cw
  const sceneH = Math.round((sceneW * H) / W)
  ctx.drawImage(scene, 0, 0, sceneW, sceneH)

  const pad = Math.round(cw * 0.06)
  const unit = format === 'wide' ? 0.8 : format === 'story' ? 1.15 : 0.85
  // Портрет поверх нижнего края сцены.
  const ps = Math.round(9 * unit)
  const portraitX = pad
  const portraitY = sceneH - Math.round(ps * 10)
  ctx.fillStyle = paper
  ctx.fillRect(portraitX - ps, portraitY - ps, ps * 18, ps * 22)
  drawPortrait(ctx, portraitX, portraitY, ps, d.region, d.sex, d.seed)

  let x = wide ? sceneW + pad : pad
  let y = wide ? pad + 10 : sceneH + Math.round(ps * 14)
  const maxW = cw - x - pad
  if (wide) {
    y = sceneH + Math.round(ps * 14)
    x = pad
  }
  const textW = wide ? sceneW - pad * 1.5 : maxW

  // Нижняя граница текста: под ней строка с названием игры.
  const limit = ch - pad - Math.round(60 * unit)
  const text = (s: string, size: number, color: string, weight = 400, italic = false, maxWidth = textW) => {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${Math.round(size * unit)}px ${serif}`
    ctx.fillStyle = color
    for (const line of wrap(ctx, s, maxWidth)) {
      const step = Math.round(size * unit * 1.25)
      if (y + step > limit) return
      y += step
      ctx.fillText(line, x, y)
    }
  }

  if (wide) {
    // Текст справа от сцены.
    x = sceneW + pad
    y = pad - 10
    const w = cw - x - pad
    text(d.name, 64, ink, 700, false, w)
    text(d.years, 30, muted, 400, false, w)
    text(d.place, 30, muted, 400, false, w)
    y += 16
    text(d.archetype, 40, accent, 700, false, w)
    text(d.patternLine, 24, muted, 400, false, w)
    y += 10
    for (const f of d.facts.slice(0, 2)) text(`• ${f}`, 26, ink, 400, false, w)
    if (d.playerLine) text(`«${d.playerLine}»`, 26, ink, 400, true, w)
    ctx.font = `700 ${Math.round(26 * unit)}px ${serif}`
    ctx.fillStyle = gold
    ctx.fillText(d.cta, x, ch - pad + 10)
    return
  }

  text(d.name, 76, ink, 700)
  text(d.years, 36, muted)
  text(d.place, 36, muted)
  y += 24
  text(d.archetype, 52, accent, 700)
  text(d.patternLine, 30, muted)
  y += 20
  for (const f of d.facts.slice(0, 3)) text(`• ${f}`, 34, ink)
  if (d.playerLine) {
    y += 16
    text(`«${d.playerLine}»`, 36, ink, 400, true)
  }
  ctx.font = `700 ${Math.round(34 * unit)}px ${serif}`
  ctx.fillStyle = gold
  ctx.fillText(d.cta, pad, ch - pad)
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
