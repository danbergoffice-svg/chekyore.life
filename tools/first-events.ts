// Первые события жизни: какие окна видит новичок в первые годы и сколько в них слов (ТЗ редизайна, правка 01).
// npx vite-node tools/first-events.ts [жизней, 300]
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { autoplay, eventTextKey } from '../src/engine/game'
import { newLife, rollBirth } from '../src/engine/life'
import { createT, loadAllTexts } from '../src/i18n'

const N = Number(process.argv[2] ?? 300)
const eras = await loadAllEras()
await loadAllTexts()
const t = createT('ru')
const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const nth: Map<string, number>[] = [new Map(), new Map(), new Map()]
const lens: number[][] = [[], [], []]
const ages: number[][] = [[], [], []]
for (let i = 0; i < N; i++) {
  const birth = rollBirth(71000 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
  const era = eras[birth.era]
  const s = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, livesBefore: 0 }, 71000 + i, undefined, birth), era, 8)
  const decisions = s.hero.diary.filter((d) => d.decision && d.eventId).slice(0, 3)
  decisions.forEach((d, k) => {
    const ev = era.events.find((e) => e.id === d.eventId)!
    const v = d.params?.v
    const key = eventTextKey(ev, typeof v === 'number' ? v : undefined)
    const text = t(key, {}, { sex: s.hero.sex, region: s.hero.region, religion: s.hero.religion })
    lens[k].push(words(text))
    ages[k].push(d.age)
    nth[k].set(ev.id, (nth[k].get(ev.id) ?? 0) + 1)
  })
}
const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.floor(v.length * p)]
for (let k = 0; k < 3; k++) {
  console.log(`выбор ${k + 1}: слов медиана ${q(lens[k], 0.5)}, 90% ${q(lens[k], 0.9)}; возраст медиана ${q(ages[k], 0.5)}; n=${lens[k].length}`)
  console.log('  чаще всего:', [...nth[k]].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${id} ${n}`).join(', '))
}
