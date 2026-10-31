// Стиль искусства страны (ТЗ графики, G5): каждая сцена рисуется с оглядкой на искусство своего края –
// Русь на иконопись, Византия на мозаику, Китай на тушь, Европа на рукописи и гравюру. Не копия:
// основа остаётся пиксельной, а традиция узнаётся по 3–4 признакам – палитре, контуру, фактуре, фону и рамке.
// Процедурные сцены – «вполсилы» (artStrength, флаг art_strength, по умолчанию 0,5); фон-традиция – только
// в окнах событий и на экранах-главах. Рамка-орнамент – пиксельный узор, нарисованный кодом (data: URL).

export type Outline = 'none' | 'black' | 'brown' | 'gold'
export type Texture = 'none' | 'mosaic' | 'hatch' | 'ink' | 'weave' | 'clay' | 'relief'
export type Background = 'sky' | 'gold' | 'parchment' | 'ink' | 'red' | 'goldclouds' | 'terracotta' | 'blue' | 'plaster' | 'bands'
export type Ornament = 'meander' | 'palmette' | 'frieze' | 'rosette' | 'tesserae' | 'arabesque' | 'vine' | 'marks' | 'double' | 'clouds' | 'flowers' | 'stripes' | 'bogolan' | 'glyphs' | 'daysigns' | 'tocapu'

export interface ArtStyle {
  /** На что опираемся (для промптов иллюстраций G3). */
  tradition: string
  palette: string[]
  outline: Outline
  texture: Texture
  background: Background
  frame: Ornament
  /** Цвета рамки: основной, второй, фон. */
  frameColors: [string, string, string]
  /** Строка стиля для промпта иллюстрации. */
  prompt: string
  /** Традиция менялась: с этого года – другой стиль (Европа: рукопись → гравюра). */
  artEras?: { from: number; style: Partial<ArtStyle> }[]
}

