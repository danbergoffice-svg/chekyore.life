// Вырезка живописного портрета по силуэту (надгробие, 19.11): у картин 256×320 нет прозрачности, фон - ровный
// тон бумаги, стены или холста (местами с виньеткой). Заливка от верхнего и боковых краёв: пиксель - фон, если он
// близок к соседнему фону (плавный градиент) и не слишком далёк от общего тона фона (не утекает в одежду того же
// цвета через мягкий край). Низ не заливается - там фигура срезана рамкой. Край фигуры смягчается на пиксель.

/** Убрать фон: альфа фоновых пикселей - 0, край фигуры - полупрозрачный. Меняет data на месте. */
export function cutoutPainted(d: Uint8ClampedArray, w: number, h: number, step = 20, spread = 70): void {
  const at = (x: number, y: number) => (y * w + x) * 4
  // Общий тон фона: медиана по верхней строке и верхней половине боковых краёв.
  const samples: number[][] = []
  for (let x = 0; x < w; x += 2) samples.push([d[at(x, 0)], d[at(x, 0) + 1], d[at(x, 0) + 2]])
  for (let y = 0; y < h / 2; y += 2) for (const x of [0, w - 1]) samples.push([d[at(x, y)], d[at(x, y) + 1], d[at(x, y) + 2]])
  const med = [0, 1, 2].map((c) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1])
  const dist = (i: number, r: number, g: number, b: number) => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b)

  const bg = new Uint8Array(w * h)
  const stack: number[] = []
  const seed = (x: number, y: number) => {
    const k = y * w + x
    if (!bg[k] && dist(k * 4, med[0], med[1], med[2]) < spread) {
      bg[k] = 1
      stack.push(k)
    }
  }
  for (let x = 0; x < w; x++) seed(x, 0)
  for (let y = 0; y < h; y++) {
    seed(0, y)
    seed(w - 1, y)
  }
  while (stack.length) {
    const k = stack.pop()!
    const x = k % w
    const y = (k / w) | 0
    const i = k * 4
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = ny * w + nx
      if (bg[n]) continue
      const j = n * 4
      if (dist(j, d[i], d[i + 1], d[i + 2]) < step && dist(j, med[0], med[1], med[2]) < spread * 1.6) {
        bg[n] = 1
        stack.push(n)
      }
    }
  }
  // Одиночные «островки» фигуры среди фона (пятна краски) - тоже фон; край фигуры - полупрозрачный.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (bg[k]) {
        d[k * 4 + 3] = 0
        continue
      }
      let around = 0
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) around++
      if (around >= 3) d[k * 4 + 3] = 0
      else if (around) d[k * 4 + 3] = Math.min(d[k * 4 + 3], 140)
    }
}
