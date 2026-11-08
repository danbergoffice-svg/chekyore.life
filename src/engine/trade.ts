// Личная торговля (ТЗ семейной системы, этап 4, первая очередь): рынок края, закупка и продажа, запас, прибыль.
// Товары - по признакам страны (src/content/goods.json): вино там, где вино, шёлк - где пути шёлка. Цена меняется
// раз в год (урожай, войны, корабли - «погода рынка») и по краю: своё дешевле, привозное дешевле в порту.
// Цена года считается от хеша (род, год, товар), без расхода общего потока случайности: смотреть цены можно сколько
// угодно, жизнь от этого не изменится. Покупка дороже продажи (разница торговца), так что купить и тут же продать -
// всегда убыток; навык торговли сужает разницу. Запас понемногу портится (tradeYear).
import { ERA_META } from '../content'
import GOODS from '../content/goods.json'
import { next } from './rng'
import { note } from './rules'
import type { EraMeta, FamilyTrade, GameState, TradeGood } from './types'

interface GoodDef {
  id: string
  price: number
  spoil: number
  needs?: string[]
  eras?: string[]
  local?: string
  import?: boolean
}
const G = GOODS as typeof GOODS & { goods: GoodDef[] }

export interface TradeResult {
  ok: boolean
  error?: 'no_good' | 'no_money' | 'no_stock' | 'no_space' | 'bad_quantity' | 'young'
  quantity: number
  /** Сколько заплачено (покупка) или выручено (продажа). */
  money: number
  /** Прибыль продажи против средней цены закупки. */
  profit?: number
}

type TradeEvent = 'trade_started' | 'trade_completed'
let listener: ((kind: TradeEvent, state: GameState, params: Record<string, string | number>) => void) | undefined
export function onTradeEvent(fn: typeof listener): void {
  listener = fn
}

export function initializeTrade(state: GameState): FamilyTrade {
  state.family.trade ??= { inventory: { goods: [], capacity: G.capacity.base }, businesses: [] }
  return state.family.trade
}

/** Товары, которые есть на рынке этой страны. */
export function marketGoods(era: EraMeta): GoodDef[] {
  return G.goods.filter((g) => (g.eras ? g.eras.includes(era.id) : !g.needs || g.needs.some((f) => era.features.includes(f))))
}

const goodDef = (id: string) => G.goods.find((g) => g.id === id)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

const regionTags = (state: GameState) => ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.tags ?? []

/** Цена товара в здешнем краю в этом году (середина между покупкой и продажей). */
export function marketPrice(state: GameState, goodId: string): number {
  const g = goodDef(goodId)
  if (!g) return 0
  const [lo, hi] = G.shock
  const shock = lo + (hi - lo) * hash(`${state.family.id}:${state.hero.region}:${state.year}:${goodId}`)
  const tags = regionTags(state)
  let k = shock
  if (tags.includes('capital')) k *= G.region.capital
  if (g.local && tags.includes(g.local)) k *= G.region.local
  if (g.import) k *= tags.includes('port') ? G.region.importPort : G.region.importInland
  return Math.max(1, Math.round(g.price * k))
}

/** Разница торговца: навык торговли сужает её. */
export function spread(state: GameState): number {
  return Math.max(G.spread.min, G.spread.base - (state.hero.skills.trade ?? 0) * G.spread.perSkill)
}

export const buyPrice = (state: GameState, goodId: string) => Math.round(marketPrice(state, goodId) * (1 + spread(state)))
export const sellPrice = (state: GameState, goodId: string) => Math.max(1, Math.round(marketPrice(state, goodId) * (1 - spread(state))))

/** Сколько мер помещается: своё жильё + склад и лавка рода. */
export function capacity(state: GameState): number {
  const assets = state.family.estate?.assets ?? []
  return G.capacity.base + assets.filter((a) => a.type === 'warehouse').length * G.capacity.warehouse + assets.filter((a) => a.type === 'shop').length * G.capacity.shop
}

