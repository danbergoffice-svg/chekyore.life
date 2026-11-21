// Ключи текстов, которые код вызывает буквально (t('…'), key: '…'), но которых нет ни в одном словаре языка.
// Запуск: node tools/missing-keys.mjs [ru|en|tr|fr|es]  (без аргумента - все языки). Динамические ключи (`…${x}`) не проверяются.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const LANGS = process.argv[2] ? [process.argv[2]] : ['ru', 'en', 'tr', 'fr', 'es']
// src/pixel - ключи слоёв картинок (key: 'fx.feast'), а не тексты.
const code = walk(join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('/pixel/'))
const used = new Map()
// t('a.b'), ui.t('a.b'), t(cond ? 'a.b' : 'c.d'), key: 'a.b'
const RX = [/\bt\(\s*'([a-z][\w]*(?:\.[\w]+)+)'/g, /\?\s*'([a-z][\w]*(?:\.[\w]+)+)'\s*:\s*'([a-z][\w]*(?:\.[\w]+)+)'/g, /\bkey:\s*'([a-z][\w]*(?:\.[\w]+)+)'/g]
for (const f of code) {
  const s = readFileSync(f, 'utf8')
  for (const rx of RX)
    for (const m of s.matchAll(rx))
      for (const k of m.slice(1)) if (k && !k.endsWith('.')) used.set(k, f.replace(root, ''))
}
const files = walk(join(root, 'src')).filter((f) => f.endsWith('.json'))
let bad = 0
for (const L of LANGS) {
  const keys = new Set()
  for (const f of files) {
    const b = f.split('/').pop()
    if (!new RegExp(`^(ui_)?${L}([._])`).test(b)) continue
    try {
      for (const k of Object.keys(JSON.parse(readFileSync(f, 'utf8')))) keys.add(k)
    } catch {}
  }
  // Ключ может быть только с уточнением (key.<регион> и т.п.) - тогда он есть как префикс.
  const has = (k) => keys.has(k) || [...keys].some((x) => x.startsWith(k + '.'))
  const miss = [...used].filter(([k]) => !has(k))
  if (miss.length) {
    bad += miss.length
    console.log(`${L}: нет ${miss.length}`)
    for (const [k, f] of miss) console.log(`  ${k}  (${f})`)
  }
}
if (!bad) console.log('Все буквальные ключи на месте.')
process.exit(bad ? 1 : 0)
