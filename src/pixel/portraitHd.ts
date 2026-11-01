// Крупный портрет героя для карточки «Поделиться»: пиксельный 32×40 без фона (стена дома вырезается заливкой от краёв),
// увеличен Scale2x дважды (128×160 - сглаженные лесенки, пиксельность сохраняется), с тёмной обводкой и мягким светом.
import { AH, AW, drawAvatar } from './avatar'
import type { AvatarInput } from './avatar'

export function portraitHd(input: AvatarInput): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = AW
  c.height = AH
  drawAvatar(c.getContext('2d')!, input, 0, 0, 1)
  cutout(c)
  return outline(scale2x(scale2x(c)))
}

/** Фон портрета (два тона стены) убираем заливкой от краёв: остаётся только фигура. */
function cutout(c: HTMLCanvasElement): void {
  const x = c.getContext('2d')!
  const img = x.getImageData(0, 0, AW, AH)
  const d = img.data
  const key = (i: number) => `${d[i]},${d[i + 1]},${d[i + 2]}`
  const bgs = new Set([key(0), key((AH - 1) * AW * 4), key((AW - 1) * 4), key(((AH - 1) * AW + AW - 1) * 4)])
  const seen = new Uint8Array(AW * AH)
  const stack: [number, number][] = []
  for (let gx = 0; gx < AW; gx++) stack.push([gx, 0], [gx, AH - 1])
  for (let gy = 0; gy < AH; gy++) stack.push([0, gy], [AW - 1, gy])
  while (stack.length) {
    const [gx, gy] = stack.pop()!
    if (gx < 0 || gy < 0 || gx >= AW || gy >= AH) continue
    const k = gy * AW + gx
    if (seen[k]) continue
    seen[k] = 1
    if (!bgs.has(key(k * 4))) continue
    d[k * 4 + 3] = 0
    stack.push([gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1])
  }
  x.putImageData(img, 0, 0)
}

/** Scale2x (EPX): каждый пиксель - четыре, углы подхватывают цвет соседей - диагонали без лесенок. */
function scale2x(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width
  const h = src.height
  const s = src.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = document.createElement('canvas')
  out.width = w * 2
  out.height = h * 2
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w * 2, h * 2)
  const d = img.data
  const px = (x: number, y: number) => {
    x = Math.max(0, Math.min(w - 1, x))
    y = Math.max(0, Math.min(h - 1, y))
    const i = (y * w + x) * 4
    return ((s[i] << 24) | (s[i + 1] << 16) | (s[i + 2] << 8) | s[i + 3]) >>> 0
  }
  const put = (x: number, y: number, v: number) => {
    const i = (y * w * 2 + x) * 4
    d[i] = (v >>> 24) & 255
    d[i + 1] = (v >>> 16) & 255
    d[i + 2] = (v >>> 8) & 255
    d[i + 3] = v & 255
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(x, y)
      const a = px(x, y - 1)
      const b = px(x + 1, y)
      const c = px(x - 1, y)
      const dd = px(x, y + 1)
      let e0 = p
      let e1 = p
      let e2 = p
      let e3 = p
      if (a !== dd && c !== b) {
        e0 = c === a ? c : p
        e1 = a === b ? b : p
        e2 = c === dd ? c : p
        e3 = dd === b ? b : p
      }
      put(2 * x, 2 * y, e0)
      put(2 * x + 1, 2 * y, e1)
      put(2 * x, 2 * y + 1, e2)
      put(2 * x + 1, 2 * y + 1, e3)
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

/** Тёмная обводка по силуэту и свет слева сверху - фигура отделяется от любого фона. */
function outline(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width
  const h = src.height
  const pad = 3
  const out = document.createElement('canvas')
  out.width = w + pad * 2
  out.height = h + pad * 2
  const o = out.getContext('2d')!
  const sh = document.createElement('canvas')
  sh.width = w
  sh.height = h
  const s = sh.getContext('2d')!
  s.drawImage(src, 0, 0)
  s.globalCompositeOperation = 'source-in'
  s.fillStyle = '#0b0805'
  s.fillRect(0, 0, w, h)
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) o.drawImage(sh, pad + dx, pad + dy)
  o.drawImage(src, pad, pad)
  o.globalCompositeOperation = 'source-atop'
  const g = o.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, 'rgba(255,240,200,0.16)')
  g.addColorStop(0.5, 'rgba(255,240,200,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.18)')
  o.fillStyle = g
  o.fillRect(0, 0, out.width, out.height)
  return out
}
