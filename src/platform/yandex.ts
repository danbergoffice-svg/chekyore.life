// Платформа «Яндекс Игры». Полная реализация (SDK, облачные сохранения, реклама, лидерборды) — Этап 4.
// Пока повторяет сайт, чтобы сборка VITE_PLATFORM=yandex собиралась и работала.
import { webPlatform } from './web'
import type { Platform } from './types'

export const yandexPlatform: Platform = { ...webPlatform, name: 'yandex', installKind: () => null, installed: () => false, install: async () => false }
