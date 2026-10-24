// Пиксельные сцены. Кадр 192×60 точек (панорама 16:5), плоские цвета без обводки:
// небо полосами, силуэт места, земля с узором, человечки в несколько точек и пара предметов.
// Описание сцены (SceneDef) одно и то же для рисования и для промпта настоящей иллюстрации.

import type { SceneDef, SceneProp, ScenePlace, SceneTime } from '../engine/types'

export const W = 192
export const H = 60
const GROUND = 44

type Px = (x: number, y: number, w: number, h: number, c: string) => void

/** Детерминированный генератор: одна и та же сцена всегда выглядит одинаково. */
function rand(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const SKY: Record<SceneTime, string[]> = {
  day: ['#6aa6dc', '#78b0e2', '#88bbe7', '#9ac6ec', '#aed2f0', '#c3def4'],
  dawn: ['#6c7fb5', '#8f8fbf', '#b9a0bf', '#dcb2b6', '#f0c7a8', '#f6dbb0'],
  sunset: ['#55467a', '#7a5280', '#a65f7e', '#d0727a', '#ea9070', '#f4b072'],
  night: ['#10142e', '#141a38', '#1a2142', '#1f294c', '#253155', '#2b385d'],
  overcast: ['#7d8287', '#878c90', '#91959a', '#9b9fa3', '#a5a9ac', '#afb2b4'],
}

/** Как тонируются постройки в разное время суток. */
const SHADE: Record<SceneTime, number> = { day: 0, dawn: -0.08, sunset: -0.15, night: -0.55, overcast: -0.12 }

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

interface Palette {
  stone: string
  stoneDark: string
  wall: string
  roof: string
  ground: string
  groundLine: string
  clothes: string[]
  skin: string[]
}

const REGION: Record<string, Palette> = {
  rome: { stone: '#e9e1cc', stoneDark: '#c9bfa6', wall: '#d39a62', roof: '#a8553a', ground: '#8e877f', groundLine: '#7b746c', clothes: ['#efe8d8', '#efe8d8', '#a83a2f', '#7a5a3a', '#c9a34a'], skin: ['#c98d62', '#b07650', '#d9a07a'] },
  athens: { stone: '#efe9da', stoneDark: '#cfc6b0', wall: '#e6dccb', roof: '#b56a46', ground: '#a69d8c', groundLine: '#918877', clothes: ['#efe8d8', '#4f6f9a', '#efe8d8', '#9a4a3a', '#6a7a4a'], skin: ['#c98d62', '#b07650', '#d9a07a'] },
  egypt: { stone: '#d9b77a', stoneDark: '#b8935a', wall: '#c9a06a', roof: '#9a6a3a', ground: '#d4ad6e', groundLine: '#c09a5c', clothes: ['#f2eee2', '#f2eee2', '#e6dcc4', '#3f6f8a', '#c0703a'], skin: ['#a8704a', '#8f5c3a', '#b98058'] },
}

function palette(region: string): Palette {
  return REGION[region] ?? REGION.rome
}

// ---------- Слои ----------

function sky(px: Px, time: SceneTime, r: () => number) {
  const bands = SKY[time]
  const h = Math.ceil(GROUND / bands.length)
  bands.forEach((c, i) => px(0, i * h, W, h, c))
  if (time === 'night') for (let i = 0; i < 28; i++) px(Math.floor(r() * W), Math.floor(r() * 30), 1, 1, r() > 0.7 ? '#fff6c8' : '#cfd6ff')
}

function disc(px: Px, cx: number, cy: number, rad: number, c: string) {
  for (let y = -rad; y <= rad; y++) {
    const w = Math.round(Math.sqrt(rad * rad - y * y))
    px(cx - w, cy + y, w * 2 + 1, 1, c)
  }
}

function ground(px: Px, place: ScenePlace, p: Palette, time: SceneTime, r: () => number) {
  const k = SHADE[time]
  const water = place === 'sea' || place === 'harbor'
  const sand = place === 'arena' || place === 'battle' || place === 'camp' || place === 'field' || place === 'road'
  const base = water ? '#3f6f9e' : place === 'field' ? '#b9a14e' : sand ? '#c8a874' : place === 'river' ? p.ground : p.ground
  px(0, GROUND, W, H - GROUND, shade(base, k))
  const line = water ? '#6f9cc8' : place === 'field' ? '#9c8638' : sand ? '#b39260' : p.groundLine
  if (water) {
    for (let y = GROUND + 2; y < H; y += 3) for (let x = Math.floor(r() * 8); x < W; x += 9 + Math.floor(r() * 6)) px(x, y, 4, 1, shade(line, k))
  } else if (place === 'field') {
    for (let y = GROUND + 2; y < H; y += 3) px(0, y, W, 1, shade(line, k))
  } else if (place === 'home' || place === 'workshop' || place === 'school') {
    // Дощатый пол.
    px(0, GROUND, W, H - GROUND, shade('#a8754a', k * 0.6))
    for (let x = 0; x < W; x += 12) px(x, GROUND, 1, H - GROUND, shade('#8a5a36', k * 0.6))
    px(0, GROUND, W, 1, shade('#8a5a36', k * 0.6))
  } else if (place === 'bath') {
    px(0, GROUND, W, H - GROUND, shade('#d8d2c2', k * 0.6))
    px(40, GROUND + 4, 112, 10, '#5f9ec4')
    for (let x = 44; x < 148; x += 9) px(x, GROUND + 7, 4, 1, '#8cc0e0')
  } else if (place === 'road') {
    px(0, GROUND + 6, W, 6, shade('#9b8b70', k))
    for (let x = 4; x < W; x += 14) px(x, GROUND + 8, 6, 1, shade('#b9a98c', k))
  } else {
    // Мостовая или утоптанная земля: короткие штрихи.
    for (let y = GROUND + 2; y < H; y += 3) for (let x = (y % 2) * 4; x < W; x += 8) px(x, y, 4, 1, shade(line, k))
  }
  if (place === 'river') {
    px(0, GROUND + 6, W, 6, shade('#3f78a8', k))
    for (let x = 3; x < W; x += 9) px(x, GROUND + 8, 4, 1, shade('#7aa8d0', k))
  }
}

function colonnade(px: Px, x0: number, w: number, top: number, p: Palette, k: number, n: number) {
  const stone = shade(p.stone, k)
  const dark = shade(p.stoneDark, k)
  // фронтон ступенями
  const steps = 4
  for (let i = 0; i < steps; i++) px(x0 + 8 + i * 6, top - 2 - i * 2, w - 16 - i * 12, 2, stone)
  px(x0 + 2, top, w - 4, 3, stone)
  const colTop = top + 3
  const colH = GROUND - 3 - colTop
  for (let i = 0; i < n; i++) {
    const x = x0 + 5 + Math.round((i * (w - 12)) / (n - 1))
    px(x, colTop, 3, colH, stone)
    px(x + 2, colTop, 1, colH, dark)
  }
  px(x0, GROUND - 3, w, 2, dark)
  px(x0 - 2, GROUND - 1, w + 4, 1, shade(p.stoneDark, k - 0.1))
}

function pyramid(px: Px, cx: number, base: number, levels: number, c: string, step = 3) {
  for (let i = 0; i < levels; i++) px(cx - base / 2 + i * step, GROUND - (i + 1) * 3, base - i * step * 2, 3, c)
}

function house(px: Px, x: number, w: number, h: number, wall: string, roof: string, win: string, r: () => number, lit: boolean) {
  px(x, GROUND - h, w, h, wall)
  px(x - 1, GROUND - h - 2, w + 2, 2, roof)
  for (let y = GROUND - h + 3; y < GROUND - 4; y += 5) for (let wx = x + 2; wx < x + w - 3; wx += 5) px(wx, y, 2, 3, lit && r() > 0.5 ? '#e8c96a' : win)
}

function backdrop(px: Px, place: ScenePlace, region: string, time: SceneTime, p: Palette, r: () => number) {
  const k = SHADE[time]
  const lit = time === 'night' || time === 'sunset'
  switch (place) {
    case 'landmark':
      if (region === 'egypt') {
        pyramid(px, 60, 70, 9, shade('#c99a5a', k))
        pyramid(px, 112, 44, 6, shade('#b8894c', k))
      } else if (region === 'athens') {
        // Холм Акрополя и Парфенон наверху.
        for (let i = 0; i < 5; i++) px(30 + i * 6, GROUND - 6 - i * 2, 132 - i * 12, 2, shade('#9a8f78', k))
        px(18, GROUND - 6, 156, 6, shade('#9a8f78', k))
        colonnade(px, 56, 80, GROUND - 32, p, k, 8)
      } else {
        // Колизей: ярусы арок.
        const x0 = 36
        const w = 120
        for (let tier = 0; tier < 3; tier++) {
          const y = GROUND - 10 - tier * 9
          px(x0 + tier * 3, y, w - tier * 6, 9, shade(p.stone, k - tier * 0.04))
          for (let ax = x0 + tier * 3 + 3; ax < x0 + w - tier * 3 - 5; ax += 7) px(ax, y + 3, 3, 5, shade('#6b5f4e', k))
        }
        px(x0 + 9, GROUND - 31, w - 18, 3, shade(p.stoneDark, k))
      }
      break
    case 'temple':
      if (region === 'egypt') {
        const c = shade('#c9a46a', k)
        px(50, GROUND - 30, 30, 30, c)
        px(112, GROUND - 30, 30, 30, c)
        px(80, GROUND - 20, 32, 20, shade('#a8834e', k))
        for (let y = GROUND - 26; y < GROUND - 4; y += 4) px(54, y, 22, 1, shade('#a8834e', k))
      } else colonnade(px, 40, 112, GROUND - 30, p, k, 8)
      break
    case 'palace':
      colonnade(px, 24, 144, GROUND - 26, p, k, 12)
      break
    case 'street':
    case 'market': {
      let x = -4
      while (x < W) {
        const w = 22 + Math.floor(r() * 16)
        const h = region === 'rome' ? 22 + Math.floor(r() * 12) : 12 + Math.floor(r() * 8)
        house(px, x, w, h, shade(region === 'rome' ? (r() > 0.5 ? p.wall : '#b9784e') : p.wall, k), shade(p.roof, k), shade('#4a3a30', k), r, lit)
        x += w + 2
      }
      if (place === 'market') {
        for (let sx = 14; sx < W - 20; sx += 44) {
          const awning = ['#a83a2f', '#3f6f8a', '#c9a34a'][Math.floor(r() * 3)]
          for (let i = 0; i < 24; i += 4) px(sx + i, GROUND - 12, 2, 3, shade(awning, k))
          px(sx, GROUND - 9, 24, 1, shade('#5a4030', k))
          px(sx + 1, GROUND - 9, 1, 9, shade('#5a4030', k))
          px(sx + 22, GROUND - 9, 1, 9, shade('#5a4030', k))
          px(sx + 2, GROUND - 5, 20, 2, shade('#7a5a3a', k))
        }
      }
      break
    }
    case 'home':
    case 'workshop':
    case 'school':
    case 'bath': {
      // Интерьер: стена, окно, пол из досок или плит.
      const wall = place === 'bath' ? '#c9d6d8' : place === 'workshop' ? '#b98d64' : '#e7d3ad'
      px(0, 0, W, GROUND, shade(wall, k * 0.6))
      px(0, GROUND - 2, W, 2, shade('#8a6a4a', k * 0.6))
      if (place !== 'bath') {
        px(26, 8, 22, 18, shade('#7a5a3a', k * 0.6))
        const glass = time === 'night' ? '#1f294c' : time === 'sunset' ? '#e8a070' : '#8ec0e6'
        px(28, 10, 8, 6, glass)
        px(38, 10, 8, 6, glass)
        px(28, 18, 8, 6, glass)
        px(38, 18, 8, 6, glass)
      } else {
        for (let x = 20; x < W; x += 40) px(x, 6, 4, GROUND - 6, shade('#e9e1cc', k * 0.6))
      }
      if (place === 'school') {
        px(120, 10, 40, 14, shade('#6a5a4a', k * 0.6))
        for (let x = 124; x < 156; x += 6) px(x, 12, 3, 10, shade('#e9dcc0', k * 0.6))
      }
      if (place === 'workshop') for (let x = 110; x < 170; x += 12) px(x, 16, 8, 2, shade('#6a4a30', k * 0.6))
      return
    }
    case 'field':
      px(0, GROUND - 8, W, 8, shade('#7f9a5a', k))
      for (let x = 0; x < W; x += 30) disc(px, x + 15, GROUND - 6, 8, shade('#6f8a4a', k))
      break
    case 'river':
      if (region === 'egypt') pyramid(px, 150, 34, 5, shade('#c99a5a', k - 0.1))
      px(0, GROUND - 4, W, 4, shade('#7f9a5a', k))
      break
    case 'sea':
      px(0, GROUND - 3, W, 3, shade('#4f6f8a', k))
      break
    case 'harbor':
      if (region === 'egypt') {
        // Фаросский маяк.
        px(160, GROUND - 34, 8, 34, shade(p.stone, k))
        px(161, GROUND - 40, 6, 6, shade(p.stone, k))
        px(162, GROUND - 43, 4, 3, '#f2c94c')
      }
      house(px, 4, 40, 18, shade(p.wall, k), shade(p.roof, k), shade('#4a3a30', k), r, lit)
      px(44, GROUND - 2, 60, 2, shade('#6a4a30', k))
      break
    case 'camp':
      for (let x = 20; x < W - 20; x += 34) {
        for (let i = 0; i < 9; i++) px(x + 9 - i, GROUND - 9 + i, i * 2 + 1, 1, shade(i % 2 ? '#c9b48a' : '#bba67c', k))
        px(x + 8, GROUND - 4, 3, 4, shade('#6a5a3a', k))
      }
      break
    case 'battle':
      px(0, GROUND - 6, W, 6, shade('#8f8a6a', k))
      for (let x = 0; x < W; x += 40) disc(px, x + 20, GROUND - 4, 10, shade('#7f7a5a', k))
      break
    case 'arena':
      for (let tier = 0; tier < 4; tier++) px(0, 10 + tier * 7, W, 6, shade(tier % 2 ? p.stone : p.stoneDark, k))
      for (let x = 4; x < W; x += 10) px(x, 33, 4, 8, shade('#6b5f4e', k))
      break
    case 'road':
      for (let x = 10; x < W; x += 46) {
        px(x + 3, GROUND - 18, 2, 18, shade('#4a3a2a', k))
        for (let i = 0; i < 6; i++) px(x + 4 - i, GROUND - 18 + i * 2, 2 + i * 2 - 1, 2, shade('#3f5a3a', k))
      }
      break
    case 'tomb':
      px(78, GROUND - 22, 36, 22, shade(p.stone, k))
      px(74, GROUND - 25, 44, 3, shade(p.stoneDark, k))
      px(92, GROUND - 14, 8, 14, shade('#3a3028', k))
      for (let x = 20; x < W; x += 60) px(x, GROUND - 8, 5, 8, shade(p.stoneDark, k))
      break
  }
}

// ---------- Человечки и предметы ----------

function person(px: Px, x: number, p: Palette, r: () => number, k: number, small = false, base = GROUND) {
  const h = small ? 8 : 12
  const top = base + 1 - h
  const skin = p.skin[Math.floor(r() * p.skin.length)]
  const cloth = p.clothes[Math.floor(r() * p.clothes.length)]
  px(x + 1, top, 3, 1, shade('#2a2018', k * 0.5)) // волосы
  px(x + 1, top + 1, 3, small ? 1 : 2, shade(skin, k * 0.5)) // лицо
  const bodyTop = top + (small ? 2 : 3)
  const bodyH = small ? 4 : 6
  px(x, bodyTop, 5, bodyH, shade(cloth, k * 0.5))
  px(x + 1, bodyTop + bodyH, 1, h - (bodyTop - top) - bodyH, shade('#3a2a20', k * 0.5))
  px(x + 3, bodyTop + bodyH, 1, h - (bodyTop - top) - bodyH, shade('#3a2a20', k * 0.5))
}

function prop(px: Px, kind: SceneProp, x: number, time: SceneTime, p: Palette, k: number, r: () => number) {
  const g = GROUND
  switch (kind) {
    case 'sun':
      return disc(px, 150, 18, 6, time === 'sunset' ? '#f8d48a' : '#fff1b0')
    case 'moon':
      disc(px, 160, 10, 4, '#f4ecd0')
      return disc(px, 162, 9, 3, SKY.night[0])
    case 'fire':
      px(x, g - 3, 6, 3, '#e0702a')
      px(x + 1, g - 6, 4, 3, '#f2a03a')
      return px(x + 2, g - 8, 2, 2, '#f8d48a')
    case 'smoke':
      for (let i = 0; i < 4; i++) disc(px, x + 4 + i * 3, g - 14 - i * 6, 3 + i, shade('#9a9a9a', k * 0.4 - 0.1))
      return
    case 'boat':
      px(x, g + 4, 22, 3, '#6a4a2a')
      px(x + 3, g + 7, 16, 1, '#4a3420')
      px(x + 10, g - 12, 1, 16, '#4a3420')
      for (let i = 0; i < 12; i++) px(x + 11, g - 11 + i, Math.min(i, 8), 1, '#f2ead8')
      return
    case 'bed':
      px(x, g - 6, 34, 6, shade('#7a5a3a', k * 0.6))
      px(x, g - 9, 34, 3, '#f2ead8')
      return px(x + 2, g - 11, 8, 2, '#f2ead8')
    case 'cradle':
      px(x, g - 6, 12, 5, shade('#8a6a40', k * 0.6))
      px(x + 1, g - 1, 2, 1, '#5a4030')
      return px(x + 9, g - 1, 2, 1, '#5a4030')
    case 'table':
      px(x, g - 7, 24, 2, shade('#7a5a3a', k * 0.6))
      px(x + 2, g - 5, 2, 5, shade('#5a4030', k * 0.6))
      px(x + 20, g - 5, 2, 5, shade('#5a4030', k * 0.6))
      px(x + 5, g - 9, 4, 2, '#e9dcc0')
      return px(x + 14, g - 10, 3, 3, '#a8553a')
    case 'scroll':
      px(x, g - 4, 8, 3, '#efe3c2')
      px(x, g - 5, 1, 5, '#a88a5a')
      return px(x + 7, g - 5, 1, 5, '#a88a5a')
    case 'coins':
      for (let i = 0; i < 4; i++) px(x + i * 2, g - 1 - (i % 2), 2, 1, '#e8c04a')
      return px(x + 2, g - 3, 2, 1, '#f2d46a')
    case 'amphora':
      px(x + 1, g - 9, 3, 1, '#9a5a32')
      px(x, g - 8, 5, 6, '#b8683a')
      return px(x + 1, g - 2, 3, 2, '#9a5a32')
    case 'tree':
      px(x + 3, g - 10, 2, 10, '#5a4030')
      return disc(px, x + 4, g - 14, 5, shade('#4f7a3a', k))
    case 'olive':
      px(x + 3, g - 8, 2, 8, '#6a5a4a')
      return disc(px, x + 4, g - 11, 4, shade('#7f8f5a', k))
    case 'palm':
      px(x + 3, g - 16, 1, 16, '#6a4a2a')
      px(x - 2, g - 17, 11, 1, shade('#4f8a3a', k))
      px(x - 3, g - 16, 2, 1, shade('#4f8a3a', k))
      return px(x + 8, g - 16, 2, 1, shade('#4f8a3a', k))
    case 'grain':
      for (let i = 0; i < 6; i++) px(x + i * 2, g - 6 - (i % 2), 1, 6, '#d8b44a')
      return
    case 'goat':
      px(x, g - 5, 7, 3, '#e9e0d0')
      px(x + 6, g - 7, 2, 2, '#e9e0d0')
      px(x + 1, g - 2, 1, 2, '#5a4a3a')
      return px(x + 5, g - 2, 1, 2, '#5a4a3a')
    case 'horse':
      px(x, g - 9, 12, 5, '#7a4a2a')
      px(x + 11, g - 12, 3, 5, '#7a4a2a')
      for (const lx of [1, 3, 8, 10]) px(x + lx, g - 4, 1, 4, '#4a2a1a')
      return
    case 'cart':
      px(x, g - 6, 16, 3, '#7a5a3a')
      disc(px, x + 3, g - 2, 2, '#4a3420')
      return disc(px, x + 12, g - 2, 2, '#4a3420')
    case 'lamp':
      px(x + 2, g - 18, 1, 18, '#3a3028')
      return px(x, g - 20, 5, 2, '#f2d46a')
    case 'altar':
      px(x, g - 6, 10, 6, shade(p.stone, k))
      px(x + 3, g - 9, 4, 3, '#e0702a')
      return
    case 'statue':
      px(x, g - 4, 8, 4, shade(p.stoneDark, k))
      px(x + 2, g - 14, 4, 10, shade(p.stone, k))
      return px(x + 3, g - 16, 2, 2, shade(p.stone, k))
    case 'rain':
      for (let i = 0; i < 70; i++) px(Math.floor(r() * W), Math.floor(r() * GROUND), 1, 2, '#9fb6cc')
      return
    case 'banner':
      px(x, g - 22, 1, 22, '#4a3420')
      return px(x + 1, g - 22, 6, 7, '#a83a2f')
    case 'shield':
      return px(x, g - 8, 5, 7, '#a83a2f')
    case 'loom':
      px(x, g - 14, 1, 14, '#6a4a2a')
      px(x + 10, g - 14, 1, 14, '#6a4a2a')
      px(x, g - 14, 11, 1, '#6a4a2a')
      for (let i = 1; i < 10; i += 2) px(x + i, g - 13, 1, 9, '#c9a34a')
      return
    case 'anvil':
      px(x, g - 5, 8, 2, '#4a4a4a')
      return px(x + 2, g - 3, 4, 3, '#3a3a3a')
  }
}

/** Куда ставить предметы, чтобы они не наезжали на людей. */
const PROP_X = [16, 168, 120, 60]

export interface SceneInput {
  scene: SceneDef
  region: string
  /** Ключ разнообразия: id события, чтобы разные события с одной сценой отличались. */
  seed: string
}

export function drawScene(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { scene, region, seed } = input
  const place = scene.place ?? 'landmark'
  const time = scene.time ?? 'day'
  const p = palette(region)
  const r = rand(`${seed}:${place}:${region}`)
  const px: Px = (x, y, w, h, c) => {
    ctx.fillStyle = c
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h)))
  }
  ctx.clearRect(0, 0, W, H)
  sky(px, time, r)
  const props = scene.props ?? []
  if (props.includes('sun') && place !== 'home' && place !== 'workshop' && place !== 'school' && place !== 'bath') prop(px, 'sun', 0, time, p, 0, r)
  if (props.includes('moon')) prop(px, 'moon', 0, time, p, 0, r)
  backdrop(px, place, region, time, p, r)
  ground(px, place, p, time, r)
  const k = SHADE[time]
  const placed = props.filter((x) => x !== 'sun' && x !== 'moon' && x !== 'rain')
  // На воде люди стоят в лодке, в гавани — на причале.
  const water = place === 'sea'
  const boatX = water ? 84 : 0
  const xs = placed.map((_, i) => (water && placed[i] === 'boat' ? boatX : PROP_X[i % PROP_X.length] + Math.floor(r() * 6)))
  if (water && !placed.includes('boat') && (scene.people ?? 0) > 0) {
    placed.push('boat')
    xs.push(boatX)
  }
  placed.forEach((kind, i) => prop(px, kind, xs[i], time, p, k, r))
  let n = Math.max(0, Math.min(6, scene.people ?? 2))
  let span = n > 1 ? Math.min(96, n * 16) : 0
  let start = 96 - span / 2
  let base = GROUND
  if (water) {
    n = Math.min(n, 2)
    span = n > 1 ? 7 : 0
    start = boatX + 3
    base = GROUND + 3
  } else if (place === 'harbor') {
    span = n > 1 ? Math.min(50, n * 12) : 0
    start = 74 - span / 2
    base = GROUND - 2
  }
  for (let i = 0; i < n; i++) {
    const x = start + (n > 1 ? (i * span) / (n - 1) : 0) + (water ? 0 : Math.floor(r() * 4) - 2)
    person(px, x, p, r, k, place === 'home' && i === n - 1 && n > 2, base)
  }
  if (props.includes('rain')) prop(px, 'rain', 0, time, p, k, r)
}

