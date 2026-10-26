// Съёмка промо-ролика покадрово: npx vite --port 5174, затем
//   node tools/video/render.cjs <папка-кадров> [lang] [fps]            — все кадры 20 с;
//   node tools/video/render.cjs <папка> [lang] stills 1,3.4,6,...      — отдельные кадры для проверки.
// Каждый кадр рисует window.renderFrame(t) — время задаётся точно, без рывков.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const [, , dir, lang = 'en', mode = '60', list = ''] = process.argv
;(async () => {
  fs.mkdirSync(dir, { recursive: true })
  const b = await chromium.launch()
  const fps = Number(mode)
  const times = mode === 'stills' ? list.split(',').map(Number) : Array.from({ length: 20 * fps }, (_, i) => i / fps)
  // Параллельно в нескольких вкладках (по числу ядер): каждая снимает каждый N-й кадр.
  const workers = mode === 'stills' ? 1 : Math.max(1, require('os').cpus().length)
  const errs = []
  const t0 = Date.now()
  let done = 0
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => errs.push(e.message))
      p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
      await p.goto(`http://localhost:5174/tools/video/promo.html?lang=${lang}`)
      await p.waitForFunction(() => window.promoReady !== undefined)
      await p.evaluate(() => window.promoReady)
      const canvas = await p.$('canvas')
      for (let i = w; i < times.length; i += workers) {
        await p.evaluate((t) => window.renderFrame(t), times[i])
        const name = mode === 'stills' ? `still-${times[i]}.png` : `f${String(i).padStart(5, '0')}.jpg`
        await canvas.screenshot(mode === 'stills' ? { path: path.join(dir, name) } : { path: path.join(dir, name), type: 'jpeg', quality: 95 })
        if (++done % 120 === 0) console.log(`кадров ${done}/${times.length}, ${((Date.now() - t0) / 1000).toFixed(0)} с`)
      }
      await ctx.close()
    }),
  )
  console.log('ошибки:', errs.length ? errs.slice(0, 5) : 'нет')
  await b.close()
})()