export const ART: Record<string, ArtStyle> = {
  roman: {
    tradition: 'помпейские фрески, напольные мозаики',
    palette: ['#8e2a20', '#b8452f', '#d9a441', '#c98a3e', '#6b4a2f', '#2f2a26', '#efe6d2', '#d8c8a8', '#4f6b4a', '#7a8a5a', '#3f5a7a', '#9a9a8a', '#c9b48a', '#a8553a', '#e3cfa0', '#5a3a2a', '#6aa6dc', '#aed2f0'],
    outline: 'none',
    texture: 'mosaic',
    background: 'sky',
    frame: 'meander',
    frameColors: ['#8e2a20', '#d9a441', '#efe6d2'],
    prompt: 'in the manner of a Pompeian fresco and Roman floor mosaic: Pompeian red and ochre, tesserae texture, meander border',
  },
  greek: {
    tradition: 'чёрнофигурная и краснофигурная вазопись',
    palette: ['#c46a3a', '#d98a4e', '#a84f2a', '#1e1a18', '#3a302a', '#efe2c8', '#d8c4a0', '#8a3a2a', '#6a5a4a', '#b89a6a', '#4f6f9a', '#e6dccb', '#9a9080', '#c9a34a', '#7a8a5a', '#78b0e2', '#c3def4'],
    outline: 'black',
    texture: 'none',
    background: 'terracotta',
    frame: 'palmette',
    frameColors: ['#1e1a18', '#c46a3a', '#d98a4e'],
    prompt: 'in the manner of Attic black-figure and red-figure vase painting: silhouettes on terracotta, 4–5 colours, meander and palmette borders',
  },
  egyptian: {
    tradition: 'росписи гробниц, папирусы',
    palette: ['#d9a441', '#c46a2a', '#2a5a8a', '#3a8a8a', '#4a8a4a', '#1e1a18', '#f2ead6', '#e8c870', '#a84a2a', '#8a6a3a', '#d4ad6e', '#b8935a', '#6a4a2a', '#c99a5a', '#e0b84a', '#5a7a9a', '#88bbe7'],
    outline: 'black',
    texture: 'none',
    background: 'plaster',
    frame: 'frieze',
    frameColors: ['#2a5a8a', '#d9a441', '#f2ead6'],
    prompt: 'in the manner of an Egyptian tomb painting: figures in profile, flat colour without shading, registers, ochre and lapis blue, hieroglyph-like frieze',
  },
  mesopotamian: {
    tradition: 'дворцовые рельефы, изразцы ворот Иштар',
    palette: ['#2a4a9a', '#3a6ab8', '#e0b030', '#f2e6c0', '#d2b07a', '#a9855a', '#8a6a4a', '#6a4a30', '#c8a070', '#1e2a4a', '#e8dcc0', '#3f6f8a', '#7a4a8a', '#c0703a', '#9a8a6a', '#2a2a2a', '#88bbe7'],
    outline: 'none',
    texture: 'relief',
    background: 'blue',
    frame: 'rosette',
    frameColors: ['#2a4a9a', '#e0b030', '#f2e6c0'],
    prompt: 'in the manner of Assyrian palace reliefs and the glazed bricks of the Ishtar Gate: blue glaze with yellow figures, rosette frieze',
  },
  byzantine: {
    tradition: 'церковная мозаика, иконы',
    palette: ['#d8b040', '#c9a034', '#e8c860', '#6a2a5a', '#8a3a7a', '#2a3a8a', '#3a5aa8', '#efe6d2', '#c9b896', '#8a6a4a', '#a8603a', '#4a6a4a', '#1e1a24', '#b4a684', '#dccfb4', '#8a9aa8', '#88bbe7'],
    outline: 'brown',
    texture: 'mosaic',
    background: 'gold',
    frame: 'tesserae',
    frameColors: ['#d8b040', '#6a2a5a', '#2a3a8a'],
    prompt: 'in the manner of a Byzantine church mosaic and icon: gold ground with tesserae, elongated figures, purple and cobalt, reverse perspective',
  },
  islamic: {
    tradition: 'арабская и персидская книжная миниатюра, изразцы',
    palette: ['#2a6ab8', '#3f8fa8', '#1e4a7a', '#c0302a', '#e0a030', '#2a7a4a', '#f2eee2', '#e6d8bc', '#c2a878', '#8a5a3a', '#d8b040', '#6a3a7a', '#1e1a18', '#cdb88c', '#9ac0d8', '#a83a2f', '#88bbe7'],
    outline: 'brown',
    texture: 'none',
    background: 'sky',
    frame: 'arabesque',
    frameColors: ['#2a6ab8', '#d8b040', '#f2eee2'],
    prompt: 'in the manner of a Persian and Arab book miniature: high horizon, bright flat colours without shading, patterned carpets and tiles, arabesque border',
  },
  gothic: {
    tradition: 'иллюминированные рукописи и часословы XIII–XV вв.; с ~1450 – ксилография',
    palette: ['#2a3a9a', '#3f5ab8', '#d8b040', '#c8402a', '#efe2c0', '#d8c8a0', '#6a8a3a', '#8a2a2a', '#5a4a3a', '#2a2420', '#b8b2a6', '#8a8478', '#e2d6bc', '#6a4038', '#a89878', '#3a5a3a', '#88bbe7'],
    outline: 'brown',
    texture: 'none',
    background: 'parchment',
    frame: 'vine',
    frameColors: ['#2a3a9a', '#c8402a', '#efe2c0'],
    prompt: 'in the manner of an illuminated manuscript and book of hours: ultramarine and gold on parchment, vine-scroll border',
    artEras: [
      {
        from: 1450,
        style: {
          tradition: 'ксилография и гравюра',
          outline: 'black',
          texture: 'hatch',
          background: 'parchment',
          frameColors: ['#2a2420', '#8a2a2a', '#efe2c0'],
          prompt: 'in the manner of a late medieval woodcut: black outline, hatching, few colours on paper',
        },
      },
    ],
  },
  russian: {
    tradition: 'иконопись, летописная миниатюра',
    palette: ['#d8a840', '#c08a30', '#c0402a', '#a8302a', '#3a6a4a', '#5a8a5a', '#efe2c0', '#e0c890', '#8a5a36', '#5a4434', '#2a2018', '#3a5a8a', '#ece6d8', '#c2bba9', '#7a6a50', '#e8c060', '#88bbe7'],
    outline: 'brown',
    texture: 'none',
    background: 'gold',
    frame: 'marks',
    frameColors: ['#c0402a', '#d8a840', '#efe2c0'],
    prompt: 'in the manner of a Russian icon and chronicle miniature: golden ochre ground, stepped rocky hills, chambers in reverse perspective, cinnabar and green, border with small panels',
  },
  chinese: {
    tradition: 'тушь шань-шуй, свитки Сун',
    palette: ['#1e1e1e', '#3a3a3a', '#5a5a5a', '#7a7a7a', '#9a9a9a', '#bcbcb4', '#dcdcd4', '#f2efe6', '#b8302a', '#8a5a3a', '#4a5664', '#6a7a6a', '#a8a090', '#c9b896', '#3f5f8a', '#5a7a4a', '#9ab8c8'],
    outline: 'none',
    texture: 'ink',
    background: 'ink',
    frame: 'double',
    frameColors: ['#3a3a3a', '#b8302a', '#f2efe6'],
    prompt: 'in the manner of a Song dynasty ink landscape scroll: ink monochrome with one accent colour, layered mist, much empty space, red seal in the corner',
  },
  japanese: {
    tradition: 'свитки эмаки в стиле ямато-э, тушь суми-э',
    palette: ['#2a3a5a', '#3a5a8a', '#d8b040', '#e8c860', '#c0402a', '#3a6a4a', '#5a8a5a', '#efe6d2', '#d8ccb0', '#8a6a4a', '#3a3a42', '#1e1e24', '#a8a090', '#c9a860', '#e8a8b0', '#6a4a7a', '#88bbe7'],
    outline: 'black',
    texture: 'none',
    background: 'goldclouds',
    frame: 'clouds',
    frameColors: ['#d8b040', '#2a3a5a', '#efe6d2'],
    prompt: 'in the manner of a yamato-e emaki handscroll: view from above without roofs, golden cloud bands, flat mineral colours',
  },
  indian: {
    tradition: 'джайнские и западноиндийские рукописи XII–XV вв., храмовая роспись',
    palette: ['#b8302a', '#c84a2a', '#d8a830', '#e8c860', '#2a3a8a', '#3a5ab8', '#f2ead8', '#e6cfa8', '#2a1e18', '#3a7a4a', '#c08a50', '#8a4a2a', '#e0a030', '#d8a878', '#6a3a5a', '#f2c94c', '#88bbe7'],
    outline: 'black',
    texture: 'none',
    background: 'red',
    frame: 'flowers',
    frameColors: ['#b8302a', '#d8a830', '#2a3a8a'],
    prompt: 'in the manner of a Jain and western Indian manuscript painting: red ground, sharp outline, figures in three-quarter view with a large eye, gold and blue, floral border',
  },
  ethiopian: {
    tradition: 'церковная роспись, манускрипты на геэзе',
    palette: ['#c0302a', '#e0b030', '#2a7a3a', '#3a5a9a', '#f2eee2', '#1e1a18', '#a8664a', '#7f4a34', '#c09a6a', '#8a7a5a', '#b8a060', '#e8dcc0', '#5a3a2a', '#d87a3a', '#6a8a4a', '#2a2a4a', '#88bbe7'],
    outline: 'black',
    texture: 'none',
    background: 'bands',
    frame: 'stripes',
    frameColors: ['#c0302a', '#e0b030', '#2a7a3a'],
    prompt: 'in the manner of an Ethiopian church painting and Ge’ez manuscript: large almond eyes, bold outline, red, yellow and green, banded background',
  },
  sahel: {
    tradition: 'глиняная архитектура, ткань боголан, рукописи Тимбукту',
    palette: ['#b8865a', '#946a44', '#c0905e', '#a8784c', '#d8b07a', '#6a4a2a', '#3a2a1a', '#f2eee2', '#e0b030', '#c0503a', '#3a5a9a', '#2a2a4a', '#8a6a4a', '#e8d4b0', '#5a3a20', '#c49c68', '#88bbe7'],
    outline: 'none',
    texture: 'clay',
    background: 'sky',
    frame: 'bogolan',
    frameColors: ['#3a2a1a', '#e8d4b0', '#b8865a'],
    prompt: 'in the manner of Sahelian mud architecture and bogolan mud cloth: earth tones, clay texture, geometric bogolan border',
  },
  maya: {
    tradition: 'росписи Бонампака, расписная керамика',
    palette: ['#3a8aa8', '#5aa8c0', '#a83a2a', '#c0503a', '#e0b030', '#2a8a5a', '#1e1a18', '#f2ead8', '#d8d0b8', '#a8a088', '#7a6a4a', '#b89a5a', '#e0d4b0', '#4a8a4a', '#6a3a20', '#8a2a20', '#88bbe7'],
    outline: 'black',
    texture: 'none',
    background: 'red',
    frame: 'glyphs',
    frameColors: ['#1e1a18', '#3a8aa8', '#e0d4b0'],
    prompt: 'in the manner of the Bonampak murals and Maya painted ceramics: Maya blue and red ground, thick black outline, glyph frieze',
  },
  aztec: {
    tradition: 'кодексы (Борджиа, Мендоса)',
    palette: ['#c0303a', '#e0b030', '#2a8a8a', '#3a8a4a', '#2a6ab8', '#f2ead8', '#1e1a18', '#e6dcc4', '#c8bca0', '#9a8e74', '#b89a5a', '#6a3a20', '#e08a3a', '#8a4a8a', '#a8a07a', '#d8a878', '#88bbe7'],
    outline: 'black',
    texture: 'none',
    background: 'parchment',
    frame: 'daysigns',
    frameColors: ['#c0303a', '#2a8a8a', '#f2ead8'],
    prompt: 'in the manner of an Aztec codex (Borgia, Mendoza): bright flat colours, thick outline, figures as signs, border of day signs',
  },
  andean: {
    tradition: 'текстиль и керамика инков',
    palette: ['#b83a3a', '#8a2a2a', '#e0b030', '#c4a860', '#2a4a8a', '#f2ead8', '#1e1a18', '#a8a090', '#7f786a', '#9a9284', '#8a8a6a', '#4a2a2a', '#d87a3a', '#3a6a4a', '#c8b89a', '#6a5a4a', '#88bbe7'],
    outline: 'none',
    texture: 'weave',
    background: 'sky',
    frame: 'tocapu',
    frameColors: ['#b83a3a', '#e0b030', '#1e1a18'],
    prompt: 'in the manner of Inca textiles and ceramics: stepped geometric tocapu patterns, red-ochre palette, fitted stone masonry',
  },
}

