/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * Сборка для порталов (VITE_PLATFORM=crazygames): из index.html убираются Google Fonts, превью для соцсетей,
 * canonical и манифест сайта, а в начало подключается SDK портала.
 */
function portalHtml(platform: string | undefined): Plugin {
  return {
    name: 'portal-html',
    transformIndexHtml(html) {
      if (platform !== 'crazygames') return html
      return html
        .replace(/\s*<link rel="preconnect"[^>]*>/g, '')
        .replace(/\s*<link href="https:\/\/fonts\.googleapis[^>]*>/g, '')
        .replace(/\s*<!--[^>]*соцсетях[\s\S]*?-->/g, '')
        .replace(/\s*<meta (property="og:|name="twitter:)[^>]*>/g, '')
        .replace(/\s*<link rel="(canonical|manifest)"[^>]*>/g, '')
        .replace('<html lang="ru">', '<html lang="en">')
        .replace(/<title>[^<]*<\/title>/, '<title>Thousands of Lives</title>')
        .replace(/<meta name="description" content="[^"]*"/, '<meta name="description" content="A life simulator set in a random era of history."')
        .replace('<title>', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n    <title>')
    },
  }
}

export default defineConfig({
  // Относительные пути: сайт работает и на своём домене, и на временном адресе github.io/chekyore.life/
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  plugins: [portalHtml(process.env.VITE_PLATFORM)],
  // Номер сборки в аналитике: дата и время сборки.
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  build: {
    rollupOptions: {
      output: {
        // Контент страны склеивается в несколько файлов: события и вести, тексты на каждом языке.
        manualChunks(id) {
          const m = id.match(/src\/content\/(\w+)\/(events|news|primer|ru|en)[^/]*\.json$/)
          if (!m) return undefined
          const kind = m[2] === 'news' || m[2] === 'primer' ? 'events' : m[2]
          return `c-${m[1]}-${kind}`
        },
      },
    },
  },
  // Симуляционные прогоны тысяч жизней идут дольше обычных тестов.
  test: { testTimeout: 60000 },
})