// ---------- Промпт для настоящей иллюстрации ----------

const PLACE_EN: Record<ScenePlace, string> = {
  landmark: 'a famous city view',
  home: 'inside a modest home',
  street: 'a city street with houses',
  market: 'a busy market with stalls',
  temple: 'in front of a temple',
  field: 'farm fields',
  river: 'a river bank',
  sea: 'the open sea',
  harbor: 'a harbor with ships',
  workshop: 'inside a craftsman workshop',
  school: 'a schoolroom',
  camp: 'a military camp with tents',
  battle: 'a battlefield seen from afar',
  arena: 'an arena with stands',
  road: 'a country road with cypress trees',
  tomb: 'a quiet tomb by the road',
  palace: 'a grand villa with columns',
  bath: 'public baths',
}

const REGION_EN: Record<string, string> = {
  rome: 'ancient Rome',
  athens: 'ancient Athens',
  egypt: 'Ptolemaic or Roman Egypt',
}

const TIME_EN: Record<SceneTime, string> = { day: 'daylight', dawn: 'dawn light', sunset: 'warm sunset', night: 'night, moonlight', overcast: 'overcast grey sky' }

/** Промпт по шаблону ТЗ: [сцена] + [эпоха и регион] + [единый стиль] + [освещение] + [формат кадра]. */
export function scenePrompt(scene: SceneDef, region: string, eraName: string): string {
  const place = PLACE_EN[scene.place ?? 'landmark']
  const people = scene.people ? `${scene.people} small figures in period clothing` : 'no people'
  const props = scene.props?.length ? `, with ${scene.props.join(', ')}` : ''
  return [
    `${place}${props}, ${people}`,
    `${REGION_EN[region] ?? region}, ${eraName}`,
    'flat pixel art, limited palette, no outlines, simple shapes, no text',
    TIME_EN[scene.time ?? 'day'],
    'wide panorama 16:5',
  ].join('; ')
}

