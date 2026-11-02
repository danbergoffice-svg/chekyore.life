// Положение в обществе: N рождений по лотерее «как в жизни», первая жизнь ботом. Сколько событий положения (st_*)
// выпадает за жизнь по полосам, сколько раз герой поднимается и опускается между полосами.
// npx vite-node tools/status.ts [рождений, 400]
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'

const N = Number(process.argv[2] ?? 400)
const eras = await loadAllEras()
const events = new Map<string, number>()
const byClass = new Map<string, { lives: number; st: number; up: number; down: number }>()
for (let i = 0; i < N; i++) {
  const birth = rollBirth(88000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[birth.era]
  const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20 }, 88000 + i, undefined, birth), era)
  const a = byClass.get(birth.cls) ?? { lives: 0, st: 0, up: 0, down: 0 }
  a.lives++
  for (const d of s.hero.diary) {
    if (d.eventId?.startsWith('st_')) {
      a.st++
      events.set(d.eventId, (events.get(d.eventId) ?? 0) + 1)
    }
    if (d.key === 'diary.band_up') a.up++
    if (d.key === 'diary.band_down') a.down++
  }
  byClass.set(birth.cls, a)
}
console.log('сословие     жизней  событий положения на жизнь  подъёмов  падений (на 100 жизней)')
for (const [cls, a] of byClass) console.log(`${cls.padEnd(12)} ${String(a.lives).padStart(5)}  ${(a.st / a.lives).toFixed(2).padStart(10)}                ${Math.round((100 * a.up) / a.lives).toString().padStart(5)}    ${Math.round((100 * a.down) / a.lives).toString().padStart(5)}`)
console.log('события:', [...events].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', '))
