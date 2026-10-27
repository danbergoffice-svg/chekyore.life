// Сколько лет добавляет взрослому бережный образ жизни (разнообразная еда, прогулки, врач, баня) — по странам.
// Пишет src/content/longevity.json: подсказка во вкладке «Герой» и справка о продолжительности жизни.
// Запуск: npm run longevity -- [жизней на страну, по умолчанию 400]
import fs from 'node:fs'
import { loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'

const per = Number(process.argv[2] ?? 400)
const eras = await loadAllEras()
const CAREFUL: Record<string, string> = { food: 'varied', exercise: 'walks', medicine: 'physician', baths: 'daily' }
const out: Record<string, { adult: number; careful: number; bonus: number }> = {}
let seed = 1
for (const era of Object.values(eras)) {
  const ages = { normal: [] as number[], careful: [] as number[] }
  for (const mode of ['normal', 'careful'] as const) {
    for (let i = 0; i < per; i++) {
      const s = newLife(era, { mode: 'quick', mortality: 'historical', softenHeavy: false }, 300000 + seed++)
      if (s.hero.cls === 'slave' || s.hero.cls === 'peasant') continue
      if (mode === 'careful') for (const l of era.lifestyle) if (l.options.some((o) => o.id === CAREFUL[l.id])) s.hero.lifestyle[l.id] = CAREFUL[l.id]
      const end = autoplay(s, era)
      if (end.hero.age >= 20) ages[mode].push(end.hero.age)
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  out[era.id] = { adult: Math.round(mean(ages.normal) * 10) / 10, careful: Math.round(mean(ages.careful) * 10) / 10, bonus: Math.round(mean(ages.careful) - mean(ages.normal)) }
}
const all = Object.values(out).map((x) => x.bonus).sort((a, b) => a - b)
const file = { per, bonusMin: all[Math.floor(all.length * 0.15)], bonusMax: all[Math.floor(all.length * 0.85)], eras: out }
fs.writeFileSync('src/content/longevity.json', JSON.stringify(file, null, 2) + '\n')
console.log(file)
