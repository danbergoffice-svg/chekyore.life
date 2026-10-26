// Ранние браки по странам: доля обручённых в детстве, возраст первой свадьбы, кто выбирает. npm run marriage -- [жизней]
import { ERA_IDS, loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'

async function main() {
  const lives = Number(process.argv[2] ?? 300)
  const settings = { mode: 'quick' as const, mortality: 'soft' as const, softenHeavy: false }
  console.log('страна пол  n   обруч%  свадьба≤15%  выбрали%  ср.возраст_брака  тело(ср)')
  for (const id of ERA_IDS) {
    const era = await loadEra(id)
    for (const sex of ['f', 'm'] as const) {
      let n = 0, betrothed = 0, early = 0, chosen = 0, wedAges: number[] = [], bodies: number[] = []
      for (let i = 0; n < lives && i < lives * 4; i++) {
        let s = newLife(era, settings, 9100 + i)
        if (s.hero.sex !== sex) continue
        s = autoplay(s, era)
        if (s.hero.age < 20) continue
        n++
        const h = s.hero
        if (h.seen.mar_betrothal !== undefined || h.seen.mar_betrothal_m !== undefined) betrothed++
        if (h.seen.mar_bride_chosen !== undefined) chosen++
        const w = h.diary.find((d) => d.key === 'diary.married')
        if (w) {
          wedAges.push(w.age)
          if (w.age <= 15) early++
        }
        bodies.push(h.body ?? 0)
      }
      const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-')
      const pc = (x: number) => String(Math.round((100 * x) / Math.max(1, n))).padStart(3)
      console.log(`${id.padEnd(6)} ${sex}  ${String(n).padStart(3)}   ${pc(betrothed)}     ${pc(early)}         ${pc(chosen)}       ${avg(wedAges).padStart(5)}            ${avg(bodies)}`)
    }
  }
}
main()
