// Герб рода: щит с полем и фигурой (src/content/houses.json). Простые фигуры на сетке 100×120 - читаются и мелко.
import HOUSES from '../content/houses.json'

export type HouseDef = { id: string; charge: string; field: string; ink: string }
export const HOUSE_LIST = HOUSES.houses as HouseDef[]
export const houseDef = (id?: string) => HOUSE_LIST.find((h) => h.id === id)

const SHIELD = 'M6 6 H94 V58 C94 88 72 106 50 116 C28 106 6 88 6 58 Z'

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
      return <path d="M60 28 A28 28 0 1 0 60 84 A22 22 0 1 1 60 28 Z" {...f} />
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
    default:
      return null
  }
}

/** Щит рода. size - ширина в пикселях. */
export function Arms({ id, size = 48, label }: { id?: string; size?: number; label?: string }) {
  const h = houseDef(id)
  if (!h) return null
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} role="img" aria-label={label} class="arms">
      <path d={SHIELD} fill={h.field} stroke="#130904" stroke-width="4" />
      <Charge kind={h.charge} ink={h.ink} />
    </svg>
  )
}
