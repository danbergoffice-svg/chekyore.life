// Уникальные первые жизни: N игроков по 10 жизней подряд (случайные страны) - с флагом unique_lives и без.
// Считает, какая доля событий жизни уже была в прошлых жизнях игрока, и сколько разных чисел детей.
// npx vite-node tools/unique.ts [игроков]
import { ERA_IDS, loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife, pickKidsTarget } from '../src/engine/life'
import { next } from '../src/engine/rng'
import type { GameSettings, LifeSummary } from '../src/engine/types'

const players = Number(process.argv[2] ?? 30)
const eras = await loadAllEras()
for (const unique of [false, true]) {
  let events = 0
  let repeats = 0
  let inLife = 0
  const kidsDistinct: number[] = []
  const adultKids: number[][] = []
  const rep = new Map<string, number>()
  for (let p = 0; p < players; p++) {
    const memorial: LifeSummary[] = []
    const kids: number[] = []
    const seen = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const seed = 1000 * p + i + 7
      const h = { rng: seed }
      const id = ERA_IDS[Math.floor(next(h) * ERA_IDS.length)]
      const era = eras[id]
      const settings: GameSettings = { mode: 'quick', mortality: 'soft', softenHeavy: false, livesBefore: i }
      if (unique) {
        settings.eventsSeen = [...new Set(memorial.flatMap((l) => l.diary.map((d) => d.eventId).filter((x): x is string => !!x)))]
        settings.kidsTarget = pickKidsTarget(memorial.filter((l) => l.age >= 25).map((l) => l.children), ((k) => () => next(k))({ rng: (seed ^ 0x9e3779b9) >>> 0 }))
      }
      const s = autoplay(newLife(era, settings, seed), era)
      const sum = s.family.lives[s.family.lives.length - 1]
      memorial.push(sum)
      const ids = sum.diary.map((d) => d.eventId).filter((x): x is string => !!x)
      const counts = new Map<string, number>()
      for (const e of ids) counts.set(e, (counts.get(e) ?? 0) + 1)
      for (const [e, n] of counts) {
        events += n
        if (seen.has(e)) {
          repeats += n
          rep.set(e, (rep.get(e) ?? 0) + n)
        }
        inLife += n - 1
      }
      for (const e of ids) seen.add(e)
      if (sum.age >= 25) kids.push(sum.children)
    }
    kidsDistinct.push(new Set(kids).size / Math.max(1, kids.length))
    adultKids.push(kids)
  }
  console.log(unique ? 'С уникальностью' : 'Без уникальности')
  if (process.env.TOP) {
    const typeOf = (id: string) => { for (const e of Object.values(eras)) { const ev = e.events.find((x) => x.id === id); if (ev) return `${ev.type}${ev.milestone ? '/milestone' : ''}${ev.global_chance !== undefined ? '/global' : ''}${ev.choices?.length ? '' : '/moment'}` } return '?' }
    const byType = new Map<string, number>()
    for (const [id, n] of rep) byType.set(typeOf(id), (byType.get(typeOf(id)) ?? 0) + n)
    console.log('  повторы по типам:', [...byType].sort((a, b) => b[1] - a[1]).slice(0, 8))
    console.log('  чаще всего:', [...rep].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => `${id}:${n}`).join(' '))
  }
  console.log(`  событий в жизнях: ${events}, уже были в прошлых жизнях: ${((repeats / events) * 100).toFixed(1)}%, повторы внутри жизни: ${((inLife / events) * 100).toFixed(1)}%`)
  console.log(`  разных чисел детей среди взрослых жизней: ${((kidsDistinct.reduce((a, b) => a + b, 0) / players) * 100).toFixed(0)}%; пример: ${adultKids.slice(0, 3).map((k) => k.join(',')).join(' | ')}`)
}
