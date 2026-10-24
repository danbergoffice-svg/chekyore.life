/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Относительные пути: сайт работает и на своём домене, и на временном адресе github.io/chekyore.life/
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  // Симуляционные прогоны тысяч жизней идут дольше обычных тестов.
  test: { testTimeout: 60000 },
})
