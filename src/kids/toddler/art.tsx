// Картинки для ранних игр (2–4 года): плоский вектор в стиле досок головоломок - заливка, обводка темнее в тон, блик.
// Каждая вещь рисуется в поле -50…50 и ставится через <Thing kind x y size>.
import type { JSX } from 'preact'

export type ThingKind =
  | 'date' | 'berry' | 'apple' | 'shell' | 'flower' | 'bean' | 'egg' | 'stone' | 'fish' | 'star' | 'leaf'
  | 'cat' | 'chick' | 'pup' | 'goat' | 'llama' | 'goose' | 'house' | 'bush' | 'basket' | 'pot' | 'drum'

/** Цвет темнее (k < 1) или светлее (k > 1) - для обводки и блика в тон. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Цвет вещи по умолчанию (если обёртка страны не задала свой). */
export const THING_COLOR: Record<ThingKind, string> = {
  date: '#8a4b26', berry: '#b53a4a', apple: '#c9442e', shell: '#e9c9a8', flower: '#e88a3a', bean: '#9b3b2a',
  egg: '#f1e4c9', stone: '#9c958a', fish: '#7fa3c4', star: '#ecd06f', leaf: '#6e9a3e', cat: '#d9a35a',
  chick: '#f2d25a', pup: '#d8c09a', goat: '#e8dcc6', llama: '#f0e6d2', goose: '#f3eee2', house: '#d9b98a',
  bush: '#5f8a3a', basket: '#c9a063', pot: '#b8693e', drum: '#a8573a',
}

const GREEN = '#5f8a3a'
const EYE = '#2b2119'
const BEAK = '#e5813a'

