// Беды хозяйств рода (план вкладки «Герой», 19.11, docs/TZ_hero.md п. 4): родовое можно потерять. Раз в год у каждого
// хозяйства (Family.estate) - свой небольшой риск; беда приходит событием с выбором (events_perils.json), не тихой
// строкой. Не больше одной беды в год. Выбор меняет именно то хозяйство, о котором событие (ActiveEvent.assetId).
//
// Пожар - доходный дом, мастерская, лавка, склад; в городе чаще, каменный (улучшение 2+) - вдвое реже.
// Паводок и мор - хозяйство (поле), склад у реки. Управляющий ворует - хозяйства сверх того, что род ведёт сам.
// Опала - землевладельцам и знати. Тяжба соседа - хозяйство.
import { ERA_META } from '../content'
import { chance, int } from './rng'
import { changeParam, note } from './rules'
import { heroShare, saleValue, underSteward } from './estate'
import type { Asset, GameState, TextParam } from './types'

export type PerilId = 'fire' | 'flood' | 'steward' | 'disgrace' | 'lawsuit'

/** Шанс в год для одного хозяйства и кого касается. За 40 взрослых лет примерно каждое второе хозяйство хоть раз попадёт в беду. */
export const PERILS: { id: PerilId; chance: number; types: string[]; classes?: string[] }[] = [
  { id: 'fire', chance: 0.01, types: ['house', 'workshop', 'shop', 'warehouse'] },
  { id: 'flood', chance: 0.012, types: ['farm', 'warehouse'] },
  { id: 'steward', chance: 0.025, types: ['farm', 'workshop', 'shop', 'house', 'warehouse'] },
  { id: 'disgrace', chance: 0.008, types: ['farm', 'workshop', 'shop', 'house', 'warehouse'], classes: ['landowner', 'noble', 'royal'] },
  { id: 'lawsuit', chance: 0.006, types: ['farm'] },
]

/** Доли цены хозяйства: отстроить, продать пепелище, откупиться от опалы, тяжба, мзда. */
export const COST = { rebuild: 0.4, ruins: 0.15, bribe: 0.3, court: 0.08, sue: 0.1, lawsuitWin: 0.6, sueWin: 0.5, stewardCut: 0.2, floodWear: 30 }

const tags = (state: GameState) => ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.tags ?? []
const river = (state: GameState) => ERA_META[state.hero.era]?.features.includes('river') ?? false

/** Поправка шанса: город и река, каменный дом, доброе имя и навык торговли против воровства. */
function perilChance(state: GameState, id: PerilId, a: Asset): number {
  let p = PERILS.find((x) => x.id === id)!.chance
  const t = tags(state)
  if (id === 'fire') {
    if (t.includes('capital') || t.includes('port')) p *= 1.5
    if ((a.level ?? 0) >= 2) p *= 0.5
  }
  if (id === 'flood' && river(state)) p *= 1.5
  if (id === 'steward') {
    if (!underSteward(state, a)) return 0
    p *= Math.max(0.4, 1 - (state.hero.hidden.reputation - 50) / 100 - (state.hero.skills.trade ?? 0) / 200)
  }
  return p
}

/** Беда этого года (одна на весь род) или null. Расходует общий поток случайности только при наличии хозяйств. */
export function assetPeril(state: GameState): { eventId: string; assetId: string } | null {
  const hero = state.hero
  const mine = (state.family.estate?.assets ?? []).filter((a) => heroShare(state, a) > 0 && (a.idleUntil ?? 0) < state.year)
  if (!mine.length || hero.cls === 'slave') return null
  for (const a of mine)
    for (const p of PERILS) {
      if (!p.types.includes(a.type) || (p.classes && !p.classes.includes(hero.cls))) continue
      if (chance(state, perilChance(state, p.id, a))) return { eventId: `peril_${p.id}`, assetId: a.id }
    }
  return null
}

const asset = (state: GameState, id?: string) => state.family.estate?.assets.find((a) => a.id === id)

/** Числа для текста события: {what} - что за хозяйство, {rebuild}, {ruins}, {bribe}, {court}, {sue} - суммы. */
export function perilParams(state: GameState, assetId?: string): Record<string, TextParam> {
  const a = asset(state, assetId)
  if (!a) return {}
  const share = heroShare(state, a)
  const k = (x: number) => Math.max(1, Math.round(a.value * x * share))
  const coin = ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.coin ?? 'coin'
  return { what: { key: `asset.${a.type}` }, rebuild: k(COST.rebuild), ruins: k(COST.ruins), bribe: k(COST.bribe), court: k(COST.court), sue: k(COST.sue), coin: { key: `coin.${coin}` } }
}

export type PerilAction = 'rebuild' | 'sell_ruins' | 'abandon' | 'wait' | 'sell_half' | 'dismiss' | 'sue' | 'ignore' | 'pay' | 'yield' | 'court'

function remove(state: GameState, a: Asset): void {
  const estate = state.family.estate!
  estate.assets = estate.assets.filter((x) => x !== a)
  estate.debts = estate.assets.reduce((s, x) => s + (x.pledged ?? 0), 0)
}

/**
 * Выбор игрока в беде. Возвращает 'success' | 'failure' для исхода (тяжба, суд с управляющим) или 'ok'.
 * Залог при потере хозяйства гасится: заимодавец забирает то, что осталось.
 */
export function applyPeril(state: GameState, assetId: string | undefined, action: PerilAction): 'ok' | 'success' | 'failure' {
  const a = asset(state, assetId)
  const hero = state.hero
  if (!a) return 'ok'
  const share = heroShare(state, a)
  const k = (x: number) => Math.max(1, Math.round(a.value * x * share))
  const lose = (got: number) => {
    hero.money += Math.max(0, got - (a.pledged ?? 0))
    remove(state, a)
    changeParam(hero, 'happiness', -5)
    note(state, { key: 'diary.peril_lost', params: { what: { key: `asset.${a.type}` } }, topic: 'money', icon: 'loss', score: 28, mood: -5, major: true })
  }
  switch (action) {
    case 'rebuild':
      hero.money -= k(COST.rebuild)
      a.condition = 100
      a.idleUntil = state.year + 1
      return 'ok'
    case 'sell_ruins':
      lose(k(COST.ruins))
      return 'ok'
    case 'abandon':
      lose(0)
      return 'ok'
    case 'wait':
      a.idleUntil = state.year + 1
      a.condition = Math.max(0, a.condition - COST.floodWear)
      return 'ok'
    case 'sell_half':
      lose(Math.round(saleValue(state, a) * 0.5))
      return 'ok'
    case 'dismiss':
      a.idleUntil = state.year + 1
      return 'ok'
    case 'sue': {
      hero.money -= k(COST.sue)
      if (chance(state, COST.sueWin)) {
        hero.money += k(COST.sue * 1.5)
        return 'success'
      }
      a.idleUntil = state.year + 1
      return 'failure'
    }
    case 'ignore':
      a.income = Math.round(a.income * (1 - COST.stewardCut))
      return 'ok'
    case 'pay':
      hero.money -= k(COST.bribe)
      hero.hidden.reputation = Math.max(0, hero.hidden.reputation - 3)
      return 'ok'
    case 'yield':
      lose(0)
      return 'ok'
    case 'court': {
      hero.money -= k(COST.court)
      if (chance(state, COST.lawsuitWin + int(state, -10, 10) / 100)) return 'success'
      lose(0)
      return 'failure'
    }
  }
  return 'ok'
}
