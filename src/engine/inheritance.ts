// Наследство семейных активов (ТЗ семейной системы, этап 3): завещание и раздел между детьми.
// Без завещания - по обычаю края (equal / sons_first / youngest_hearth), с завещанием - по воле героя, если обычай
// позволяет обойти наследника; обойдённый по обычаю наследник может затеять спор. Деньги по-прежнему делит
// inheritanceShare (life.ts), наделы и рабов - estateShare: здесь только реестр Family.estate.
import ASSETS from '../content/assets.json'
import { chance } from './rng'
import { emitEstate } from './estate'
import { note } from './rules'
import type { Asset, Estate, EraDef, GameState, Npc, Will } from './types'

type Custom = 'equal' | 'sons_first' | 'youngest_hearth'
const RULES = ASSETS.inheritance as { customs: Record<Custom, { disinherit: boolean }>; disputeChance: number; disputeCost: number; disputeAttitude: number }

export interface WillValidation {
  ok: boolean
  errors: string[]
}

/** Кому что досталось: id наследника → доли активов; кто обойдён против обычая. */
export interface InheritanceResult {
  shares: Record<string, { assetId: string; share: number }[]>
  byWill: boolean
  /** Наследники, которым обычай дал бы долю, а воля - ничего. */
  slighted: string[]
}

export function customOf(state: GameState, era: EraDef): Custom {
  return (era.regions.find((r) => r.id === state.hero.region)?.inheritance ?? era.inheritance) as Custom
}

/** Наследники - дети (и дальше по роду), как в heirs() life.ts; передаются снаружи, чтобы не тянуть life.ts. */
function youngestSon(kids: Npc[]): Npc | undefined {
  const sons = kids.filter((k) => k.sex === 'm')
  return sons.length ? sons.reduce((a, b) => (b.birthYear > a.birthYear ? b : a)) : undefined
}

/** Раздел по обычаю: самое ценное - первому по очереди, дальше по кругу. */
export function customDistribution(state: GameState, era: EraDef, kids: Npc[]): Will['distributions'] {
  const assets = [...(state.family.estate?.assets ?? [])].sort((a, b) => b.value - a.value)
  if (!assets.length || !kids.length) return []
  const custom = customOf(state, era)
  const sons = kids.filter((k) => k.sex === 'm')
  let order: Npc[] = kids
  if (custom === 'sons_first' && sons.length) order = sons
  if (custom === 'youngest_hearth' && sons.length) {
    // Младший сын - хранитель очага: ему самое ценное (и ещё раз в круге), старшим сыновьям - остальное.
    const y = youngestSon(kids)!
    order = [y, ...sons.filter((s) => s !== y)]
  }
  return assets.map((a, i) => ({ assetId: a.id, beneficiaryId: order[i % order.length].id, share: 1 }))
}

