// Вес сборки (ТЗ графики, «Бюджет веса»): запускать после vite build — npm run size.
// Печатает общий вес dist, вес первого запуска в gzip (страница, главный скрипт и стили, общие тексты и события,
// самая тяжёлая страна со своими картинками) и 10 самых больших файлов. Падает, если dist больше порога,
// первый запуск больше порога или картинка тяжелее 30 КБ (атлас спрайтов — 300 КБ). Пороги — package.json → "size".
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = process.argv[2] ?? 'dist'
const limits = { dist_mb: 45, first_mb: 3.5, image_kb: 30, atlas_kb: 300, ...(JSON.parse(readFileSync('package.json', 'utf8')).size ?? {}) }

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else files.push({ path: relative(DIST, p).replaceAll('\\', '/'), size: st.size })
  }
}
walk(DIST)
const mb = (n) => (n / 1024 / 1024).toFixed(2)
const kb = (n) => (n / 1024).toFixed(1)
const gz = (path) => gzipSync(readFileSync(join(DIST, path))).length

const total = files.reduce((s, f) => s + f.size, 0)

// Первый запуск: index.html, всё, на что он ссылается (скрипт, стили), общие тексты и события на одном языке,
// плюс самая тяжёлая страна (события + тексты + картинки art/<страна>).
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const linked = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]).filter((p) => files.some((f) => f.path === p))
const first = new Set(['index.html', 'flags.json', ...linked])
for (const f of files) if (/assets\/c-common-(events|ru)-/.test(f.path)) first.add(f.path)
const countries = new Map()
for (const f of files) {
  const m = f.path.match(/assets\/c-([a-z_0-9]+)-(events|ru)-/) ?? f.path.match(/assets\/art-([a-z_0-9]+)-/)
  if (!m || m[1] === 'common') continue
  const list = countries.get(m[1]) ?? []
  list.push(f.path)
  countries.set(m[1], list)
}
let heaviest = ['', 0]
for (const [id, list] of countries) {
  const w = list.reduce((s, p) => s + gz(p), 0)
  if (w > heaviest[1]) heaviest = [id, w]
}
const firstGz = [...first].reduce((s, p) => s + gz(p), 0) + heaviest[1]

const music = files.filter((f) => f.path.startsWith('music/')).reduce((s, f) => s + f.size, 0)
console.log(`Сборка: ${mb(total)} МБ (музыка ${mb(music)} МБ), файлов ${files.length}`)
console.log(`Первый запуск (gzip): ${mb(firstGz)} МБ — страница, скрипт, стили, общие тексты и события, самая тяжёлая страна (${heaviest[0]}: ${kb(heaviest[1])} КБ)`)

// До первого выбора (R8 ТЗ удержания, 20.11): первый запуск + заставка и шрифты + живопись самого тяжёлого стиля
// (оглавление и лёгкие слои целиком - prefetchPainted(…, false); из интерьеров, достопримечательностей и портретов -
// по самой тяжёлой картинке, из фигур, предметов и животных - по три и две: в первой жизни до первого выбора они
// берутся по одной, src/pixel/painted.ts)
// + музыка: самый тяжёлый трек страны (новая музыка v2, .m4a; если его нет - .mp3). Трек меню новичок не качает: первое
// касание - рывок рычага, и в меню сразу играет трек выпавшей страны (App.tsx onPull). Музыка грузится фоном после
// текстов страны (src/audio.ts musicAfter), но до первого выбора обычно успевает - поэтому тоже считается.
const SCENE_LAYERS = ['sky', 'far', 'ground', 'house']
const SLICES = { interior: 1, landmark: 1, portrait: 1, person: 3, prop: 3, animal: 2 }
const size = (p) => files.find((f) => f.path === p)?.size ?? 0
const fonts = files.filter((f) => /assets\/(ThousandsLetopis-VF|alegreya-(latin|cyrillic)-wght-(normal|italic))-[^/]+\.woff2$/.test(f.path)).reduce((s, f) => s + f.size, 0)
let art = ['', 0]
const artDir = join(DIST, 'art')
for (const style of existsSync(artDir) ? readdirSync(artDir) : []) {
  const indexFile = readdirSync(join(artDir, style)).find((f) => /^index-.*\.json$/.test(f))
  if (!indexFile) continue
  const ix = JSON.parse(readFileSync(join(artDir, style, indexFile), 'utf8'))
  const biggest = (layer) => Math.max(0, ...Object.values(ix.items ?? {}).filter((e) => e[0] === layer).map((e) => e[2]))
  const slices = Object.entries(SLICES).reduce((s, [layer, n]) => s + n * biggest(layer), 0)
  const w = gz(`art/${style}/${indexFile}`) + SCENE_LAYERS.reduce((s, l) => s + (ix.files?.[l] ? size(`art/${style}/${ix.files[l]}`) : 0), 0) + slices
  if (w > art[1]) art = [style, w]
}
const track = (id) => size(`music/v2/${id}.m4a`) || size(`music/v2/${id}.mp3`) || size(`music/${id}.mp3`)
const countryTrack = Math.max(0, ...files.filter((f) => /^music\/v2\/[a-z0-9]+\.(m4a|mp3)$/.test(f.path) && !/menu\./.test(f.path)).map((f) => track(f.path.replace(/^music\/v2\/|\.(m4a|mp3)$/g, ''))))
const tracks = countryTrack
const beforeChoice = firstGz + size('splash.jpg') + fonts + art[1] + tracks
console.log(
  `До первого выбора: ${mb(beforeChoice)} МБ — первый запуск ${mb(firstGz)}, заставка и шрифты ${mb(size('splash.jpg') + fonts)}, живопись (${art[0]}) ${mb(art[1])}, музыка страны ${mb(tracks)} (фоном)`,
)
console.log('10 самых больших файлов:')
for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 10)) console.log(`  ${kb(f.size).padStart(8)} КБ  ${f.path}`)

const errors = []
if (total > limits.dist_mb * 1024 * 1024) errors.push(`сборка ${mb(total)} МБ > ${limits.dist_mb} МБ`)
if (firstGz > limits.first_mb * 1024 * 1024) errors.push(`первый запуск ${mb(firstGz)} МБ > ${limits.first_mb} МБ`)
if (limits.first_choice_mb && beforeChoice > limits.first_choice_mb * 1024 * 1024) errors.push(`до первого выбора ${mb(beforeChoice)} МБ > ${limits.first_choice_mb} МБ`)
for (const f of files) {
  // Превью для соцсетей и заставка загрузки (живописная картинка 960×300) - не пиксельные иллюстрации, у них свой вес.
  if (!/\.(png|webp|jpe?g|gif)$/i.test(f.path) || /^og-|^splash\./.test(f.path)) continue
  const limit = /atlas/.test(f.path) ? limits.atlas_kb : limits.image_kb
  if (f.size > limit * 1024) errors.push(`картинка ${f.path}: ${kb(f.size)} КБ > ${limit} КБ`)
}
if (errors.length) {
  console.error(`\nВес превышен:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nВ пределах: сборка ≤ ${limits.dist_mb} МБ, первый запуск ≤ ${limits.first_mb} МБ, до первого выбора ≤ ${limits.first_choice_mb ?? '-'} МБ, картинки ≤ ${limits.image_kb} КБ (атлас ≤ ${limits.atlas_kb} КБ).`)
