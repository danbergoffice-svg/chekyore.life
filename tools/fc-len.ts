// Длинные тексты событий рождения (first_choice): какие длиннее 40 слов и есть ли у них короткая версия (.short) -
// её показывают в первых событиях жизни в эксперименте X0 (ТЗ редизайна, правка 01).
// npx vite-node tools/fc-len.ts [--dump] - с --dump печатает тексты на трёх языках.
import { loadAllEras } from '../src/content'
import { allKeys, createT, hasKey, loadAllTexts, rawText } from '../src/i18n'

const eras = await loadAllEras()
await loadAllTexts()
const fc = new Set<string>()
for (const e of Object.values(eras)) for (const ev of e.events) if (ev.first_choice) fc.add(ev.id)
const w = (s: string) => s.split(/\s+/).filter(Boolean).length
const keys = allKeys('ru').filter((k) => /^ev\.[a-z0-9_]+\.text$/.test(k) && fc.has(k.split('.')[1]))
const long = keys.filter((k) => w(rawText('ru', k)) > 40)
console.log(`событий рождения ${fc.size}, длиннее 40 слов ${long.length}, без короткой версии ${long.filter((k) => !hasKey('ru', k.replace(/\.text$/, '.short'))).length}`)
// Слова в показанном тексте (больший из вариантов для мальчика и девочки); английский длиннее при том же смысле.
const LIMIT = { ru: 40, en: 50, tr: 40 }
for (const lang of ['ru', 'en', 'tr'] as const) {
  const t = createT(lang)
  const shown = (k: string) => Math.max(...(['m', 'f'] as const).map((sex) => w(t(k, {}, { sex }))))
  const bad = keys.map((k) => k.replace(/\.text$/, '.short')).filter((k) => hasKey(lang, k) && shown(k) > LIMIT[lang])
  if (bad.length) console.log(lang, `короткие длиннее ${LIMIT[lang]} слов:`, bad.join(', '))
}
if (process.argv.includes('--dump')) for (const k of long) for (const lang of ['ru', 'en', 'tr'] as const) console.log(`${lang} ${k}\t${rawText(lang, k)}`)
