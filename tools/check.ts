// Проверка одной страны для авторов контента: npm run check -- CHN
// Проверяет тексты, ссылки, сцены, веру и прогоняет симуляцию жизней (средний возраст, ошибки, какие события не выпадают).
import fs from 'node:fs'
import path from 'node:path'
import { ERA_FOLDER, ERA_META, loadEra } from '../src/content'
import { leftoverBraces, validateEra } from '../src/content/validate'
import { autoplay, triggerStats } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import { allKeys, loadTexts, LANGS } from '../src/i18n'

async function main() {
  const id = process.argv[2]
  const lives = Number(process.argv[3] ?? 400)
  if (!id || !ERA_META[id]) {
    console.log(`Usage: npm run check -- <ID> [lives]. IDs: ${Object.keys(ERA_META).join(', ')}`)
    process.exit(1)
  }
  const folder = ERA_FOLDER[id]
  const dir = path.join('src/content', folder)
  const problems: string[] = []

  // 1. Файлы папки: JSON читается, ключи ru и en совпадают.
  const keys: Record<string, Set<string>> = { ru: new Set(), en: new Set() }
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    let data: unknown
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    } catch (e) {
      problems.push(`${f}: не JSON (${(e as Error).message})`)
      continue
    }
    const m = f.match(/^(?:ui_)?(ru|en)/)
    if (m) for (const k of Object.keys(data as object)) keys[m[1]].add(k)
  }
  for (const k of keys.ru) if (!keys.en.has(k)) problems.push(`ключ есть в ru, нет в en: ${k}`)
  for (const k of keys.en) if (!keys.ru.has(k)) problems.push(`ключ есть в en, нет в ru: ${k}`)

  // 2. Страна целиком.
  await Promise.all(LANGS.flatMap((lang) => [loadTexts(lang, 'common'), loadTexts(lang, folder)]))
  const era = await loadEra(id)
  problems.push(...validateEra(era))
  problems.push(...leftoverBraces([...keys.ru].filter((k) => allKeys('ru').includes(k))).map((k) => `остались {скобки}: ${k}`))

  const local = new Set<string>()
  for (const f of fs.readdirSync(dir)) if (f.startsWith('events')) for (const ev of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) local.add(ev.id)
  console.log(`${id}: событий всего ${era.events.length} (местных ${local.size}, общих ${era.events.length - local.size}), вестей ${era.news.length}`)

  // 3. Симуляция.
  const seen = new Map<string, number>()
  const ages: number[] = []
  const causes: Record<string, number> = {}
  const religions: Record<string, number> = {}
  let errors = 0
  let distinct = 0
  for (let i = 0; i < lives; i++) {
    try {
      const settings = { mode: 'full' as const, mortality: 'historical' as const, softenHeavy: false }
      let s = autoplay(newLife(era, settings, 7000 + i), era)
      ages.push(s.hero.age)
      causes[s.hero.deathCause!] = (causes[s.hero.deathCause!] ?? 0) + 1
      religions[s.hero.religion] = (religions[s.hero.religion] ?? 0) + 1
      const ids = new Set(s.hero.diary.map((d) => d.eventId).filter(Boolean) as string[])
      distinct += ids.size
      for (const e of ids) seen.set(e, (seen.get(e) ?? 0) + 1)
      if (i < 40 && heirs(s).length) {
        s = autoplay(continueWithHeir(s, era, heirs(s)[0].id), era)
        for (const d of s.hero.diary) if (d.eventId) seen.set(d.eventId, (seen.get(d.eventId) ?? 0) + 1)
      }
    } catch (e) {
      errors++
      if (errors <= 3) problems.push(`ошибка в симуляции (seed ${7000 + i}): ${(e as Error).stack?.split('\n').slice(0, 3).join(' ')}`)
    }
  }
  const mean = ages.reduce((a, b) => a + b, 0) / Math.max(1, ages.length)
  const adult = ages.filter((a) => a >= 18).length / Math.max(1, ages.length)
  const never = [...local].filter((e) => !seen.has(e) && !era.events.find((x) => x.id === e)?.trigger_only)
  console.log(`Историческая смертность: средний возраст ${mean.toFixed(1)} (ориентир lifeExpectancy ${era.lifeExpectancy}), до 18 лет дожили ${(adult * 100).toFixed(0)}%`)
  console.log('Причины смерти:', causes)
  console.log('Вера героев:', religions)
  console.log(`Разных событий за жизнь в среднем: ${(distinct / Math.max(1, ages.length)).toFixed(1)}`)
  console.log(`Местные события, которые ни разу не выпали за ${lives} жизней (${never.length}):`, never.slice(0, 60).join(', '))
  console.log('Отложенные последствия: отменены по причинам', triggerStats.cancelled, ', перенесены на год:', triggerStats.postponed)
  if (Math.abs(mean - era.lifeExpectancy) > 5) problems.push(`средний возраст ${mean.toFixed(1)} далёк от lifeExpectancy ${era.lifeExpectancy}: поправьте mortality.calibration`)

  if (problems.length) {
    console.log(`\nПРОБЛЕМЫ (${problems.length}):`)
    for (const p of problems.slice(0, 200)) console.log(' - ' + p)
    process.exit(1)
  }
  console.log('\nOK')
}
main()
