/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Относительные пути: сайт работает и на своём домене, и на временном адресе github.io/chekyore.life/
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
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
