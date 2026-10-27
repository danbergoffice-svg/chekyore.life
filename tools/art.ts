// Проверка иллюстраций G3: npm run art.
// Размер 256×144, PNG-8 с палитрой до 32 цветов (или WebP lossless), вес ≤ 30 КБ; отчёт о недостающих картинках
// по странам и о том, сколько событий получат каждый момент (image_slot или автоматически).
import fs from 'node:fs'
import path from 'node:path'
import { ERA_FOLDER, loadAllEras } from '../src/content'
import { ART_H, ART_W, MOMENTS, momentOf } from '../src/pixel/illustrations'

const DIR = 'src/art'
const MAX_KB = 30
const MAX_COLORS = 32

interface Info {
  w: number
  h: number
  colors?: number
  kind: string
}

/** Размер и число цветов PNG по заголовку (IHDR, PLTE) — без декодирования. */
function pngInfo(b: Buffer): Info | null {
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  let off = 8
  const info: Info = { w: 0, h: 0, kind: 'png' }
  while (off < b.length) {
    const len = b.readUInt32BE(off)
    const type = b.toString('ascii', off + 4, off + 8)
    if (type === 'IHDR') {
      info.w = b.readUInt32BE(off + 8)
      info.h = b.readUInt32BE(off + 12)
      const colorType = b[off + 17]
      info.kind = colorType === 3 ? 'png8' : `png (тип цвета ${colorType})`
    }
    if (type === 'PLTE') info.colors = len / 3
    if (type === 'IEND') break
    off += 12 + len
  }
  return info
}

/** Размер WebP lossless (VP8L) или расширенного (VP8X). */
function webpInfo(b: Buffer): Info | null {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, kind: 'webp lossless' }
  }
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), kind: 'webp (VP8X)' }
  return { w: 0, h: 0, kind: 'webp lossy' }
}

async function main() {
  const errors: string[] = []
  const have = new Map<string, Set<string>>()
  if (fs.existsSync(DIR)) {
    for (const folder of fs.readdirSync(DIR)) {
      const dir = path.join(DIR, folder)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const file of fs.readdirSync(dir)) {
        const m = file.match(/^([a-z_]+)\.(png|webp)$/)
        if (!m) continue
        const p = path.join(dir, file)
        const b = fs.readFileSync(p)
        const info = m[2] === 'png' ? pngInfo(b) : webpInfo(b)
        if (!(MOMENTS as readonly string[]).includes(m[1])) errors.push(`${p}: неизвестный момент «${m[1]}»`)
        if (!info) errors.push(`${p}: не PNG и не WebP`)
        else {
          if (info.w !== ART_W || info.h !== ART_H) errors.push(`${p}: ${info.w}×${info.h}, нужно ${ART_W}×${ART_H}`)
          if (info.kind === 'webp lossy') errors.push(`${p}: WebP со сжатием с потерями — нужен lossless`)
          if (info.kind.startsWith('png (')) errors.push(`${p}: полноцветный PNG — нужен PNG-8 с палитрой`)
          if (info.colors !== undefined && info.colors > MAX_COLORS) errors.push(`${p}: ${info.colors} цветов > ${MAX_COLORS}`)
        }
        if (b.length > MAX_KB * 1024) errors.push(`${p}: ${(b.length / 1024).toFixed(1)} КБ > ${MAX_KB} КБ`)
        const set = have.get(folder) ?? new Set<string>()
        set.add(m[1])
        have.set(folder, set)
      }
    }
  }
  const eras = await loadAllEras()
  console.log('Иллюстрации по странам (есть / нужно):')
  let total = 0
  for (const era of Object.values(eras)) {
    const folder = ERA_FOLDER[era.id]
    const got = have.get(folder) ?? new Set()
    total += got.size
    const missing = MOMENTS.filter((m) => !got.has(m))
    console.log(`  ${folder.padEnd(14)} ${String(got.size).padStart(2)} / ${MOMENTS.length}${missing.length && got.size ? `  нет: ${missing.join(', ')}` : ''}`)
  }
  // Сколько событий получат каждый момент.
  const count = new Map<string, number>()
  let withMoment = 0
  const seen = new Set<string>()
  for (const era of Object.values(eras)) {
    for (const ev of era.events) {
      if (seen.has(ev.id)) continue
      seen.add(ev.id)
      const m = momentOf(ev)
      if (!m) continue
      withMoment++
      count.set(m, (count.get(m) ?? 0) + 1)
    }
  }
  console.log(`\nСобытий с иллюстрацией момента: ${withMoment} из ${seen.size}`)
  console.log('  ' + [...count].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(' · '))
  console.log(`\nВсего картинок: ${total} из ${Object.keys(eras).length * MOMENTS.length}`)
  if (errors.length) {
    console.error(`\nОшибки:\n  ${errors.join('\n  ')}`)
    process.exit(1)
  }
}
main()
