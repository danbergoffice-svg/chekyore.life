// Официальные каналы игры (05.11): Reddit, Instagram, Telegram, TikTok - пиксельными значками в духе игры.
// Только на сайте (EXTERNAL): порталы вроде CrazyGames не разрешают уводить игрока наружу.
import { platform } from '../platform'
import { useUi } from './text'

/** Значки 16×16 с бликом и тенью: каждая строка - 16 клеток, буква - цвет из палитры, точка - пусто. */
const ICONS: Record<string, { grid: string[]; colors: Record<string, string> }> = {
  reddit: {
    colors: { o: '#ff4500', l: '#ff7a45', d: '#c73600', w: '#ffffff', g: '#d9e2ec' },
    grid: [
      '.....lloooo.....',
      '...lllooooowwo..',
      '..llloooooowwoo.',
      '.lllooooooowoooo',
      '.llooooooowooooo',
      'lloowwwwwwwwoooo',
      'lowwwwwwwwwwwwoo',
      'owwwwwwwwwwwwwwo',
      'owwwoowwwwoowwwo',
      'owwwoowwwwoowwwd',
      'oowwwwwwwwwwwwdd',
      'oowwwgwwwwgwwwdd',
      '.ooowwggggwwddd.',
      '.ooooowwwwodddd.',
      '..oooooooodddd..',
      '.....oooodd.....',
    ],
  },
  instagram: {
    colors: { p: '#6a2fb0', m: '#b42f9c', r: '#e1306c', o: '#f77737', y: '#fcaf45', w: '#ffffff' },
    grid: [
      '..rrrroooooyyy..',
      '.rrrrrroooooyyy.',
      'mmrwwwwwwwwwwyyy',
      'mmwwrrrrrooowwyy',
      'mmwmrrrrrrowowoy',
      'mmwmmrwwwwroowoo',
      'mmwmmwwrrwwrowoo',
      'pmwmmwmrrrwrrwoo',
      'ppwmmwmmrrwrrwoo',
      'ppwmmwmmmrwrrwro',
      'ppwpmmwwwwrrrwrr',
      'ppwppmmwwmmrrwrr',
      'ppwwppmmmmmmwwrr',
      'pppwwwwwwwwwwrrr',
      '.pppppppmmmmmmr.',
      '..pppppppmmmmm..',
    ],
  },
  telegram: {
    colors: { b: '#2aabee', l: '#5cc3f3', d: '#1c8bc7', w: '#ffffff', s: '#c8daea' },
    grid: [
      '.....llbbbb.....',
      '...lllbbbbbbb...',
      '..lllbbbbbbbbb..',
      '.lllbbbbbbbbbbb.',
      '.llbbbbbbbbwwbb.',
      'llbbbbbbbwwwwbbb',
      'lbbbbbbwwwwwwbbb',
      'bbbbbwwwwwswwbbb',
      'bbbwwwwwwsswbbbb',
      'bbbbbwwwsswwbbbd',
      'bbbbbbbswwwbbbdd',
      '.bbbbbbsswbbbdd.',
      '.bbbbbbbsbbbddd.',
      '..bbbbbbbbbddd..',
      '...bbbbbbbddd...',
      '.....bbbbdd.....',
    ],
  },
  tiktok: {
    colors: { k: '#111111', c: '#25f4ee', r: '#fe2c55', w: '#ffffff' },
    grid: [
      '..kkkkkkkkkkkk..',
      '.kkkkkkcckkkkkk.',
      'kkkkkkkcwwckkkkk',
      'kkkkkkkcwwwwkkkk',
      'kkkkkkkcwwwwwkkk',
      'kkkkkkkcwwrwwwkk',
      'kkkkkkkcwwrkwwrk',
      'kkkkkkkcwwrkkrrk',
      'kkkkccccwwrkkkkk',
      'kkkccwwwwwrkkkkk',
      'kkkcwwwwwwrkkkkk',
      'kkkcwwwwwwrkkkkk',
      'kkkkwwwwwrrkkkkk',
      'kkkkkwwwrrkkkkkk',
      '.kkkkkrrrkkkkkk.',
      '..kkkkkkkkkkkk..',
    ],
  },
}

// В сборке для CrazyGames список пуст на этапе сборки: портал проверяет, что в коде нет внешних адресов.
export const CHANNELS: { id: string; url: string; name: string }[] = import.meta.env.VITE_PLATFORM === 'crazygames' ? [] : [
  { id: 'reddit', url: 'https://www.reddit.com/r/Thousands_of_lives/', name: 'Reddit' },
  { id: 'instagram', url: 'https://www.instagram.com/thousands.life_game/', name: 'Instagram' },
  { id: 'telegram', url: 'https://t.me/thousands_of_lives_game', name: 'Telegram' },
  { id: 'tiktok', url: 'https://www.tiktok.com/@thousands_of_lives', name: 'TikTok' },
]

export function PixelIcon({ id, size = 32 }: { id: string; size?: number }) {
  const icon = ICONS[id]
  const cells: preact.JSX.Element[] = []
  icon.grid.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && cells.push(<rect x={x} y={y} width={1} height={1} fill={icon.colors[ch]} />)))
  return (
    <svg class="pixel-icon" width={size} height={size} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
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