// ---------- Портрет героя ----------

/** Портрет 16×20 точек: волосы, лицо, одежда эпохи. Рисуется в точке (x, y) с размером точки s. */
export function drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, region: string, sex: 'm' | 'f', seed: string): void {
  const p = palette(region)
  const r = rand(`portrait:${seed}`)
  const skin = p.skin[Math.floor(r() * p.skin.length)]
  const cloth = p.clothes[Math.floor(r() * p.clothes.length)]
  const hair = ['#2a2018', '#3a2a1a', '#5a3a22', '#1a1410'][Math.floor(r() * 4)]
  const px = (gx: number, gy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c
    ctx.fillRect(x + gx * s, y + gy * s, w * s, h * s)
  }
  px(4, 2, 8, 2, hair)
  px(3, 3, 10, 2, hair)
  if (sex === 'f') {
    px(3, 5, 2, 8, hair)
    px(11, 5, 2, 8, hair)
  }
  px(5, 4, 6, 7, skin)
  px(6, 6, 1, 1, '#2a2018')
  px(9, 6, 1, 1, '#2a2018')
  px(7, 9, 2, 1, shade(skin, -0.25))
  px(7, 11, 2, 1, skin)
  px(3, 12, 10, 8, cloth)
  px(2, 14, 1, 6, cloth)
  px(13, 14, 1, 6, cloth)
  px(6, 12, 4, 1, shade(cloth, -0.15))
}
