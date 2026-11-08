// Владения героя сверх дома: земля (наделы) и рабы. Покупаются выбором в событиях (estate_*), приносят доход каждый
// год и несут риски: неурожай, захват земли, побег и бунт рабов, просьба об освобождении. Учитываются в ставках костей,
// в наследстве, в итоге жизни и в мемориале.
//
// Рабов можно купить только там и тогда, где это было обычным и законным делом (решение владельца 06.11):
// Рим, Афины, эллинистический Египет, Новое царство и Месопотамия, халифаты и Османская держава, Византия, Мали и Сонгай,
// Киевская Русь (холопы - до ~1300 года), майя, ацтеки и инки, Делийский султанат. В Западной Европе после ~1100 года,
// в Китае, Японии и христианской Эфиопии такого выбора нет: там зависимые люди - крепостные и слуги при земле.
import { ERA_META } from '../content'
import { HOME_COST } from './household'
import { chance, int } from './rng'
import { changeParam, faithMatches, HOME_TAGS, note } from './rules'
import ASSETS from '../content/assets.json'
import type { Asset, AssetType, Estate, GameState, Hero } from './types'

/** Больше стольких наделов и рабов у героя не бывает (иначе это уже не семья, а поместье знати). */
export const LAND_MAX = 5
export const SLAVES_MAX = 6
/** Цена надела земли и раба без поправки на край. */
export const LAND_COST = 400
export const SLAVE_COST = 250
/** Средний доход за год: надел - десятая часть цены, раб - восьмая (за вычетом еды и одежды). */
export const LAND_INCOME = 40
export const SLAVE_INCOME = 30
/** Покупка - только если после неё останется запас: деньги не меньше цены × RESERVE. */
const RESERVE = 1.3

/** Где и когда можно купить раба: страна → края (пусто - все края) и последний год. */
const SLAVERY: Record<string, { regions?: string[]; until?: number }> = {
  E03: {},
  ANE: {},
  ISL: {},
  BYZ: {},
  WAF: {},
  AMR: {},
  MAY: {},
  RUS: { until: 1300 },
  IND: { regions: ['delhi'] },
}

export type EstateKind = 'home' | 'land' | 'slaves'

/** Рабство обычно и законно здесь и сейчас. */
export function slaveryAllowed(state: GameState): boolean {
  const rule = SLAVERY[state.hero.era]
  if (!rule) return false
  if (rule.regions && !rule.regions.includes(state.hero.region)) return false
  return rule.until === undefined || state.year <= rule.until
}

/** Поправка цен на край: в столице земля и люди дороже, в деревне - дешевле. */
function regionK(state: GameState): number {
  const tags = ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.tags ?? []
  return tags.includes('capital') ? 1.4 : tags.includes('port') ? 1.15 : tags.includes('rural') ? 0.8 : 1
}

export const landPrice = (state: GameState) => Math.round(LAND_COST * regionK(state))
export const slavePrice = (state: GameState) => Math.round(SLAVE_COST * regionK(state))

/** Цена следующей покупки этого вида (дом - следующий по размеру). */
export function estatePrice(state: GameState, kind: EstateKind): number {
  if (kind === 'home') return HOME_COST[Math.min(4, (state.hero.home ?? 1) + 1)]
  return kind === 'land' ? landPrice(state) : slavePrice(state)
}

const free = (hero: Hero) => hero.cls !== 'slave' && !hero.tags.includes('enslaved')

/** Может ли герой сейчас купить это: свободен, взрослый, хватает денег с запасом, есть куда расти, закон края позволяет. */
export function canBuy(state: GameState, kind: EstateKind): boolean {
  const hero = state.hero
  const adult = hero.age >= (ERA_META[hero.era]?.stages.adult ?? 16)
  if (!adult || !free(hero) || hero.money < estatePrice(state, kind) * RESERVE) return false
  if (kind === 'home') return !hero.rent && (hero.home ?? 1) < 4 && !hero.tags.some((t) => HOME_TAGS.includes(t))
  if (kind === 'land') return (hero.land ?? 0) < LAND_MAX
  // Купить раба на чужбине - по законам приютившей страны; знать и купцы держат больше, бедняк - одного-двух.
  return slaveryAllowed(state) && (hero.slaves ?? 0) < SLAVES_MAX
}

