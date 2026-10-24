// Яндекс Метрика. Подключается только в собранной версии сайта, чтобы локальная разработка не портила статистику.
const COUNTER_ID = 113771699

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number }

declare global {
  interface Window {
    ym?: Ym
  }
}

export function initAnalytics(): void {
  if (!import.meta.env.PROD) return

  const ym: Ym = window.ym ?? (((...args: unknown[]) => {
    ;(ym.a = ym.a ?? []).push(args)
  }) as Ym)
  ym.l = Date.now()
  window.ym = ym

  const script = document.createElement('script')
  script.async = true
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`
  document.head.appendChild(script)

  ym(COUNTER_ID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  })
}

/** Игровое событие (цель в Метрике): например, track('life_start', { era: 'E03' }). */
export function track(goal: string, params?: Record<string, unknown>): void {
  window.ym?.(COUNTER_ID, 'reachGoal', goal, params)
}
