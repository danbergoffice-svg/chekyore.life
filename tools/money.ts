// Деньги по сословиям: N рождений по лотерее «как в жизни», первая жизнь проживается ботом (случайный выбор).
// Достаток в годовых расходах сословия (медиана на пике и в конце), доля жизней в долгах и в долговой яме,
// сколько лет в долгах, сколько раз выпали события долгов. После правок денег или событий debt_*.
// npx vite-node tools/money.ts [рождений, 400] [--no-debt-events - без событий debt_*, чтобы видеть вклад движка]
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'

const N = Number(process.argv[2] ?? 400)
const eras = await loadAllEras()
if (process.argv.includes('--no-debt-events')) for (const e of Object.values(eras)) e.events = e.events.filter((ev) => !ev.id.startsWith('debt_'))
type Row = { cls: string; end: number; peak: number; debt: boolean; deep: boolean; debtYears: number; age: number }
const rows: Row[] = []
const events = new Map<string, number>()
for (let i = 0; i < N; i++) {
  const birth = rollBirth(52000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[birth.era]
  const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, livesBefore: 1 }, 52000 + i, undefined, birth), era)
  const h = s.hero
  const up = Math.max(100, era.classes.find((c) => c.id === birth.cls)!.upkeep)
  const adult = h.history.filter((y) => y.age >= 18)
  for (const d of h.diary) if (d.eventId?.startsWith('debt_')) events.set(d.eventId, (events.get(d.eventId) ?? 0) + 1)
  rows.push({
    cls: birth.cls,
    end: h.money / up,
    peak: Math.max(0, ...adult.map((y) => y.money)) / up,
    debt: adult.some((y) => y.money < 0),
    deep: h.diary.some((d) => d.key === 'diary.debt_deep'),
    debtYears: adult.filter((y) => y.money < 0).length,
    age: h.age,
  })
}
const med = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0)
const pct = (x: number, n: number) => `${Math.round((100 * x) / Math.max(1, n))}%`.padStart(4)
console.log('сословие     жизней  достаток в конце (медиана)  на пике   в долгах  в яме  лет в долгах (у должников)')
for (const cls of ['all', 'slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']) {
  const r = rows.filter((x) => cls === 'all' || x.cls === cls)
  if (!r.length) continue
  const debtors = r.filter((x) => x.debt)
  console.log(`${cls.padEnd(12)} ${String(r.length).padStart(5)}  ${med(r.map((x) => x.end)).toFixed(1).padStart(8)}                  ${med(r.map((x) => x.peak)).toFixed(1).padStart(6)}   ${pct(debtors.length, r.length)}    ${pct(r.filter((x) => x.deep).length, r.length)}   ${med(debtors.map((x) => x.debtYears))}`)
}
console.log('события долгов:', [...events].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет')
console.log('средний возраст смерти:', (rows.reduce((a, x) => a + x.age, 0) / rows.length).toFixed(1))
