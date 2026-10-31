// Обложки CrazyGames: 1920×1080, 800×1200, 800×800 из tools/covers.html → out/crazygames/cover-*.png. Нужен npx vite --port 5174.
const { chromium } = require('playwright')
const fs = require('fs')
fs.mkdirSync('out/crazygames', { recursive: true })
;(async () => {
  const b = await chromium.launch()
  for (const [w, h, n] of [[1920, 1080, 'landscape'], [800, 1200, 'portrait'], [800, 800, 'square']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.goto(`http://localhost:5174/tools/covers.html?w=${w}&h=${h}`)
    await p.waitForSelector('body[data-ready]', { timeout: 20000 })
    await (await p.$('#c')).screenshot({ path: `out/crazygames/cover-${n}-${w}x${h}.png` })
    console.log(n, w, h)
    await p.close()
  }
  await b.close()
})()
