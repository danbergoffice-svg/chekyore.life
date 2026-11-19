// Герб рода: щит выбранной формы, поле одной или двух тинктур, знак (src/engine/arms.ts). Простые фигуры на сетке
// 100×120 - читаются и мелко. Прежние готовые гербы (houses.json) рисуются через legacyArms.
import { armsOf, TINCTURE_HEX } from '../engine/arms'
import type { ArmsSpec, Division, ShieldShape } from '../engine/arms'
import type { T } from '../i18n'

/** Контур щита по форме. */
export const SHIELD: Record<ShieldShape, string> = {
  heater: 'M6 6 H94 V58 C94 88 72 106 50 116 C28 106 6 88 6 58 Z',
  round: 'M6 6 H94 V68 A44 46 0 0 1 6 68 Z',
  french: 'M6 6 H94 V92 Q94 104 80 104 H64 Q54 104 50 114 Q46 104 36 104 H20 Q6 104 6 92 Z',
  kite: 'M8 6 H92 Q94 56 50 116 Q6 56 8 6 Z',
}
/** Вторая часть поля при делении (обрезается по щиту). */
const PART: Record<Exclude<Division, 'plain'>, string> = {
  pale: 'M50 0 H100 V120 H50 Z',
  fess: 'M0 58 H100 V120 H0 Z',
  bend: 'M0 0 L100 120 H0 Z',
}
/** Рисунок знака: у трёх прежних домов имя и рисунок различаются. */
const DRAW: Record<string, string> = { oak: 'tree', river: 'waves', falcon: 'bird' }

