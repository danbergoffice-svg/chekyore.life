// Вырезка живописного портрета по силуэту (надгробие, 19.11; переделано 20.11 после «призрака» - светлая одежда на
// светлом фоне уходила в фон, оставались голова и пятна). У картин 256×320 нет прозрачности, фон - ровный тон бумаги,
// стены или холста. Порядок:
//  1. Тон фона - медиана верхней строки и верхней половины боковых краёв.
//  2. Заливка от верхнего и боковых краёв: пиксель - фон, если близок к соседнему фону, не далёк от тона фона и не
//     лежит на контуре рисунка (перепад яркости) - контур держит заливку, даже если одежда того же цвета, что фон.
//  3. Фигура - самый крупный связный кусок не-фона; обрывки и пятна краски - в фон.
//  0. Тёмный фон (готические масляные портреты) - сразу мягкая рамка: тёмная одежда сливается с ним.
//  4. Проверка: фигура высокая и цельная (самый крупный кусок - почти весь не-фон). Иначе вырезка не удалась - запасной вариант: мягкая
//     овальная рамка без вырезки (лучше фон по краям, чем «призрак» из обрывков).

export interface CutoutResult {
  /** Вырезка удалась (иначе - мягкая рамка). */
  ok: boolean
  /** Доля кадра, которую заняла фигура. */
  fg: number
}

const STEP = 14
const SPREAD = 58
const EDGE = 46

/** Убрать фон: альфа фона - 0, край фигуры - полупрозрачный. Меняет data на месте. */
export function cutoutPainted(d: Uint8ClampedArray, w: number, h: number): CutoutResult {
  const n = w * h
  const at = (k: number) => k * 4
  const lum = new Float32Array(n)
  for (let k = 0; k < n; k++) lum[k] = 0.299 * d[at(k)] + 0.587 * d[at(k) + 1] + 0.114 * d[at(k) + 2]
  // Контуры: перепад яркости (Собель) - заливка через них не идёт.
  const edge = new Float32Array(n)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x
      const gx = lum[k - w + 1] + 2 * lum[k + 1] + lum[k + w + 1] - lum[k - w - 1] - 2 * lum[k - 1] - lum[k + w - 1]
      const gy = lum[k + w - 1] + 2 * lum[k + w] + lum[k + w + 1] - lum[k - w - 1] - 2 * lum[k - w] - lum[k - w + 1]
      edge[k] = Math.hypot(gx, gy) / 4
    }
  // Тон фона.
  const samples: number[][] = []
  for (let x = 0; x < w; x += 2) samples.push([d[at(x)], d[at(x) + 1], d[at(x) + 2]])
  for (let y = 0; y < h / 2; y += 2) for (const x of [0, w - 1]) samples.push([d[at(y * w + x)], d[at(y * w + x) + 1], d[at(y * w + x) + 2]])
  const med = [0, 1, 2].map((c) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1])
  // Тёмный фон (масляные портреты в полутьме): тёмная одежда сливается с ним, вырезка теряет тело - сразу мягкая рамка.
  if (0.299 * med[0] + 0.587 * med[1] + 0.114 * med[2] < 100) {
    vignette(d, w, h)
    return { ok: false, fg: 0 }
  }
  const distTo = (k: number, r: number, g: number, b: number) => Math.hypot(d[at(k)] - r, d[at(k) + 1] - g, d[at(k) + 2] - b)
  const toBg = (k: number) => distTo(k, med[0], med[1], med[2])

  const bg = new Uint8Array(n)
  const stack: number[] = []
  const seed = (k: number) => {
    if (!bg[k] && toBg(k) < SPREAD && edge[k] < EDGE) {
      bg[k] = 1
      stack.push(k)
    }
  }
  for (let x = 0; x < w; x++) seed(x)
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  while (stack.length) {
    const k = stack.pop()!
    const x = k % w
    const y = (k / w) | 0
    for (const m of [x + 1 < w ? k + 1 : -1, x > 0 ? k - 1 : -1, y + 1 < h ? k + w : -1, y > 0 ? k - w : -1]) {
      if (m < 0 || bg[m]) continue
      if (edge[m] >= EDGE || toBg(m) >= SPREAD * 1.5) continue
      if (distTo(m, d[at(k)], d[at(k) + 1], d[at(k) + 2]) >= STEP) continue
      bg[m] = 1
      stack.push(m)
    }
  }
  // Самый крупный связный кусок фигуры.
  const comp = new Int32Array(n).fill(-1)
  let best = -1
  let bestSize = 0
  let id = 0
  for (let s = 0; s < n; s++) {
    if (bg[s] || comp[s] >= 0) continue
    let size = 0
    stack.push(s)
    comp[s] = id
    while (stack.length) {
      const k = stack.pop()!
      size++
      const x = k % w
      const y = (k / w) | 0
      for (const m of [x + 1 < w ? k + 1 : -1, x > 0 ? k - 1 : -1, y + 1 < h ? k + w : -1, y > 0 ? k - w : -1]) {
        if (m < 0 || bg[m] || comp[m] >= 0) continue
        comp[m] = id
        stack.push(m)
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = id
    }
    id++
  }
  let top = h
  let bottom = 0
  for (let k = 0; k < n; k++)
    if (comp[k] === best) {
      const y = (k / w) | 0
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  const fg = bestSize / n
  let nonBg = 0
  for (let k = 0; k < n; k++) if (!bg[k]) nonBg++
  // Удалась: фигура высокая (бюст или в полный рост) и цельная - не рассыпалась на голову и обрывки одежды.
  const ok = fg >= 0.025 && bottom - top >= h * 0.45 && bestSize / Math.max(1, nonBg) >= 0.85
  if (!ok) {
    vignette(d, w, h)
    return { ok, fg }
  }
  for (let k = 0; k < n; k++) {
    if (comp[k] !== best) {
      d[at(k) + 3] = 0
      continue
    }
    // Край фигуры - полупрозрачный.
    const x = k % w
    const y = (k / w) | 0
    let around = 0
    for (const m of [x + 1 < w ? k + 1 : -1, x > 0 ? k - 1 : -1, y + 1 < h ? k + w : -1, y > 0 ? k - w : -1]) if (m < 0 || comp[m] !== best) around++
    if (around) d[at(k) + 3] = Math.min(d[at(k) + 3], around >= 2 ? 110 : 170)
  }
  return { ok, fg }
}

/** Запасной вариант: мягкая овальная рамка - фон тает к краям, фигура в середине остаётся целой. */
function vignette(d: Uint8ClampedArray, w: number, h: number): void {
  const cx = w / 2
  const cy = h * 0.46
  const rx = w * 0.5
  const ry = h * 0.56
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot((x - cx) / rx, (y - cy) / ry)
      const a = r < 0.72 ? 1 : r > 1 ? 0 : 1 - (r - 0.72) / 0.28
      const i = (y * w + x) * 4 + 3
      d[i] = Math.round(d[i] * a)
    }
}
