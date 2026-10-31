// Прорисовка домов в полном разрешении (ТЗ графики, G4 - кодом, без художника): поверх силуэта дома,
// нарисованного в сетке 192×60, добавляются фактура стен по стилю края (брёвна с торцами, фахверк с раскосами,
// сырцовый кирпич, штукатурка с цоколем, деревянные стойки, каменная кладка, плетень), черепица, тёс и солома
// на крыше, тень под стрехой, рамы, переплёты и подоконники окон (на Руси - белые наличники), доски и ручки дверей.
// Работает по пикселям готового слоя: трогает только точки цвета стены и цвета крыши.

export interface HouseRec {
  x: number
  w: number
  h: number
  roof: 'tile' | 'shingle' | 'thatch' | 'flat'
  style: string
}

export interface Opening {
  x: number
  y: number
  w: number
  h: number
  kind: 'window' | 'door'
  style: string
}

type Rgb = [number, number, number]

export function detailHouses(img: ImageData, houses: HouseRec[], openings: Opening[], S: number, groundY: number): void {
  const { width: W, height: H, data: d } = img
  const at = (x: number, y: number) => (y * W + x) * 4
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
  const get = (x: number, y: number): Rgb | null => {
    if (!inside(x, y)) return null
    const i = at(x, y)
    return d[i + 3] ? [d[i], d[i + 1], d[i + 2]] : null
  }
  const same = (a: Rgb | null, b: Rgb | null, tol = 6) => !!a && !!b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol
  const tone = (x: number, y: number, f: number) => {
    if (!inside(x, y)) return
    const i = at(x, y)
    if (!d[i + 3]) return
    d[i] = Math.max(0, Math.min(255, d[i] * f))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * f))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * f))
  }
  const set = (x: number, y: number, c: Rgb) => {
    if (!inside(x, y)) return
    const i = at(x, y)
    d[i] = c[0]
    d[i + 1] = c[1]
    d[i + 2] = c[2]
    d[i + 3] = 255
  }
  const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 97

  for (const hs of houses) {
    const X0 = Math.round(hs.x * S)
    const X1 = Math.round((hs.x + hs.w) * S)
    const top = Math.round((groundY / S - hs.h) * S)
    const base = groundY
    // Цвет стены - у левого верхнего угла стены, цвет крыши - над серединой стены.
    const wall = get(X0 + 1, top + 3)
    const roof = get(Math.round((X0 + X1) / 2), top - 2)
    if (!wall) continue
    const isWall = (x: number, y: number) => same(get(x, y), wall)
    // Фактура стен.
    for (let y = top; y < base; y++) {
      for (let x = X0; x < X1; x++) {
        if (!isWall(x, y)) continue
        const ry = y - top
        const rx = x - X0
        switch (hs.style) {
          case 'russian':
            // Торцы брёвен по углам.
            if ((rx < 2 || rx >= X1 - X0 - 2) && ry % 3 === 1) tone(x, y, 1.18)
            break
          case 'gothic':
            break
          case 'egyptian':
          case 'mesopotamian':
          case 'sahel':
            // Сырцовый кирпич: ряды и швы вразбежку.
            if (ry % 4 === 3 || (rx + (Math.floor(ry / 4) % 2) * 3) % 6 === 0) tone(x, y, 0.93)
            break
          case 'andean':
            // Пригнанная кладка: неровные швы.
            if (ry % 5 === 4 || (rx + Math.floor(ry / 5) * 4) % 7 === 0) tone(x, y, 0.88)
            break
          case 'ethiopian':
            // Плетень и обмазка.
            if (rx % 3 === 0) tone(x, y, 0.92)
            break
          case 'chinese':
          case 'japanese':
            break
          default:
            // Штукатурка: редкие пятна и трещинки.
            if (hash(x, y) === 0) tone(x, y, 0.9)
        }
      }
    }
    const width = X1 - X0
    const wallDark: Rgb = [wall[0] * 0.55, wall[1] * 0.55, wall[2] * 0.55]
    if (hs.style === 'gothic') {
      // Раскосы фахверка в крайних панелях.
      const beam: Rgb = [90 * 0.9, 58 * 0.9, 36 * 0.9]
      const hh = base - top
      for (let i = 0; i < Math.min(hh - 2, 10); i++) {
        if (isWall(X0 + 2 + i, base - 2 - i)) set(X0 + 2 + i, base - 2 - i, beam)
        if (isWall(X1 - 3 - i, base - 2 - i)) set(X1 - 3 - i, base - 2 - i, beam)
      }
    }
    if (hs.style === 'chinese' || hs.style === 'japanese') {
      // Деревянные стойки по углам.
      for (let y = top; y < base; y++) {
        for (const x of [X0, X0 + 1, X1 - 2, X1 - 1]) if (isWall(x, y)) set(x, y, [74, 50, 34])
      }
    }
    if (['roman', 'greek', 'byzantine', 'islamic', 'indian', 'chinese', 'japanese', 'maya', 'aztec'].includes(hs.style)) {
      // Цоколь: две нижние строки темнее.
      for (let x = X0; x < X1; x++) for (const y of [base - 1, base - 2]) if (isWall(x, y)) tone(x, y, 0.82)
    }
    // Тень под стрехой.
    if (hs.roof !== 'flat') for (let x = X0; x < X1; x++) for (const [y, f] of [[top, 0.7], [top + 1, 0.85]] as const) if (isWall(x, y)) tone(x, y, f)
    else for (let x = X0 - 1; x <= X1; x++) tone(x, top - 1, 1.15)
    // Крыша: черепица, тёс или солома.
    if (roof && !same(roof, wall)) {
      for (let y = Math.max(0, top - 40); y < top; y++) {
        for (let x = X0 - 8; x < X1 + 8; x++) {
          if (!same(get(x, y), roof, 4)) continue
          if (hs.roof === 'tile') {
            if (y % 2 === 0) tone(x, y, 0.86)
            else if ((x + (y % 4 === 1 ? 2 : 0)) % 4 === 0) tone(x, y, 0.92)
          } else if (hs.roof === 'shingle') {
            if (y % 3 === 0) tone(x, y, 0.82)
            else if (x % 5 === y % 5) tone(x, y, 0.92)
          } else if (hs.roof === 'thatch') {
            tone(x, y, x % 2 ? 1.07 : 0.93)
            if (hash(x, y) < 6) tone(x, y, 0.85)
          }
        }
      }
    }
    void width
    void wallDark
  }

  // Окна и двери.
  for (const o of openings) {
    if (o.kind === 'window') {
      const frame: Rgb = o.style === 'russian' ? [232, 222, 196] : o.style === 'gothic' ? [74, 58, 40] : [90, 64, 44]
      // Рама вокруг проёма и подоконник.
      for (let x = o.x - 1; x <= o.x + o.w; x++) {
        set(x, o.y - 1, frame)
        set(x, o.y + o.h, frame)
      }
      for (let y = o.y; y < o.y + o.h; y++) {
        set(o.x - 1, y, frame)
        set(o.x + o.w, y, frame)
      }
      if (o.style === 'russian') {
        // Резной наличник: «кокошник» над окном.
        for (let x = o.x - 1; x <= o.x + o.w; x++) if ((x - o.x) % 2 === 0) set(x, o.y - 2, frame)
        set(o.x + Math.floor(o.w / 2), o.y - 3, frame)
      }
      if (o.w >= 4 && o.h >= 4) {
        // Переплёт.
        const mx = o.x + Math.floor(o.w / 2)
        const my = o.y + Math.floor(o.h / 2)
        for (let y = o.y; y < o.y + o.h; y++) set(mx, y, frame)
        for (let x = o.x; x < o.x + o.w; x++) set(x, my, frame)
      }
      for (let x = o.x - 1; x <= o.x + o.w; x++) tone(x, o.y + o.h + 1, 0.8)
    } else {
      // Дверь: доски, ручка, светлая притолока.
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x + 1; x < o.x + o.w; x += 2) tone(x, y, 0.8)
      set(o.x + o.w - 2, o.y + Math.floor(o.h / 2), [200, 168, 90])
      for (let x = o.x - 1; x <= o.x + o.w; x++) tone(x, o.y - 1, 1.2)
    }
  }
}