function Charge({ kind, ink }: { kind: string; ink: string }) {
  const f = { fill: ink }
  const s = { fill: 'none', stroke: ink, 'stroke-width': 6, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const }
  switch (kind) {
    case 'sun':
      return (
        <g>
          <circle cx="50" cy="55" r="15" {...f} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6
            return <line x1={50 + Math.cos(a) * 21} y1={55 + Math.sin(a) * 21} x2={50 + Math.cos(a) * 31} y2={55 + Math.sin(a) * 31} {...s} stroke-width={4} />
          })}
        </g>
      )
    case 'moon':
      return <path d="M60 28 A28 28 0 1 0 60 84 A34 34 0 0 1 60 28 Z" {...f} />
    case 'star':
      return <polygon points="50,24 58,46 82,46 63,60 70,83 50,69 30,83 37,60 18,46 42,46" {...f} />
    case 'tower':
      return <path d="M32 88 V44 H36 V36 H43 V44 H47 V36 H53 V44 H57 V36 H64 V44 H68 V88 Z M45 88 V72 A5 5 0 0 1 55 72 V88 Z" {...f} fill-rule="evenodd" />
    case 'key':
      return (
        <g>
          <circle cx="50" cy="36" r="11" {...s} />
          <path d="M50 47 V88 M50 72 H62 M50 82 H60" {...s} />
        </g>
      )
    case 'wheel':
      return (
        <g>
          <circle cx="50" cy="56" r="26" {...s} />
          <circle cx="50" cy="56" r="5" {...f} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4
            return <line x1="50" y1="56" x2={50 + Math.cos(a) * 26} y2={56 + Math.sin(a) * 26} {...s} stroke-width={4} />
          })}
        </g>
      )
    case 'wheat':
      return (
        <g>
          <path d="M50 90 V30" {...s} stroke-width={4} />
          {[36, 46, 56, 66].map((y) => (
            <>
              <ellipse cx="42" cy={y} rx="6" ry="9" transform={`rotate(-30 42 ${y})`} {...f} />
              <ellipse cx="58" cy={y} rx="6" ry="9" transform={`rotate(30 58 ${y})`} {...f} />
            </>
          ))}
        </g>
      )
    case 'tree':
      return (
        <g>
          <circle cx="50" cy="44" r="22" {...f} />
          <circle cx="34" cy="54" r="12" {...f} />
          <circle cx="66" cy="54" r="12" {...f} />
          <rect x="45" y="58" width="10" height="30" {...f} />
        </g>
      )
    case 'mountain':
      return <path d="M16 86 L40 40 L52 60 L62 46 L84 86 Z" {...f} />
    case 'waves':
      return <path d="M14 46 Q26 36 38 46 T62 46 T86 46 M14 62 Q26 52 38 62 T62 62 T86 62 M14 78 Q26 68 38 78 T62 78 T86 78" {...s} />
    case 'fish':
      return <path d="M20 56 Q44 32 70 56 Q44 80 20 56 Z M70 56 L86 42 V70 Z" {...f} />
    case 'bird':
      return <path d="M50 70 L22 40 L40 48 L50 30 L60 48 L78 40 Z M44 70 L50 86 L56 70 Z" {...f} />
    case 'horseshoe':
      return <path d="M32 86 V56 A18 18 0 0 1 68 56 V86" {...s} stroke-width={10} stroke-linecap="butt" />
    case 'sword':
      return (
        <g>
          <path d="M50 22 L56 32 V74 H44 V32 Z" {...f} />
          <rect x="34" y="72" width="32" height="6" {...f} />
          <rect x="47" y="78" width="6" height="12" {...f} />
        </g>
      )
    case 'cup':
      return <path d="M30 32 H70 Q70 62 54 66 V80 H64 V88 H36 V80 H46 V66 Q30 62 30 32 Z" {...f} />
    case 'ship':
      return (
        <g>
          <path d="M20 68 H80 L70 84 H30 Z" {...f} />
          <path d="M50 66 V26" {...s} stroke-width={4} />
          <path d="M53 30 L74 60 H53 Z" {...f} />
          <path d="M47 34 L30 60 H47 Z" {...f} />
        </g>
      )
    case 'crown':
      return <path d="M22 78 V40 L36 56 L50 34 L64 56 L78 40 V78 Z" {...f} />
    case 'rose':
      return (
        <g>
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i * 2 * Math.PI) / 5 - Math.PI / 2
            return <circle cx={50 + Math.cos(a) * 14} cy={56 + Math.sin(a) * 14} r="12" {...f} />
          })}
          <circle cx="50" cy="56" r="7" fill="#e8c44a" />
        </g>
      )
    case 'hammer':
      return (
        <g>
          <rect x="28" y="30" width="44" height="16" rx="3" {...f} />
          <rect x="45" y="44" width="10" height="44" {...f} />
        </g>
      )
    case 'flame':
      return <path d="M50 22 C62 40 72 50 70 68 C68 84 58 90 50 90 C42 90 32 84 30 68 C30 56 38 50 42 40 C46 52 52 54 54 48 C56 40 52 32 50 22 Z" {...f} />
    case 'eagle':
      return (
        <g>
          <path d="M50 30 C46 30 44 34 45 38 L40 40 L46 42 L44 50 L18 34 L22 50 L14 52 L26 60 L20 66 L40 64 L44 80 L36 92 L50 84 L64 92 L56 80 L60 64 L80 66 L74 60 L86 52 L78 50 L82 34 L56 50 L54 42 C58 40 58 32 50 30 Z" {...f} />
        </g>
      )
    case 'lily':
      return (
        <g>
          <path d="M50 24 C40 36 42 52 50 62 C58 52 60 36 50 24 Z" {...f} />
          <path d="M46 62 C36 66 22 60 22 48 C22 40 30 38 34 44 C28 44 28 52 34 54 C40 56 44 56 46 54 Z" {...f} />
          <path d="M54 62 C64 66 78 60 78 48 C78 40 70 38 66 44 C72 44 72 52 66 54 C60 56 56 56 54 54 Z" {...f} />
          <rect x="32" y="62" width="36" height="7" {...f} />
          <path d="M46 69 L44 88 L50 82 L56 88 L54 69 Z" {...f} />
        </g>
      )
    case 'anchor':
      return (
        <g>
          <circle cx="50" cy="30" r="7" {...s} stroke-width={5} />
          <path d="M50 37 V88 M36 48 H64 M24 68 Q28 88 50 88 Q72 88 76 68" {...s} />
          <path d="M18 72 L26 62 L30 74 Z M82 72 L74 62 L70 74 Z" {...f} />
        </g>
      )
    case 'bell':
      return (
        <g>
          <path d="M50 28 C38 28 34 38 34 50 C34 64 30 72 24 78 H76 C70 72 66 64 66 50 C66 38 62 28 50 28 Z" {...f} />
          <circle cx="50" cy="86" r="6" {...f} />
          <rect x="46" y="20" width="8" height="10" {...f} />
        </g>
      )
    case 'axe':
      return (
        <g>
          <path d="M44 22 H52 V92 H44 Z" {...f} />
          <path d="M52 30 C64 28 76 34 78 50 C76 62 66 66 52 62 Z" {...f} />
        </g>
      )
    case 'arrow':
      return (
        <g>
          <path d="M50 26 V86" {...s} />
          <path d="M50 18 L62 36 H38 Z" {...f} />
          <path d="M50 74 L38 84 V94 L50 84 L62 94 V84 Z" {...f} />
        </g>
      )
    case 'horn':
      return (
        <g>
          <path d="M22 44 C30 76 60 84 80 70 L76 58 C62 66 42 62 34 40 Z" {...f} />
          <rect x="72" y="54" width="10" height="20" transform="rotate(-30 77 64)" {...f} />
          <path d="M28 42 Q50 26 78 58" {...s} stroke-width={3} />
        </g>
      )
    case 'antlers':
      return (
        <g>
          <path d="M44 84 C36 66 34 52 26 34 M34 54 L20 48 M30 42 L18 30 M28 38 L34 22 M56 84 C64 66 66 52 74 34 M66 54 L80 48 M70 42 L82 30 M72 38 L66 22" {...s} stroke-width={6} />
          <path d="M42 80 H58 L54 92 H46 Z" {...f} />
        </g>
      )
    case 'grapes':
      return (
        <g>
          {[[38, 42], [50, 42], [62, 42], [44, 53], [56, 53], [38, 64], [50, 64], [62, 64], [44, 75], [56, 75], [50, 86]].map(([x, y]) => (
            <circle cx={x} cy={y} r="6.5" {...f} />
          ))}
          <path d="M50 34 V22 M50 28 Q62 18 70 26" {...s} stroke-width={4} />
        </g>
      )
    case 'bee':
      return (
        <g>
          <ellipse cx="34" cy="44" rx="14" ry="9" transform="rotate(-25 34 44)" {...f} opacity="0.75" />
          <ellipse cx="66" cy="44" rx="14" ry="9" transform="rotate(25 66 44)" {...f} opacity="0.75" />
          <circle cx="50" cy="40" r="8" {...f} />
          <path d="M50 48 C38 52 38 82 50 92 C62 82 62 52 50 48 Z" {...f} />
          <path d="M40 62 H60 M40 74 H60" stroke="rgba(0,0,0,0.45)" stroke-width="4" />
        </g>
      )
    default:
      return null
  }
}

