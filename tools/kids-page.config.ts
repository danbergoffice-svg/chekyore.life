// Сборка стенда детских головоломок в один HTML (для показа владельцу): npx vite build -c tools/kids-page.config.ts && node tools/kids-page-inline.mjs
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  build: {
    outDir: 'out/kids-page',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { input: 'tools/kids-play.html', output: { inlineDynamicImports: true } },
  },
})
