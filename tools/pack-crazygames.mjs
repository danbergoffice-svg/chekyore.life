// Упаковка сборки для CrazyGames: npm run build:crazygames → crazygames.zip (index.html в корне архива).
// 1. Убирает файлы сайта, которые порталу не нужны (домен, офлайн-кэш, манифест, картинки для соцсетей).
// 2. Проверяет, что в сборке нет обращений наружу, кроме SDK CrazyGames, и что не превышены лимиты портала.
// 3. Собирает zip без сторонних программ (deflate из node:zlib).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIR = 'dist-crazygames'
const OUT = 'crazygames.zip'
const DROP = ['CNAME', 'sw.js', 'manifest.webmanifest', 'og-ru.png', 'og-en.png', '_worker.js']
/** Разрешённые адреса: SDK портала и пространства имён SVG/XML (это не запросы в сеть). */
const ALLOWED = [/^https:\/\/sdk\.crazygames\.com\//, /^http:\/\/www\.w3\.org\//]
/** Лимиты CrazyGames: файлов ≤ 1500, первая загрузка ≤ 20 МБ (для мобильной главной). */
const MAX_FILES = 1500
const MAX_MB = 20

if (!fs.existsSync(path.join(DIR, 'index.html'))) {
  console.error(`Нет ${DIR}/index.html — сначала vite build`)
  process.exit(1)
}
for (const f of DROP) fs.rmSync(path.join(DIR, f), { force: true })

const files = []
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else files.push(full)
  }
}
walk(DIR)

// Проверка внешних адресов в html, js, css, json.
const problems = []
for (const f of files.filter((x) => /\.(html|js|css|json|webmanifest)$/.test(x))) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
    if (!ALLOWED.some((re) => re.test(m[0]))) problems.push(`${path.relative(DIR, f)}: ${m[0]}`)
  }
  if (/thousands\.life/.test(text) && !f.endsWith('.json')) {
    for (const m of text.matchAll(/.{0,40}thousands\.life.{0,20}/g)) problems.push(`${path.relative(DIR, f)}: упоминание сайта «${m[0]}»`)
  }
}
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8')
if (!html.includes('crazygames-sdk-v3.js')) problems.push('index.html: не подключён SDK CrazyGames')
if (/(src|href)="\//.test(html)) problems.push('index.html: есть абсолютные пути «/…» — на портале они не откроются')

const bytes = files.reduce((s, f) => s + fs.statSync(f).size, 0)
console.log(`Файлов: ${files.length} (лимит ${MAX_FILES}), размер: ${(bytes / 1048576).toFixed(1)} МБ (лимит ${MAX_MB} МБ)`)
if (files.length > MAX_FILES) problems.push(`слишком много файлов: ${files.length}`)
if (bytes > MAX_MB * 1048576) problems.push(`слишком большой размер: ${(bytes / 1048576).toFixed(1)} МБ`)
if (problems.length) {
  console.error('Сборка не готова для CrazyGames:\n  ' + [...new Set(problems)].join('\n  '))
  process.exit(1)
}

// ---------- zip ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const parts = []
const central = []
let offset = 0
for (const f of files.sort()) {
  const name = Buffer.from(path.relative(DIR, f).split(path.sep).join('/'))
  const data = fs.readFileSync(f)
  const packed = zlib.deflateRawSync(data, { level: 9 })
  const store = packed.length >= data.length
  const body = store ? data : packed
  const crc = crc32(data)
  const head = Buffer.alloc(30)
  head.writeUInt32LE(0x04034b50, 0)
  head.writeUInt16LE(20, 4)
  head.writeUInt16LE(0x0800, 6) // имена в UTF-8
  head.writeUInt16LE(store ? 0 : 8, 8)
  head.writeUInt32LE(0x00210000, 10) // время/дата: 1 января 1980
  head.writeUInt32LE(crc, 14)
  head.writeUInt32LE(body.length, 18)
  head.writeUInt32LE(data.length, 22)
  head.writeUInt16LE(name.length, 26)
  parts.push(head, name, body)
  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0)
  entry.writeUInt16LE(20, 4)
  entry.writeUInt16LE(20, 6)
  entry.writeUInt16LE(0x0800, 8)
  entry.writeUInt16LE(store ? 0 : 8, 10)
  entry.writeUInt32LE(0x00210000, 12)
  entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(body.length, 20)
  entry.writeUInt32LE(data.length, 24)
  entry.writeUInt16LE(name.length, 28)
  entry.writeUInt32LE(offset, 42)
  central.push(entry, name)
  offset += head.length + name.length + body.length
}
const centralSize = central.reduce((s, b) => s + b.length, 0)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralSize, 12)
end.writeUInt32LE(offset, 16)
fs.writeFileSync(OUT, Buffer.concat([...parts, ...central, end]))
console.log(`Готово: ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} МБ) — загрузить в CrazyGames как HTML5-игру.`)
