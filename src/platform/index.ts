// Единая точка доступа к платформе. Сборка выбирает реализацию переменной VITE_PLATFORM=web|yandex|crazygames;
// выбор известен при сборке, поэтому код других платформ (Метрика, свой приёмник) в сборку не попадает.
import { crazyPlatform } from './crazygames'
import { webPlatform } from './web'
import { yandexPlatform } from './yandex'
import type { Platform } from './types'

const PLATFORM = import.meta.env.VITE_PLATFORM as string | undefined
export const platform: Platform = PLATFORM === 'crazygames' ? crazyPlatform : PLATFORM === 'yandex' ? yandexPlatform : webPlatform
/** Ссылки и данные за пределы платформы (сайт, соцсети, отзывы). Константа сборки: лишний код вырезается. */
export const EXTERNAL = PLATFORM !== 'crazygames'
export type { Flags, Platform, ShareResult } from './types'
export { DEFAULT_FLAGS } from './types'

let started: Promise<void> | null = null
/** Запустить платформу один раз (флаги, игрок, аналитика). Повторные вызовы ждут тот же запуск. */
export function initPlatform(): Promise<void> {
  return (started ??= platform.init().catch(() => {}))
}
