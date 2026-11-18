// Официальные каналы игры (05.11): Reddit, Instagram, Telegram, TikTok. С 18.11 - значками-линиями, как все значки игры
// (пиксельные цветные значки выбивались из живописного оформления).
// Только на сайте (EXTERNAL): порталы вроде CrazyGames не разрешают уводить игрока наружу.
import { platform } from '../platform'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { useUi } from './text'

// В сборке для CrazyGames список пуст на этапе сборки: портал проверяет, что в коде нет внешних адресов.
export const CHANNELS: { id: IconName; url: string; name: string }[] = import.meta.env.VITE_PLATFORM === 'crazygames' ? [] : [
  { id: 'reddit', url: 'https://www.reddit.com/r/Thousands_of_lives/', name: 'Reddit' },
  { id: 'instagram', url: 'https://www.instagram.com/thousands.life_game/', name: 'Instagram' },
  { id: 'telegram', url: 'https://t.me/thousands_of_lives_game', name: 'Telegram' },
  { id: 'tiktok', url: 'https://www.tiktok.com/@thousands_of_lives', name: 'TikTok' },
]

/** Ряд ссылок на каналы; compact - только значки (для узких мест). */
export function SocialLinks({ from, compact = false }: { from: 'menu' | 'sheet'; compact?: boolean }) {
  const { t } = useUi()
  return (
    <nav class={`social-links ${compact ? 'compact' : ''} from-${from}`} aria-label={t('social.title')}>
      {CHANNELS.map((c) => (
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={c.name}
          title={c.name}
          onClick={() => platform.track('social_click', { net: c.id, from })}
        >
          <Icon name={c.id} size={1.5} />
          {!compact && <span>{c.name}</span>}
        </a>
      ))}
    </nav>
  )
}

/** Поддержать проект (Boosty): внизу меню, только на сайте. */
export const SUPPORT_URL = import.meta.env.VITE_PLATFORM === 'crazygames' ? '' : 'https://boosty.to/afterall/donate'

export function SupportLink({ from }: { from: 'menu' | 'sheet' }) {
  const { t } = useUi()
  if (!SUPPORT_URL) return null
  return (
    <a class="support-link" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => platform.track('support_click', { from })}>
      <Icon name="heart" />
      <span>{t('support.boosty')}</span>
    </a>
  )
}
