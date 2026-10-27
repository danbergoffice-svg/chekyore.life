// Полный рендер ролика: node render.cjs [кадров/с=60] [подкадров=3] [потоков=2]
// Кадры — frames/f-00000.jpg (уже готовые пропускаются, можно продолжить после обрыва), затем ffmpeg:
// H.264 + озвучка (vo.mp3, путь в VO) + звуки sfx.py → out/thousands-flyover-1080x1920.mp4.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const FPS = Number(process.argv[2] || 60)
const SUB = Number(process.argv[3] || 3)
const WORKERS = Number(process.argv[4] || 2)
const DURATION = 68.8
const N = Math.round(DURATION * FPS)
const FR = path.join(__dirname, 'frames', String(FPS))
const OUT = path.join(__dirname, 'out')
const VO = process.env.VO || path.join(__dirname, 'vo.mp3')
fs.mkdirSync(FR, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })
const name = (i) => path.join(FR, `f-${String(i).padStart(5, '0')}.jpg`)
const todo = []
for (let i = 0; i < N; i++) if (!fs.existsSync(name(i))) todo.push(i)
let done = N - todo.length
const start = Date.now()
const startDone = done
console.log(`кадров ${N}, осталось ${todo.length}, потоков ${WORKERS}, подкадров ${SUB}`)

async function worker(k) {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport: { width: 540, height: 960 } })
  p.on('pageerror', (e) => console.log(`[${k}] ОШИБКА`, e.message))
  await p.goto(`http://localhost:5174/tools/video/flyover/film.html?sub=${SUB}&fps=${FPS}`)
  await p.waitForSelector('body[data-ready="1"]', { timeout: 300000, state: 'attached' })
  for (let j = k; j < todo.length; j += WORKERS) {
    const i = todo[j]
    const url = await p.evaluate((t) => window.seek(t), i / FPS)
    fs.writeFileSync(name(i) + '.part', Buffer.from(url.split(',')[1], 'base64'))
    fs.renameSync(name(i) + '.part', name(i))
    done++
    if (done % 60 === 0) {
      const rate = (Date.now() - start) / 1000 / Math.max(1, done - startDone)
      console.log(`${done}/${N} · ${rate.toFixed(2)} с/кадр · осталось ~${Math.round(((N - done) * rate) / 60)} мин`)
    }
  }
  await b.close()
}

;(async () => {
  await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)))
  const sfx = path.join(OUT, 'sfx.wav')
  execFileSync('python3', [path.join(__dirname, 'sfx.py'), sfx], { stdio: 'inherit' })
  const mp4 = path.join(OUT, `thousands-flyover-1080x1920${FPS === 60 ? '' : '-' + FPS + 'fps'}.mp4`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(FR, 'f-%05d.jpg'), '-i', VO, '-i', sfx,
    '-filter_complex', `[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad,atrim=0:${DURATION}[vo];[2:a]aresample=48000[fx];[vo][fx]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(DURATION), mp4], { stdio: 'inherit' })
  console.log('готово', mp4, `${Math.round((Date.now() - start) / 60000)} мин`)
})()
