// Съёмка страницы ролика по слоям (ТЗ ролика, шаг 1): страница без поднимающихся элементов — полосами по 2048 CSS-px
// (DPR 2), каждый элемент data-layer отдельно на прозрачном фоне с полями 28 px; положения — в layers/layers.json.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, 'layers')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const DPR = 2
const PAD = 28
const TILE = 2048
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 640, height: 1000 }, deviceScaleFactor: DPR })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://localhost:5174/tools/video/flyover/landing.html')
  await p.waitForSelector('body[data-ready="1"]', { timeout: 90000, state: 'attached' })
  // Прокрутка до конца — на случай ленивых картинок.
  const H = await p.evaluate(() => document.getElementById('page').offsetHeight)
  for (let y = 0; y < H; y += 900) await p.evaluate((yy) => window.scrollTo(0, yy), y)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(300)
  const info = await p.evaluate(() => {
    const out = []
    document.querySelectorAll('[data-layer]').forEach((n, i) => {
      n.dataset.idx = String(i)
      const r = n.getBoundingClientRect()
      out.push({ i, kind: n.dataset.layer, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, z: Number(n.dataset.z || 0), stand: Number(n.dataset.stand || 0), fly: n.dataset.fly || null, tile: n.dataset.tile ? Number(n.dataset.tile) : null })
    })
    return { layers: out, layout: window.layout }
  })
  // 1. Страница без слоёв.
  await p.addStyleTag({ content: '[data-layer]{visibility:hidden !important}' })
  const tiles = []
  for (let y = 0, k = 0; y < H; y += TILE, k++) {
    const h = Math.min(TILE, H - y)
    const file = `page-${k}.png`
    await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y, width: 640, height: h }, fullPage: true })
    tiles.push({ file, y, h })
  }
  // 2. Каждый слой отдельно, на прозрачном фоне.
  await p.addStyleTag({ content: 'html,body,.page{background:transparent !important} body *{visibility:hidden !important} .band{display:none}' })
  const layers = []
  for (const L of info.layers) {
    const style = await p.addStyleTag({ content: `[data-idx="${L.i}"], [data-idx="${L.i}"] *{visibility:visible !important}` })
    const clip = { x: Math.max(0, L.x - PAD), y: Math.max(0, L.y - PAD), width: L.w + PAD * 2, height: L.h + PAD * 2 }
    const file = `layer-${L.i}.png`
    await p.screenshot({ path: path.join(OUT, file), clip, fullPage: true, omitBackground: true })
    await style.evaluate((n) => n.remove())
    layers.push({ ...L, file, cx: clip.x, cy: clip.y, cw: clip.width, ch: clip.height })
  }
  fs.writeFileSync(path.join(OUT, 'layers.json'), JSON.stringify({ width: 640, height: H, dpr: DPR, pad: PAD, tiles, layers, layout: info.layout }, null, 1))
  console.log(`страница ${H}px, полос ${tiles.length}, слоёв ${layers.length}`, errs)
  await b.close()
})()
