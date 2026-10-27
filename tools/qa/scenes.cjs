// Проверка сцен (ТЗ графики): одинаковый seed и время анимации — попиксельно одинаковая картинка
// (два независимых захода на страницу), время кадра при замедлении процессора ×6 — не больше 4 мс.
// Запуск: npx vite --port 5174, затем node tools/qa/scenes.cjs
const { chromium } = require('playwright')
const crypto = require('crypto')

const STYLES = ['roman', 'greek', 'egyptian', 'mesopotamian', 'byzantine', 'islamic', 'gothic', 'russian', 'chinese', 'japanese', 'indian', 'ethiopian', 'sahel', 'maya', 'aztec', 'andean']
const CASES = [
  { place: 'yard', time: 'day', season: 0.1, weather: 'snow' },
  { place: 'street', time: 'night', disaster: 'fire' },
  { place: 'market', time: 'sunset', weather: 'rain', art: 'full' },
  { place: 'sea', time: 'dawn', weather: 'fog' },
]

async function hashes(page) {
  return page.evaluate(async ({ STYLES, CASES }) => {
    const { drawScene, W, H } = await import('/src/pixel/scene.ts')
    const out = []
    for (const region of STYLES) for (const c of CASES) {
      const cv = document.createElement('canvas')
      cv.width = W
      cv.height = H
      const input = { region, seed: `qa:${region}`, scene: { place: c.place, time: c.time, people: 4, props: ['sun', 'banner'], disaster: c.disaster }, season: c.season, weather: c.weather, art: c.art, cast: { members: [{ role: 'hero', sex: 'm', age: 30, seed: 'h' }], animals: ['dog'], home: 2 } }
      drawScene(cv.getContext('2d'), input, 2.5)
      out.push(cv.toDataURL())
    }
    return out
  }, { STYLES, CASES })
}

;(async () => {
  const b = await chromium.launch()
  const errors = []
  const runs = []
  for (let i = 0; i < 2; i++) {
    const p = await b.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto('http://localhost:5174/tools/scenes.html')
    runs.push((await hashes(p)).map((u) => crypto.createHash('sha1').update(u).digest('hex')))
    await p.close()
  }
  const diff = runs[0].filter((h, i) => h !== runs[1][i]).length
  // Время кадра при ×6.
  const p = await b.newPage()
  const cdp = await p.context().newCDPSession(p)
  await p.goto('http://localhost:5174/tools/scenes.html')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  const ms = await p.evaluate(async () => {
    const { buildScene, composeScene, W, H } = await import('/src/pixel/scene.ts')
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d')
    const b = buildScene({ region: 'moscow', seed: 'perf', scene: { place: 'market', time: 'night', people: 6, props: ['banner', 'fire'] }, weather: 'storm', cast: { members: [{ role: 'hero', sex: 'm', age: 30, seed: 'h' }], animals: ['dog', 'cow'], home: 2 } })
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) composeScene(ctx, b, i / 10)
    return (performance.now() - t0) / 100
  })
  await b.close()
  console.log(`Сцен: ${runs[0].length}, различий между заходами: ${diff}; кадр при ×6: ${ms.toFixed(2)} мс; ошибок: ${errors.length}`)
  if (diff || ms > 4 || errors.length) {
    console.error('Не прошло', errors)
    process.exit(1)
  }
})()