function draw(kind: ThingKind, c: string): JSX.Element {
  const line = shade(c, 0.62)
  const hi = shade(c, 1.45)
  const st = { stroke: line, 'stroke-width': 3, 'stroke-linejoin': 'round' as const }
  switch (kind) {
    case 'date':
      return (
        <g>
          <ellipse cx="0" cy="4" rx="20" ry="32" transform="rotate(-18)" fill={c} {...st} />
          <ellipse cx="-8" cy="-8" rx="5" ry="11" transform="rotate(-18)" fill={hi} opacity="0.7" />
          <path d="M8 -30 q6 -8 12 -10" stroke={GREEN} stroke-width="4" fill="none" stroke-linecap="round" />
        </g>
      )
    case 'berry':
      return (
        <g>
          <circle cx="0" cy="6" r="30" fill={c} {...st} />
          <circle cx="-10" cy="-4" r="7" fill={hi} opacity="0.65" />
          <path d="M0 -24 q-14 -16 -24 -10 q10 10 24 10z" fill={GREEN} stroke={shade(GREEN, 0.7)} stroke-width="2" />
        </g>
      )
    case 'apple':
      return (
        <g>
          <path d="M0 -20 C-34 -36 -48 4 -26 30 C-14 44 -4 40 0 36 C4 40 14 44 26 30 C48 4 34 -36 0 -20z" fill={c} {...st} />
          <ellipse cx="-16" cy="-6" rx="6" ry="10" fill={hi} opacity="0.6" />
          <path d="M0 -20 q2 -14 8 -20" stroke="#6b4a2a" stroke-width="4" fill="none" stroke-linecap="round" />
          <path d="M6 -32 q16 -10 22 2 q-14 6 -22 -2z" fill={GREEN} />
        </g>
      )
    case 'shell':
      return (
        <g>
          <path d="M-36 14 A38 38 0 0 1 36 14 L8 30 L-8 30 Z" fill={c} {...st} />
          {[-24, -12, 0, 12, 24].map((x) => (
            <path d={`M${x * 0.3} 28 L${x} -16`} stroke={line} stroke-width="2.5" opacity="0.7" />
          ))}
          <rect x="-10" y="28" width="20" height="10" rx="3" fill={shade(c, 0.85)} stroke={line} stroke-width="2.5" />
        </g>
      )
    case 'flower':
      return (
        <g>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse cx="0" cy="-22" rx="14" ry="20" transform={`rotate(${a})`} fill={c} {...st} />
          ))}
          <circle cx="0" cy="0" r="13" fill="#f3d55a" stroke="#c9a52e" stroke-width="3" />
        </g>
      )
    case 'bean':
      return (
        <g>
          <path d="M-30 -6 C-30 -30 4 -30 10 -14 C14 -4 22 -8 28 -2 C38 10 26 32 4 30 C-22 28 -30 12 -30 -6z" fill={c} {...st} />
          <ellipse cx="-14" cy="-10" rx="7" ry="4" fill={hi} opacity="0.7" />
        </g>
      )
    case 'egg':
      return (
        <g>
          <path d="M0 -38 C24 -38 32 0 30 14 C28 32 14 40 0 40 C-14 40 -28 32 -30 14 C-32 0 -24 -38 0 -38z" fill={c} {...st} />
          <ellipse cx="-11" cy="-12" rx="6" ry="11" fill={hi} opacity="0.7" />
        </g>
      )
    case 'stone':
      return (
        <g>
          <ellipse cx="0" cy="6" rx="34" ry="24" fill={c} {...st} />
          <ellipse cx="-12" cy="-4" rx="10" ry="5" fill={hi} opacity="0.7" />
        </g>
      )
    case 'fish':
      return (
        <g>
          <path d="M22 0 L44 -18 L40 0 L44 18 Z" fill={shade(c, 0.85)} {...st} />
          <ellipse cx="-4" cy="0" rx="32" ry="20" fill={c} {...st} />
          <path d="M-4 -18 q8 18 0 36" stroke={line} stroke-width="2.5" fill="none" />
          <circle cx="-22" cy="-5" r="4" fill={EYE} />
        </g>
      )
    case 'star':
      return (
        <g>
          <path d="M0 -40 L11 -12 L40 -12 L17 6 L26 36 L0 18 L-26 36 L-17 6 L-40 -12 L-11 -12 Z" fill={c} {...st} />
          <circle cx="-4" cy="-8" r="5" fill={hi} opacity="0.7" />
        </g>
      )
    case 'leaf':
      return (
        <g>
          <path d="M-32 30 C-36 -10 -4 -38 34 -34 C36 6 6 36 -32 30z" fill={c} {...st} />
          <path d="M-32 30 L22 -22" stroke={line} stroke-width="3" />
        </g>
      )
    case 'cat':
      return (
        <g>
          <path d="M-30 -14 L-32 -44 L-10 -28 Z M30 -14 L32 -44 L10 -28 Z" fill={c} {...st} />
          <ellipse cx="0" cy="2" rx="34" ry="30" fill={c} {...st} />
          <path d="M-22 -36 L-20 -24 M22 -36 L20 -24" stroke="#e58a8a" stroke-width="5" stroke-linecap="round" />
          <ellipse cx="-12" cy="-2" rx="4" ry="6" fill={EYE} />
          <ellipse cx="12" cy="-2" rx="4" ry="6" fill={EYE} />
          <path d="M-4 10 L4 10 L0 15 Z" fill="#e58a8a" />
          <path d="M-8 20 q8 6 16 0" stroke={line} stroke-width="2.5" fill="none" />
          <path d="M-18 12 L-40 8 M-18 16 L-38 20 M18 12 L40 8 M18 16 L38 20" stroke={line} stroke-width="2" />
        </g>
      )
    case 'chick':
      return (
        <g>
          <ellipse cx="0" cy="14" rx="30" ry="26" fill={c} {...st} />
          <circle cx="4" cy="-20" r="18" fill={c} {...st} />
          <path d="M20 -22 L34 -16 L20 -12 Z" fill={BEAK} stroke={shade(BEAK, 0.7)} stroke-width="2" />
          <circle cx="10" cy="-24" r="3.5" fill={EYE} />
          <path d="M-22 10 q-10 10 4 18" stroke={line} stroke-width="3" fill="none" />
          <ellipse cx="-6" cy="4" rx="8" ry="5" fill={hi} opacity="0.6" />
        </g>
      )
    case 'pup':
      return (
        <g>
          <circle cx="0" cy="0" r="30" fill={c} {...st} />
          <ellipse cx="-30" cy="0" rx="10" ry="22" transform="rotate(15 -30 0)" fill={shade(c, 0.7)} stroke={line} stroke-width="3" />
          <ellipse cx="30" cy="0" rx="10" ry="22" transform="rotate(-15 30 0)" fill={shade(c, 0.7)} stroke={line} stroke-width="3" />
          <circle cx="-11" cy="-6" r="4" fill={EYE} />
          <circle cx="11" cy="-6" r="4" fill={EYE} />
          <ellipse cx="0" cy="10" rx="12" ry="9" fill={hi} />
          <ellipse cx="0" cy="6" rx="5" ry="4" fill={EYE} />
          <path d="M0 10 L0 16" stroke={EYE} stroke-width="2" />
        </g>
      )
    case 'goat':
    case 'llama':
      return (
        <g>
          {kind === 'goat' ? (
            <path d="M-12 -24 C-20 -46 -34 -44 -36 -34 M12 -24 C20 -46 34 -44 36 -34" stroke="#8a6a4a" stroke-width="6" fill="none" stroke-linecap="round" />
          ) : (
            <path d="M-12 -24 L-16 -48 L-4 -30 Z M12 -24 L16 -48 L4 -30 Z" fill={c} {...st} />
          )}
          <ellipse cx="-30" cy="-14" rx="12" ry="6" transform="rotate(-20 -30 -14)" fill={c} {...st} />
          <ellipse cx="30" cy="-14" rx="12" ry="6" transform="rotate(20 30 -14)" fill={c} {...st} />
          <path d="M-22 -26 C-24 0 -16 34 0 36 C16 34 24 0 22 -26 C14 -34 -14 -34 -22 -26z" fill={c} {...st} />
          <circle cx="-9" cy="-10" r="4" fill={EYE} />
          <circle cx="9" cy="-10" r="4" fill={EYE} />
          <ellipse cx="0" cy="24" rx="10" ry="7" fill={shade(c, 0.85)} />
          <path d="M-4 22 L0 26 L4 22" stroke={line} stroke-width="2.5" fill="none" />
          {kind === 'goat' && <path d="M-5 34 L0 46 L5 34" fill={shade(c, 0.8)} stroke={line} stroke-width="2" />}
        </g>
      )
    case 'goose':
      return (
        <g>
          <ellipse cx="-4" cy="18" rx="34" ry="22" fill={c} {...st} />
          <path d="M14 10 C14 -10 6 -20 10 -30" stroke={line} stroke-width="15" fill="none" stroke-linecap="round" />
          <path d="M14 10 C14 -10 6 -20 10 -30" stroke={c} stroke-width="10" fill="none" stroke-linecap="round" />
          <circle cx="12" cy="-32" r="12" fill={c} {...st} />
          <path d="M22 -34 L38 -28 L22 -24 Z" fill={BEAK} stroke={shade(BEAK, 0.7)} stroke-width="2" />
          <circle cx="15" cy="-35" r="3" fill={EYE} />
          <path d="M-26 14 q14 -10 26 4" stroke={line} stroke-width="3" fill="none" />
        </g>
      )
    case 'house':
      return (
        <g>
          <rect x="-30" y="-6" width="60" height="42" rx="3" fill={c} {...st} />
          <path d="M-40 -4 L0 -38 L40 -4 Z" fill="#a8573a" stroke={shade('#a8573a', 0.62)} stroke-width="3" stroke-linejoin="round" />
          <rect x="-8" y="12" width="16" height="24" rx="2" fill="#5e3f22" />
          <rect x="12" y="4" width="11" height="10" fill="#f3d58a" stroke={line} stroke-width="2" />
        </g>
      )
    case 'bush':
      return (
        <g>
          <circle cx="-16" cy="8" r="20" fill={c} {...st} />
          <circle cx="16" cy="8" r="20" fill={c} {...st} />
          <circle cx="0" cy="-8" r="22" fill={c} {...st} />
          <circle cx="-6" cy="-14" r="6" fill={hi} opacity="0.6" />
        </g>
      )
    case 'basket':
      return (
        <g>
          <path d="M-30 -12 C-30 -50 30 -50 30 -12" stroke={line} stroke-width="6" fill="none" />
          <path d="M-40 -12 L40 -12 L32 36 L-32 36 Z" fill={c} {...st} />
          {[-2, 10, 22].map((y) => (
            <path d={`M-36 ${y} L36 ${y}`} stroke={line} stroke-width="2.5" opacity="0.7" />
          ))}
          {[-20, 0, 20].map((x) => (
            <path d={`M${x} -12 L${x * 0.85} 36`} stroke={line} stroke-width="2.5" opacity="0.7" />
          ))}
        </g>
      )
    case 'pot':
      return (
        <g>
          <path d="M-14 -40 L14 -40 L12 -28 C34 -20 40 10 30 28 C22 40 -22 40 -30 28 C-40 10 -34 -20 -12 -28 Z" fill={c} {...st} />
          <path d="M-34 4 L34 4" stroke="#e8c48a" stroke-width="5" />
          <path d="M-32 14 L32 14" stroke={line} stroke-width="2.5" />
          <ellipse cx="-14" cy="-10" rx="5" ry="9" fill={hi} opacity="0.5" />
        </g>
      )
    case 'drum':
      return (
        <g>
          <path d="M-34 -22 L-30 30 C-20 40 20 40 30 30 L34 -22 Z" fill={c} {...st} />
          <path d="M-32 -16 L-22 30 L-10 -18 L2 32 L14 -18 L24 30 L32 -14" stroke="#e8c48a" stroke-width="3" fill="none" />
          <ellipse cx="0" cy="-22" rx="34" ry="12" fill="#f1e4c9" stroke={shade('#f1e4c9', 0.6)} stroke-width="3" />
        </g>
      )
  }
}

export function Thing({ kind, color, x = 0, y = 0, size = 100 }: { kind: ThingKind; color?: string; x?: number; y?: number; size?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${size / 100})`}>{draw(kind, color ?? THING_COLOR[kind])}</g>
}

/** Вещь отдельной картинкой (для кнопок вне общего SVG). */
export function ThingIcon({ kind, color, size = 48 }: { kind: ThingKind; color?: string; size?: number }) {
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} aria-hidden="true">
      <Thing kind={kind} color={color} />
    </svg>
  )
}
