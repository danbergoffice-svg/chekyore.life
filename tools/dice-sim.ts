// Кости в жизнях бота: доля жизней с партиями, сколько партий, до какой ставки доходят, разорение и кабала.
// Ориентиры ТЗ: разоряются через кости не больше 15% жизней; до 3-й ставки кто-то должен доходить.
// npx vite-node tools/dice-sim.ts [жизней, 400]
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'

const N = Number(process.argv[2] ?? 400)
const eras = await loadAllEras()
let played = 0
let games = 0
let ruined = 0
let bonded = 0
let heavy = 0
const stake = [0, 0, 0, 0, 0, 0]
const lust: number[] = []
for (let i = 0; i < N; i++) {
  const birth = rollBirth(81000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[birth.era]
  const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, livesBefore: 1 }, 81000 + i, undefined, birth), era)
  const d = s.hero.dice
  if (!d?.games) continue
  played++
  games += d.games
  stake[d.maxStake]++
  lust.push(d.lust)
  if (d.ruined) ruined++
  if (d.games >= 10) heavy++
  if (s.hero.diary.some((e) => e.key === 'diary.dice_lost.self')) bonded++
}
const pct = (x: number, n = N) => `${Math.round((100 * x) / Math.max(1, n))}%`
console.log(`жизней ${N}: играли в кости ${pct(played)}, партий у игравших в среднем ${(games / Math.max(1, played)).toFixed(1)}, 10+ партий ${pct(heavy)}`)
console.log(`высшая ставка (у игравших): ${[1, 2, 3, 4, 5].map((l) => `${l}: ${pct(stake[l], played)}`).join(', ')}`)
console.log(`разорились через кости (дом, земля, семья, свобода) ${pct(ruined)} всех жизней; в кабалу ${pct(bonded)}`)
console.log(`азарт в конце жизни у игравших: медиана ${[...lust].sort((a, b) => a - b)[Math.floor(lust.length / 2)] ?? 0}`)
