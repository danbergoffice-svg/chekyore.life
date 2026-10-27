// Доли получения наград: прогон жизней по всем странам. Запуск: npm run achievements -- [жизней на страну] [historical|soft]
// Ни одна обычная награда не должна выпадать чаще 60% и реже 0,2% (кроме секретных и трудных).
import { loadAllEras } from '../src/content'
import { ACHIEVEMENTS, checkLife } from '../src/engine/achievements'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife, summarize } from '../src/engine/life'
import type { LifeSummary } from '../src/engine/types'

const per = Number(process.argv[2] ?? 150)
const mortality = (process.argv[3] ?? 'soft') as 'soft' | 'historical'
const eras = await loadAllEras()
const count: Record<string, number> = {}
let lives = 0
for (const era of Object.values(eras)) {
  for (let k = 0; k < per; k++) {
    // Род: до трёх поколений подряд, чтобы были видны награды рода.
    let s = autoplay(newLife(era, { mode: 'quick', mortality, softenHeavy: false, livesBefore: 1 }, 90000 + lives), era)
    const memorial: LifeSummary[] = []
    for (let g = 0; g < 3; g++) {
      // После переезда герой живёт и умирает уже в другой стране.
      const now = eras[s.hero.era] ?? era
      const life = summarize(s, now)
      memorial.push(life)
      lives++
      for (const id of checkLife(life, memorial, new Set())) count[id] = (count[id] ?? 0) + 1
      const h = heirs(s)
      if (!h.length || g === 2) break
      const next = continueWithHeir(s, now, h[0].id)
      s = autoplay(next, eras[next.hero.era] ?? now)
    }
  }
}
const rows = ACHIEVEMENTS.map((a) => {
  const share = (count[a.id] ?? 0) / lives
  const flag = !a.secret && !a.hard && !a.era && (share > 0.6 || share < 0.002) ? ' ⚠' : ''
  return `${a.id.padEnd(22)} ${(share * 100).toFixed(2).padStart(6)}%${flag}`
})
console.log(`Жизней: ${lives}, смертность ${mortality}\n` + rows.join('\n'))