/** Покупка: деньги уходят, владение растёт, запись в дневник. n - сколько наделов или рабов. */
export function buyEstate(state: GameState, kind: EstateKind, n = 1): void {
  const hero = state.hero
  if (!canBuy(state, kind)) return
  if (kind === 'home') {
    const price = estatePrice(state, 'home')
    hero.money -= price
    hero.home = (hero.home ?? 1) + 1
    changeParam(hero, 'happiness', 6)
    note(state, { key: 'diary.home_up', params: { home: { key: `home.${hero.home}` } }, major: true, topic: 'money', icon: 'move', score: 30, mood: 6 })
    return
  }
  const max = kind === 'land' ? LAND_MAX : SLAVES_MAX
  const have = (kind === 'land' ? hero.land : hero.slaves) ?? 0
  const price = estatePrice(state, kind)
  // Сколько реально по карману (с запасом) и есть ли куда.
  const count = Math.max(1, Math.min(n, max - have, Math.floor(hero.money / (price * RESERVE))))
  hero.money -= price * count
  if (kind === 'land') hero.land = have + count
  else hero.slaves = have + count
  changeParam(hero, 'happiness', 3)
  note(state, { key: `diary.estate_bought_${kind}`, params: { n: count, total: have + count }, major: true, topic: 'money', icon: 'find', score: 26, mood: 3 })
  // Своя земля делает крестьянина землевладельцем.
  if (kind === 'land' && hero.land! >= 3 && hero.cls === 'peasant' && ERA_META[hero.era]?.classes.some((c) => c.id === 'landowner')) {
    hero.cls = 'landowner'
    note(state, { key: 'diary.estate_landowner', major: true, topic: 'money', icon: 'find', score: 34, mood: 6 })
  }
}

/**
 * Потеря наделов или рабов (неурожай пришлось продать, землю отняли, раб бежал, отпущен на волю).
 * refund - какая доля цены возвращается деньгами (продажа - больше половины, отняли или бежал - ничего).
 */
export function loseEstate(state: GameState, kind: 'land' | 'slaves', n: number, refund = 0): number {
  const hero = state.hero
  const have = (kind === 'land' ? hero.land : hero.slaves) ?? 0
  const count = Math.min(have, n)
  if (count <= 0) return 0
  if (kind === 'land') hero.land = have - count
  else hero.slaves = have - count
  if (refund > 0) hero.money += Math.round(estatePrice(state, kind) * refund * count)
  return count
}

/** Сколько стоит всё, чем владеет герой, кроме денег: дом, земля, рабы. */
export function estateWorth(hero: Hero, state?: GameState): number {
  const k = state ? regionK(state) : 1
  return (hero.rent ? 0 : HOME_COST[Math.max(0, Math.min(4, hero.home ?? 0))]) + Math.round((hero.land ?? 0) * LAND_COST * k + (hero.slaves ?? 0) * SLAVE_COST * k)
}

/** Какое предложение о покупке подходит сейчас: дом, земля или рабы (по порядку того, чего не хватает). */
export function estateOffers(state: GameState): EstateKind[] {
  const out: EstateKind[] = []
  if (canBuy(state, 'home')) out.push('home')
  if (canBuy(state, 'land')) out.push('land')
  if (canBuy(state, 'slaves')) out.push('slaves')
  return out
}

/** Год владений: доход с земли по урожаю, работа рабов; в долгах - продают; где рабства нет - отпускают. */
export function estateYear(state: GameState): void {
  // Семейные активы - в том же годовом расчёте (не отдельно, чтобы не посчитать доход дважды).
  assetsYear(state)
  const hero = state.hero
  const land = hero.land ?? 0
  const slaves = hero.slaves ?? 0
  if (!land && !slaves) return
  // Рабы в краю, где рабство не в обычае (переехал, хроника сменилась): их отпускают.
  if (slaves && !slaveryAllowed(state)) {
    hero.slaves = 0
    note(state, { key: 'diary.estate_slaves_released', params: { n: slaves }, topic: 'money', score: 18 })
  }
  // Урожай: от плохого до богатого; рабы на земле поднимают доход с неё.
  if (land) {
    const harvest = 0.4 + int(state, 0, 10) / 10
    const hands = Math.min(1.25, 1 + (hero.slaves ?? 0) * 0.05)
    hero.money += Math.round(land * LAND_INCOME * harvest * hands)
  }
  if (hero.slaves) hero.money += hero.slaves * SLAVE_INCOME
  // Долги: сначала продают рабов, потом землю (дом и скот - в householdYear).
  if (hero.money < -100 && chance(state, 0.4)) {
    if (hero.slaves) {
      loseEstate(state, 'slaves', 1, 0.7)
      note(state, { key: 'diary.estate_sold_slaves', topic: 'money', icon: 'loss', score: 16, mood: -2 })
    } else if (hero.land) {
      loseEstate(state, 'land', 1, 0.7)
      changeParam(hero, 'happiness', -4)
      note(state, { key: 'diary.estate_sold_land', topic: 'money', icon: 'loss', score: 22, mood: -4, major: true })
    }
  }
}

