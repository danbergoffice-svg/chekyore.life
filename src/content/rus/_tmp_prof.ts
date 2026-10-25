import { loadEra } from '/home/user/chekyore.life/src/content'
import { autoplay } from '/home/user/chekyore.life/src/engine/game'
import { newLife } from '/home/user/chekyore.life/src/engine/life'
const era = await loadEra('RUS')
const c: Record<string, number> = {}
const reg: Record<string, number> = {}
for (let i = 0; i < 400; i++) {
  const s = autoplay(newLife(era, { mode: 'full', mortality: 'historical', softenHeavy: false } as any, 7000 + i), era)
  const p = (s.hero as any).profession ?? 'none'
  c[p] = (c[p] ?? 0) + 1
  const k = s.hero.region + ':' + (s as any).year
  reg[s.hero.region] = (reg[s.hero.region] ?? 0) + 1
}
console.log(c, reg)