/** Стиль края в этом году (с учётом смены традиции). */
export function artFor(style: string, year?: number): ArtStyle {
  const base = ART[style] ?? ART.roman
  const era = year !== undefined ? [...(base.artEras ?? [])].reverse().find((e) => year >= e.from) : undefined
  return era ? { ...base, ...era.style } : base
}

/** Сила стиля 0–1 (флаг art_strength). */
let strength = 0.5
export function setArtStrength(k: number): void {
  if (Number.isFinite(k)) strength = Math.max(0, Math.min(1, k))
}
export function artStrength(): number {
  return strength
}

// ---------- Цвета ----------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

/** Подтянуть цвет к ближайшему цвету палитры на долю k (кэш на палитру). */
export function paletteMapper(palette: string[], k: number): (c: string) => string {
  const pal = palette.map(rgb)
  const cache = new Map<string, string>()
  return (c) => {
    if (k <= 0 || c.length !== 7 || c[0] !== '#') return c
    let out = cache.get(c)
    if (out) return out
    const [r, g, b] = rgb(c)
    let best = pal[0]
    let bd = Infinity
    for (const p of pal) {
      // Взвешенное расстояние: глаз чувствительнее к зелёному.
      const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11
      if (d < bd) {
        bd = d
        best = p
      }
    }
    out = hex(r + (best[0] - r) * k, g + (best[1] - g) * k, b + (best[2] - b) * k)
    cache.set(c, out)
    return out
  }
}

