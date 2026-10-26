// Единая точка доступа к платформе. Сборка выбирает реализацию переменной VITE_PLATFORM=web|yandex.
import { webPlatform } from './web'
import { yandexPlatform } from './yandex'
import type { Platform } from './types'

export const platform: Platform = import.meta.env.VITE_PLATFORM === 'yandex' ? yandexPlatform : webPlatform
export type { Flags, Platform, ShareResult } from './types'
export { DEFAULT_FLAGS } from './types'

let started: Promise<void> | null = null
/** Запустить платформу один раз (флаги, игрок, аналитика). Повторные вызовы ждут тот же запуск. */
export function initPlatform(): Promise<void> {
  return (started ??= platform.init().catch(() => {}))
}