/** Вера смотрит на рабство по-своему: ислам и христианство поощряют освобождение - совесть отзывается сильнее. */
export function manumissionPraised(state: GameState): boolean {
  return faithMatches(state.hero.religion, ['islamic', 'christian', 'jewish'])
}

// ---------- Семейные активы (ТЗ семейной системы, этап 3) ----------
// Хозяйства, мастерские, лавки, склады и доходные дома - в Family.estate: имущество рода, а не одного героя.
// Покупка, продажа, улучшение, залог; доход и содержание раз в год (assetsYear из estateYear - один годовой расчёт).
// Дом, скот, наделы и рабы остаются в Hero (совместимость, п. 4.6 ТЗ). Правила - src/content/assets.json.

type AssetDef = { id: AssetType; cost: number; income: number; maintenance: number; classes: string[]; needs?: string[]; notRural?: boolean }
const A = ASSETS as typeof ASSETS & { types: AssetDef[] }

/** Слушатель для аналитики (src/telemetry.ts). */
type EstateEvent = 'asset_acquired' | 'asset_sold' | 'will_created' | 'inheritance_distributed'
type EstateListener = (kind: EstateEvent, state: GameState, params: Record<string, string | number>) => void
let estateListener: EstateListener | undefined
export function onEstateEvent(fn: EstateListener | undefined): void {
  estateListener = fn
}
export const emitEstate = (kind: EstateEvent, state: GameState, params: Record<string, string | number>) => estateListener?.(kind, state, params)

export function initializeEstate(state: GameState): Estate {
  state.family.estate ??= { assets: [], debts: 0 }
  return state.family.estate
}

export const assetDef = (type: AssetType) => A.types.find((t) => t.id === type)

/** Доля героя в активе (0–1). */
export const heroShare = (state: GameState, a: Asset) => a.ownerShares[state.hero.id] ?? 0

/** Цена нового актива этого вида в здешнем краю. */
export function assetPrice(state: GameState, type: AssetType): number {
  const def = assetDef(type)
  return def ? Math.round(def.cost * regionK(state)) : 0
}

/** Почему сейчас нельзя купить (ключ текста) или undefined. */
export function assetLock(state: GameState, type: AssetType): string | undefined {
  const hero = state.hero
  const def = assetDef(type)
  const meta = ERA_META[hero.era]
  if (!def || meta?.assets?.exclude?.includes(type)) return 'estate.lock.era'
  if (def.needs && !def.needs.some((f) => meta?.features.includes(f))) return 'estate.lock.era'
  if (def.notRural && regionTags(state).includes('rural')) return 'estate.lock.rural'
  if (!def.classes.includes(hero.cls) || !free(hero)) return 'estate.lock.class'
  if (hero.age < (meta?.stages.adult ?? 16)) return 'estate.lock.young'
  if ((state.family.estate?.assets.length ?? 0) >= A.max) return 'estate.lock.max'
  if (hero.money < assetPrice(state, type)) return 'estate.lock.money'
  return undefined
}

const regionTags = (state: GameState) => ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.tags ?? []

/** Купить актив: деньги уходят, актив записан на героя целиком. */
export function acquireAsset(state: GameState, input: { type: AssetType; name?: string }): Asset | undefined {
  if (assetLock(state, input.type)) return undefined
  const def = assetDef(input.type)!
  const estate = initializeEstate(state)
  const value = assetPrice(state, input.type)
  const asset: Asset = {
    id: `a${state.nextId++}`,
    type: input.type,
    name: input.name ?? input.type,
    region: state.hero.region,
    acquiredYear: state.year,
    value,
    income: Math.round(value * def.income),
    maintenance: Math.round(value * def.maintenance),
    condition: 100,
    level: 0,
    ownerShares: { [state.hero.id]: 1 },
  }
  state.hero.money -= value
  estate.assets.push(asset)
  note(state, { key: 'diary.asset_bought', params: { what: { key: `asset.${asset.type}` }, money: value }, topic: 'money', icon: 'find', score: 24, mood: 3, major: true })
  emitEstate('asset_acquired', state, { type: asset.type, value })
  return asset
}

/** Сколько дадут при продаже доли героя: от половины до девяти десятых цены по сохранности, за вычетом залога. */
export function saleValue(state: GameState, a: Asset): number {
  const k = A.sale.base + A.sale.condition * (a.condition / 100)
  return Math.round(a.value * k * heroShare(state, a))
}