// ---------- Фактура, контур, фон (по готовому слою) ----------

const OUTLINE_COLOR: Record<Outline, [number, number, number] | null> = { none: null, black: [30, 26, 24], brown: [74, 48, 32], gold: [200, 160, 60] }

/**
 * Фактура маской 4×4 по крупным плоскостям и контур силуэтов против неба.
 * data – пиксели слоя W×H; изменяется на месте.
 */
export function stylize(d: Uint8ClampedArray, w: number, h: number, art: ArtStyle, k: number): void {
  if (k <= 0) return
  const at = (x: number, y: number) => (y * w + x) * 4
  const same = (i: number, j: number) => d[i] === d[j] && d[i + 1] === d[j + 1] && d[i + 2] === d[j + 2] && d[j + 3] > 0
  const tone = (i: number, f: number) => {
    d[i] = Math.max(0, Math.min(255, d[i] * f))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * f))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * f))
  }
  const amp = 0.1 * k * 2
  if (art.texture !== 'none') {
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = at(x, y)
        if (!d[i + 3] || !same(i, at(x + 1, y)) || !same(i, at(x, y + 1))) continue
        const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
        switch (art.texture) {
          case 'mosaic':
            // Сетка тессер: швы через три точки, со сдвигом через ряд.
            if (y % 3 === 0 || (x + (Math.floor(y / 3) % 2) * 2) % 3 === 0) tone(i, 1 - amp * 0.8)
            break
          case 'hatch':
            if (l < 0.6 && (x + y) % 3 === 0) tone(i, 1 - amp * 1.4)
            break
          case 'ink': {
            const n = ((x * 73856093) ^ (Math.floor(y / 2) * 19349663)) >>> 0
            tone(i, 1 + ((n % 7) - 3) * amp * 0.12)
            break
          }
          case 'weave':
            if ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0) tone(i, 1 - amp * 0.5)
            break
          case 'clay':
            if (((x * 2654435761) ^ (y * 40503)) % 11 === 0) tone(i, 1 - amp)
            break
          case 'relief':
            if (y % 4 === 0) tone(i, 1 + amp * 0.6)
            else if (y % 4 === 1) tone(i, 1 - amp * 0.4)
            break
        }
      }
    }
  }
  const oc = OUTLINE_COLOR[art.outline]
  if (oc && k >= 0.25) {
    // Контур: прозрачная точка рядом с непрозрачной получает цвет контура (силуэты против неба).
    const mark: number[] = []
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = at(x, y)
        if (d[i + 3]) continue
        if (d[at(x - 1, y) + 3] || d[at(x + 1, y) + 3] || d[at(x, y + 1) + 3] || d[at(x, y - 1) + 3]) mark.push(i)
      }
    }
    for (const i of mark) {
      d[i] = oc[0]
      d[i + 1] = oc[1]
      d[i + 2] = oc[2]
      d[i + 3] = Math.round(255 * Math.min(1, k * 1.4))
    }
  }
}

