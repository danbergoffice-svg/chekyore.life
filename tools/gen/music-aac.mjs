// Лёгкие копии новых треков (R8 ТЗ удержания, 20.11): public/music/v2/<id>.mp3 → <id>.m4a, AAC-LC 64 кбит/с, стерео.
// Игра берёт .m4a, а mp3 - запасной (src/audio.ts). После перекодировки - увеличить MUSIC_VERSION в src/audio.ts.
// Запуск: node tools/gen/music-aac.mjs  (нужен ffmpeg; другой путь к нему - FFMPEG=/путь/ffmpeg).
// На Mac берётся кодер AudioToolbox (aac_at) - он звучит лучше встроенного aac; без него - встроенный.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DIR = 'public/music/v2'
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const encoders = execFileSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' })
const codec = /\baac_at\b/.test(encoders) ? 'aac_at' : 'aac'

let before = 0
let after = 0
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.mp3')).sort()) {
  const src = path.join(DIR, file)
  const out = src.replace(/\.mp3$/, '.m4a')
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-map_metadata', '-1', '-c:a', codec, '-b:a', '64k', '-movflags', '+faststart', out])
  const a = fs.statSync(src).size
  const b = fs.statSync(out).size
  before += a
  after += b
  console.log(`${file.padEnd(10)} ${(a / 1024).toFixed(0).padStart(6)} КБ → ${(b / 1024).toFixed(0).padStart(6)} КБ`)
}
console.log(`Всего: ${(before / 1048576).toFixed(1)} МБ mp3 → ${(after / 1048576).toFixed(1)} МБ m4a (${codec})`)
