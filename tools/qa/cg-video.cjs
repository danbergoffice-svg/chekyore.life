// Превью-видео для CrazyGames: настоящий проход по игре (меню → рычаг → барабаны → семья → событие → жизнь),
// 16:9 1920×1080 и 2:3 1080×1620, без звука; первый кадр - обложка (out/crazygames/cover-*.png), всего 15–20 с.
// Нужен npx vite preview --outDir dist-crazygames --port 4174. Итог: out/crazygames/preview-*.mp4
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const OUT = 'out/crazygames'
const TMP = '/tmp/claude-0/cgvideo'
fs.mkdirSync(TMP, { recursive: true })
const STUB = `window.CrazyGames = { SDK: { environment: 'local', init: async () => {},
  game: { loadingStart() {}, loadingStop() {}, gameplayStart() {}, gameplayStop() {}, happytime() {}, inviteLink: () => '', settings: {} },
  ad: { requestAd(t, cb) { cb.adError('none') }, hasAdblock: async () => false },
  user: { getUser: async () => null, addAuthListener() {} },
  data: { getItem: () => null, setItem() {}, removeItem() {} } } }`
async function record(name, w, h, zoom, cover) {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US', recordVideo: { dir: TMP, size: { width: w, height: h } } })
  await ctx.route(/crazygames-sdk-v3\.js/, (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }))
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, year_sec_child: 1.2, year_sec: 1.5 } }) })
  await ctx.addInitScript((z) => {
    document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(z) })
    // Курсора в кадре нет: системный курсор браузер в видео не пишет.
  }, zoom)
  const p = await ctx.newPage()
  const t0 = Date.now()
  await p.goto('http://localhost:4174/?useLocalSdk=true')
  await p.waitForSelector('.lever:not([disabled])', { timeout: 30000 })
  const tReady = (Date.now() - t0) / 1000
  await p.waitForTimeout(1300)
  await p.click('.lever')
  await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 20000 })
  await p.waitForTimeout(1200)
  await p.click('.spin-result .primary')
  await p.waitForSelector('.reveal .primary')
  await p.waitForTimeout(1600)
  await p.click('.reveal .primary')
  const t1 = Date.now()
  while (Date.now() - t1 < 20000 && !(await p.$('.modal .choices'))) await p.waitForTimeout(100)
  await p.waitForTimeout(1400)
  const opts = await p.$$('.choices .choice:not([disabled])')
  if (opts[1]) await opts[1].hover()
  await p.waitForTimeout(700)
  if (opts[1]) await opts[1].click()
  await p.waitForTimeout(1600)
  await p.click('.outcome .primary').catch(() => {})
  await p.click('.speed .chip:nth-child(4)').catch(() => {})
  await p.waitForTimeout(3800)
  const tEnd = (Date.now() - t0) / 1000
  const video = await p.video().path()
  await ctx.close()
  await b.close()
  // Начало ролика - с готового меню (без загрузки), длина - до конца прохода; спереди 1 с обложки.
  const raw = path.join(TMP, `${name}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(tReady + 0.3), '-to', String(tEnd), '-i', video, '-an', '-vf', `scale=${w}:${h},fps=30`, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', raw])
  const still = path.join(TMP, `${name}-cover.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-t', '1', '-i', cover, '-an', '-vf', `scale=${w}:${h},fps=30`, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', still])
  const list = path.join(TMP, `${name}.txt`)
  fs.writeFileSync(list, `file '${still}'\nfile '${raw}'\n`)
  const out = path.join(OUT, `preview-${name}-${w}x${h}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim()
  console.log(name, out, `${Number(dur).toFixed(1)} с`, `${(fs.statSync(out).size / 1048576).toFixed(1)} МБ`)
}
;(async () => {
  await record('landscape', 1920, 1080, 1.55, `${OUT}/cover-landscape-1920x1080.png`)
  // Портрет 2:3: обложка 800×1200 растягивается до 1080×1620 без искажений (те же пропорции).
  await record('portrait', 1080, 1620, 2.4, `${OUT}/cover-portrait-800x1200.png`)
})()