/** Фон-традиция вместо неба (окна событий и экраны-главы). tint – цвет времени суток для ночи и заката. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, horizon: number, art: ArtStyle, tint: string | null): boolean {
  const bg = art.background
  if (bg === 'sky') return false
  const fill = (x: number, y: number, ww: number, hh: number, c: string) => {
    ctx.fillStyle = c
    ctx.fillRect(x, y, ww, hh)
  }
  const base: Record<Exclude<Background, 'sky'>, string> = {
    gold: '#d8b040',
    parchment: '#efe2c0',
    ink: '#f0eee6',
    red: '#b8302a',
    goldclouds: '#7aa8c8',
    terracotta: '#c46a3a',
    blue: '#2a4a9a',
    plaster: '#efe4c8',
    bands: '#e0b030',
  }
  fill(0, 0, w, horizon, base[bg])
  switch (bg) {
    case 'gold':
      // Золото с тессерами.
      for (let y = 0; y < horizon; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < w; x += 3) fill(x, y, 1, 1, '#c9a034')
      break
    case 'parchment':
      for (let i = 0; i < 160; i++) fill((i * 97) % w, (i * 53) % horizon, 3, 1, '#e2d2a8')
      break
    case 'ink':
      // Туман туши: размытые полосы гор.
      for (let band = 0; band < 3; band++) {
        const y0 = horizon - 30 + band * 8
        for (let x = 0; x < w; x++) {
          const hh = Math.round(6 + Math.sin(x / (18 + band * 7) + band) * 5)
          fill(x, y0 - hh, 1, hh, ['#d4d4cc', '#bcbcb4', '#a4a49c'][band])
        }
      }
      fill(w - 14, 6, 8, 8, '#b8302a')
      fill(w - 12, 8, 4, 4, '#e8d8c8')
      break
    case 'red':
      for (let y = 4; y < horizon; y += 12) fill(0, y, w, 1, '#a82a24')
      break
    case 'goldclouds':
      // Золотые полосы облаков.
      for (const [y, x0, len] of [[8, 10, 120], [22, 150, 150], [36, 40, 110]]) {
        fill(x0, y, len, 5, '#d8b040')
        fill(x0 + 4, y - 1, len - 8, 1, '#e8c860')
        fill(x0 + 6, y + 5, len - 12, 1, '#c9a034')
      }
      break
    case 'terracotta':
      for (let x = 0; x < w; x += 6) fill(x, horizon - 4, 4, 2, '#1e1a18')
      break
    case 'blue':
      // Глазурованные кирпичи.
      for (let y = 0; y < horizon; y += 4) {
        fill(0, y, w, 1, '#1e3a7a')
        for (let x = (y / 4) % 2 ? 4 : 0; x < w; x += 8) fill(x, y, 1, 4, '#1e3a7a')
      }
      for (let x = 12; x < w; x += 40) {
        fill(x, 10, 5, 5, '#e0b030')
        fill(x + 2, 9, 1, 7, '#e0b030')
        fill(x - 1, 12, 7, 1, '#e0b030')
      }
      break
    case 'plaster':
      for (let y = 6; y < horizon; y += 14) fill(0, y, w, 1, '#d9a441')
      break
    case 'bands': {
      // Полосы фона росписи – приглушённые, с тёмной нитью между ними.
      const cols = ['#d07a5a', '#e8c870', '#7aa070']
      const hh = Math.ceil(horizon / 6)
      for (let i = 0; i < 6; i++) {
        fill(0, i * hh, w, hh, cols[i % 3])
        fill(0, i * hh, w, 1, '#8a5a3a')
      }
      break
    }
  }
  if (tint) {
    ctx.globalAlpha = 0.45
    fill(0, 0, w, horizon, tint)
    ctx.globalAlpha = 1
  }
  return true
}

// ---------- Рамка-орнамент ----------

const FRAME_CACHE = new Map<string, string>()

/**
 * Пиксельная рамка края для CSS border-image: плитка 18×18, угол и сторона по 6 точек.
 * Возвращает data: URL (1–3 КБ) или '' вне браузера.
 */
