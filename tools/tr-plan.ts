// Перевод на турецкий по частям: сначала интерфейс (src/i18n/en.json, ui_en.json стран), затем тексты событий,
// которые игроки видят чаще — симуляция жизней с весом по возрасту (новички чаще уходят в детстве).
// Пачки — tools/tr/batch-NN.txt: строки «номер<TAB>текст» (перенос строки — \n), без длинных ключей — так дешевле;
// номер → файл и ключ — в batch-NN.map.json. Уже переведённое (tr*.json) пропускается: следующий запуск — следующая порция.
// Запуск: npx vite-node tools/tr-plan.ts [бюджет знаков=200000] [жизней=400]
// Перевод — в tools/tr/out/batch-NN.txt той же формы, затем: node tools/tr-merge.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { ERA_FOLDER, ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'

const BUDGET = Number(process.argv[2] ?? 200000)
const LIVES = Number(process.argv[3] ?? 400)
const BATCH = 22000
const ROOT = 'src/content'

/** Доля игроков, которые ещё играют в этом возрасте героя (по аналитике 26–29.10, грубо). */
const ageWeight = (a: number) => (a < 5 ? 1 : a < 15 ? 0.7 : a < 20 ? 0.5 : a < 40 ? 0.3 : 0.15)

const eras = await loadAllEras()
const seen: Record<string, Record<string, number>> = { '*': {} }
for (let i = 0; i < LIVES; i++) {
  const b = rollBirth(77000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[b.era]
  const s = autoplay(newLife(era, { mode: 'full', mortality: 'soft', softenHeavy: false, livesBefore: 0, protectedUntil: 20 }, 77000 + i, undefined, b), era)
  const folder = ERA_FOLDER[b.era]
  const own = (seen[folder] ??= {})
  for (const [id, year] of Object.entries(s.hero.seen)) {
    if (id.startsWith('@')) continue
    const w = ageWeight(year - s.hero.birthYear)
    own[id] = (own[id] ?? 0) + w
    seen['*'][id] = (seen['*'][id] ?? 0) + w
  }
}

// Уже переведённые ключи — по папкам.
const done = new Set<string>()
const read = (f: string): Record<string, unknown> => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {})
for (const folder of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, folder)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const f of fs.readdirSync(dir).filter((f) => /^(ui_)?tr(_.*)?\.json$/.test(f))) for (const k of Object.keys(read(path.join(dir, f)))) done.add(`${folder}/${k}`)
}
// Интерфейс: целиком и первым.
const ui: Record<string, Record<string, string>> = {}
const uiTr = read('src/i18n/tr.json')
for (const [k, v] of Object.entries(read('src/i18n/en.json'))) if (typeof v === 'string' && !(k in uiTr)) (ui['../i18n/en.json'] ??= {})[k] = v
for (const folder of fs.readdirSync(ROOT)) {
  const f = path.join(ROOT, folder, 'ui_en.json')
  if (fs.existsSync(f)) for (const [k, v] of Object.entries(read(f))) if (typeof v === 'string' && !done.has(`${folder}/${k}`)) (ui[`${folder}/ui_en.json`] ??= {})[k] = v
}
const uiChars = Object.values(ui).reduce((n, t) => n + Object.values(t).reduce((m, v) => m + v.length, 0), 0)

// Группы: все ключи одного события в одном файле; вес — сколько раз (с весом возраста) событие показывалось.
type Group = { file: string; weight: number; texts: Record<string, string>; chars: number }
const groups: Group[] = []
const small: Group = { file: '', weight: Infinity, texts: {}, chars: 0 }
const smallFiles: Record<string, Record<string, string>> = {}
for (const folder of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, folder)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const f of fs.readdirSync(dir).filter((f) => /^en(_.*)?\.json$/.test(f))) {
    const file = `${folder}/${f}`
    const byEvent: Record<string, Record<string, string>> = {}
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>)) {
      if (typeof v !== 'string' || done.has(`${folder}/${k}`)) continue
      const [head, id] = k.split('.')
      if (head === 'ev') (byEvent[id] ??= {})[k] = v
      // Короткие подписи (сословия, занятия, причины смерти, образ жизни, вера, монеты…) — видны всем и всегда.
      else if (head !== 'news' && head !== 'primer' && head !== 'dream' && v.length <= 60) (smallFiles[file] ??= {})[k] = v
    }
    const counts = folder === 'common' ? seen['*'] : (seen[folder] ?? {})
    for (const [id, texts] of Object.entries(byEvent)) {
      const weight = counts[id] ?? 0
      if (weight > 0) groups.push({ file, weight, texts, chars: Object.values(texts).reduce((n, v) => n + v.length, 0) })
    }
  }
}
for (const t of Object.values(smallFiles)) for (const v of Object.values(t)) small.chars += v.length

groups.sort((a, b) => b.weight - a.weight)
const total = groups.reduce((n, g) => n + g.weight * g.chars, 0)
let left = BUDGET - small.chars - uiChars
const picked: Group[] = []
for (const g of groups) {
  if (g.chars > left) continue
  picked.push(g)
  left -= g.chars
}
const covered = picked.reduce((n, g) => n + g.weight * g.chars, 0)

// Пачки по ~BATCH знаков: строки «номер<TAB>текст» и карта номер → [файл, ключ] (файл — от src/content).
fs.mkdirSync('tools/tr/out', { recursive: true })
for (const f of fs.readdirSync('tools/tr').filter((f) => /^batch-\d+\./.test(f))) fs.unlinkSync(path.join('tools/tr', f))
const batches: { lines: string[]; map: [string, string][] }[] = []
let cur: { lines: string[]; map: [string, string][] } = { lines: [], map: [] }
let size = 0
const push = (file: string, texts: Record<string, string>) => {
  const chars = Object.values(texts).reduce((n, v) => n + v.length, 0)
  if (size + chars > BATCH && size > 0) {
    batches.push(cur)
    cur = { lines: [], map: [] }
    size = 0
  }
  for (const [k, v] of Object.entries(texts)) {
    cur.lines.push(`${cur.map.length + 1}\t${v.replace(/\n/g, '\\n')}`)
    cur.map.push([file, k])
  }
  size += chars
}
for (const [file, t] of Object.entries(ui)) push(file, t)
for (const [file, t] of Object.entries(smallFiles)) push(file, t)
for (const g of picked) push(g.file, g.texts)
if (size) batches.push(cur)
batches.forEach((b, i) => {
  const n = `tools/tr/batch-${String(i + 1).padStart(2, '0')}`
  fs.writeFileSync(`${n}.txt`, b.lines.join('\n') + '\n')
  fs.writeFileSync(`${n}.map.json`, JSON.stringify(b.map))
})

console.log(`жизней ${LIVES}; интерфейс ${uiChars} зн.; групп событий ${groups.length}, взято ${picked.length}; короткие подписи ${small.chars} зн.`)
console.log(`к переводу ${BUDGET - left} зн. в ${batches.length} пачках; покрытие показанного текста событий: ${Math.round((100 * covered) / total)}%`)
