// Съёмка ролика про кости покадрово (tools/video/dice.ts):
//   node tools/video/dice-render.cjs <папка> <lang> <fps|stills> [секунды через запятую]
// Сервер: vite на PORT (по умолчанию 5174); вертикаль - O=v. Playwright - из PW (папка с playwright-core) или обычный.
const path = require('path')
const fs = require('fs')
const { chromium } = require(process.env.PW ? path.join(process.env.PW, 'node_modules/playwright-core') : 'playwright')
const [, , dir, lang = 'en', mode = '30', list = ''] = process.argv
const port = process.env.PORT ?? '5174'
const vertical = process.env.O === 'v'
;(async () => {
  fs.mkdirSync(dir, { recursive: true })
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})
  const viewport = vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
  const fps = Number(mode)
  const times = mode === 'stills' ? list.split(',').map(Number) : Array.from({ length: 15 * fps }, (_, i) => i / fps)
  const workers = mode === 'stills' ? 1 : Math.max(1, Math.min(6, require('os').cpus().length))
  const errs = []
  let done = 0
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => errs.push(e.message))
      await p.goto(`http://localhost:${port}/tools/video/dice.html?lang=${lang}${vertical ? '&o=v' : ''}`)
      await p.waitForFunction(() => window.promoReady !== undefined)
      await p.evaluate(() => window.promoReady)
      for (let i = w; i < times.length; i += workers) {
        await p.evaluate((t) => window.renderFrame(t), times[i])
        const name = mode === 'stills' ? `still-${times[i]}.jpg` : `f${String(i).padStart(5, '0')}.jpg`
        // Кадр - прямо из холста: снимок элемента зависит от того, что поверх страницы.
        const data = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/jpeg', 0.92))
        fs.writeFileSync(path.join(dir, name), Buffer.from(data.split(',')[1], 'base64'))
        if (++done % 90 === 0) console.log(`кадров ${done}/${times.length}`)
      }
      await ctx.close()
    }),
  )
  console.log('ошибки:', errs.length ? errs.slice(0, 5) : 'нет')
  await b.close()
})()
