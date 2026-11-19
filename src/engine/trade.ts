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
  notEras?: string[]
  /** С какого года товар есть в стране: {страна: год}. */
  from?: Record<string, number>
  local?: string
  import?: boolean
  /** Мера товара (тексты unit.<id>) и мера по стране. */
  unit?: string
  units?: Record<string, string>
}
const G = GOODS as unknown as Omit<typeof GOODS, 'goods'> & { goods: GoodDef[] }

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
  state.family.trade ??= { inventory: { goods: [], capacity: capacity(state) }, businesses: [], region: state.hero.region }
  return state.family.trade
}

/** Товары, которые есть на рынке этой страны (в этом году, если он известен): по признакам страны, без чужих
 *  (зерно - не у майя), с года появления (бумага в Европе - с 1250). */
export function marketGoods(era: EraMeta, year?: number): GoodDef[] {
  return G.goods.filter(
    (g) =>
      (g.eras ? g.eras.includes(era.id) : !g.needs || g.needs.some((f) => era.features.includes(f))) &&
      !g.notEras?.includes(era.id) &&
      (year === undefined || g.from?.[era.id] === undefined || year >= g.from[era.id]),
  )
}

export const goodDef = (id: string) => G.goods.find((g) => g.id === id)

/** Мера товара в этой стране: мешок, амфора, бочка… (ключ текста unit.<id>). */
export const unitOf = (goodId: string, era?: string) => {
  const g = goodDef(goodId)
  return (era && g?.units?.[era]) || g?.unit || 'measure'
}

/** Товары здешнего рынка в этом году. */
export const goodsHere = (state: GameState) => {
  const era = ERA_META[state.hero.era]
  return era ? marketGoods(era, state.year) : []
}

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

/** Фокус года «Торговля»: герой сам на рынке - разница торговца уже, а цена продажи качается (своя на товар и год):
 *  можно выручить больше, можно и меньше. Без фокуса - 0. */
export function focusSwing(state: GameState, goodId: string): number {
  if (state.lastFocus !== 'trade') return 0
  const { low, high } = G.focus
  return low + (high - low) * hash(`${state.family.id}:${state.year}:${goodId}:focus`)
}
const spreadNow = (state: GameState) => spread(state) * (state.lastFocus === 'trade' ? G.focus.spread : 1)

export const buyPrice = (state: GameState, goodId: string) => Math.round(marketPrice(state, goodId) * (1 + spreadNow(state)))
export const sellPrice = (state: GameState, goodId: string) => Math.max(1, Math.round(marketPrice(state, goodId) * (1 - spreadNow(state)) * (1 + focusSwing(state, goodId))))

/** Сколько мер помещается (20.11): по дому героя (лачуга - мало, усадьба - много; съёмное жильё - немного) + склад и
 *  лавка рода. */
export function capacity(state: GameState): number {
  const assets = state.family.estate?.assets ?? []
  const C = G.capacity
  const home = state.hero.rent ? C.rent : C.home[Math.max(0, Math.min(C.home.length - 1, state.hero.home ?? 1))]
  return home + assets.filter((a) => a.type === 'warehouse').length * C.warehouse + assets.filter((a) => a.type === 'shop').length * C.shop
}

/**
 * Переезд (20.11): запас лежит там, где его покупали (FamilyTrade.region). Герой переехал - с собой берёт carry мер
 * (дорогое - в первую очередь), остальное продают перед дорогой за долю цены. Вызывается перед любой сделкой и раз в год.
 */
export function relocateStock(state: GameState): void {
  const trade = state.family.trade
  if (!trade) return
  if (!trade.region) {
    trade.region = state.hero.region
    return
  }
  if (trade.region === state.hero.region) return
  trade.region = state.hero.region
  const goods = [...trade.inventory.goods].sort((a, b) => (goodDef(b.id)?.price ?? 0) - (goodDef(a.id)?.price ?? 0))
  let room = G.capacity.carry
  let sold = 0
  let money = 0
  for (const item of goods) {
    const keep = Math.min(item.quantity, room)
    room -= keep
    const rest = item.quantity - keep
    if (rest > 0) {
      money += Math.round(rest * (goodDef(item.id)?.price ?? 1) * G.capacity.moveSale)
      sold += rest
      item.quantity = keep
    }
  }
  trade.inventory.goods = trade.inventory.goods.filter((g) => g.quantity > 0)
  if (sold) {
    state.hero.money += money
    note(state, { key: 'diary.trade_moved', params: { n: sold, money }, topic: 'money', icon: 'loss', score: 14, mood: -1 })
  }
}

export const stockOf = (state: GameState, goodId: string) => state.family.trade?.inventory.goods.find((g) => g.id === goodId)?.quantity ?? 0
export const stockTotal = (state: GameState) => (state.family.trade?.inventory.goods ?? []).reduce((s, g) => s + g.quantity, 0)

function canTrade(state: GameState): boolean {
  return state.hero.age >= (ERA_META[state.hero.era]?.stages.adult ?? 16) && state.hero.cls !== 'slave'
}

export function buyGoods(state: GameState, goodId: string, quantity: number): TradeResult {
  const fail = (error: TradeResult['error']): TradeResult => ({ ok: false, error, quantity: 0, money: 0 })
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > G.maxBuy) return fail('bad_quantity')
  if (!goodsHere(state).some((g) => g.id === goodId)) return fail('no_good')
  if (!canTrade(state)) return fail('young')
  const trade = initializeTrade(state)
  relocateStock(state)
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
  relocateStock(state)
  const trade = state.family.trade
  const item = trade?.inventory.goods.find((g) => g.id === goodId)
  if (!trade || !item || item.quantity < quantity) return fail('no_stock')
  // Чужого товара на здешнем рынке может не быть - тогда берут дёшево (половина обычной цены).
  const here = goodsHere(state).some((g) => g.id === goodId)
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
  relocateStock(state)
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