/** Имя рода: своё или «Дом …» по знаку. */
export function houseName(t: T, x: { house?: string; arms?: ArmsSpec } | undefined): string {
  const a = armsOf(x)
  return a?.name || (a ? t(`house.${a.charge}`) : '')
}

/** Щит рода. size - ширина в пикселях; arms - герб, иначе of (семья или итог жизни: arms или прежний house). */
export function Arms({ arms, of, size = 48, label }: { arms?: ArmsSpec; of?: { house?: string; arms?: ArmsSpec }; size?: number; label?: string }) {
  const a = arms ?? armsOf(of)
  if (!a) return null
  const clip = `arms-${a.shape}`
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} role="img" aria-label={label} class="arms">
      <defs>
        <clipPath id={clip}>
          <path d={SHIELD[a.shape]} />
        </clipPath>
      </defs>
      <path d={SHIELD[a.shape]} fill={TINCTURE_HEX[a.field]} />
      {a.division !== 'plain' && <path d={PART[a.division]} fill={TINCTURE_HEX[a.field2]} clip-path={`url(#${clip})`} />}
      <Charge kind={DRAW[a.charge] ?? a.charge} ink={TINCTURE_HEX[a.ink]} />
      <path d={SHIELD[a.shape]} fill="none" stroke="#130904" stroke-width="4" />
    </svg>
  )
}
