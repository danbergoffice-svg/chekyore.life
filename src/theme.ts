// Тема оформления (src/skin.css): «синяя ночь» или «утреннее небо» (решение владельца 03.11). Настройка игрока -
// как в системе, светлая или тёмная; итог пишется в html[data-skin], до первого кадра (main.tsx), чтобы не мигало.
import type { Prefs } from './storage'

const light = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null
let current: Prefs['theme'] = 'auto'

export function applyTheme(theme: Prefs['theme'] = 'auto'): void {
  current = theme
  const day = theme === 'light' || (theme === 'auto' && !!light?.matches)
  document.documentElement.dataset.skin = day ? 'day' : 'night'
}

// «Как в системе»: система сменила тему (вечером, например) - меняем и мы.
light?.addEventListener?.('change', () => current === 'auto' && applyTheme('auto'))

/** Тема из сохранённых настроек - до загрузки игры. */
export function savedTheme(): Prefs['theme'] {
  try {
    const t = JSON.parse(localStorage.getItem('thousands.prefs') ?? '{}').theme
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}
