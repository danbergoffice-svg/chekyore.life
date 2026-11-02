// Калибровка целей жизни (docs/TZ_goal.md): N рождений по лотерее «как в жизни», каждая подходящая цель
// проживается дважды - случайный выбор и «всегда ▲» (вариант с наибольшим вкладом в цель).
// Пишет src/content/goal_tiers.json: доля исполнивших (среднее двух способов) по сословию и в целом.
// npx vite-node tools/goals.ts [рождений, 300] [--dry - не записывать]
import { writeFileSync } from 'node:fs'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { GOALS, GOAL_STEPS, goalFits, goalImpact, setGoal, tierOf } from '../src/engine/goals'
import type { GoalId } from '../src/engine/goals'
import { newLife, rollBirth } from '../src/engine/life'
import type { ChoiceDef, GameState } from '../src/engine/types'

const N = Number(process.argv[2] ?? 300)
const dry = process.argv.includes('--dry')
const eras = await loadAllEras()

const greedy = (options: ChoiceDef[], state: GameState): number | null => {
  const id = state.hero.goal!.id
  let best = -1
  let bestV = 0.5
  options.forEach((c, i) => {
    const v = goalImpact(id, c)
    if (v > bestV) [best, bestV] = [i, v]
  })
  return best >= 0 ? best : null
}

type Acc = { lives: number; done: [number, number]; steps: [number, number]; first: number[]; reach: number[] }
const acc = new Map<string, Acc>()
const get = (k: string) => {
  let a = acc.get(k)
  if (!a) acc.set(k, (a = { lives: 0, done: [0, 0], steps: [0, 0], first: [], reach: [0, 0, 0, 0, 0] }))
  return a
}

for (let i = 0; i < N; i++) {
  const seed = 31000 + i
  const birth = rollBirth(seed, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[birth.era]
  for (const g of GOALS) {
    if (!goalFits(g, birth.cls)) continue
    const keys = [`${g.id}|${birth.cls}`, `${g.id}|all`]
    for (const k of keys) get(k).lives++
    ;[undefined, greedy].forEach((pick, p) => {
      const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, livesBefore: 1, goalWeight: 1.5 }, seed, undefined, birth)
      setGoal(s, era, g.id)
      autoplay(s, era, 130, pick)
      const goal = s.hero.goal!
      for (const k of keys) {
        const a = get(k)
        a.steps[p] += goal.steps.length
        if (goal.steps.length >= GOAL_STEPS) a.done[p]++
        if (p === 1 && goal.steps.length) a.first.push(goal.steps[0])
        if (p === 1) for (let n = 1; n <= goal.steps.length; n++) a.reach[n]++
      }
    })
  }
  if (i % 50 === 49) console.error(`${i + 1}/${N}`)
}

const pct = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(0)}%`.padStart(4)
const out: Record<string, Record<string, number>> = {}
console.log('цель|сословие            жизней  случайно  по ▲   шагов сл/▲   1-й шаг (медиана)  слово   по ▲ дошли до шагов 1/2/3')
for (const [k, a] of [...acc].sort()) {
  const [id, cls] = k.split('|')
  const rate = (a.done[0] + a.done[1]) / 2 / Math.max(1, a.lives)
  if (a.lives >= 8) (out[id] ??= {})[cls] = Math.round(rate * 100) / 100
  const first = a.first.sort((x, y) => x - y)[Math.floor(a.first.length / 2)] ?? '-'
  console.log(`${k.padEnd(26)} ${String(a.lives).padStart(5)}  ${pct(a.done[0], a.lives)}     ${pct(a.done[1], a.lives)}   ${(a.steps[0] / a.lives).toFixed(1)}/${(a.steps[1] / a.lives).toFixed(1)}       ${String(first).padStart(3)}            ${tierOf(rate)}       ${a.reach.slice(1, 4).map((x) => pct(x, a.lives)).join('/')}`)
}
if (!dry) {
  const sorted = Object.fromEntries((GOALS.map((g) => g.id) as GoalId[]).filter((id) => out[id]).map((id) => [id, out[id]]))
  writeFileSync(new URL('../src/content/goal_tiers.json', import.meta.url), JSON.stringify(sorted, null, 2) + '\n')
  console.log('записано: src/content/goal_tiers.json')
}
