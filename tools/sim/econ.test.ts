import { it } from 'vitest'
import { loadEra } from '../../src/content'
import { autoplay } from '../../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../../src/engine/life'
import { acquireAsset, assetLock, assetPrice, canImprove, improveAsset, estateValue, buyEstate, canBuy, estateWorth } from '../../src/engine/estate'
import { businessLock, businessDef, createBusiness, heroStake } from '../../src/engine/business'
import type { AssetType, GameState } from '../../src/engine/types'

const TYPES: AssetType[] = ['farm', 'workshop', 'shop', 'house', 'warehouse']
function invest(s: GameState) {
  const h = s.hero
  for (let k = 0; k < 3; k++) {
    for (const a of s.family.estate?.assets ?? []) if (canImprove(s, a) && h.money > 1.5 * a.value * 0.3) improveAsset(s, a.id)
    const ty = TYPES.filter((t) => !assetLock(s, t)).sort((a, b) => assetPrice(s, a) - assetPrice(s, b))[0]
    if (ty && h.money > assetPrice(s, ty) * 1.3) acquireAsset(s, { type: ty })
    for (const b of ['shipping', 'caravan', 'trading_house', 'artel']) if (!businessLock(s, b, businessDef(b)!.capital) && h.money > businessDef(b)!.capital * 1.5) createBusiness(s, { type: b, capital: businessDef(b)!.capital })
    if (canBuy(s, 'land')) buyEstate(s, 'land')
  }
}
const worth = (s: GameState) => Math.round(Math.max(0, s.hero.money) + estateValue(s) + estateWorth(s.hero, s) + (s.family.trade?.businesses ?? []).filter((b) => b.active).reduce((x, b) => x + b.capital * heroStake(b), 0))

it('econ', async () => {
  for (const eraId of ['EUR', 'CHN', 'ISL']) {
    const era = await loadEra(eraId)
    const ref = era.classes.find((c) => c.id === 'craftsman')?.upkeep ?? 200
    const rows: string[] = []
    for (let seed = 1; seed <= 6; seed++) {
      const opts = { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 70 } as const
      let s = newLife(era, opts, 500 + seed)
      const gens: string[] = []
      for (let g = 0; g < 5; g++) {
        s = autoplay(s, era, 130, undefined, (fs, st) => { if (process.env.INVEST) invest(st); return null })
        gens.push(`${s.hero.cls[0]}${s.hero.age}:${(worth(s) / ref).toFixed(0)}(${s.family.estate?.assets.length ?? 0}a,${(s.family.trade?.businesses ?? []).filter((b) => b.active).length}b)`)
        const hs = heirs(s); if (!hs.length) break
        s = continueWithHeir(s, era, hs[0].id)
      }
      rows.push(gens.join('  '))
    }
    console.log(`${eraId} (в годовых расходах ремесленника, ${ref}):\n` + rows.join('\n'))
  }
}, 300000)