export const stockOf = (state: GameState, goodId: string) => state.family.trade?.inventory.goods.find((g) => g.id === goodId)?.quantity ?? 0
export const stockTotal = (state: GameState) => (state.family.trade?.inventory.goods ?? []).reduce((s, g) => s + g.quantity, 0)

function canTrade(state: GameState): boolean {
  return state.hero.age >= (ERA_META[state.hero.era]?.stages.adult ?? 16) && state.hero.cls !== 'slave'
}

export function buyGoods(state: GameState, goodId: string, quantity: number): TradeResult {
  const fail = (error: TradeResult['error']): TradeResult => ({ ok: false, error, quantity: 0, money: 0 })
  const era = ERA_META[state.hero.era]
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > G.maxBuy) return fail('bad_quantity')
  if (!era || !marketGoods(era).some((g) => g.id === goodId)) return fail('no_good')
  if (!canTrade(state)) return fail('young')
  const trade = initializeTrade(state)
  trade.inventory.capacity = capacity(state)
  if (stockTotal(state) + quantity > trade.inventory.capacity) return fail('no_space')
  const price = buyPrice(state, goodId)
  const cost = price * quantity
  if (state.hero.money < cost) return fail('no_money')
  state.hero.money -= cost
  let item = trade.inventory.goods.find((g) => g.id === goodId)
  if (!item) trade.inventory.goods.push((item = { id: goodId, quantity: 0, averagePrice: 0 }))
  item.averagePrice = (item.averagePrice * item.quantity + cost) / (item.quantity + quantity)
  item.quantity += quantity
  listener?.('trade_started', state, { good: goodId, quantity, money: cost })
  return { ok: true, quantity, money: cost }
}

export function sellGoods(state: GameState, goodId: string, quantity: number): TradeResult {
  const fail = (error: TradeResult['error']): TradeResult => ({ ok: false, error, quantity: 0, money: 0 })
  if (!Number.isInteger(quantity) || quantity <= 0) return fail('bad_quantity')
  const trade = state.family.trade
  const item = trade?.inventory.goods.find((g) => g.id === goodId)
  if (!trade || !item || item.quantity < quantity) return fail('no_stock')
  // Чужого товара на здешнем рынке может не быть - тогда берут дёшево (половина обычной цены).
  const era = ERA_META[state.hero.era]
  const here = era && marketGoods(era).some((g) => g.id === goodId)
  const price = here ? sellPrice(state, goodId) : Math.max(1, Math.round((goodDef(goodId)?.price ?? 1) * 0.5))
  const revenue = price * quantity
  const profit = Math.round(revenue - item.averagePrice * quantity)
  state.hero.money += revenue
  item.quantity -= quantity
  if (item.quantity === 0) trade.inventory.goods = trade.inventory.goods.filter((g) => g !== item)
  trade.profit = (trade.profit ?? 0) + profit
  listener?.('trade_completed', state, { good: goodId, quantity, money: revenue, profit })
  return { ok: true, quantity, money: revenue, profit }
}

/** Год торговли: запас портится и пропадает (мыши, сырость, кражи); большой убыток - строкой в дневник. */
export function tradeYear(state: GameState): void {
  const trade = state.family.trade
  if (!trade?.inventory.goods.length) return
  let lost = 0
  for (const item of trade.inventory.goods) {
    const rate = goodDef(item.id)?.spoil ?? 0.05
    const gone = Math.min(item.quantity, Math.floor(item.quantity * rate * (0.5 + next(state))))
    item.quantity -= gone
    lost += gone * item.averagePrice
  }
  trade.inventory.goods = trade.inventory.goods.filter((g) => g.quantity > 0)
  trade.inventory.capacity = capacity(state)
  if (lost >= 50) note(state, { key: 'diary.trade_spoiled', params: { money: Math.round(lost) }, topic: 'money', icon: 'loss', score: 10, mood: -1 })
}

/** Сколько стоит запас по нынешним ценам продажи (для итогов и наследства). */
export function stockValue(state: GameState): number {
  return (state.family.trade?.inventory.goods ?? []).reduce((s, g: TradeGood) => s + g.quantity * sellPrice(state, g.id), 0)
}
