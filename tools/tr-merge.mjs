// Турецкий перевод из пачек tools/tr/out/batch-NN.txt — в файлы игры (tr*.json рядом с en*.json, src/i18n/tr.json).
// Проверка одной пачки: node tools/tr-merge.mjs --check 03  (все номера на месте, подстановки {…} те же, скобки целы).
// Слить всё проверенное: node tools/tr-merge.mjs   (пачки с ошибками пропускаются, строки с ошибками — тоже).
import fs from 'node:fs'
import path from 'node:path'

const DIR = 'tools/tr'
/** Числа по-турецки: тысячи «7,000» → «7.000», дроби «2.5» → «2,5», процент впереди «75%» → «%75» (и «{r}%» → «%{r}»).
 *  Цепочки вида 9.13.0.0.0 (даты майя) не трогаем. */
export const turkishNumbers = (s) =>
  s
    .replace(/(?<![\d.,%])(\d+(?:[.,]\d+)?|\{\w+\})\s?%/g, '%$1')
    .replace(/(?<![\d.,])\d+\.\d{1,2}(?![\d.,])/g, (m) => m.replace('.', ',')).replace(/(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d.,])/g, (m) => m.replace(/,/g, '.'))
const parse = (file) => {
  const out = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^(\d+)\t(.*)$/)
    if (m) out.set(Number(m[1]), m[2].replace(/\\n/g, '\n'))
  }
  return out
}
/** Простые подстановки {name} должны совпасть ({g:…|…} и {p=n:…} в турецком можно упростить). */
const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const balanced = (s) => {
  let d = 0
  for (const c of s) {
    if (c === '{') d++
    if (c === '}') d--
    if (d < 0 || d > 1) return false
  }
  return d === 0
}

function check(id) {
  const src = parse(`${DIR}/batch-${id}.txt`)
  const file = `${DIR}/out/batch-${id}.txt`
  if (!fs.existsSync(file)) return { ok: new Map(), errors: [`нет файла ${file}`] }
  const tr = parse(file)
  const errors = []
  const ok = new Map()
  for (const [n, en] of src) {
    const t = tr.get(n)
    if (t === undefined) errors.push(`${n}: нет перевода`)
    else if (!t.trim()) errors.push(`${n}: пусто`)
    else if (params(t) !== params(en)) errors.push(`${n}: подстановки ${params(en) || '—'} → ${params(t) || '—'}`)
    else if (!balanced(t)) errors.push(`${n}: фигурные скобки не закрыты`)
    else if (/[а-яё]/i.test(t)) errors.push(`${n}: кириллица`)
    else ok.set(n, t)
  }
  for (const n of tr.keys()) if (!src.has(n)) errors.push(`${n}: лишний номер`)
  return { ok, errors }
}

// При импорте (например, ради turkishNumbers) ничего не запускать.
if (import.meta.url !== `file://${path.resolve(process.argv[1] ?? '')}`) {
  // модуль подключён из другого скрипта
} else main()

function main() {
const args = process.argv.slice(2)
if (args[0] === '--normalize') {
  // Числа по-турецки во всех tr*.json (и в уже слитом раньше).
  let changed = 0
  const all = ['src/i18n/tr.json', ...fs.readdirSync('src/content').flatMap((d) => (fs.statSync(path.join('src/content', d)).isDirectory() ? fs.readdirSync(path.join('src/content', d)).filter((f) => /^(ui_)?tr(_.*)?\.json$/.test(f)).map((f) => path.join('src/content', d, f)) : []))]
  for (const f of all) {
    const dict = JSON.parse(fs.readFileSync(f, 'utf8'))
    for (const [k, v] of Object.entries(dict)) {
      const n = turkishNumbers(v)
      if (n !== v) {
        dict[k] = n
        changed++
      }
    }
    fs.writeFileSync(f, JSON.stringify(dict, null, 2) + '\n')
  }
  console.log(`файлов ${all.length}, исправлено строк: ${changed}`)
  return
}
if (args[0] === '--check') {
  const { ok, errors } = check(args[1].padStart(2, '0'))
  console.log(errors.length ? `ошибок ${errors.length} (верных ${ok.size}):\n${errors.slice(0, 40).join('\n')}` : `OK: ${ok.size} строк`)
  process.exit(errors.length ? 1 : 0)
}

// Слить: номер → [файл en, ключ] → файл tr рядом.
const target = (file) => (file === '../i18n/en.json' ? 'src/i18n/tr.json' : path.join('src/content', path.dirname(file), path.basename(file).replace(/^(ui_)?en/, '$1tr')))
const files = new Map()
let total = 0
let bad = 0
for (const f of fs.readdirSync(`${DIR}/out`).filter((f) => /^batch-\d+\.txt$/.test(f)).sort()) {
  const id = f.match(/\d+/)[0]
  const map = JSON.parse(fs.readFileSync(`${DIR}/batch-${id}.map.json`, 'utf8'))
  const { ok, errors } = check(id)
  bad += errors.length
  if (errors.length) console.log(`batch-${id}: пропущено строк с ошибками — ${errors.length}`)
  for (const [n, t] of ok) {
    const [file, key] = map[n - 1]
    const to = target(file)
    if (!files.has(to)) files.set(to, fs.existsSync(to) ? JSON.parse(fs.readFileSync(to, 'utf8')) : {})
    files.get(to)[key] = turkishNumbers(t)
    total++
  }
}
for (const [to, dict] of files) fs.writeFileSync(to, JSON.stringify(dict, null, 2) + '\n')
console.log(`слито строк: ${total} в ${files.size} файлов; пропущено с ошибками: ${bad}`)
}
