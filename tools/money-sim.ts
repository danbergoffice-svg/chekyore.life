// Деньги событий против казны: N жизней ботом, по сословиям - казна в 40 лет, прирост в год с 30 до 40
// и сумма денежного выбора в событии (как её возьмёт движок) в долях казны в тот год. После правок scaledMoney.
// npx vite-node tools/money-sim.ts [жизней, 300]
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'
import { scaledMoney } from '../src/engine/rules'
const eras = await loadAllEras()
const N = Number(process.argv[2] ?? 300)
const q = (v: number[], p: number) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length * p)] : 0)
const by: Record<string, { stock: number[]; ev: number[]; incr: number[] }> = {}
for (let i = 0; i < N; i++) {
  const birth = rollBirth(61000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[birth.era]
  const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, livesBefore: 1 }, 61000 + i, undefined, birth), era)
  const h = s.hero
  const r = (by[birth.cls] ??= { stock: [], ev: [], incr: [] })
  const byId = new Map(era.events.map((e) => [e.id, e]))
  for (const d of h.diary) {
    if (d.age < 25 || !d.eventId) continue
    const ck = (d.params?.choice as { key?: string } | undefined)?.key
    const ev = byId.get(d.eventId)
    const c = ev?.choices?.find((x) => ck === `ev.${ev.id}.${x.id}`)
    if (!c) continue
    const res = d.params?.result
    const list = [...(c.effects ?? []), ...(res === 'success' ? c.risk_roll?.on_success ?? [] : res === 'failure' ? c.risk_roll?.on_failure ?? [] : [])]
    for (const e of list) if ('param' in e && e.param === 'money') {
      const y = h.history.find((x) => x.age === d.age)
      if (!y || y.money <= 0) continue
      r.ev.push(Math.abs(scaledMoney(h, era, e.delta)) / y.money)
    }
  }
  for (const y of h.history) if (y.age === 40) r.stock.push(y.money)
  const a = h.history.find((x) => x.age === 30), b = h.history.find((x) => x.age === 40)
  if (a && b) r.incr.push((b.money - a.money) / 10)
}
console.log('сословие   капитал в 40 (мед)  прирост в год 30-40 (мед)  сумма события / капитал: медиана, 90%')
for (const [c, r] of Object.entries(by)) console.log(c.padEnd(10), String(q(r.stock, 0.5)).padStart(8), String(Math.round(q(r.incr, 0.5))).padStart(14), `${(100 * q(r.ev, 0.5)).toFixed(1)}%  ${(100 * q(r.ev, 0.9)).toFixed(1)}%  n=${r.ev.length}`)
