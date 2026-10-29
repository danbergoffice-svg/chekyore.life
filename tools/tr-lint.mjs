// Проверка турецкого перевода по всем tr*.json: окончания, приклеенные к подстановкам ({npc}'nin — окончание зависит
// от слова), строки, оставшиеся по-английски, подозрительная длина (меньше половины или больше двух английских).
// Запуск: node tools/tr-lint.mjs [сколько примеров показать=15]
import fs from 'node:fs'
import path from 'node:path'

const SHOW = Number(process.argv[2] ?? 15)
const pairs = [['src/i18n/en.json', 'src/i18n/tr.json']]
for (const folder of fs.readdirSync('src/content')) {
  const dir = path.join('src/content', folder)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const f of fs.readdirSync(dir).filter((f) => /^(ui_)?en(_.*)?\.json$/.test(f))) pairs.push([path.join(dir, f), path.join(dir, f.replace(/^(ui_)?en/, '$1tr'))])
}
const SUFFIX = /\{\w+\}'?(n?[ıiuü]n|[dt][ae]n?|y?[ae]|y?[ıiuü]|l[ae]|yl[ae]|[ıiuü]m|s[ıiuü])(?![\wçğıöşü])/u
const out = { suffix: [], english: [], short: [], long: [], missing: 0, total: 0 }
for (const [enFile, trFile] of pairs) {
  const en = JSON.parse(fs.readFileSync(enFile, 'utf8'))
  const tr = fs.existsSync(trFile) ? JSON.parse(fs.readFileSync(trFile, 'utf8')) : {}
  for (const [k, v] of Object.entries(en)) {
    if (typeof v !== 'string') continue
    out.total++
    const t = tr[k]
    if (t === undefined) {
      out.missing++
      continue
    }
    const where = `${trFile.replace('src/', '')}  ${k}`
    if (SUFFIX.test(t)) out.suffix.push(`${where}: ${t.match(SUFFIX)[0]}  «${t.slice(0, 100)}»`)
    if (t === v && v.length > 20 && /[a-z]{4}/.test(v)) out.english.push(`${where}: «${v.slice(0, 80)}»`)
    if (v.length > 40 && t.length < v.length * 0.45) out.short.push(`${where}: ${v.length}→${t.length}`)
    if (v.length > 20 && t.length > v.length * 2.2) out.long.push(`${where}: ${v.length}→${t.length}`)
  }
}
console.log(`строк ${out.total}, без перевода ${out.missing}`)
for (const k of ['suffix', 'english', 'short', 'long']) {
  console.log(`\n${k}: ${out[k].length}`)
  for (const line of out[k].slice(0, SHOW)) console.log('  ' + line)
}