export function sellAsset(state: GameState, assetId: string): number {
  const estate = state.family.estate
  const a = estate?.assets.find((x) => x.id === assetId)
  if (!estate || !a || heroShare(state, a) <= 0) return 0
  const got = saleValue(state, a) - (a.pledged ?? 0)
  state.hero.money += got
  estate.assets = estate.assets.filter((x) => x !== a)
  syncDebts(estate)
  note(state, { key: 'diary.asset_sold', params: { what: { key: `asset.${a.type}` }, money: Math.max(0, got) }, topic: 'money', score: 18 })
  emitEstate('asset_sold', state, { type: a.type, value: got })
  return got
}

export const improveCost = (a: Asset) => Math.round(a.value * A.improve.cost)
export const canImprove = (state: GameState, a: Asset) => (a.level ?? 0) < A.improve.maxLevel && state.hero.money >= improveCost(a) && heroShare(state, a) > 0

/** Улучшить: плата - треть цены; сохранность 100, цена и доход выше. */
export function improveAsset(state: GameState, assetId: string): boolean {
  const a = state.family.estate?.assets.find((x) => x.id === assetId)
  if (!a || !canImprove(state, a)) return false
  state.hero.money -= improveCost(a)
  a.level = (a.level ?? 0) + 1
  a.condition = 100
  a.value = Math.round(a.value * A.improve.value)
  a.income = Math.round(a.income * (1 + A.improve.income))
  note(state, { key: 'diary.asset_improved', params: { what: { key: `asset.${a.type}` } }, topic: 'money', score: 14, mood: 2 })
  return true
}

/** Заложить: половина цены деньгами сейчас, 10% в год, в долгах могут забрать. */
export function pledgeAsset(state: GameState, assetId: string): number {
  const estate = state.family.estate
  const a = estate?.assets.find((x) => x.id === assetId)
  if (!estate || !a || a.pledged || heroShare(state, a) <= 0) return 0
  const loan = Math.round(a.value * A.pledge.share * heroShare(state, a))
  a.pledged = loan
  state.hero.money += loan
  syncDebts(estate)
  note(state, { key: 'diary.asset_pledged', params: { what: { key: `asset.${a.type}` }, money: loan }, topic: 'money', score: 16 })
  return loan
}

/** Выкупить залог. */
export function redeemAsset(state: GameState, assetId: string): boolean {
  const estate = state.family.estate
  const a = estate?.assets.find((x) => x.id === assetId)
  if (!estate || !a?.pledged || state.hero.money < a.pledged) return false
  state.hero.money -= a.pledged
  a.pledged = undefined
  syncDebts(estate)
  return true
}

function syncDebts(estate: Estate): void {
  estate.debts = estate.assets.reduce((s, a) => s + (a.pledged ?? 0), 0)
}

/** Цена всего семейного имущества в реестре (доля героя), за вычетом залогов. */
export function estateValue(state: GameState): number {
  return (state.family.estate?.assets ?? []).reduce((s, a) => s + Math.round(a.value * heroShare(state, a)) - (a.pledged ?? 0), 0)
}

/** Год активов: доход по удаче и сохранности (доля героя), содержание, ветшание, проценты по залогу, изъятие в долгах. */
export function assetsYear(state: GameState): void {
  const estate = state.family.estate
  if (!estate?.assets.length) return
  const hero = state.hero
  let net = 0
  for (const a of estate.assets) {
    const share = heroShare(state, a)
    const luck = int(state, A.harvest[0], A.harvest[1]) / 10
    const shape = a.condition < A.poorBelow ? 0.5 : 0.6 + 0.4 * (a.condition / 100)
    net += Math.round(a.income * luck * shape * share) - Math.round(a.maintenance * share)
    if (a.pledged) net -= Math.round(a.pledged * A.pledge.interest)
    a.condition = Math.max(0, a.condition - int(state, A.wear[0], A.wear[1]))
  }
  hero.money += net
  // В долгах заимодавец забирает заложенное.
  const pledged = estate.assets.find((a) => a.pledged)
  if (pledged && hero.money < 0 && chance(state, A.pledge.seizeChance)) {
    estate.assets = estate.assets.filter((a) => a !== pledged)
    hero.money += Math.max(0, saleValue(state, pledged) - pledged.pledged!) // остаток после долга - семье
    note(state, { key: 'diary.asset_seized', params: { what: { key: `asset.${pledged.type}` } }, topic: 'money', icon: 'loss', score: 26, mood: -5, major: true })
    changeParam(hero, 'happiness', -5)
  }
  syncDebts(estate)
}
