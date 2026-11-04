// Официальные каналы игры (05.11): Reddit, Instagram, Telegram - пиксельными значками в духе игры.
// Только на сайте (EXTERNAL): порталы вроде CrazyGames не разрешают уводить игрока наружу.
import { platform } from '../platform'
import { useUi } from './text'

/** Значки 12×12: каждая строка - 12 клеток, буква - цвет из палитры, точка - пусто. */
const ICONS: Record<string, { grid: string[]; colors: Record<string, string> }> = {
  reddit: {
    colors: { o: '#ff4500', w: '#ffffff', k: '#1c1a17' },
    grid: [
      '....oooo....',
      '..oooooowo..',
      '.oooooooooo.',
      '.ooowwwwooo.',
      'oowwwwwwwwoo',
      'oowkwwwwkwoo',
      'oowwwwwwwwoo',
      'ooowwkkwwooo',
      '.oooowwoooo.',
      '.oooooooooo.',
      '..oooooooo..',
      '....oooo....',
    ],
  },
  instagram: {
    colors: { p: '#833ab4', r: '#e1306c', o: '#f77737', y: '#fcaf45', w: '#ffffff' },
    grid: [
      '.ppprrrrooo.',
      'ppwwwwwwwwoo',
      'pw........wo',
      'pw......w.wo',
      'pw..wwww..wy',
      'pw.w....w.wy',
      'rw.w....w.wy',
      'rw.w....w.wy',
      'rw..wwww..wy',
      'rw........wy',
      'rrwwwwwwwwyy',
      '.rrroooyyyy.',
    ],
  },
  telegram: {
    colors: { b: '#2aabee', w: '#ffffff', l: '#c8daea' },
    grid: [
      '....bbbb....',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbbbbbbwwb.',
      'bbbbbbwwwwbb',
      'bbbbwwwwwlbb',
      'bbwwwwwwllbb',
      'bbbbwwwwlbbb',
      '.bbbbwlwbbb.',
      '.bbbbblbbbb.',
      '..bbbbbbbb..',
      '....bbbb....',
    ],
  },
}

export const CHANNELS = [
  { id: 'reddit', url: 'https://www.reddit.com/r/Thousands_of_lives/', name: 'Reddit' },
  { id: 'instagram', url: 'https://www.instagram.com/thousands.life_game/', name: 'Instagram' },
  { id: 'telegram', url: 'https://t.me/thousands_of_lives_game', name: 'Telegram' },
] as const

export function PixelIcon({ id, size = 28 }: { id: string; size?: number }) {
  const icon = ICONS[id]
  const cells: preact.JSX.Element[] = []
  icon.grid.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && cells.push(<rect x={x} y={y} width={1} height={1} fill={icon.colors[ch]} />)))
  return (
    <svg class="pixel-icon" width={size} height={size} viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
      {cells}
    </svg>
  )
}

/** Ряд ссылок на каналы; compact - только значки (для узких мест). */
export function SocialLinks({ from, compact = false }: { from: 'menu' | 'sheet'; compact?: boolean }) {
  const { t } = useUi()
  return (
    <nav class={`social-links ${compact ? 'compact' : ''}`} aria-label={t('social.title')}>
      {CHANNELS.map((c) => (
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={c.name}
          title={c.name}
          onClick={() => platform.track('social_click', { net: c.id, from })}
        >
          <PixelIcon id={c.id} />
          {!compact && <span>{c.name}</span>}
        </a>
      ))}
    </nav>
  )
}