/** Проверка завещания: наследник существует, актив есть, доли не больше 100%, обычай позволяет обойти. */
export function validateWill(state: GameState, era: EraDef, will: Will, kids: Npc[]): WillValidation {
  const errors: string[] = []
  const assets = state.family.estate?.assets ?? []
  const ids = new Set(kids.map((k) => k.id))
  const sum: Record<string, number> = {}
  for (const d of will.distributions) {
    if (!ids.has(d.beneficiaryId)) errors.push('no_heir')
    if (!assets.some((a) => a.id === d.assetId)) errors.push('no_asset')
    if (!(d.share > 0 && d.share <= 1)) errors.push('bad_share')
    sum[d.assetId] = (sum[d.assetId] ?? 0) + d.share
  }
  if (Object.values(sum).some((s) => s > 1 + 1e-9)) errors.push('over_100')
  const custom = customOf(state, era)
  if (!RULES.customs[custom]?.disinherit && assets.length) {
    // Где наследника обойти нельзя (степной обычай): младший сын должен получить хоть что-то.
    const y = youngestSon(kids)
    if (y && !will.distributions.some((d) => d.beneficiaryId === y.id)) errors.push('custom_forbids')
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

/** Составить завещание. false - не прошло проверку. */
export function createWill(state: GameState, era: EraDef, distributions: Will['distributions'], kids: Npc[]): WillValidation {
  const will: Will = { createdYear: state.year, by: state.hero.id, distributions }
  const v = validateWill(state, era, will, kids)
  if (!v.ok) return v
  const estate = state.family.estate as Estate
  estate.will = will
  note(state, { key: 'diary.will_made', topic: 'family', score: 16 })
  emitEstate('will_created', state, { assets: estate.assets.length, heirs: new Set(distributions.map((d) => d.beneficiaryId)).size })
  return v
}

/** Раздел имущества между наследниками (по завещанию этого героя, если оно действительно, иначе по обычаю). */
export function distributeEstate(state: GameState, era: EraDef, kids: Npc[]): InheritanceResult {
  const estate = state.family.estate
  const will = estate?.will?.by === state.hero.id && validateWill(state, era, estate.will, kids).ok ? estate.will : undefined
  const list = will ? will.distributions : customDistribution(state, era, kids)
  const shares: InheritanceResult['shares'] = {}
  for (const d of list) (shares[d.beneficiaryId] ??= []).push({ assetId: d.assetId, share: d.share })
  // Нераспределённое по завещанию - по обычаю.
  if (will) {
    const given: Record<string, number> = {}
    for (const d of list) given[d.assetId] = (given[d.assetId] ?? 0) + d.share
    for (const d of customDistribution(state, era, kids)) {
      const rest = 1 - (given[d.assetId] ?? 0)
      if (rest > 1e-9) (shares[d.beneficiaryId] ??= []).push({ assetId: d.assetId, share: rest })
    }
  }
  const byCustom = new Set(customDistribution(state, era, kids).map((d) => d.beneficiaryId))
  const slighted = will ? [...byCustom].filter((id) => !shares[id]?.length) : []
  return { shares, byWill: !!will, slighted }
}

/**
 * Имущество рода для нового героя: его доли остаются в реестре (на его id), доли братьев и сестёр - тоже записаны
 * (на их прежние id), целиком ушедшее другим - в estate.passed. Спор: обойдённый против обычая наследник.
 */
export function estateForHeir(prev: GameState, next: GameState, era: EraDef, kids: Npc[], heirId: string): void {
  const estate = prev.family.estate
  if (!estate?.assets.length) {
    if (estate) next.family = { ...next.family, estate: { assets: [], debts: 0, passed: estate.passed } }
    return
  }
  const res = distributeEstate(prev, era, kids)
  const owners: Record<string, Record<string, number>> = {}
  for (const [id, list] of Object.entries(res.shares)) for (const s of list) (owners[s.assetId] ??= {})[id] = (owners[s.assetId][id] ?? 0) + s.share
  const kept: Asset[] = []
  const passed = [...(estate.passed ?? [])]
  for (const a of estate.assets) {
    const o = owners[a.id] ?? {}
    if ((o[heirId] ?? 0) > 0) {
      const shares: Record<string, number> = {}
      for (const [id, s] of Object.entries(o)) shares[id === heirId ? next.hero.id : id] = s
      kept.push({ ...a, ownerShares: shares })
    } else {
      const to = Object.keys(o)[0]
      passed.push({ year: prev.year, assetId: a.id, type: a.type, to: kids.find((k) => k.id === to)?.name ?? '' })
    }
  }
  next.family = { ...next.family, estate: { assets: kept, debts: kept.reduce((s, a) => s + (a.pledged ?? 0), 0), passed } }
  const hero = next.hero
  const at = { year: prev.year, age: hero.age, reg: hero.region, rel: hero.religion }
  if (kept.length) hero.diary.push({ ...at, key: res.byWill ? 'diary.inherit_assets_will' : 'diary.inherit_assets', params: { n: kept.length }, topic: 'money', score: 28 })
  const others = passed.filter((p) => p.year === prev.year)
  if (others.length) hero.diary.push({ ...at, key: 'diary.inherit_passed', params: { n: others.length, list: { name: [...new Set(others.map((p) => p.to))].join(', ') } }, topic: 'family', score: 18 })
  // Обойдённые завещанием против обычая: спор - судебные траты и обида.
  for (const id of res.slighted) {
    if (id === heirId || !chance(next, RULES.disputeChance)) continue
    const kid = kids.find((k) => k.id === id)
    const cost = Math.round(kept.reduce((s, a) => s + a.value, 0) * RULES.disputeCost)
    hero.money -= cost
    const sib = hero.npcs.find((n) => n.name === kid?.name && n.role === 'sibling')
    if (sib) sib.attitude = Math.max(-100, sib.attitude + RULES.disputeAttitude)
    hero.diary.push({ ...at, key: 'diary.inherit_dispute', params: { who: { name: kid?.name ?? '' }, sex: kid?.sex ?? 'm', money: cost }, topic: 'family', score: 30, major: true })
  }
  emitEstate('inheritance_distributed', prev, { assets: estate.assets.length, kept: kept.length, will: res.byWill ? 1 : 0, disputes: res.slighted.length })
}