export function frameImage(style: string, year?: number): string {
  if (typeof document === 'undefined') return ''
  const art = artFor(style, year)
  const key = `${style}:${art.frame}:${art.frameColors.join()}`
  const hit = FRAME_CACHE.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 18
  c.height = 18
  const ctx = c.getContext('2d')!
  const [a, b, bg] = art.frameColors
  const f = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col
    ctx.fillRect(x, y, w, h)
  }
  f(0, 0, 18, 18, bg)
  // Узор рисуется по полосе 6 точек вдоль каждого края: сначала верхняя, потом поворотом остальные.
  const strip = (draw: (p: (x: number, y: number, w: number, h: number, col: string) => void) => void) => {
    for (let side = 0; side < 4; side++) {
      ctx.save()
      ctx.translate(9, 9)
      ctx.rotate((side * Math.PI) / 2)
      ctx.translate(-9, -9)
      draw(f)
      ctx.restore()
    }
  }
  switch (art.frame) {
    case 'meander':
      strip((p) => {
        p(0, 0, 18, 1, a)
        p(0, 5, 18, 1, a)
        for (let x = 0; x < 18; x += 6) {
          p(x + 1, 1, 1, 3, a)
          p(x + 1, 1, 3, 1, a)
          p(x + 3, 1, 1, 2, a)
          p(x + 4, 3, 1, 2, a)
        }
      })
      break
    case 'palmette':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 1; x < 18; x += 6) {
          p(x + 1, 1, 1, 4, b)
          p(x, 2, 3, 1, b)
          p(x + 3, 3, 1, 2, b)
        }
      })
      break
    case 'frieze':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 0; x < 18; x += 3) p(x + 1, 1, 1, 4, x % 6 ? b : bg)
        p(0, 5, 18, 1, b)
      })
      break
    case 'rosette':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 1; x < 18; x += 6) {
          p(x + 1, 1, 2, 4, b)
          p(x, 2, 4, 2, b)
          p(x + 1, 2, 2, 2, bg)
        }
      })
      break
    case 'tesserae':
      strip((p) => {
        p(0, 0, 18, 6, b)
        for (let x = 0; x < 18; x += 2) p(x, (x / 2) % 2 ? 1 : 3, 1, 1, a)
        p(0, 0, 18, 1, a)
        p(0, 5, 18, 1, a)
      })
      break
    case 'arabesque':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 0; x < 18; x += 6) {
          p(x + 1, 2, 4, 1, b)
          p(x + 2, 1, 2, 1, b)
          p(x + 2, 3, 2, 2, b)
        }
      })
      break
    case 'vine':
      strip((p) => {
        p(0, 0, 18, 1, a)
        for (let x = 0; x < 18; x++) p(x, 3 + Math.round(Math.sin(x / 1.6) * 1.4), 1, 1, '#4a7a3a')
        for (let x = 2; x < 18; x += 6) p(x, 1, 2, 2, b)
      })
      break
    case 'marks':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 1; x < 18; x += 6) p(x, 1, 4, 4, b)
        for (let x = 2; x < 18; x += 6) p(x, 2, 2, 2, bg)
      })
      break
    case 'double':
      strip((p) => {
        p(0, 1, 18, 1, a)
        p(0, 4, 18, 1, a)
      })
      f(12, 12, 5, 5, b)
      break
    case 'clouds':
      strip((p) => {
        p(0, 0, 18, 6, b)
        p(1, 2, 7, 2, a)
        p(2, 1, 5, 1, a)
        p(10, 3, 7, 2, a)
        p(11, 2, 5, 1, a)
      })
      break
    case 'flowers':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 1; x < 18; x += 6) {
          p(x + 1, 1, 2, 4, b)
          p(x, 2, 4, 2, b)
          p(x + 1, 2, 2, 2, '#2a3a8a')
        }
      })
      break
    case 'stripes':
      strip((p) => {
        p(0, 0, 18, 2, a)
        p(0, 2, 18, 2, b)
        p(0, 4, 18, 2, bg)
      })
      break
    case 'bogolan':
      strip((p) => {
        p(0, 0, 18, 6, a)
        for (let x = 0; x < 18; x += 4) {
          p(x, 1, 2, 1, b)
          p(x + 2, 3, 1, 2, b)
        }
      })
      break
    case 'glyphs':
      strip((p) => {
        p(0, 0, 18, 6, b)
        for (let x = 1; x < 18; x += 6) {
          p(x, 1, 4, 4, a)
          p(x + 1, 2, 2, 1, bg)
          p(x + 1, 3, 1, 1, bg)
        }
      })
      break
    case 'daysigns':
      strip((p) => {
        p(0, 0, 18, 6, bg)
        for (let x = 0; x < 18; x += 6) {
          p(x, 0, 6, 6, a)
          p(x + 1, 1, 4, 4, bg)
          p(x + 2, 2, 2, 2, b)
        }
      })
      break
    case 'tocapu':
      strip((p) => {
        p(0, 0, 18, 6, bg)
        for (let x = 0; x < 18; x += 6) {
          p(x, 0, 3, 3, a)
          p(x + 3, 3, 3, 3, a)
          p(x + 3, 0, 3, 3, b)
          p(x, 3, 3, 3, b)
        }
      })
      break
  }
  const url = c.toDataURL('image/png')
  FRAME_CACHE.set(key, url)
  return url
}
