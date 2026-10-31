// Животные двора в полном разрешении (ТЗ графики, G4 – кодом): куры, индейки, коза, овца, свинья, корова, вол,
// осёл, лошадь, верблюд, лама, пёс, кошка. Два кадра: 0 – стоит, 1 – шагнул (у пасущихся голова опущена,
// у пса виляет хвост). x – левый край, base – строка копыт, k – затемнение по времени суток.

export type Px = (x: number, y: number, w: number, h: number, c: string) => void

function sh(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

/** Можно ли нарисовать это животное здесь (остальных рисует прежний код). */
export const NATIVE_ANIMALS = ['chickens', 'turkey', 'goat', 'sheep', 'pig', 'cow', 'ox', 'donkey', 'horse', 'camel', 'llama', 'dog', 'cat']

/** Ширина в точках холста – чтобы расставить животных без наложения. */
export function animalWidth(kind: string): number {
  return ({ chickens: 14, turkey: 14, goat: 13, sheep: 13, pig: 13, cow: 21, ox: 21, donkey: 17, horse: 23, camel: 24, llama: 15, dog: 12, cat: 11 } as Record<string, number>)[kind] ?? 12
}

export function drawAnimal(px: Px, kind: string, x: number, base: number, k: number, frame = 0): void {
  const c = (h: string, d = 0) => sh(h, k * 0.6 + d)
  const step = frame === 1
  /** Четыре ноги: задние и передние пары, на шаге передняя пара сдвигается. */
  const legs = (xs: number[], h: number, col: string) =>
    xs.forEach((lx, i) => px(x + lx + (step && i >= 2 ? (i === 2 ? 1 : -1) : 0), base - h + 1, 1, h, c(col)))
  switch (kind) {
    case 'chickens':
    case 'turkey': {
      const body = kind === 'turkey' ? ['#4a3a2a', '#5a4030'] : ['#f2ead8', '#c9a060']
      ;[0, 8].forEach((dx, i) => {
        const peck = step && i === 0
        const bx = x + dx
        px(bx, base - 4, 5, 3, c(body[i]))
        px(bx + 1, base - 5, 3, 1, c(body[i]))
        px(bx - 1, base - 5, 1, 2, c(body[i], -0.15))
        // Голова: клюёт на шаге.
        const hy = peck ? base - 3 : base - 6
        px(bx + 4, hy, 2, 2, c(body[i]))
        px(bx + 6, hy + 1, 1, 1, c('#d8a040'))
        px(bx + 4, hy - 1, 1, 1, c(kind === 'turkey' ? '#c0303a' : '#d83a2a'))
        px(bx + 2, base - 1, 1, 2, c('#d8a040'))
      })
      return
    }
    case 'goat':
    case 'sheep': {
      const col = kind === 'sheep' ? '#efe9dc' : '#d8ccb4'
      px(x, base - 7, 11, 4, c(col))
      px(x + 1, base - 8, 9, 1, c(col))
      if (kind === 'sheep') for (let i = 0; i < 5; i++) px(x + 1 + i * 2, base - 8 + (i % 2), 1, 1, c(col, -0.08))
      const head = kind === 'sheep' ? '#3a3028' : col
      const hy = step ? base - 6 : base - 10
      px(x + 10, hy, 3, 3, c(head))
      if (kind === 'goat') {
        px(x + 11, hy - 2, 1, 2, c('#6a5a4a'))
        px(x + 12, hy + 3, 1, 2, c(col, -0.1))
      }
      px(x - 1, base - 7, 1, 2, c(col, -0.1))
      legs([1, 3, 8, 10], 3, '#4a3a2a')
      return
    }
    case 'pig':
      px(x, base - 7, 11, 5, c('#e0a8a0'))
      px(x + 1, base - 8, 9, 1, c('#e0a8a0'))
      px(x + 11, step ? base - 5 : base - 6, 2, 3, c('#d09088'))
      px(x + 9, base - 9, 1, 1, c('#c88880'))
      px(x - 1, base - 7, 1, 1, c('#c88880'))
      legs([1, 3, 7, 9], 2, '#a87870')
      return
    case 'cow':
    case 'ox': {
      const col = kind === 'cow' ? '#f2ead8' : '#8a5a3a'
      px(x, base - 12, 17, 7, c(col))
      px(x + 1, base - 13, 15, 1, c(col))
      if (kind === 'cow') {
        px(x + 3, base - 11, 4, 3, c('#3a2a20'))
        px(x + 10, base - 10, 3, 3, c('#3a2a20'))
        px(x + 7, base - 6, 3, 1, c('#e8b0a8'))
      }
      // Голова: на шаге опущена к траве.
      const hy = step ? base - 8 : base - 14
      px(x + 16, hy, 4, 5, c(col))
      px(x + 19, hy + 3, 1, 2, c('#3a2a20', 0.2))
      px(x + 16, hy - 1, 1, 1, c('#e8dcc0'))
      px(x + 19, hy - 1, 1, 1, c('#e8dcc0'))
      px(x - 1, base - 12, 1, 6, c(col, -0.1))
      legs([1, 4, 12, 15], 5, '#3a2a20')
      return
    }
    case 'donkey':
      px(x, base - 11, 13, 5, c('#8a8680'))
      px(x + 12, step ? base - 9 : base - 15, 3, 5, c('#8a8680'))
      px(x + 13, step ? base - 11 : base - 18, 1, 3, c('#6a6660'))
      px(x + 1, base - 9, 11, 1, c('#a8a49e'))
      px(x - 1, base - 11, 1, 4, c('#5a5650'))
      legs([1, 3, 9, 11], 5, '#4a4640')
      return
    case 'horse':
      px(x, base - 14, 18, 7, c('#7a4a2a'))
      px(x + 16, step ? base - 12 : base - 19, 4, 7, c('#7a4a2a'))
      px(x + 19, step ? base - 7 : base - 15, 2, 3, c('#7a4a2a'))
      px(x + 15, step ? base - 13 : base - 20, 2, 6, c('#3a2418'))
      px(x - 2, base - 14, 2, 7, c('#3a2418'))
      legs([1, 4, 13, 16], 7, '#4a2a1a')
      return
    case 'camel':
      px(x, base - 15, 18, 6, c('#c8a068'))
      px(x + 4, base - 20, 8, 5, c('#c8a068'))
      px(x + 5, base - 21, 6, 1, c('#c8a068'))
      px(x + 17, step ? base - 16 : base - 22, 3, 9, c('#c8a068'))
      px(x + 18, step ? base - 17 : base - 24, 5, 3, c('#c8a068'))
      legs([1, 4, 13, 16], 9, '#8a6a40')
      return
    case 'llama':
      px(x, base - 12, 12, 6, c('#efe2c8'))
      px(x + 11, step ? base - 17 : base - 22, 3, 11, c('#efe2c8'))
      px(x + 12, step ? base - 18 : base - 23, 3, 2, c('#efe2c8'))
      px(x + 12, step ? base - 20 : base - 25, 1, 2, c('#efe2c8'))
      px(x + 2, base - 11, 8, 2, c('#c0303a'))
      legs([1, 3, 8, 10], 6, '#8a7a60')
      return
    case 'dog':
      px(x, base - 6, 9, 3, c('#9a6a3a'))
      px(x + 8, base - 9, 4, 4, c('#9a6a3a'))
      px(x + 11, base - 7, 2, 2, c('#7a4a2a'))
      px(x + 8, base - 10, 1, 1, c('#7a4a2a'))
      // Хвост виляет.
      px(x - 1, step ? base - 9 : base - 8, 1, 3, c('#9a6a3a'))
      legs([0, 2, 6, 8], 3, '#6a4a2a')
      return
    case 'cat':
      px(x, base - 5, 7, 3, c('#5a5a5a'))
      px(x + 6, base - 8, 4, 3, c('#5a5a5a'))
      px(x + 6, base - 9, 1, 1, c('#5a5a5a'))
      px(x + 9, base - 9, 1, 1, c('#5a5a5a'))
      px(x + 7, base - 7, 1, 1, c('#c8d84a'))
      px(x - 1, step ? base - 10 : base - 9, 1, 5, c('#5a5a5a'))
      legs([0, 2, 4, 6], 2, '#4a4a4a')
      return
  }
}
